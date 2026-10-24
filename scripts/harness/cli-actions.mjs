// Subcomandos da CLI do runner (cli.mjs). Cada um chama funções existentes dos módulos do harness,
// grava estado só por state.mjs e devolve um objeto com status. Nenhum subcomando chama o modelo:
// este módulo não importa o adaptador do claude nem o runner de invocação.
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { acquireLockReleasingAuthorized, releaseLock } from './lock.mjs';
import { createState, loadState, saveState, writeFileAtomic } from './state.mjs';
import { applyTransition, STATE_AWAITING_DECISION, STATE_CONFIG_BLOCKED, STOP_REASONS } from './machine.mjs';
import { recordEvent, recordLifecycleEvent } from './telemetry.mjs';
import { recordActiveTime } from './active-time.mjs';
import { recordInterruption, resumeExecution, uncoveredReservations } from './runner.mjs';
import { MILESTONES, writeMilestoneCheckpoint } from './checkpoint.mjs';
import { changeDir, localDir, projectId } from './identity.mjs';
import { archiveApproval, validateChange } from './validate.mjs';
import { defaultRuntime, fingerprint } from './evidence.mjs';
import { approveSlice, REQUIRED_SLICES } from './slice.mjs';
import { reconcileRecord } from './reconciliation.mjs';
import { loadAuthorizations } from './contract.mjs';
import { activeGrants, authorizedTotalUsd } from './budget.mjs';
import { ConfigError, effectiveCeiling, loadPolicy, loadProfile } from './policy.mjs';
import { writeReports } from './report.mjs';
import { deriveSummary } from './views.mjs';
import { countGateEvaluation } from './counters.mjs';
import { evaluateImplementation, buildBaseline } from '../gates/implement-gate.mjs';
import { evaluateArchive } from '../gates/archive-gate.mjs';
import { decideVerdict } from '../gates/gate-store.mjs';
import { ChecksError } from '../gates/checks.mjs';
import { guardedEvaluation } from './gate-guard.mjs';

const RUNNER = 'runner';
const MODES = ['legacy', 'runner'];
const ADOPTION_LINE = /Marco de adoção registrado:\*\*\s*\d{4}-\d{2}-\d{2}\s*[—-]\s*aprovador:\s*\S/;
const ADOPTION_FILE = join('docs', 'agents', 'issue-tracker.md');
const SUMMARY_FILE = 'summary.json';

const refused = (state, stopReason, extra = {}) => ({ status: 'refused', stop_reason: stopReason, state, ...extra });

// Marco de adoção registrado no issue-tracker (SP-009): sem ele, nenhuma execução vira runner.
export function adoptionRegistered(root) {
  try {
    return ADOPTION_LINE.test(readFileSync(join(root, ADOPTION_FILE), 'utf8'));
  } catch {
    return false;
  }
}

// Trava da change durante a operação (D1). Partida recusada devolve o diagnóstico, sem gravar nada.
export async function withLock(root, change, executionId, run) {
  const lock = acquireLockReleasingAuthorized(root, change, { executionId });
  if (!lock.acquired) {
    return refused(null, lock.stopReason, { blocked_by: lock.blockedBy ?? null, diagnostic: lock.diagnostic ?? null });
  }
  try {
    return await run();
  } finally {
    releaseLock(root, change, executionId);
  }
}

function requireState(root, change) {
  const state = loadState(root, change);
  if (!state) throw new ConfigError(`sem execução para "${change}": rode start antes`);
  return state;
}

function requireRunner(state) {
  if (state.mode !== RUNNER) return refused(state.state, 'mode_mismatch', { mode: state.mode, message: 'este subcomando é do modo runner; no modo legacy use o gate com --legacy-write' });
  return null;
}

// Baseline do gate de implementação, gravado uma vez por change (SP-009): os testes que já existem.
async function baselineOf(root) {
  return buildBaseline({ root });
}

