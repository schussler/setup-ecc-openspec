// Runner de uma etapa headless (F5, F6). Ordem dos portões, antes de qualquer processo:
// 1. configuração (PO-002, PO-013): perfil que exige limite de turnos precisa de probe_result enforced humano;
// 2. limite efetivo e autorização de orçamento (HE-005, RC-021, RC-031): sem concessão vigente, authorization_required;
// 3. lock da change (D1, RS-022); 4. modo runner (D20);
// 5. nova execução só a partir de parada (RS-024, RC-035); invocação interrompida exige reconciliação (RC-017, RC-024);
// 6. tempo ativo e invocações da change (RC-026, RC-036, RC-037);
// 7. reserva cabe no saldo total descontando consumo e reservas pendentes (RC-008, RC-009, RC-033);
// 8. reserva gravada antes do processo; 9. invocação com timeout efetivo (D23); 10. reconciliação do resultado (RC-010, RC-011).
// Toda mudança de estado passa por machine.mjs (RC-001) e o motivo fica em stop_reason (RC-002).
import { randomUUID } from 'node:crypto';
import { invokeHarness, readAllowedTools } from './claude.mjs';
import { activeGrants, applyReconciliation, authorizedTotalUsd, checkReserve, marginUsd, reservationUsd, settleCall } from './budget.mjs';
import { countInvocation } from './counters.mjs';
import { loadAuthorizations } from './contract.mjs';
import { addActive, emptyActiveBook } from './active-time.mjs';
import { changeDir } from './identity.mjs';
import { acquireLockReleasingAuthorized, releaseLock } from './lock.mjs';
import {
  STATE_APPROVED, STATE_AWAITING_DECISION, STATE_AWAITING_GATE, STATE_CONFIG_BLOCKED,
  STATE_DIAGNOSING, STATE_FORBIDDEN, STATE_INTERRUPTED, STATE_INVOKING, STATE_READY, applyTransition,
} from './machine.mjs';
import { ConfigError, effectiveCeiling, effectiveLimit, loadPolicy, validateProfileAgainstPolicy } from './policy.mjs';
import { createState, loadState, prepareReservation, saveState } from './state.mjs';
import { compareProtected } from './evidence.mjs';
import { eventFromInvocation, recordEvent, recordLifecycleEvent, recordTransitionRefused } from './telemetry.mjs';
import { pendingTermination, recordExternalGateInterruption, terminationReleased } from './gate-guard.mjs';

const RUNNER_MODE = 'runner';
const PROBE_KIND = 'probe_result';
const ENFORCED = 'enforced';
const HUMAN_ORIGIN = 'human';
const RECONCILIATION_KIND = 'reconciliation';
const RECONCILIATION_DECISIONS = ['kept', 'closed_observed', 'closed_unknown'];
const NEW_EXECUTION_FROM = new Set([STATE_AWAITING_DECISION, STATE_INTERRUPTED, STATE_CONFIG_BLOCKED, STATE_DIAGNOSING]);
const TIMEOUT_REQUIRED = ['partial_output', 'duration_ms', 'command'];
const MS_PER_SECOND = 1000;

function stopped(state, stopReason, extra = {}) {
  return {
    invoked: false, state, stop_reason: stopReason, result: null, session_id: null, invocation_id: null,
    limit_usd: null, margin_usd: null, reserved_usd: null, ...extra,
  };
}

function loadRecords(root, change) {
  const { records, errors } = loadAuthorizations(changeDir(root, change));
  if (errors.length > 0) throw new ConfigError(`authorizations.json ilegível: ${errors[0].message}`, { stopReason: 'human_decision_needed' });
  return records;
}

// probe_result enforced vale só se for humano, da change, e não tiver sido revogado.
function hasEnforcedProbe(records, change) {
  const revoked = new Set(records.map((record) => record?.revokes).filter(Boolean));
  return records.some((record) => record?.kind === PROBE_KIND
    && record.result === ENFORCED
    && record.origin === HUMAN_ORIGIN
    && record.scope?.change === change
    && !revoked.has(record.id));
}

