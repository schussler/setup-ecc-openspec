// Ciclo de uma fatia conduzido pelo runner (F6): invocação, avaliação do gate, correções
// com teto, assinatura de sintoma, ausência de melhora, divergência e aprovação com
// checkpoint no marco (RC-003, RC-005, RC-007, RC-014, RC-016, RC-027, SG-017, RS-011).
// O runner novo não para por contagem de falhas (RC-041); a regra SG-018 é só legada (gate-store).
// O gate é injetado (evaluate): este módulo não executa scripts/gates nem grava veredito. Cada avaliação
// passa pelo guarda (gate-guard.mjs): prazo max_seconds_per_gate, sinais e término confirmado (D8, D25).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { changeDir } from './identity.mjs';
import { writeMilestoneCheckpoint } from './checkpoint.mjs';
import { countGateEvaluation, dispatchCorrection } from './counters.mjs';
import { runHarnessStep } from './runner.mjs';
import { applyTransition, STATE_APPROVED, STATE_AWAITING_DECISION, STATE_AWAITING_GATE, STATE_CORRECTION_REQUESTED, STATE_DIAGNOSING, STATE_FORBIDDEN } from './machine.mjs';
import { ConfigError, loadPolicy } from './policy.mjs';
import { loadState, saveState } from './state.mjs';
import { checkAction, recordSymptom, symptomSignature } from './symptoms.mjs';
import { recordActiveTime } from './active-time.mjs';
import { compareProtected } from './evidence.mjs';
import { guardedEvaluation, pendingTermination } from './gate-guard.mjs';

const DEFAULT_GATE = 'implement';
// Fatias obrigatórias da execução (C1, SP-010): a execução só aprova quando todas estão aprovadas e a validação final passa.
export const REQUIRED_SLICES = Object.freeze(['implement']);

const SLICE_PREFIX = '## Fatia: ';
const SCENARIOS_LINE = /^- Cenários: (.+)$/m;