export async function start({ root, change, options }) {
  const mode = options.mode ?? 'legacy';
  if (!MODES.includes(mode)) throw new ConfigError(`modo inválido: "${mode}" (use legacy ou runner)`);
  if (mode === RUNNER && !adoptionRegistered(root)) {
    return refused(null, 'config_error', { message: `marco de adoção não registrado em ${ADOPTION_FILE}; execuções ficam em legacy (SP-009)` });
  }
  const existing = loadState(root, change);
  if (existing) return refused(existing.state, null, { execution_id: existing.execution_id, message: 'execução já existe: use resume ou um novo start após parada' });
  const executionId = options.execution_id ?? randomUUID();
  return withLock(root, change, executionId, async () => {
    const baseline = mode === RUNNER ? await baselineOf(root) : null;
    const created = createState(root, change, { mode, executionId });
    const withGates = baseline ? saveState(root, change, { ...created, gates: { implement: { baseline, attempts: [] } } }) : created;
    recordLifecycleEvent(root, change, { phase: 'start', execution_id: executionId, previous_execution_id: null, state: withGates.state });
    return { status: 'started', mode, execution_id: executionId, state: withGates.state };
  });
}

// Gate de implementação. Pass em modo runner aprova a fatia avaliada (C1); a execução inteira não é
// aprovada aqui (ver validateFinal). evaluate é injetável para os testes; o padrão é o gate real.
// A avaliação passa pelo guarda (D8, D25): prazo max_seconds_per_gate e SIGINT/SIGTERM encerram a árvore
// de processos; o resultado parcial é descartado e nenhuma tentativa é gravada. guard é injetável nos testes.
export async function gateImplement({ root, change, options, evaluate = evaluateImplementation, guard = {} }) {
  const state = requireState(root, change);
  const blocked = requireRunner(state);
  if (blocked) return blocked;
  const baseline = state.gates?.implement?.baseline;
  if (!baseline) throw new ChecksError(`sem baseline do gate de implementação para "${change}": rode start em modo runner`);
  const before = currentPrint(root, change);
  const guarded = await guardedEvaluation({
    root, change, gate: 'implement', evaluate: ({ onSpawn }) => evaluate({ root, baseline, onSpawn }),
    executionId: state.execution_id, ...guard,
  });
  if (guarded.status === 'refused') return refused(guarded.state, guarded.stop_reason, { blocked_by: guarded.blocked_by });
  if (guarded.status === 'interrupted') {
    return {
      status: 'interrupted', gate: 'implement', cause: guarded.cause, termination_confirmed: guarded.termination_confirmed,
      gate_run_id: guarded.gate_run_id, state: guarded.state, stop_reason: guarded.stop_reason,
    };
  }
  const result = guarded.verdict;
  const after = currentPrint(root, change);
  const previous = state.gates.implement.attempts ?? [];
  const verdict = decideVerdict({ passed: result.passed, failures: result.failures }, previous);
  const attempt = { attempt: previous.length + 1, at: new Date().toISOString(), note: options.note ?? '', ...result, verdict };
  return withLock(root, change, state.execution_id, () => {
    const current = requireState(root, change);
    const counted = countGateEvaluation(current);
    saveState(root, change, {
      ...counted,
      gates: { ...current.gates, implement: { ...current.gates.implement, attempts: [...previous, attempt] } },
    });
    if (verdict !== 'pass') return { status: verdict, gate: 'implement', verdict, attempt: attempt.attempt, failures: result.failures, passed: result.passed };
    return approveImplementationSlice({ root, change, attempt, result, before, after });
  });
}

// Impressão da evidência no momento atual (D14). A fatia só vale se o código avaliado é o mesmo antes e depois.
function currentPrint(root, change) {
  return fingerprint({ root, change, runtime: defaultRuntime() }).fingerprint;
}

// O status é o veredito do gate (pass); a aprovação da fatia é o campo slice_approved. Pass sem
// fatia aprovável (impressão mudou, sem casos, fora de awaiting_gate) mantém o veredito e diz o motivo.
function approveImplementationSlice({ root, change, attempt, result, before, after }) {
  const base = { status: 'pass', gate: 'implement', verdict: 'pass', attempt: attempt.attempt, failures: result.failures, passed: true };
  const notApproved = (reason) => ({ ...base, slice_approved: false, reason: `fatia não aprovada: ${reason}` });
  if (before !== after) return notApproved('impressão alterada durante a avaliação');
  if (!Array.isArray(result.cases) || result.cases.length === 0) return notApproved('sem casos executados');
  const approval = approveSlice(root, change, {
    gate: 'implement', attempt: attempt.attempt, fingerprint: after, cases: result.cases.map((item) => item.id),
  });
  if (!approval.ok) return notApproved(`transição ${approval.from_state} → approved recusada`);
  return { ...base, slice_approved: true, slice: 'implement' };
}