function nonEmpty(value) {
  return typeof value === 'string' && value.length > 0;
}

// Decisões humanas de reconciliação para as reservas abertas, ou null se alguma reserva
// ainda não tem decisão (RC-017, RC-024, RS-014).
function reconciliationDecisions(records, state) {
  const items = records
    .filter((record) => record?.kind === RECONCILIATION_KIND && record.origin === HUMAN_ORIGIN
      && nonEmpty(record.approver) && nonEmpty(record.date))
    .flatMap((record) => record.reservations ?? []);
  const bySession = new Map(items.map((item) => [item.session_id, item]));
  const covered = state.open_reservations.every((entry) => RECONCILIATION_DECISIONS.includes(bySession.get(entry.session_id)?.decision));
  return covered ? state.open_reservations.map((entry) => bySession.get(entry.session_id)) : null;
}

// Toda gravação leva o tempo ativo acumulado nesta etapa (RC-036). Sem tempo medido, mantém o do estado.
function persist(ctx, next) {
  const time = ctx.timeBook ?? { total: next.active_ms ?? 0, book: next.active_ms_by_category ?? emptyActiveBook() };
  return saveState(ctx.root, ctx.change, { ...next, active_ms: time.total, active_ms_by_category: time.book });
}

// Soma ao tempo ativo da etapa a duração de uma invocação, gate ou ferramenta do runner (RC-036).
function addTime(book, category, ms) {
  return { total: book.total + ms, book: addActive(book.book, category, ms) };
}

async function timedIn(ctx, category, run) {
  const started = Date.now();
  try {
    return await run();
  } finally {
    ctx.timeBook = addTime(ctx.timeBook, category, Date.now() - started);
  }
}

// Tentativa recusada: só um evento transition_refused (origem, destino e motivo). O estado não muda (C2).
function refuseTransition(ctx, from, to, reason) {
  recordTransitionRefused(ctx.root, ctx.change, { execution_id: ctx.executionId, from_state: from, to_state: to, reason });
}

// Aplica uma transição pela tabela e grava. Parada acrescenta o motivo ao histórico.
function transitionTo(ctx, state, to, { stopReason = null, patch = {} } = {}) {
  const result = applyTransition({ ...state, ...patch }, to, { stopReason });
  if (!result.ok) {
    refuseTransition(ctx, state.state, to, result.reason);
    throw new ConfigError(`transição ${state.state} → ${to} recusada (${result.reason})`);
  }
  const history = stopReason === null ? {} : {
    stop_history: [...(state.stop_history ?? []), { stop_reason: stopReason, state: to, at: new Date().toISOString() }],
  };
  return persist(ctx, { ...result.state, ...history });
}

function stopFrom(ctx, state, to, stopReason, limits) {
  const next = transitionTo(ctx, state, to, { stopReason });
  return stopped(next.state, stopReason, limits);
}

function limitsOf(limit, policy) {
  const marginValue = marginUsd(limit, policy.reserve_margin_ratio);
  return { limit_usd: limit, margin_usd: marginValue, reserved_usd: reservationUsd(limit, policy.reserve_margin_ratio) };
}

// Nova execução: mesmo estado, execution_id novo e previous_execution_id; consumo, reservas e limites ficam (RC-035).
function beginExecution(ctx, state) {
  const replaced = { ...state, execution_id: ctx.executionId, previous_execution_id: state.execution_id };
  return transitionTo(ctx, replaced, STATE_READY);
}

// Há consumo ou reserva a reconciliar: reservas abertas ou chamadas de custo desconhecido (RC-046).
function requiresReconciliation(state) {
  return state.open_reservations.length > 0 || (state.consumption?.unknown_calls ?? 0) > 0;
}

