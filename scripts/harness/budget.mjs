// Orçamento e reservas do harness (F5, D7, D19). Funções puras: nunca alteram os
// objetos recebidos e devolvem novos valores. Quem grava é o runner, via state.mjs.
//
// Comprometido = reservas abertas + gasto conhecido + gasto estimado. Custo
// desconhecido não vira zero: conta em unknown_calls e mantém a reserva aberta
// até a reconciliação (RC-010, RC-011, RC-024).
import { ConfigError, effectiveGrant } from './policy.mjs';

const BUDGET_KIND = 'budget';
const HUMAN_ORIGIN = 'human';
const ROUND_DIGITS = 6;
const RECONCILIATION_DECISIONS = ['kept', 'closed_observed', 'closed_unknown'];
const OBSERVED_SOURCES = ['reported', 'estimated'];
const AUTHORIZATION_REQUIRED = 'authorization_required';
const RESERVE_INSUFFICIENT = 'budget_reserve_insufficient';

function round(value) {
  return Math.round(value * 10 ** ROUND_DIGITS) / 10 ** ROUND_DIGITS;
}

function isPositiveAmount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

// Concessão de orçamento válida: total e por chamada positivos, por chamada não maior que o total.
function isBudgetGrantShape(record) {
  return isPositiveAmount(record.total_usd)
    && isPositiveAmount(record.per_call_usd)
    && record.per_call_usd <= record.total_usd;
}

// Margem de segurança de uma chamada: limite efetivo × margem. Não é teto (D7, D23).
export function marginUsd(limitUsd, reserveMarginRatio) {
  return round(limitUsd * reserveMarginRatio);
}

// Reserva de uma chamada: limite efetivo + margem. Campo separado da margem (D23).
export function reservationUsd(limitUsd, reserveMarginRatio) {
  return round(limitUsd + marginUsd(limitUsd, reserveMarginRatio));
}

// Autorizações que concedem orçamento nesta change: origem humana, escopo da change,
// formato de concessão válido, não revogadas nem substituídas (RC-029, RC-030, RC-034).
// Revogação é registro próprio (kind revocation) e nunca concede orçamento.
export function activeGrants(records, change) {
  const revoked = new Set(records.map((record) => record?.revokes).filter(Boolean));
  const superseded = new Set(records.map((record) => record?.supersedes).filter(Boolean));
  return records.filter((record) => record?.kind === BUDGET_KIND
    && record.origin === HUMAN_ORIGIN
    && record.scope?.change === change
    && !record.revokes
    && !revoked.has(record.id)
    && !superseded.has(record.id)
    && isBudgetGrantShape(record));
}

// Saldo total autorizado para a change (D23): o total da autorização efetiva, limitado
// pelo teto da política e pelo candidato do perfil (que só reduz). Sem concessão, null.
export function authorizedTotalUsd(policy, profile, grants) {
  const grant = effectiveGrant(grants);
  if (grant === null) return null;
  const sources = [grant.total_usd, policy.max_usd_per_change];
  const candidate = profile?.candidate_usd_per_change;
  if (typeof candidate === 'number') sources.push(candidate);
  return Math.min(...sources);
}

// Comprometido (D7, D26 regra 6): reservas abertas, gasto conhecido, gasto estimado e a exposição
// desconhecida de reservas encerradas com closed_unknown (unknown_exposure_usd, ausente = zero).
export function committedUsd(consumption, openReservations) {
  const reserved = openReservations.reduce((sum, entry) => sum + entry.reserved_usd, 0);
  return round(reserved + consumption.known_usd + consumption.estimated_usd + (consumption.unknown_exposure_usd ?? 0));
}