export async function gateArchive({ root, change, options }) {
  const state = requireState(root, change);
  const blocked = requireRunner(state);
  if (blocked) return blocked;
  const approved = state.gates?.implement?.attempts?.at(-1)?.verdict === 'pass';
  const specsDir = join(changeDir(root, change), 'specs');
  const result = await evaluateArchive({ root, change, specsDir, implementationApproved: approved });
  const previous = state.gates?.archive?.attempts ?? [];
  const verdict = approved ? decideVerdict(result, previous) : 'stop';
  const attempt = { attempt: previous.length + 1, at: new Date().toISOString(), note: options.note ?? '', ...result, verdict };
  return withLock(root, change, state.execution_id, () => {
    const current = requireState(root, change);
    saveState(root, change, { ...current, gates: { ...current.gates, archive: { attempts: [...previous, attempt] } } });
    return { status: verdict, gate: 'archive', verdict, attempt: attempt.attempt, failures: result.failures ?? [] };
  });
}

const MS_PER_SECOND = 1000;
const PROFILE_DEFAULT = '.claude/harness/profiles/default.json';
const TIME_LIMIT = 'time_limit';

// Limite total de tempo ativo da change (RC-026): menor entre a política e o perfil usado pela execução
// (gravado no estado por run); sem perfil gravado, o padrão do projeto, se existir.
function timeLimitMs(root, state) {
  const policy = loadPolicy(root);
  let profile = state.profile?.content ?? null;
  if (profile === null && existsSync(join(root, PROFILE_DEFAULT))) profile = loadProfile(root, PROFILE_DEFAULT);
  return effectiveCeiling(policy.max_seconds_per_change, profile?.candidate_seconds_per_change) * MS_PER_SECOND;
}

// Parada por tempo a partir de qualquer estado: approved só sai para ready, então passa por ele.
function stopForTime(root, change) {
  let current = requireState(root, change);
  if (current.state === 'approved') current = saveState(root, change, applyTransition(current, 'ready').state);
  const moved = applyTransition(current, STATE_AWAITING_DECISION, { stopReason: TIME_LIMIT });
  if (!moved.ok) return current;
  const history = [...(current.stop_history ?? []), { stop_reason: TIME_LIMIT, state: STATE_AWAITING_DECISION, at: new Date().toISOString() }];
  return saveState(root, change, { ...moved.state, stop_history: history, execution_approval: null });
}

// Resultado por cenário do resumo durável, para a aceitação interna do runner no relatório (TE-004).
function scenarioCases(root, change) {
  const path = join(changeDir(root, change), 'evidence-summary.json');
  if (!existsSync(path)) return [];
  const scenarios = JSON.parse(readFileSync(path, 'utf8')).scenarios ?? {};
  return Object.entries(scenarios).map(([id, item]) => ({
    id, outcome: item.status === 'pass' ? 'pass' : item.status, mandatory: item.status !== 'not_applicable',
  }));
}

// Evento da validação final (TE-005): aprovada vira entrega aceita da execução; o resto, tentativa malsucedida.
function recordFinalValidation(root, change, { executionId, approved, verdict, cases, stops }) {
  recordEvent(root, change, {
    agent: 'runner', function: 'validacao_final', paid: false, status: approved ? 'accepted' : 'failed',
    delivery: executionId, execution_id: executionId, cases, results: [{ verdict }], stops,
  });
}