// Interrupção: a transição é aceita e persistida antes do evento de interrupção (C2). Origem fora da
// tabela (por exemplo approved) devolve { refused: true } com evento transition_refused, sem
// evento de interrupção e sem gravar estado. Só exige reconciliação com consumo ou reserva (RC-017, RC-046).
// Em awaiting_gate, a interrupção é de gate (D8): resultado parcial descartado, sem reconciliação financeira.
function markInterrupted(ctx, state) {
  if (state.state === STATE_AWAITING_GATE) {
    const gate = recordExternalGateInterruption(ctx.root, ctx.change, { executionId: ctx.executionId });
    return stopped(gate.state, gate.stop_reason, { gate_interruption: gate.entry });
  }
  const open = state.open_reservations.map((entry) => ({ ...entry, interrupted: true }));
  const event = { invocation_id: state.invocation_id ?? null, at: new Date().toISOString(), from_state: state.state };
  const interrupted = { ...state, open_reservations: open, interruptions: [...(state.interruptions ?? []), event], gate_resume_pending: null };
  const reason = requiresReconciliation(interrupted) ? 'reconciliation_required' : null;
  const check = applyTransition(state, STATE_INTERRUPTED, { stopReason: reason });
  if (!check.ok) {
    refuseTransition(ctx, state.state, STATE_INTERRUPTED, check.reason);
    return { refused: true, from_state: state.state, to_state: STATE_INTERRUPTED, reason: check.reason };
  }
  const next = transitionTo(ctx, interrupted, STATE_INTERRUPTED, { stopReason: reason });
  recordLifecycleEvent(ctx.root, ctx.change, {
    phase: 'interrupt', execution_id: ctx.executionId, invocation_id: event.invocation_id, state: next.state,
  });
  return stopped(next.state, reason, {});
}

// Estado novo com a reconciliação aplicada, ou null se alguma reserva ainda não tem decisão humana.
function reconcileInterrupted(state, records) {
  if (!requiresReconciliation(state)) return state;
  // Reservas já cobertas por registro D26 (já aplicado ao estado) dispensam a decisão do caminho antigo (RC-024).
  if (uncoveredReservations(state).length === 0 && (state.reconciliations ?? []).length > 0) return state;
  const decisions = reconciliationDecisions(records, state);
  if (decisions === null) return null;
  const applied = applyReconciliation(state.consumption, state.open_reservations, decisions);
  return { ...state, consumption: applied.consumption, open_reservations: applied.open_reservations };
}

// Término não confirmado só é liberado por lock_release humano que cite a invocação (RC-043, RC-044):
// terminationReleased, em gate-guard.mjs, vale para invocação e para gate.

// Estados que devem voltar a ready antes de novas verificações. Parada de diagnóstico e de
// configuração volta a ready quando as verificações passam de novo (RC-036, RC-013).
function normalizeToReady(ctx, state) {
  if (state.state === STATE_FORBIDDEN) return { blocked: true, state };
  if ([STATE_AWAITING_DECISION, STATE_CONFIG_BLOCKED, STATE_DIAGNOSING, STATE_APPROVED].includes(state.state)) {
    return { blocked: false, state: transitionTo(ctx, state, STATE_READY) };
  }
  return { blocked: false, state };
}

function changedPaths(recorded, current) {
  const paths = new Set([...Object.keys(recorded), ...Object.keys(current)]);
  return [...paths].filter((path) => recorded[path] !== current[path]).sort();
}

function timeoutDiagnostic(result) {
  return {
    required: TIMEOUT_REQUIRED,
    partial_output: result.partial_output ?? '',
    duration_ms: result.duration_ms,
    command: result.command ?? [],
  };
}

