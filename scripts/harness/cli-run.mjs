// Subcomando `run` da CLI do runner: a entrada pública da execução headless. Conecta o ciclo da
// fatia que já existe (slice.mjs: invocação, gate, correções com teto, sintoma repetido, divergência)
// ao gate de implementação real e à validação final (cli-actions.mjs). É o único subcomando que chama
// o modelo, sempre por runHarnessStep: autorização budget, reserva e lock vêm de lá (HE-005, RC-008).
// Uso: node scripts/harness/cli.mjs run --change <nome> [--task <texto>] [--model <m>] [--effort <e>]
//      [--profile <arquivo>] [--claude-bin "<comando>"] [--root <dir>]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateImplementation } from '../gates/implement-gate.mjs';
import { validateFinal, withLock } from './cli-actions.mjs';
import { defaultRuntime, fingerprint, protectedSnapshot, sha256, sortKeys } from './evidence.mjs';
import { applyTransition, STATE_APPROVED, STATE_READY } from './machine.mjs';
import { ConfigError, loadProfile } from './policy.mjs';
import { approvedTask, runSlice, sliceDeclarations } from './slice.mjs';
import { PREFLIGHT_BLOCKED, runPreflight } from './preflight.mjs';
import { conciliate } from './conciliation.mjs';
import { guardedEvaluation } from './gate-guard.mjs';
import { financialMode } from './observation.mjs';
import { buildReport } from './report.mjs';
import { readEvents } from './telemetry.mjs';
import { loadState, saveState } from './state.mjs';
import { buildStopReport } from './stop-report.mjs';

const RUNNER = 'runner';
const GATE = 'implement';
const SKILL = '/spec-implement';
const PROFILE_DEFAULT = '.claude/harness/profiles/default.json';
const DEFAULT_BIN = ['claude'];
const RECONCILIATION_MISMATCH = 'reconciliation_mismatch';
const REVALIDATION_INTERRUPTED = 'revalidation_interrupted';
const profilePathOf = (options) => (typeof options.profile === 'string' ? options.profile : PROFILE_DEFAULT);

// Prompt de cada passo (HE-001): a skill nomeada e o argumento de tarefa. --runner-step diz à skill
// que o runner avalia o gate; a correção leva as falhas do gate.
export function stepPrompt(change, task) {
  return `${SKILL} ${change} --runner-step${task ? ` --task ${task}` : ''}`;
}

export function correctionPrompt(change, task, verdict) {
  const failures = verdict.failures.length > 0 ? verdict.failures.join(', ') : 'sem caso identificado (ver lint, tipos ou código de saída)';
  return `${stepPrompt(change, task)} --correction "falhas do gate de implementação: ${failures}"`;
}

// Identificadores entre colchetes do nome do caso ("[E2E-001] ..." ou "arquivo > [E2E-001] ...").
const bracketIds = (name) => [...name.matchAll(/\[([^\]\s]+)\]/g)].map((match) => match[1]);

const print = (root, change) => fingerprint({ root, change, runtime: defaultRuntime() }).fingerprint;

// Cada avaliação vira uma tentativa do gate no estado, como em gate-implement (gate-archive lê a última).
function recordAttempt(root, change, result, verdict, task) {
  const current = loadState(root, change);
  const implement = current.gates.implement;
  const attempt = {
    attempt: (implement.attempts ?? []).length + 1, at: new Date().toISOString(), note: 'run', ...result, verdict,
    ...(task ? { task } : {}),
  };
  saveState(root, change, { ...current, gates: { ...current.gates, implement: { ...implement, attempts: [...(implement.attempts ?? []), attempt] } } });
  return attempt.attempt;
}

