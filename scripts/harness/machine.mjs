// Máquina de estados do runner (F6, D8, RC-001, RC-002). A tabela TRANSITIONS é a
// regra citada em .claude/harness/policy.md: nenhuma outra transição é aceita.
// Funções puras: devolvem o novo estado; quem grava é o runner, via state.mjs.
import { ConfigError } from './policy.mjs';

export const STATE_READY = 'ready';
export const STATE_INVOKING = 'invoking';
export const STATE_AWAITING_GATE = 'awaiting_gate';
export const STATE_CORRECTION_REQUESTED = 'correction_requested';
export const STATE_APPROVED = 'approved';
export const STATE_AWAITING_DECISION = 'awaiting_decision';
export const STATE_INTERRUPTED = 'interrupted';
export const STATE_CONFIG_BLOCKED = 'config_blocked';
export const STATE_DIAGNOSING = 'diagnosing';
export const STATE_FORBIDDEN = 'forbidden_action_stopped';

// Mesma ordem e conteúdo da chave `states` de policy.json (testado em f6-machine).
export const STATES = Object.freeze([
  STATE_READY, STATE_INVOKING, STATE_AWAITING_GATE, STATE_CORRECTION_REQUESTED, STATE_APPROVED,
  STATE_AWAITING_DECISION, STATE_INTERRUPTED, STATE_CONFIG_BLOCKED, STATE_DIAGNOSING, STATE_FORBIDDEN,
]);

// Mesma ordem e conteúdo da chave `stop_reasons` de policy.json (testado em f6-machine).
export const STOP_REASONS = Object.freeze([
  'correction_limit', 'budget_exhausted', 'budget_reserve_insufficient', 'repeated_symptom',
  'protected_change', 'config_error', 'invalid_evidence', 'quota_unavailable', 'time_limit',
  'human_decision_needed', 'stale_lock', 'lock_held', 'reconciliation_required', 'mode_mismatch',
  'timeout_unclassified', 'authorization_required', 'lock_unreadable',
]);

export const STOP_STATES = new Set([
  STATE_AWAITING_DECISION, STATE_INTERRUPTED, STATE_CONFIG_BLOCKED, STATE_DIAGNOSING, STATE_FORBIDDEN,
]);

// Origem -> destinos aceitos. Estados de parada aceitam reentrada com outro motivo.
export const TRANSITIONS = Object.freeze({
  [STATE_READY]: [STATE_INVOKING, STATE_AWAITING_DECISION, STATE_CONFIG_BLOCKED],
  [STATE_INVOKING]: [STATE_AWAITING_GATE, STATE_AWAITING_DECISION, STATE_INTERRUPTED, STATE_CONFIG_BLOCKED],
  // awaiting_gate → interrupted: interrupção durante a avaliação do gate (timeout, sinal ou externa, D8).
  [STATE_AWAITING_GATE]: [
    STATE_APPROVED, STATE_CORRECTION_REQUESTED, STATE_INVOKING, STATE_AWAITING_DECISION, STATE_DIAGNOSING, STATE_FORBIDDEN,
    STATE_INTERRUPTED,
  ],
  [STATE_CORRECTION_REQUESTED]: [STATE_INVOKING, STATE_AWAITING_DECISION],
  [STATE_APPROVED]: [STATE_READY],
  [STATE_AWAITING_DECISION]: [STATE_READY, STATE_AWAITING_DECISION, STATE_CONFIG_BLOCKED],
  // interrupted → awaiting_gate: retomada de gate interrompido, que reexecuta o gate do início (D8).
  [STATE_INTERRUPTED]: [STATE_READY, STATE_INTERRUPTED, STATE_AWAITING_DECISION, STATE_AWAITING_GATE],
  [STATE_CONFIG_BLOCKED]: [STATE_READY, STATE_CONFIG_BLOCKED],
  [STATE_DIAGNOSING]: [STATE_READY, STATE_AWAITING_DECISION],
  [STATE_FORBIDDEN]: [STATE_AWAITING_DECISION, STATE_FORBIDDEN],
});

// Invariante: stop_reason só existe em estado de parada, e é nulo nos demais (RC-002).
export function assertStateInvariant(state) {
  if (!STATES.includes(state.state)) throw new ConfigError(`estado desconhecido: "${state.state}"`);
  const hasReason = state.stop_reason !== null && state.stop_reason !== undefined;
  if (hasReason && !STOP_STATES.has(state.state)) {
    throw new ConfigError(`stop_reason "${state.stop_reason}" só é permitido em estado de parada, não em "${state.state}"`);
  }
  if (hasReason && !STOP_REASONS.includes(state.stop_reason)) {
    throw new ConfigError(`motivo de parada desconhecido: "${state.stop_reason}"`);
  }
}

// Aplica uma transição pela tabela. Recusada: ok false e o objeto de origem não muda.
export function applyTransition(state, to, { stopReason = null } = {}) {
  const allowed = TRANSITIONS[state.state] ?? [];
  if (!allowed.includes(to)) return { ok: false, reason: 'transition_refused', from: state.state, to };
  if (stopReason !== null && !STOP_STATES.has(to)) {
    return { ok: false, reason: 'stop_reason_outside_stop_state', from: state.state, to };
  }
  if (stopReason !== null && !STOP_REASONS.includes(stopReason)) {
    return { ok: false, reason: 'unknown_stop_reason', from: state.state, to };
  }
  const next = { ...state, state: to, stop_reason: STOP_STATES.has(to) ? stopReason : null };
  assertStateInvariant(next);
  return { ok: true, state: next };
}
