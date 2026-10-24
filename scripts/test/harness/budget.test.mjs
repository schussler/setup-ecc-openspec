// Testes do orçamento e das reservas do harness (F5). Nome de cada teste começa
// pelo ID do cenário em headless-execution e harness-run-control.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, effectiveLimit } from '../../harness/policy.mjs';
import {
  activeGrants,
  applyReconciliation,
  authorizedTotalUsd,
  checkReserve,
  committedUsd,
  reservationUsd,
  settleCall,
} from '../../harness/budget.mjs';

const CHANGE = 'add-spec-harness';
const POLICY = { version: '1.0.0', reserve_margin_ratio: 0.25, max_usd_per_call: 3, max_usd_per_change: 30 };
const ZERO = { known_usd: 0, estimated_usd: 0, unknown_calls: 0 };

// Concessão no formato D23: total e por chamada (por chamada = menor entre 2 e o total).
function grant(id, totalUsd, extra = {}) {
  return {
    id, kind: 'budget', origin: 'human', scope: { change: CHANGE }, total_usd: totalUsd, per_call_usd: Math.min(2, totalUsd),
    reason: 'teste', approver: 'mantenedor', author: 'mantenedor', recorded_at: '2026-10-23T12:00:00.000Z',
    project_id: '3f2c9a1e-6b7d-4e8f-9a0b-1c2d3e4f5a6b', ...extra,
  };
}

function reservation(sessionId, reservedUsd, extra = {}) {
  return { session_id: sessionId, reserved_usd: reservedUsd, status: 'open', attempt_id: 1, opened_at: '2026-10-23T12:00:00.000Z', ...extra };
}

test('[RC-022] limite efetivo por chamada é o menor entre política, perfil e autorização', () => {
  const profile = { provisional: true, candidate_usd_per_call: 2 };
  const { limit } = effectiveLimit(POLICY, profile, [grant('a', 1.5)]);
  assert.equal(limit, 1.5);
});

test('[RC-021] configuração proposta com candidato de gasto não autoriza nenhum gasto', () => {
  const profile = { provisional: true, candidate_usd_per_change: 30, candidate_usd_per_call: 2 };
  assert.equal(effectiveLimit(POLICY, profile, []).limit, null);
  assert.equal(authorizedTotalUsd(POLICY, profile, []), null);
});

test('[RC-029] só concedem orçamento registros humanos, do escopo, não revogados nem de revogação', () => {
  const records = [
    grant('agente', 9, { origin: 'agent' }),
    grant('outra-change', 9, { id: 'outra', scope: { change: 'outra' } }),
    grant('revogada', 5),
    { id: 'revogacao', kind: 'revocation', origin: 'human', scope: { change: CHANGE }, revokes: 'revogada', reason: 'x', approver: 'y' },
    grant('trocada', 4),
    grant('nova', 6, { supersedes: 'trocada' }),
    grant('valida', 2),
  ];
  assert.deepEqual(activeGrants(records, CHANGE).map((record) => record.id), ['nova', 'valida']);
});

test('[RC-008] reserva é o limite efetivo com a margem de segurança', () => {
  assert.equal(reservationUsd(2, 0.25), 2.5);
});

test('[RC-008] reserva que não cabe no orçamento autorizado é recusada com budget_reserve_insufficient', () => {
  const verdict = checkReserve({ authorizedTotalUsd: 2, consumption: ZERO, openReservations: [], reserveUsd: 2.5 });
  assert.deepEqual(verdict, { ok: false, stop_reason: 'budget_reserve_insufficient', remaining_usd: 2 });
});

test('[RC-009] orçamento esgotado marca budget_exhausted e mantém o consumo sem zerá-lo', () => {
  const consumption = { known_usd: 3, estimated_usd: 0, unknown_calls: 0 };
  const verdict = checkReserve({ authorizedTotalUsd: 3, consumption, openReservations: [], reserveUsd: 2.5 });
  assert.equal(verdict.stop_reason, 'budget_exhausted');
  assert.deepEqual(consumption, { known_usd: 3, estimated_usd: 0, unknown_calls: 0 });
});

test('[RC-011] reserva aberta continua comprometida e diminui o restante', () => {
  const consumption = { ...ZERO, unknown_calls: 1 };
  const open = [reservation('s1', 2.5, { cost_unknown: true })];
  assert.equal(committedUsd(consumption, open), 2.5);
  assert.equal(checkReserve({ authorizedTotalUsd: 4, consumption, openReservations: open, reserveUsd: 2.5 }).ok, false);
});

test('[RC-010] custo desconhecido conta como chamada desconhecida e mantém a reserva aberta', () => {
  const next = settleCall(ZERO, [reservation('s1', 2.5)], { sessionId: 's1', cost_usd: null, cost_source: 'unknown' });
  assert.equal(next.consumption.unknown_calls, 1);
  assert.equal(next.consumption.known_usd, 0);
  assert.equal(next.open_reservations.length, 1);
  assert.equal(next.open_reservations[0].cost_unknown, true);
});

test('[RC-010] custo reportado libera a reserva e soma ao gasto conhecido', () => {
  const next = settleCall(ZERO, [reservation('s1', 2.5)], { sessionId: 's1', cost_usd: 1.2, cost_source: 'reported' });
  assert.equal(next.consumption.known_usd, 1.2);
  assert.equal(next.consumption.unknown_calls, 0);
  assert.deepEqual(next.open_reservations, []);
});

test('[RC-024] closed_unknown encerra a reserva e mantém a contagem de custo desconhecido', () => {
  const consumption = { ...ZERO, unknown_calls: 1 };
  const open = [reservation('s1', 2.5, { cost_unknown: true })];
  const next = applyReconciliation(consumption, open, [{ session_id: 's1', decision: 'closed_unknown' }]);
  assert.deepEqual(next.open_reservations, []);
  assert.equal(next.consumption.unknown_calls, 1);
});

test('[RC-024] closed_unknown de chamada interrompida ainda não contada conta como desconhecida', () => {
  const next = applyReconciliation(ZERO, [reservation('s1', 2.5)], [{ session_id: 's1', decision: 'closed_unknown' }]);
  assert.equal(next.consumption.unknown_calls, 1);
  assert.deepEqual(next.open_reservations, []);
});

test('[RC-024] closed_observed com custo reportado troca a contagem desconhecida por gasto conhecido', () => {
  const consumption = { ...ZERO, unknown_calls: 1 };
  const open = [reservation('s1', 2.5, { cost_unknown: true })];
  const next = applyReconciliation(consumption, open, [{ session_id: 's1', decision: 'closed_observed', observed_usd: 1.1, source: 'reported' }]);
  assert.equal(next.consumption.known_usd, 1.1);
  assert.equal(next.consumption.unknown_calls, 0);
  assert.deepEqual(next.open_reservations, []);
});

test('[RC-024] kept mantém a reserva e decisão inválida é recusada', () => {
  const open = [reservation('s1', 2.5)];
  assert.deepEqual(applyReconciliation(ZERO, open, [{ session_id: 's1', decision: 'kept' }]).open_reservations, open);
  assert.throws(
    () => applyReconciliation(ZERO, open, [{ session_id: 's1', decision: 'talvez' }]),
    ConfigError,
  );
});