// Verifica se a próxima reserva cabe no saldo total. Sem concessão vigente é
// authorization_required (RC-031). Saldo zero ou menos é budget_exhausted. Reserva
// maior que o saldo restante é budget_reserve_insufficient, que só ocorre com concessão vigente.
export function checkReserve({ authorizedTotalUsd: total, consumption, openReservations, reserveUsd }) {
  if (total === null) return { ok: false, stop_reason: AUTHORIZATION_REQUIRED, remaining_usd: 0 };
  const remaining = round(total - committedUsd(consumption, openReservations));
  if (remaining <= 0) return { ok: false, stop_reason: 'budget_exhausted', remaining_usd: remaining };
  if (reserveUsd > remaining) return { ok: false, stop_reason: RESERVE_INSUFFICIENT, remaining_usd: remaining };
  return { ok: true, stop_reason: null, remaining_usd: remaining };
}

function findOpen(openReservations, sessionId) {
  const entry = openReservations.find((item) => item.session_id === sessionId);
  if (!entry) throw new ConfigError(`reserva "${sessionId}" não está aberta`);
  return entry;
}

// Aplica o resultado de uma chamada. Custo reportado libera a reserva; custo ausente
// conta como desconhecido e mantém a reserva aberta.
export function settleCall(consumption, openReservations, { sessionId, cost_usd: costUsd, cost_source: costSource }) {
  findOpen(openReservations, sessionId);
  if (costSource === 'reported' && typeof costUsd === 'number' && Number.isFinite(costUsd)) {
    return {
      consumption: { ...consumption, known_usd: round(consumption.known_usd + costUsd) },
      open_reservations: openReservations.filter((entry) => entry.session_id !== sessionId),
    };
  }
  return {
    consumption: { ...consumption, unknown_calls: consumption.unknown_calls + 1 },
    open_reservations: openReservations.map((entry) => (entry.session_id === sessionId ? { ...entry, cost_unknown: true } : entry)),
  };
}

function reconcileOne(state, item) {
  const entry = findOpen(state.open_reservations, item.session_id);
  if (!RECONCILIATION_DECISIONS.includes(item.decision)) throw new ConfigError(`decisão de reconciliação inválida: "${item.decision}"`);
  const remaining = state.open_reservations.filter((other) => other.session_id !== item.session_id);
  if (item.decision === 'kept') return state;
  if (item.decision === 'closed_unknown') {
    // A reserva deixa de ser reserva aberta, mas o valor vira exposição desconhecida no comprometido:
    // liberar a reserva não faz o gasto sumir do controle (D26 regra 6, RC-055).
    const unknownCalls = entry.cost_unknown ? state.consumption.unknown_calls : state.consumption.unknown_calls + 1;
    const exposure = round((state.consumption.unknown_exposure_usd ?? 0) + entry.reserved_usd);
    return { consumption: { ...state.consumption, unknown_calls: unknownCalls, unknown_exposure_usd: exposure }, open_reservations: remaining };
  }
  if (!isPositiveAmount(item.observed_usd) && item.observed_usd !== 0) throw new ConfigError('closed_observed exige observed_usd finito e não negativo');
  if (!OBSERVED_SOURCES.includes(item.source)) throw new ConfigError('closed_observed exige origem reported ou estimated');
  const consumption = {
    ...state.consumption,
    known_usd: item.source === 'reported' ? round(state.consumption.known_usd + item.observed_usd) : state.consumption.known_usd,
    estimated_usd: item.source === 'estimated' ? round(state.consumption.estimated_usd + item.observed_usd) : state.consumption.estimated_usd,
    unknown_calls: entry.cost_unknown ? state.consumption.unknown_calls - 1 : state.consumption.unknown_calls,
  };
  return { consumption, open_reservations: remaining };
}

// Aplica as decisões de uma reconciliação (kind reconciliation). Cada reserva aberta
// recebe kept, closed_observed ou closed_unknown (RC-024, D19).
export function applyReconciliation(consumption, openReservations, reservations) {
  return reservations.reduce(
    (state, item) => reconcileOne(state, item),
    { consumption, open_reservations: openReservations },
  );
}