// Uma invocação completa, a partir do estado já validado. Ver a ordem dos portões no topo.
async function runStep(ctx, options) {
  const { root, change, policy, profile, limit, records, tools, prompt, bin, env, cwd, model, effort, observe, killGraceMs, terminate, protect, agent } = options;
  let state = loadState(root, change) ?? createState(root, change, { mode: RUNNER_MODE, executionId: ctx.executionId });
  if (state.mode !== RUNNER_MODE) return stopped(STATE_CONFIG_BLOCKED, 'mode_mismatch');
  ctx.timeBook = { total: state.active_ms ?? 0, book: { ...emptyActiveBook(), ...(state.active_ms_by_category ?? {}) } };
  // Motivo lido antes da normalização, que limpa stop_reason (D26, RC-017, RC-024).
  const reconciliationPending = state.stop_reason === 'reconciliation_required' || state.state === STATE_INTERRUPTED;
  if (state.termination_unconfirmed) {
    if (!terminationReleased(records, change, state.termination_unconfirmed)) {
      ctx.keepLock = true;
      return stopped(state.state, 'human_decision_needed', { blocked_by: 'termination_unconfirmed' });
    }
    state = persist(ctx, { ...state, termination_unconfirmed: null });
  }
  if (options.newExecution) state = beginExecution(ctx, state);

  const limits = limitsOf(limit, policy);
  if (state.state === STATE_INVOKING) return markInterrupted(ctx, state);
  if (state.state === STATE_INTERRUPTED) {
    const reconciled = reconcileInterrupted(state, records);
    if (reconciled === null) return stopped(STATE_INTERRUPTED, 'reconciliation_required');
    // Nova invocação a partir da interrupção: um gate interrompido pendente deixa de ser retomável.
    state = transitionTo(ctx, reconciled, STATE_READY, { patch: { gate_resume_pending: null } });
  }

  const normalized = normalizeToReady(ctx, state);
  if (normalized.blocked) return stopped(normalized.state.state, 'human_decision_needed', limits);
  state = normalized.state;

  if (observe && Object.keys(state.observed_hashes ?? {}).length > 0) {
    const changed = changedPaths(state.observed_hashes, await timedIn(ctx, 'ferramenta', observe));
    if (changed.length > 0) state = persist(ctx, { ...state, pending_validation: changed, approved_evidence_hash: null });
  }

  const timeLimitMs = effectiveCeiling(policy.max_seconds_per_change, profile.candidate_seconds_per_change) * MS_PER_SECOND;
  if (ctx.timeBook.total >= timeLimitMs) return stopFrom(ctx, state, STATE_AWAITING_DECISION, 'time_limit', limits);

  const maxInvocations = effectiveCeiling(policy.max_invocations_per_change, profile.candidate_invocations_per_change);
  if ((state.invocations_total ?? 0) >= maxInvocations) return stopFrom(ctx, state, STATE_AWAITING_DECISION, 'budget_exhausted', limits);

  const verdict = checkReserve({
    authorizedTotalUsd: authorizedTotalUsd(policy, profile, options.grants),
    consumption: state.consumption,
    openReservations: state.open_reservations,
    reserveUsd: limits.reserved_usd,
  });
  if (!verdict.ok) return stopFrom(ctx, state, STATE_AWAITING_DECISION, verdict.stop_reason, limits);

  // Reserva aberta sem registro de reconciliação D26 bloqueia a próxima chamada paga (D19, D26).
  if (uncoveredReservations(state, { mandatory: reconciliationPending }).length > 0) {
    return stopFrom(ctx, state, STATE_AWAITING_DECISION, 'reconciliation_required', limits);
  }

  const invocationId = randomUUID();
  let sessionId;
  try {
    sessionId = prepareReservation(root, change, { reserved_usd: limits.reserved_usd, invocation_id: invocationId }, { authorizations: records });
  } catch (err) {
    if (err.stopReason !== 'reconciliation_required') throw err;
    return stopFrom(ctx, state, STATE_AWAITING_DECISION, 'reconciliation_required', limits);
  }
  const reserved = loadState(root, change);
  const invoking = transitionTo(ctx, reserved, STATE_INVOKING, {
    patch: {
      invocation_id: invocationId,
      attempt_id: reserved.attempt_id + 1,
      invocations_total: (reserved.invocations_total ?? 0) + 1,
      // Histórico de invocações da execução: a CLI de reconcile confere a correspondência por ele (RC-051).
      invocations: [...(reserved.invocations ?? []), { invocation_id: invocationId, execution_id: ctx.executionId, at: new Date().toISOString() }],
      counters: countInvocation(reserved).counters,
    },
  });

  const timeoutMs = effectiveCeiling(policy.max_seconds_per_call, profile.candidate_seconds_per_call) * MS_PER_SECOND;
  const protectedBefore = protect ? await timedIn(ctx, 'ferramenta', protect) : null;
  const result = await timedIn(ctx, 'invocacao', () => invokeHarness({
    bin, cwd, prompt, allowedTools: tools, sessionId, maxBudgetUsd: limit, model, effort, env,
    timeoutMs: options.timeoutMs === undefined ? timeoutMs : Math.min(timeoutMs, options.timeoutMs), killGraceMs, terminate,
  }));

  const current = loadState(root, change);
  const settled = settleCall(current.consumption, current.open_reservations, {
    sessionId, cost_usd: result.cost_usd, cost_source: result.cost_source,
  });
  const observed = observe ? await timedIn(ctx, 'ferramenta', observe) : current.observed_hashes;
  // Término não confirmado: o processo pode seguir vivo. O estado registra, o lock não é liberado,
  // e nenhuma avaliação nova começa até decisão humana (RC-043, RC-044).
  const unconfirmed = result.termination_confirmed === false;
  if (unconfirmed) ctx.keepLock = true;
  const stopReason = unconfirmed ? 'human_decision_needed' : (result.stop_reason ?? null);
  // Um evento por invocação (F9, TE-001 a TE-002): custo sem origem fica unknown, nunca zero.
  recordEvent(root, change, eventFromInvocation(result, {
    agent, function: 'invocacao', model, effort, execution_id: ctx.executionId, invocation_id: invocationId,
  }));
  const patch = {
    consumption: settled.consumption,
    open_reservations: settled.open_reservations,
    observed_hashes: observed,
    timeout_diagnostic: result.stop_reason === 'timeout_unclassified' ? timeoutDiagnostic(result) : current.timeout_diagnostic,
    termination_unconfirmed: unconfirmed
      ? { invocation_id: invocationId, session_id: sessionId, at: new Date().toISOString() }
      : (current.termination_unconfirmed ?? null),
  };
  // Caminho protegido alterado durante a invocação (EV-003): a parada vem de awaiting_gate, a única
  // origem da tabela que aceita forbidden_action_stopped.
  const protectedAfter = protect ? await timedIn(ctx, 'ferramenta', protect) : null;
  const protectedChanges = protect ? compareProtected(protectedBefore, protectedAfter) : [];
  if (protectedChanges.length > 0) {
    const awaiting = transitionTo(ctx, { ...invoking, ...patch }, STATE_AWAITING_GATE);
    const forbidden = transitionTo(ctx, awaiting, STATE_FORBIDDEN, { stopReason: 'protected_change' });
    return {
      invoked: true, state: forbidden.state, stop_reason: 'protected_change', result, session_id: sessionId,
      invocation_id: invocationId, protected_changes: protectedChanges, ...limits,
    };
  }
  const finished = transitionTo(ctx, { ...invoking, ...patch }, stopReason ? STATE_AWAITING_DECISION : STATE_AWAITING_GATE, { stopReason });
  return {
    invoked: true, state: finished.state, stop_reason: stopReason, result, session_id: sessionId,
    invocation_id: invocationId, ...limits,
  };
}

