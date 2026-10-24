// Guarda da avaliação de gate (D8, D25, RC-042 a RC-046). Uma avaliação roda com prazo
// (max_seconds_per_gate) e ouvindo sinais de interrupção. No prazo ou no sinal, a árvore de
// processos de cada comando do gate é encerrada (process-group), e a execução vai de awaiting_gate a
// interrupted pela tabela de machine.mjs, com evento de interrupção próprio. O resultado parcial é
// descartado e registrado como descartado: nenhum veredito parcial vale como aprovação.
// - Encerramento confirmado: interrupted sem stop_reason; o gate não abre reserva, então não há
//   reconciliação financeira (RC-046).
// - Encerramento não confirmado: interrupted com human_decision_needed e termination_unconfirmed; nenhuma
//   avaliação nova começa até lock_release humano que cite o gate_run_id (RC-043, RC-044).
// A retomada (runner.resumeExecution) volta a awaiting_gate e marca o gate para reexecução do início.
import { randomUUID } from 'node:crypto';
import { loadAuthorizations } from './contract.mjs';
import { changeDir } from './identity.mjs';
import { applyTransition, STATE_INTERRUPTED } from './machine.mjs';
import { loadPolicy } from './policy.mjs';
import { DEFAULT_KILL_GRACE_MS, groupAlive, terminateGroup } from './process-group.mjs';
import { loadState, saveState } from './state.mjs';
import { recordLifecycleEvent, recordTransitionRefused } from './telemetry.mjs';

export const GATE_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM']);
export const PARTIAL_DISCARDED = 'discarded';
const MS_PER_SECOND = 1000;
const LOCK_RELEASE_KIND = 'lock_release';
const HUMAN_ORIGIN = 'human';
const GATE_KIND = 'gate';

// Prazo padrão de um gate: max_seconds_per_gate da política (D23).
export function defaultGateTimeoutMs(root) {
  return (loadPolicy(root).max_seconds_per_gate ?? 0) * MS_PER_SECOND;
}

// Término não confirmado liberado só por lock_release humano que cite a invocação ou o gate_run_id.
export function terminationReleased(records, change, pending) {
  return records.some((record) => record?.kind === LOCK_RELEASE_KIND
    && record.origin === HUMAN_ORIGIN
    && record.scope?.change === change
    && record.invocation_id === pending.invocation_id);
}

function releasedRecords(root, change) {
  const { records, errors } = loadAuthorizations(changeDir(root, change));
  return errors.length > 0 ? [] : records;
}

// Término não confirmado pendente (sem liberação humana) bloqueia nova avaliação (RC-044).
export function pendingTermination(root, change, state = loadState(root, change)) {
  const pending = state?.termination_unconfirmed ?? null;
  if (!pending) return null;
  return terminationReleased(releasedRecords(root, change), change, pending) ? null : pending;
}

function patchState(root, change, patch) {
  const current = loadState(root, change);
  return saveState(root, change, { ...current, ...patch(current) });
}

// Registra a interrupção do gate e aplica awaiting_gate → interrupted pela tabela. Fora da tabela,
// grava só transition_refused e as marcas da interrupção, sem mudar o estado (RC-001).
export function recordGateInterruption(root, change, { gateRunId, gate, cause, confirmed, pids = [], executionId = null }) {
  const state = loadState(root, change);
  const at = new Date().toISOString();
  const entry = {
    gate_run_id: gateRunId, gate, cause, at, termination_confirmed: confirmed, partial_result: PARTIAL_DISCARDED, from_state: state.state,
  };
  const marks = {
    gate_run: null,
    gate_interruptions: [...(state.gate_interruptions ?? []), entry],
    gate_resume_pending: { gate, gate_run_id: gateRunId },
    termination_unconfirmed: confirmed ? (state.termination_unconfirmed ?? null)
      : { invocation_id: gateRunId, gate_run_id: gateRunId, gate, kind: GATE_KIND, pids, at },
  };
  const stopReason = confirmed ? null : 'human_decision_needed';
  const result = applyTransition({ ...state, ...marks }, STATE_INTERRUPTED, { stopReason });
  const execution = executionId ?? state.execution_id;
  if (!result.ok) {
    recordTransitionRefused(root, change, { execution_id: execution, from_state: state.state, to_state: STATE_INTERRUPTED, reason: result.reason });
    const kept = saveState(root, change, { ...state, ...marks });
    return { refused: true, state: kept.state, stop_reason: kept.stop_reason ?? null, entry };
  }
  const history = stopReason === null ? {} : { stop_history: [...(state.stop_history ?? []), { stop_reason: stopReason, state: STATE_INTERRUPTED, at }] };
  const saved = saveState(root, change, { ...result.state, ...history });
  recordLifecycleEvent(root, change, {
    phase: 'interrupt', execution_id: execution, invocation_id: gateRunId, state: saved.state, stop_reason: stopReason, cause: `gate_${cause}`,
  });
  return { refused: false, state: saved.state, stop_reason: stopReason, entry };
}