// Gate real adaptado ao ciclo da fatia. A fatia só aprova com casos executados e a mesma impressão
// antes e depois da avaliação; impressão alterada ou ausência de casos pedem decisão humana.
// Cenários declarados para a fatia (MS-008) precisam passar, mesmo que os casos antigos passem.
function implementEvaluation(root, change, evaluate, slice) {
  return async ({ onSpawn }) => {
    const baseline = loadState(root, change).gates.implement.baseline;
    const before = print(root, change);
    const result = await evaluate({ root, baseline, onSpawn });
    const after = print(root, change);
    const cases = Array.isArray(result.cases) ? result.cases : [];
    // Identidade exata (MS-019): o cenário casa só por igualdade com um identificador entre colchetes do nome do caso.
    const passed = (scenario) => cases.some((item) => item.status === 'pass' && bracketIds(item.id).includes(scenario));
    const missing = slice.scenarios.filter((scenario) => !passed(scenario));
    const failures = [...cases.filter((item) => item.status !== 'pass').map((item) => item.id), ...missing];
    let outcome = result.passed && missing.length === 0 ? 'passed' : 'failed';
    if (before !== after || (result.passed && cases.length === 0)) outcome = 'human_decision_needed';
    const attempt = recordAttempt(root, change, result, outcome === 'passed' ? 'pass' : 'retry', slice.name);
    return { outcome, failures, errorClass: null, cases: cases.map((item) => item.id), fingerprint: after, attempt };
  };
}

// Três formas, sem concatenação de shell: caminho de executável existente (espaços preservados),
// array JSON de argumentos (`["node","a b/sim.mjs"]`) e comando separado por espaços (simulador).
export function binOf(options) {
  const raw = options['claude-bin'];
  if (raw === undefined) return DEFAULT_BIN;
  if (typeof raw !== 'string' || raw.trim() === '') throw new ConfigError('--claude-bin exige um comando');
  const value = raw.trim();
  if (existsSync(value)) return [value];
  if (value.startsWith('[')) return parseBinArray(value);
  return value.split(/\s+/);
}

function parseBinArray(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ConfigError('--claude-bin em array JSON é inválido; nada foi executado');
  }
  const valid = Array.isArray(parsed) && parsed.length > 0 && parsed.every((item) => typeof item === 'string' && item !== '');
  if (!valid) throw new ConfigError('--claude-bin em array JSON exige strings não vazias; nada foi executado');
  return parsed;
}

// runHarnessStep recusa sem autorização budget (e perfil com turnos sem sonda) antes do lock, sem gravar.
// A entrada pública grava a parada com o lock, para o estado mostrar o motivo (RC-021, PO-013).
const STOPS_BEFORE_LOCK = new Set(['authorization_required', 'config_error']);

async function persistEarlyStop(root, change, outcome) {
  if (outcome.invoked || !STOPS_BEFORE_LOCK.has(outcome.stop_reason)) return;
  const { execution_id: executionId } = loadState(root, change);
  await withLock(root, change, executionId, () => {
    const current = loadState(root, change);
    const moved = applyTransition(current, outcome.state, { stopReason: outcome.stop_reason });
    if (moved.ok) saveState(root, change, moved.state);
  });
}

// Perfil efetivamente usado, gravado no estado antes da primeira chamada: a impressão o usa (EV-001).
async function recordProfile(root, change, path) {
  const raw = readFileSync(join(root, path));
  const profile = { path, sha256: sha256(raw), content: sortKeys(JSON.parse(raw.toString('utf8'))) };
  const { execution_id: executionId } = loadState(root, change);
  await withLock(root, change, executionId, () => saveState(root, change, { ...loadState(root, change), profile }));
  return profile;
}

// Conciliação entre estado, eventos e relatório (MS-013), com o mesmo cálculo de consumo do relatório.
function conciliateExecution(root, change, profilePath) {
  const state = loadState(root, change);
  const events = readEvents(root, change);
  const report = buildReport({ change, events, state });
  return conciliate({
    state, events, reportInvocations: report.invocations.measured, financial: financialMode(loadProfile(root, profilePath)),
  });
}

// Divergência de contagens ou de custo para a conclusão antes da validação final: nada é aprovado.
async function conclude({ root, change, validate, outcome, profilePath }) {
  const conciliation = conciliateExecution(root, change, profilePath);
  if (conciliation.status !== 'reconciled') {
    const current = loadState(root, change);
    return {
      status: 'stop', state: current.state, stop_reason: RECONCILIATION_MISMATCH, execution_id: current.execution_id,
      slice_approved: true, execution_approved: false, conciliation, invoked: outcome?.invoked ?? false,
    };
  }
  const final = await validateFinal({ root, change, validate });
  const approved = final.status === 'pass';
  return {
    status: approved ? 'pass' : 'stop', state: loadState(root, change).state, stop_reason: approved ? null : (final.stop_reason ?? 'invalid_evidence'),
    execution_id: final.execution_id, slice_approved: true, execution_approved: final.execution_approved,
    final_validation: final, conciliation, invoked: outcome?.invoked ?? false,
  };
}