// Fim de uma etapa para a telemetria de ciclo de vida (TE-010). Conclusão quando a invocação
// terminou com sucesso e sem parada; falha quando há parada ou status diferente de success.
// Interrupção já foi gravada em markInterrupted; a parada de reconciliação não tem fim próprio.
function terminalLifecycle(result, executionId) {
  if (result.state === STATE_INTERRUPTED && !result.invoked) return null;
  const status = result.result?.status ?? null;
  if (result.stop_reason || (result.invoked && status !== 'success')) {
    return {
      phase: 'fail', execution_id: executionId, invocation_id: result.invocation_id ?? null, state: result.state,
      stop_reason: result.stop_reason ?? null, status, cause: result.result?.cause ?? null,
    };
  }
  if (result.invoked) {
    return { phase: 'complete', execution_id: executionId, invocation_id: result.invocation_id, state: result.state, status };
  }
  return null;
}

// Executa uma etapa com o lock da change. A liberação do lock é sempre tentada ao fim.
// Partida recusada pelo lock não grava nada em events.jsonl (TE-009): o diagnóstico vai à saída.
async function runWithLock(context) {
  const { root, change, executionId } = context;
  const lock = acquireLockReleasingAuthorized(root, change, { executionId });
  if (!lock.acquired) {
    return stopped(lock.state ?? null, lock.stopReason, { blocked_by: lock.blockedBy ?? null, diagnostic: lock.diagnostic ?? null });
  }
  const ctx = { root, change, executionId, timeBook: null, keepLock: false };
  try {
    recordLifecycleEvent(root, change, { phase: context.phase, execution_id: executionId, previous_execution_id: context.previousExecutionId });
    const result = await runStep(ctx, context);
    const terminal = terminalLifecycle(result, executionId);
    if (terminal) recordLifecycleEvent(root, change, terminal);
    return result;
  } catch (err) {
    recordLifecycleEvent(root, change, {
      phase: 'fail', execution_id: executionId, stop_reason: err.stopReason ?? 'config_error', cause: err.message,
    });
    throw err;
  } finally {
    if (!ctx.keepLock) releaseLock(root, change, executionId);
  }
}