// Interrupção externa com o gate em andamento (gate_run no estado, processo do runner morto): o término só
// é confirmado se nenhum grupo registrado continuar vivo.
export function recordExternalGateInterruption(root, change, { executionId = null, alive = groupAlive } = {}) {
  const state = loadState(root, change);
  const run = state.gate_run ?? { gate_run_id: randomUUID(), gate: null, pids: [] };
  const living = (run.pids ?? []).filter((pid) => alive(pid));
  return recordGateInterruption(root, change, {
    gateRunId: run.gate_run_id, gate: run.gate, cause: 'external', confirmed: living.length === 0, pids: living, executionId,
  });
}

async function terminateAll(pids, { terminate, killGraceMs }) {
  const results = await Promise.all(pids.map((pid) => terminate(pid, { graceMs: killGraceMs })));
  return results.every((item) => item.confirmed);
}

// Espera a avaliação, o prazo ou um sinal, o que vier primeiro. Ouvintes e timer são sempre removidos.
function raceEvaluation(running, { timeoutMs, signalSource, signals }) {
  let timer = null;
  const listeners = [];
  const interruption = new Promise((resolve) => {
    if (timeoutMs > 0) timer = setTimeout(() => resolve({ cause: 'timeout' }), timeoutMs);
    for (const signal of signals) {
      const listener = () => resolve({ cause: 'signal', signal });
      listeners.push([signal, listener]);
      signalSource.on(signal, listener);
    }
  });
  const cleanup = () => {
    clearTimeout(timer);
    for (const [signal, listener] of listeners) signalSource.removeListener(signal, listener);
  };
  const finished = running.then((verdict) => ({ verdict }), (error) => ({ error }));
  return Promise.race([finished, interruption]).finally(cleanup);
}

// Avalia o gate com prazo e sinais. evaluate recebe o contexto mais onSpawn(pid), que registra cada grupo
// de processos do gate. Devolve evaluated (veredito), interrupted (sem veredito) ou refused (RC-044).
export async function guardedEvaluation({
  root, change, gate, evaluate, context = {}, timeoutMs = defaultGateTimeoutMs(root), killGraceMs = DEFAULT_KILL_GRACE_MS,
  terminate = terminateGroup, signalSource = process, signals = GATE_SIGNALS, executionId = null,
}) {
  const before = loadState(root, change);
  const pending = pendingTermination(root, change, before);
  if (pending) {
    return { status: 'refused', stop_reason: 'human_decision_needed', blocked_by: 'termination_unconfirmed', state: before.state, pending };
  }
  const gateRunId = randomUUID();
  const pids = [];
  patchState(root, change, () => ({
    termination_unconfirmed: null, gate_rerun_pending: null,
    gate_run: { gate_run_id: gateRunId, gate, started_at: new Date().toISOString(), pids: [] },
  }));
  let interrupted = false;
  const onSpawn = (pid) => {
    // Depois da interrupção, comando novo do gate descartado é encerrado na hora, sem tocar o estado.
    if (interrupted) {
      terminate(pid, { graceMs: killGraceMs }).catch(() => {});
      return;
    }
    pids.push(pid);
    patchState(root, change, (current) => ({ gate_run: current.gate_run ? { ...current.gate_run, pids: [...pids] } : current.gate_run }));
  };
  const running = Promise.resolve().then(() => evaluate({ ...context, gate, onSpawn }));
  const outcome = await raceEvaluation(running, { timeoutMs, signalSource, signals });
  if ('verdict' in outcome || 'error' in outcome) {
    patchState(root, change, () => ({ gate_run: null }));
    if ('error' in outcome) throw outcome.error;
    return { status: 'evaluated', verdict: outcome.verdict, gate_run_id: gateRunId };
  }
  // Interrompido: o veredito que chegar depois é ignorado (descartado, já registrado como tal).
  interrupted = true;
  running.catch(() => {});
  const confirmed = await terminateAll(pids, { terminate, killGraceMs });
  const recorded = recordGateInterruption(root, change, {
    gateRunId, gate, cause: outcome.cause, confirmed, pids: confirmed ? [] : pids, executionId,
  });
  return {
    status: 'interrupted', cause: outcome.cause, signal: outcome.signal ?? null, termination_confirmed: confirmed,
    gate_run_id: gateRunId, state: recorded.state, stop_reason: recorded.stop_reason, refused_transition: recorded.refused,
  };
}