// Uma invocação de fatia até aprovação ou parada. task None = fatia legada (implement, sem cenários exigidos).
async function sliceRun({ root, change, options, evaluate, profile, slice }) {
  const { name: task } = slice;
  return runSlice({
    root, change, gate: GATE, stage: GATE, cwd: root, bin: binOf(options),
    task, correctionKey: task ? `${task}:${GATE}` : GATE,
    profile,
    model: typeof options.model === 'string' ? options.model : undefined,
    effort: typeof options.effort === 'string' ? options.effort : undefined,
    prompt: stepPrompt(change, task),
    correctionPrompt: (verdict) => correctionPrompt(change, task, verdict),
    evaluate: implementEvaluation(root, change, evaluate, slice),
    snapshot: async () => print(root, change),
    protect: () => protectedSnapshot({ root, change }),
  });
}

function stopResult(root, change, outcome, objective) {
  const current = loadState(root, change);
  return {
    status: 'stop', state: outcome.state ?? current?.state ?? null, stop_reason: outcome.stop_reason ?? null,
    execution_id: current?.execution_id ?? null, slice_approved: false, execution_approved: false,
    blocked_by: outcome.blocked_by ?? null, protected_changes: outcome.protected_changes ?? null,
    stop_report: buildStopReport({ outcome, state: current, objective }),
  };
}

// Volta a ready depois de uma fatia aprovada, para a próxima fatia começar pela tabela (approved → ready).
async function leaveApproved(root, change) {
  const { execution_id: executionId } = loadState(root, change);
  await withLock(root, change, executionId, () => {
    const current = loadState(root, change);
    if (current.state !== STATE_APPROVED) return;
    const moved = applyTransition(current, STATE_READY);
    if (moved.ok) saveState(root, change, moved.state);
  });
}

// Lista de fatias obrigatórias gravada uma vez no estado: a validação final usa a mesma lista da execução.
async function recordRequiredSlices(root, change, names) {
  const { execution_id: executionId } = loadState(root, change);
  await withLock(root, change, executionId, () => saveState(root, change, { ...loadState(root, change), required_slices: names }));
}

// Atualiza só as aprovações de fatia, sob lock (a execução mantém o mesmo execution_id).
async function patchApprovals(root, change, update) {
  const { execution_id: executionId } = loadState(root, change);
  await withLock(root, change, executionId, () => {
    const current = loadState(root, change);
    saveState(root, change, { ...current, ...update(current) });
  });
}

// Identidade de uma aprovação: a leitura do lock devolve objetos novos, então a comparação usa tarefa e instante.
const sameApproval = (a, b) => a.task === b.task && a.at === b.at;

// Reavaliação de fatia aprovada (MS-011, MS-012): se a impressão mudou desde a aprovação, o gate da fatia roda de
// novo sem invocar o modelo. Passa: a aprovação segue com a nova impressão e o histórico. Falha: a aprovação sai de
// slice_approvals e vai para invalidated_slices, e a fatia volta ao ciclo com o modelo.
// Sem veredito (prazo, sinal ou recusa do guarda), devolve o resultado do guarda e não altera nenhuma aprovação.
export async function revalidateApprovals({ root, change, evaluate, slices, guard = {} }) {
  for (const slice of slices) {
    const record = (loadState(root, change).slice_approvals ?? []).filter((item) => item.task === slice.name).at(-1);
    if (!record || record.fingerprint === print(root, change)) continue;
    const guarded = await guardedEvaluation({
      root, change, gate: GATE, evaluate: implementEvaluation(root, change, evaluate, slice), executionId: loadState(root, change).execution_id, ...guard,
    });
    // Sem veredito: a aprovação fica como está, o motivo é explícito e a próxima execução revalida de novo (MS-017).
    if (guarded.status === 'interrupted') {
      return { ...guarded, stop_reason: REVALIDATION_INTERRUPTED, revalidated_task: slice.name };
    }
    if (guarded.status !== 'evaluated') return guarded;
    const verdict = guarded.verdict;
    const at = new Date().toISOString();
    if (verdict.outcome === 'passed') {
      const revalidated = { ...record, fingerprint: verdict.fingerprint, revalidated_at: at, revalidations: [...(record.revalidations ?? []), { at, from: record.fingerprint, to: verdict.fingerprint }] };
      await patchApprovals(root, change, (current) => ({
        slice_approvals: current.slice_approvals.map((item) => (sameApproval(item, record) ? revalidated : item)),
      }));
    } else {
      const invalidation = { task: slice.name, fingerprint: record.fingerprint, at, outcome: verdict.outcome, failures: verdict.failures };
      await patchApprovals(root, change, (current) => ({
        slice_approvals: current.slice_approvals.filter((item) => !sameApproval(item, record)),
        invalidated_slices: [...(current.invalidated_slices ?? []), invalidation],
      }));
    }
  }
  return null;
}