// Reservas abertas sem registro de reconciliação D26 que exige reconciliação antes de nova chamada paga
// (D19, D26, RC-017, RC-024). Exige-se quando a reserva é de chamada interrompida, quando a execução
// está interrompida ou parada por reconciliação, e quando veio de checkpoint importado. Reserva de
// chamada com custo desconhecido sem interrupção segue o fluxo de RC-010 e RC-011.
export function uncoveredReservations(state, { mandatory: pendingStop = false } = {}) {
  const covered = new Set((state.reconciliations ?? []).map((item) => item.reserve_id));
  const pending = (state.open_reservations ?? []).filter((entry) => !covered.has(entry.session_id));
  const mandatory = pendingStop || state.state === STATE_INTERRUPTED || state.stop_reason === 'reconciliation_required'
    || (state.imported_checkpoint_seq ?? null) !== null;
  return pending.filter((entry) => mandatory || entry.interrupted === true);
}

// Interrupção registrada pela CLI: mesma transição do runner, com evento de interrupção próprio (TE-010).
export function recordInterruption({ root, change, executionId }) {
  const state = loadState(root, change);
  if (!state) throw new ConfigError('sem execução para registrar interrupção');
  const ctx = { root, change, executionId, timeBook: null, keepLock: false };
  return markInterrupted(ctx, state);
}

// Retomada da mesma execução (RS-024): preserva execution_id, consumo e reservas. Sem reconciliação
// das reservas abertas, a retomada é recusada com reconciliation_required. Não faz chamada.
// Término não confirmado sem lock_release humano recusa a retomada (RC-043, RC-044). Gate interrompido
// (gate_resume_pending) volta a awaiting_gate e fica marcado para reexecução do início (D8).
export function resumeExecution({ root, change }) {
  let state = loadState(root, change);
  if (!state) throw new ConfigError('sem execução para retomar');
  const ctx = { root, change, executionId: state.execution_id, timeBook: null, keepLock: false };
  if (state.state === STATE_INVOKING) return { status: 'refused', stop_reason: 'human_decision_needed', state: state.state };
  if (pendingTermination(root, change, state)) {
    return { status: 'refused', stop_reason: 'human_decision_needed', state: state.state, blocked_by: 'termination_unconfirmed' };
  }
  if (state.termination_unconfirmed) state = persist(ctx, { ...state, termination_unconfirmed: null });
  if (uncoveredReservations(state).length > 0) return { status: 'refused', stop_reason: 'reconciliation_required', state: state.state };
  if (state.state === STATE_INTERRUPTED && state.gate_resume_pending) return resumeGate(ctx, state);
  const normalized = normalizeToReady(ctx, state);
  if (normalized.blocked) return { status: 'refused', stop_reason: 'human_decision_needed', state: normalized.state.state };
  const ready = state.state === STATE_INTERRUPTED ? transitionTo(ctx, state, STATE_READY) : normalized.state;
  recordLifecycleEvent(root, change, { phase: 'resume', execution_id: state.execution_id, previous_execution_id: null, state: ready.state });
  return { status: 'resumed', stop_reason: null, state: ready.state, execution_id: state.execution_id };
}