// Fatias declaradas em tasks.md (add-multislice-run, MS-001, MS-002, MS-008): cada seção "## Fatia: <nome>" vai até
// o próximo cabeçalho "## ". Lista vazia é o modo legado (uma fatia implement). Ordem do arquivo = ordem de execução.
export function declaredSlices(text) {
  return text.split(/^(?=## )/m)
    .filter((section) => section.startsWith(SLICE_PREFIX))
    .map((section) => {
      const name = section.split('\n')[0].slice(SLICE_PREFIX.length).trim();
      const line = section.match(SCENARIOS_LINE);
      const scenarios = line ? line[1].split(',').map((id) => id.trim()).filter(Boolean) : [];
      return { name, scenarios };
    });
}

// Fatia multifatia aprovada: o registro guarda o nome da tarefa (task), não só o gate de ciclo.
export function approvedTask(state, task) {
  return (state.slice_approvals ?? []).some((item) => item.task === task);
}

// Acrescenta a tarefa ao registro que acabou de ser gravado pela aprovação (approveSlice).
export function tagSliceApproval(root, change, task) {
  const current = loadState(root, change);
  const approvals = current.slice_approvals ?? [];
  if (approvals.length === 0) return current;
  const last = approvals.at(-1);
  return saveState(root, change, { ...current, slice_approvals: [...approvals.slice(0, -1), { ...last, task }] });
}

// Lê as fatias da change; sem tasks.md, a lista é vazia (modo legado).
export function sliceDeclarations(root, change) {
  const file = join(changeDir(root, change), 'tasks.md');
  return existsSync(file) ? declaredSlices(readFileSync(file, 'utf8')) : [];
}
const NO_SNAPSHOT = async () => null;

// Parada acrescenta o motivo ao histórico do estado, como no runner (relatório de paradas, TE-004).
function moveTo(root, change, to, stopReason = null) {
  const current = loadState(root, change);
  const result = applyTransition(current, to, { stopReason });
  if (!result.ok) throw new ConfigError(`transição ${current.state} → ${to} recusada (${result.reason})`);
  const history = stopReason === null ? {} : {
    stop_history: [...(current.stop_history ?? []), { stop_reason: stopReason, state: to, at: new Date().toISOString() }],
  };
  return saveState(root, change, { ...result.state, ...history });
}

// Aprovação de fatia (C1, SP-010): só parte de awaiting_gate, pela tabela. O registro guarda gate,
// tentativa e impressão avaliada; o checkpoint de fatia é gravado depois da persistência. Não aprova a execução.
export function approveSlice(root, change, { gate, attempt = null, fingerprint = null, cases = null }) {
  const current = loadState(root, change);
  const result = applyTransition(current, STATE_APPROVED);
  if (!result.ok) return { ok: false, reason: result.reason, from_state: current.state };
  const record = { slice: gate, attempt, fingerprint, cases: cases ?? null, at: new Date().toISOString() };
  const saved = saveState(root, change, { ...result.state, slice_approvals: [...(current.slice_approvals ?? []), record] });
  writeMilestoneCheckpoint(changeDir(root, change), saved, 'slice_approved');
  return { ok: true, state: saved, slice: record };
}

function updateCounters(root, change, update) {
  const current = loadState(root, change);
  return saveState(root, change, { ...current, counters: update(current.counters) });
}

// Mede a duração de uma etapa fora do runner e grava na categoria dela (RC-036), mesmo se falhar.
async function timed(root, change, category, run) {
  const started = Date.now();
  try {
    return await run();
  } finally {
    recordActiveTime(root, change, category, Date.now() - started);
  }
}

// Uma avaliação guardada. Término não confirmado pendente recusa antes de contar a avaliação (RC-044).
async function evaluateOnce(root, change, evaluate, gate, outcome, guard, category = 'gate') {
  const before = loadState(root, change);
  if (pendingTermination(root, change, before)) {
    return { status: 'refused', stop_reason: 'human_decision_needed', blocked_by: 'termination_unconfirmed', state: before.state };
  }
  saveState(root, change, countGateEvaluation(before));
  const context = { invocation: outcome.result ?? null, round: loadState(root, change).round };
  return timed(root, change, category, () => guardedEvaluation({ root, change, gate, evaluate, context, ...guard }));
}

// Avaliação sem veredito (interrompida ou recusada): a fatia para no estado gravado pelo guarda.
function unevaluated(outcome, guarded) {
  if (guarded.status === 'refused') {
    return { ...outcome, state: guarded.state, stop_reason: guarded.stop_reason, blocked_by: guarded.blocked_by };
  }
  return {
    ...outcome, state: guarded.state, stop_reason: guarded.stop_reason,
    gate_interruption: { cause: guarded.cause, termination_confirmed: guarded.termination_confirmed, gate_run_id: guarded.gate_run_id },
  };
}

function stopAt(root, change, outcome, stopReason) {
  moveTo(root, change, STATE_AWAITING_DECISION, stopReason);
  return { ...outcome, state: STATE_AWAITING_DECISION, stop_reason: stopReason };
}

// A confirmação pode trazer a tentativa, a impressão avaliada e os casos (cli-run.mjs); o registro os guarda.
function approve(root, change, outcome, gate, confirmation = {}) {
  const approved = approveSlice(root, change, {
    gate, attempt: confirmation.attempt ?? null, fingerprint: confirmation.fingerprint ?? null, cases: confirmation.cases ?? null,
  });
  if (!approved.ok) throw new ConfigError(`aprovação de fatia recusada (${approved.reason}) a partir de "${approved.from_state}"`);
  return { ...outcome, state: STATE_APPROVED, stop_reason: null };
}

// Confirmação com o mesmo código: divergência vai a diagnosing e não aprova (RC-016).
async function confirmOrDiagnose(root, change, evaluate, gate, outcome, guard) {
  const guarded = await evaluateOnce(root, change, evaluate, gate, outcome, guard, 'diagnostico');
  if (guarded.status !== 'evaluated') return unevaluated(outcome, guarded);
  const confirmation = guarded.verdict;
  if (confirmation.outcome === 'passed') return approve(root, change, outcome, gate, confirmation);
  updateCounters(root, change, (counters) => ({
    ...counters, diagnostics: { ...counters.diagnostics, [gate]: (counters.diagnostics[gate] ?? 0) + 1 },
  }));
  moveTo(root, change, STATE_DIAGNOSING);
  return { ...outcome, state: STATE_DIAGNOSING, stop_reason: null };
}

// Despacha uma correção: consome o limite, checa ação duplicada e grava antes do processo.
function dispatchCorrectionOrStop(root, change, gate, signature, hypothesis, outcome) {
  const max = loadPolicy(root).max_corrections_per_gate;
  const dispatched = dispatchCorrection(loadState(root, change), gate, max);
  if (!dispatched.ok) return { stop: 'correction_limit' };
  // A hipótese faz parte do descritor: hipóteses diferentes são ações diferentes (RC-014, RC-015).
  const action = checkAction(dispatched.state.counters, `correcao:${gate}:${signature}:${hypothesis ?? 'sem-hipotese'}`, null);
  if (!action.ok) return { stop: 'human_decision_needed' };
  saveState(root, change, { ...dispatched.state, counters: action.counters });
  moveTo(root, change, STATE_CORRECTION_REQUESTED);
  return { stop: null, outcome };
}

function recordCorrection(root, change, gate, producedChange) {
  updateCounters(root, change, (counters) => ({ ...counters, last_correction: { gate, produced_change: producedChange } }));
}

// Gate retomado (gate_rerun_pending, D8): a fatia começa pela avaliação do gate, sem nova invocação.
async function firstOutcome(root, change, stepOptions) {
  const current = loadState(root, change);
  if (current?.state === STATE_AWAITING_GATE && current.gate_rerun_pending) {
    return { invoked: false, state: STATE_AWAITING_GATE, stop_reason: null, result: null, gate_rerun: true };
  }
  return runHarnessStep({ root, change, ...stepOptions });
}

// Executa a fatia até aprovação, parada ou esgotamento. options: as de runHarnessStep,
// mais evaluate(context) -> { outcome, failures, errorClass }, correctionPrompt (texto, ou função do
// veredito que pediu a correção), gate e snapshot.
// gateTimeoutMs, gateKillGraceMs, gateTerminate e signalSource vão ao guarda do gate (padrão: política e process).
export async function runSlice(options) {
  const {
    root, change, evaluate, gate = DEFAULT_GATE, prompt, correctionPrompt, snapshot = NO_SNAPSHOT, protect,
    gateTimeoutMs, gateKillGraceMs, gateTerminate, signalSource, ...stepOptions
  } = options;
  const guard = Object.fromEntries(Object.entries({
    timeoutMs: gateTimeoutMs, killGraceMs: gateKillGraceMs, terminate: gateTerminate, signalSource,
  }).filter(([, value]) => value !== undefined));
  let outcome = await firstOutcome(root, change, { prompt, protect, ...stepOptions });
  for (;;) {
    if (outcome.state !== STATE_AWAITING_GATE) return outcome;
    const protectedBefore = protect ? await timed(root, change, 'ferramenta', protect) : null;
    const guarded = await evaluateOnce(root, change, evaluate, gate, outcome, guard);
    if (guarded.status !== 'evaluated') return unevaluated(outcome, guarded);
    const verdict = guarded.verdict;
    // Caminho protegido alterado durante a avaliação do gate (EV-003): para antes de qualquer veredito.
    const protectedChanges = protect ? compareProtected(protectedBefore, await timed(root, change, 'ferramenta', protect)) : [];
    if (protectedChanges.length > 0) {
      moveTo(root, change, STATE_FORBIDDEN, 'protected_change');
      return { ...outcome, state: STATE_FORBIDDEN, stop_reason: 'protected_change', protected_changes: protectedChanges };
    }
    if (verdict.outcome === 'human_decision_needed') return stopAt(root, change, outcome, 'human_decision_needed');
    if (verdict.outcome === 'passed') return confirmOrDiagnose(root, change, evaluate, gate, outcome, guard);
    // Negação de permissão com gate reprovado (MS-010): o problema é de permissão, não de código. Para sem correção.
    if ((outcome.result?.permission_denials ?? []).length > 0) return stopAt(root, change, outcome, 'permission_denied');

    const signature = symptomSignature({ gate, failures: verdict.failures, errorClass: verdict.errorClass });
    const repeat = recordSymptom(loadState(root, change).counters, signature);
    updateCounters(root, change, () => repeat.counters);
    if (repeat.stop) return stopAt(root, change, outcome, repeat.stop_reason);
    const dispatch = dispatchCorrectionOrStop(root, change, gate, signature, verdict.hypothesis ?? null, outcome);
    if (dispatch.stop) return stopAt(root, change, outcome, dispatch.stop);

    const before = await timed(root, change, 'ferramenta', snapshot);
    const nextPrompt = typeof correctionPrompt === 'function' ? correctionPrompt(verdict) : correctionPrompt;
    outcome = await runHarnessStep({ root, change, prompt: nextPrompt, protect, ...stepOptions });
    const after = await timed(root, change, 'ferramenta', snapshot);
    recordCorrection(root, change, gate, before !== after);
  }
}