// Validação final e aprovação da execução (C1, SP-010). A execução só fica aprovada com a validação
// final em pass, todas as fatias obrigatórias aprovadas e o tempo ativo dentro do limite total: a duração
// da validação entra no tempo ativo (RC-036) e ultrapassar o limite nessa fase impede aprovar (RC-026).
export async function validateFinal({ root, change, validate = validateChange, now = Date.now }) {
  const state = requireState(root, change);
  const blocked = requireRunner(state);
  if (blocked) return blocked;
  const limitMs = timeLimitMs(root, state);
  const required = state.required_slices ?? REQUIRED_SLICES;
  const pending = required.filter((slice) => !sliceApproved(state, slice));
  const base = { execution_id: state.execution_id, pending_slices: pending };
  if ((state.active_ms ?? 0) >= limitMs) {
    stopForTime(root, change);
    recordFinalValidation(root, change, { executionId: state.execution_id, approved: false, verdict: null, cases: [], stops: [TIME_LIMIT] });
    return { status: 'stop', verdict: null, stop_reason: TIME_LIMIT, execution_approved: false, ...base };
  }
  // Fatia pendente recusa antes de rodar a suíte (MS-006): a validação final não serve para execução incompleta.
  if (pending.length > 0) {
    return { status: 'refused', ...base, execution_approved: false, message: 'há fatias obrigatórias sem aprovação: validação final não executada (SP-010)' };
  }
  const started = now();
  const outcome = await validate({ root, change, executionId: state.execution_id, runtime: defaultRuntime() });
  const timed = recordActiveTime(root, change, 'validacao', now() - started);
  const overLimit = (timed?.active_ms ?? 0) > limitMs;
  const executionApproved = outcome.verdict === 'pass' && pending.length === 0 && !overLimit;
  saveState(root, change, {
    ...requireState(root, change),
    execution_approval: executionApproved ? { execution_id: state.execution_id, approved_at: new Date().toISOString(), verdict: 'pass', slices: [...required] } : null,
  });
  if (overLimit) stopForTime(root, change);
  recordFinalValidation(root, change, {
    executionId: state.execution_id, approved: executionApproved, verdict: outcome.verdict,
    cases: outcome.verdict === 'pass' ? scenarioCases(root, change) : [], stops: overLimit ? [TIME_LIMIT] : [],
  });
  Object.assign(base, {
    verdict: outcome.verdict, stop_reason: overLimit ? TIME_LIMIT : (outcome.stop_reason ?? null),
    execution_id: outcome.execution_id ?? state.execution_id, execution_approved: executionApproved,
  });
  if (overLimit) return { status: 'stop', ...base, message: 'tempo ativo total ultrapassado na validação final: execução não aprovada (RC-026)' };
  if (outcome.verdict !== 'pass') return { status: outcome.verdict, ...base };
  return { status: 'pass', ...base };
}

function sliceApproved(state, slice) {
  return (state.slice_approvals ?? []).some((item) => (item.task ?? item.slice) === slice);
}

// Marco de checkpoint (D18, B.1): archived só depois de validação final aprovada (D18 passo 1).
export async function checkpoint({ root, change, options }) {
  const milestone = options.milestone;
  if (!MILESTONES.includes(milestone)) throw new ConfigError(`marco inválido: "${milestone}" (use ${MILESTONES.join(', ')})`);
  const state = requireState(root, change);
  if (milestone === 'archived') {
    const approval = archiveApproval({ root, change, runtime: defaultRuntime() });
    if (!approval.approved) return refused(state.state, null, { reasons: approval.reasons, message: 'arquivamento sem validação final aprovada (D18)' });
    if (state.execution_approval?.execution_id !== state.execution_id) {
      return refused(state.state, null, { message: 'execução não aprovada: fatias obrigatórias e validação final são exigidas antes do arquivamento (SP-010)' });
    }
  }
  return withLock(root, change, state.execution_id, () => {
    const written = writeMilestoneCheckpoint(changeDir(root, change), requireState(root, change), milestone);
    return { status: 'recorded', milestone, checkpoint_seq: written.checkpoint_seq };
  });
}

// Falha do passo: evento de falha com causa, e a execução vai para parada (config_error vai a config_blocked).
export async function fail({ root, change, options }) {
  const stopReason = options['stop-reason'];
  if (!STOP_REASONS.includes(stopReason)) throw new ConfigError(`motivo de parada inválido: "${stopReason}"`);
  const target = stopReason === 'config_error' ? STATE_CONFIG_BLOCKED : STATE_AWAITING_DECISION;
  return withLock(root, change, requireState(root, change).execution_id, () => {
    const state = requireState(root, change);
    const result = applyTransition(state, target, { stopReason });
    if (!result.ok) return refused(state.state, 'config_error', { message: `transição ${state.state} → ${target} recusada (${result.reason})` });
    recordLifecycleEvent(root, change, {
      phase: 'fail', execution_id: state.execution_id, invocation_id: state.invocation_id ?? null,
      state: target, stop_reason: stopReason, cause: options.cause ?? null,
    });
    const saved = saveState(root, change, { ...result.state, stop_history: [...(state.stop_history ?? []), { stop_reason: stopReason, state: target, at: new Date().toISOString() }] });
    return { status: 'recorded', state: saved.state, stop_reason: stopReason };
  });
}