// Retomada de gate interrompido: interrupted → awaiting_gate pela tabela. A interrupção ganha resumed_at,
// e gate_rerun_pending manda o ciclo da fatia reexecutar o gate do início, sem nova invocação.
function resumeGate(ctx, state) {
  const pending = state.gate_resume_pending;
  const at = new Date().toISOString();
  const interruptions = (state.gate_interruptions ?? []).map((entry) => (
    entry.gate_run_id === pending.gate_run_id ? { ...entry, resumed_at: at } : entry));
  const next = transitionTo(ctx, state, STATE_AWAITING_GATE, {
    patch: { gate_resume_pending: null, gate_rerun_pending: { ...pending, at }, gate_interruptions: interruptions },
  });
  recordLifecycleEvent(ctx.root, ctx.change, {
    phase: 'resume', execution_id: state.execution_id, previous_execution_id: null, state: next.state, cause: 'gate_rerun',
  });
  return { status: 'resumed', stop_reason: null, state: next.state, execution_id: state.execution_id, gate_rerun: pending.gate };
}

// Ponto de entrada do runner para uma etapa. Não aceita limite vindo do perfil:
// o perfil só reduz tetos e a autorização de orçamento vem de authorizations.json.
// newExecution começa uma execução nova a partir de estado de parada (RC-035);
// observe devolve o mapa caminho -> hash, para a validação pendente da retomada (RC-018).
export async function runHarnessStep({
  root, change, bin, prompt, allowedTools, profile = {}, model, effort, env = {}, cwd = root,
  timeoutMs, killGraceMs, executionId, newExecution = false, observe, terminate, protect, agent = 'runner',
}) {
  const policy = loadPolicy(root);
  validateProfileAgainstPolicy(profile, policy);
  const tools = allowedTools ?? readAllowedTools(root);
  const records = loadRecords(root, change);
  if (profile.max_turns !== undefined && !hasEnforcedProbe(records, change)) {
    return stopped(STATE_CONFIG_BLOCKED, 'config_error');
  }
  const grants = activeGrants(records, change);
  const { limit } = effectiveLimit(policy, profile, grants);
  if (limit === null) return stopped(STATE_AWAITING_DECISION, 'authorization_required');

  const existing = loadState(root, change);
  if (newExecution && existing !== null && !NEW_EXECUTION_FROM.has(existing.state)) {
    throw new ConfigError(`nova execução só começa a partir de estado de parada, não de "${existing.state}"`);
  }
  const startsNew = newExecution && existing !== null;
  const runExecutionId = startsNew ? (executionId ?? randomUUID()) : (executionId ?? existing?.execution_id ?? randomUUID());
  // Início (primeira execução ou nova execução, que referencia a anterior) ou retomada da mesma execução (TE-010).
  const lifecycle = existing !== null && !startsNew
    ? { phase: 'resume', previousExecutionId: null }
    : { phase: 'start', previousExecutionId: startsNew ? existing.execution_id : null };
  return runWithLock({
    root, change, policy, grants, profile, limit, records, tools, prompt, bin, env, cwd,
    model, effort, timeoutMs, killGraceMs, observe, terminate, protect, agent, executionId: runExecutionId, newExecution: startsNew,
    phase: lifecycle.phase, previousExecutionId: lifecycle.previousExecutionId,
  });
}