// Execução multifatia (add-multislice-run, MS-003 a MS-007): uma fatia por vez, na ordem de tasks.md. Fatias
// aprovadas não são invocadas de novo, mas são reavaliadas se a impressão mudou; a conclusão só vem depois da última
// fatia e da validação final.
async function runDeclaredSlices({ root, change, options, evaluate, validate, slices }) {
  await recordRequiredSlices(root, change, slices.map((slice) => slice.name));
  const profilePath = typeof options.profile === 'string' ? options.profile : PROFILE_DEFAULT;
  const profile = loadProfile(root, profilePath);
  await recordProfile(root, change, profilePath);
  for (;;) {
    const stopped = await revalidateApprovals({ root, change, evaluate, slices });
    if (stopped) return stopResult(root, change, { ...stopped, invoked: false, stop_reason: stopped.stop_reason ?? null }, `revalidação da change ${change}`);
    const pending = slices.filter((slice) => !approvedTask(loadState(root, change), slice.name));
    if (pending.length === 0) return conclude({ root, change, validate, outcome: null, profilePath: profilePathOf(options) });
    const [slice] = pending;
    await leaveApproved(root, change);
    const outcome = await sliceRun({ root, change, options, evaluate, profile, slice });
    if (outcome.state !== STATE_APPROVED) {
      await persistEarlyStop(root, change, outcome);
      return stopResult(root, change, outcome, `fatia ${slice.name} da change ${change}`);
    }
  }
}

// Subcomando preflight (MS-009): mesma verificação do run, sem lock e sem chamada ao modelo.
export function preflight({ root, change, options = {} }) {
  const report = runPreflight({ root, bin: binOf(options), profilePath: profilePathOf(options), change });
  return { status: report.status === 'ready' ? 'pass' : 'refused', items: report.items };
}

export async function run({ root, change, options = {}, evaluate = evaluateImplementation, validate }) {
  const state = loadState(root, change);
  if (!state) throw new ConfigError(`sem execução para "${change}": rode start antes`);
  if (state.mode !== RUNNER) {
    return { status: 'refused', stop_reason: 'mode_mismatch', state: state.state, message: 'run é do modo runner: rode start --mode runner depois do marco de adoção' };
  }
  if (!state.gates?.implement?.baseline) throw new ConfigError(`sem baseline do gate de implementação para "${change}": rode start em modo runner`);
  // Preflight antes de qualquer invocação (MS-009): item bloqueado recusa sem chamar o modelo.
  const preflight = runPreflight({
    root, bin: binOf(options), profilePath: profilePathOf(options), change,
  });
  if (preflight.status !== 'ready') return { status: 'refused', stop_reason: PREFLIGHT_BLOCKED, state: state.state, items: preflight.items };
  const declared = sliceDeclarations(root, change);
  if (declared.length > 0) return runDeclaredSlices({ root, change, options, evaluate, validate, slices: declared });
  // Fatia já aprovada: falta só a validação final, sem nova chamada.
  if (state.state === STATE_APPROVED) return conclude({ root, change, validate, outcome: null, profilePath: profilePathOf(options) });

  const task = typeof options.task === 'string' ? options.task : null;
  const profilePath = typeof options.profile === 'string' ? options.profile : PROFILE_DEFAULT;
  const profile = loadProfile(root, profilePath);
  await recordProfile(root, change, profilePath);
  const outcome = await sliceRun({ root, change, options, evaluate, profile, slice: { name: task, scenarios: [] } });
  if (outcome.state === STATE_APPROVED) return conclude({ root, change, validate, outcome, profilePath: profilePathOf(options) });
  await persistEarlyStop(root, change, outcome);
  return stopResult(root, change, outcome, `fatia ${GATE} da change ${change}`);
}