export async function interrupt({ root, change }) {
  const state = requireState(root, change);
  return withLock(root, change, state.execution_id, () => {
    const result = recordInterruption({ root, change, executionId: state.execution_id });
    if (result.refused) {
      // Tentativa recusada: o estado continua o mesmo e só há o evento transition_refused (C2, RC-001).
      return refused(loadState(root, change).state, null, {
        reason: result.reason, from_state: result.from_state, to_state: result.to_state,
        message: `interrupção recusada: ${result.from_state} → ${result.to_state} fora da tabela de transições`,
      });
    }
    return { status: 'recorded', state: result.state, stop_reason: result.stop_reason };
  });
}

export async function resume({ root, change }) {
  const state = requireState(root, change);
  return withLock(root, change, state.execution_id, () => resumeExecution({ root, change }));
}

// Reconciliação D26 (kind reconciliation) no estado da execução. Idempotente por reconciliation_id.
// Saldo calculado aqui; valores informados são conferidos (RC-045). O registro formal em
// authorizations.json continua pendente (D26): o estado da execução guarda o registro.
export async function reconcile({ root, change, options }) {
  if (!options.record) throw new ConfigError('uso: reconcile --record <arquivo.json>');
  const record = JSON.parse(readFileSync(options.record, 'utf8'));
  const state = requireState(root, change);
  const blocked = requireRunner(state);
  if (blocked) return blocked;
  const policy = loadPolicy(root);
  const { records: authorizations } = loadAuthorizations(changeDir(root, change));
  const totalUsd = authorizedTotalUsd(policy, {}, activeGrants(authorizations, change));
  if (totalUsd === null) return refused(state.state, 'authorization_required', { message: 'sem concessão de orçamento vigente: sem saldo não há efeito (RC-031)' });
  return withLock(root, change, state.execution_id, () => {
    const current = requireState(root, change);
    const base = current.reconciliation_base ?? { consumption: current.consumption, open_reservations: current.open_reservations };
    let outcome;
    try {
      outcome = reconcileRecord({
        base, records: current.reconciliations ?? [], record, invocations: current.invocations ?? [],
        identity: { projectId: projectId(root), change }, totalUsd,
      });
    } catch (err) {
      if (!(err instanceof ConfigError)) throw err;
      return refused(current.state, null, { error: err.message });
    }
    if (outcome.status === 'duplicate') {
      return { status: 'duplicate', reconciliation_id: record.reconciliation_id, balance_effect: outcome.record.balance_effect, warnings: [] };
    }
    saveState(root, change, {
      ...current,
      consumption: outcome.state.consumption,
      open_reservations: outcome.state.open_reservations,
      reconciliations: outcome.records,
      reconciliation_base: base,
    });
    return {
      status: 'accepted', reconciliation_id: record.reconciliation_id,
      balance_effect: outcome.record.balance_effect, warnings: outcome.warnings,
      uncovered_reservations: uncoveredReservations({ ...current, reconciliations: outcome.records }).length,
    };
  });
}

export async function report({ root, change }) {
  requireState(root, change);
  const paths = writeReports(root, change, { now: Date.now() });
  return { status: 'written', json_path: paths.json_path, md_path: paths.md_path };
}

export async function summary({ root, change }) {
  const state = requireState(root, change);
  const view = deriveSummary(state);
  const value = {
    change, execution_id: state.execution_id, state: state.state, stop_reason: state.stop_reason ?? null,
    derived_from_revision: view.derived_from_revision, markdown: view.markdown,
  };
  writeFileAtomic(join(localDir(root, change), SUMMARY_FILE), `${JSON.stringify(value, null, 2)}\n`);
  return { status: 'ok', summary: value };
}

export const HANDLERS = Object.freeze({
  start, 'gate-implement': gateImplement, 'gate-archive': gateArchive, 'validate-final': validateFinal,
  checkpoint, fail, interrupt, resume, reconcile, report, summary,
});
