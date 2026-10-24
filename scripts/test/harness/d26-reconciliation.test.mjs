// Registro de reconciliação (D26, RC-045, RC-051 a RC-056): efeito no saldo calculado pelo runner,
// idempotência, correspondência entre execução, invocação e reserva, custo desconhecido, tratamento
// conservador de closed_unknown e correção como registro novo. Os testes usam fixtures em memória.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rec from '../../harness/reconciliation.mjs';
import { committedUsd, checkReserve } from '../../harness/budget.mjs';
import { CHANGE, PROJECT_ID } from './fixture.mjs';

const EXEC = 'exec-0002';
const INV = 'inv-0003';
const RES = 'res-0003';
const ZERO = { known_usd: 0, estimated_usd: 0, unknown_calls: 0 };
const IDENTITY = { projectId: PROJECT_ID, change: CHANGE };
const INVOCATIONS = [{ invocation_id: INV, execution_id: EXEC }];
const SHA = 'a'.repeat(64);
// Total autorizado da change (D23): com reserva de 2,5 aberta, o saldo disponível antes é 10 (D26 regra 1).
const TOTAL_USD = 12.5;
const EFFECT_CLOSED_OBSERVED = {
  reserved_usd: 2.5, reserve_closed: true, reserve_released_usd: 2.5, cost_accounted_usd: 0.42, exposure_unknown_usd: 0,
  available_before_usd: 10, net_available_effect_usd: 2.08, available_after_usd: 12.08, unknown_calls_after: 0,
};

// Estado antes da reconciliação: uma reserva aberta de 2.5 USD, da invocação INV.
const baseState = () => ({
  consumption: { ...ZERO },
  open_reservations: [{ session_id: RES, reserved_usd: 2.5, invocation_id: INV, status: 'open' }],
});

// Registro válido no formato D26 e identificado no formato de authorizations.json (D32).
function reconciliation(extra = {}) {
  return {
    kind: 'reconciliation',
    origin: 'human',
    project_id: PROJECT_ID,
    scope: { change: CHANGE },
    reconciliation_id: 'rec-0001',
    execution_id: EXEC,
    invocation_id: INV,
    reserve_id: RES,
    reserve_decision: 'closed_observed',
    evidence_available: [{ nome: 'resultado-inv-0003.json', sha256: SHA }],
    cost: { usd: 0.42, status: 'observed', origin: 'reported' },
    human_decision: { decided_by: 'procedimento humano', decided_at: '2026-10-24T10:00:00Z', note: 'custo informado pela CLI' },
    ...extra,
  };
}

const reconcile = (extra = {}, { base = baseState(), records = [], invocations = INVOCATIONS } = {}) => rec.reconcileRecord({
  base, records, record: reconciliation(extra), invocations, identity: IDENTITY, totalUsd: TOTAL_USD,
});

const UNKNOWN_CLOSE = { reserve_decision: 'closed_unknown', unknown_treatment: 'counted_in_budget', cost: { usd: null, status: 'unknown', origin: 'none' } };

test('[RC-045] registro identificado recebe efeito no saldo calculado pelo runner', () => {
  const result = reconcile();
  assert.equal(result.status, 'accepted');
  assert.deepEqual(result.record.balance_effect, EFFECT_CLOSED_OBSERVED);
  assert.deepEqual(result.state.open_reservations, []);
  assert.equal(result.state.consumption.known_usd, 0.42);
});

test('[RC-045] balance_effect informado que diverge do calculado é recusado com a divergência', () => {
  assert.throws(
    () => reconcile({ balance_effect: { ...EFFECT_CLOSED_OBSERVED, net_available_effect_usd: 9, available_after_usd: 19 } }),
    /balance_effect divergente/,
  );
});

test('[RC-045] balance_effect informado igual ao calculado é aceito e não vira saldo autoritativo', () => {
  const result = reconcile({ balance_effect: EFFECT_CLOSED_OBSERVED });
  assert.equal(result.status, 'accepted');
  assert.equal(result.state.consumption.known_usd, 0.42);
});

test('[RC-045] registro sem evidência, decisão humana ou identificadores obrigatórios é recusado', () => {
  const { validateReconciliationRecord } = rec;
  const complete = reconciliation();
  assert.equal(validateReconciliationRecord(complete).ok, true, JSON.stringify(validateReconciliationRecord(complete).errors));
  const { evidence_available: _e, human_decision: _h, invocation_id: _i, reserve_id: _r, ...incomplete } = complete;
  const verdict = validateReconciliationRecord(incomplete);
  assert.equal(verdict.ok, false);
  assert.ok(verdict.errors.some((error) => /evidence_available/.test(error)));
  assert.ok(verdict.errors.some((error) => /human_decision/.test(error)));
  assert.ok(verdict.errors.some((error) => /invocation_id/.test(error)));
  assert.ok(verdict.errors.some((error) => /reserve_id/.test(error)));
});

test('[RC-051] invocação que não existe na execução informada é recusada sem alterar o estado', () => {
  const base = baseState();
  const snapshot = structuredClone(base);
  assert.throws(() => reconcile({}, { base, invocations: [{ invocation_id: INV, execution_id: 'outra-execucao' }] }), /invocação/);
  assert.throws(() => reconcile({}, { base, invocations: [] }), /invocação/);
  assert.deepEqual(base, snapshot);
});

test('[RC-051] reserva que não pertence à invocação informada é recusada', () => {
  const base = { ...baseState(), open_reservations: [{ session_id: RES, reserved_usd: 2.5, invocation_id: 'inv-9999', status: 'open' }] };
  assert.throws(() => reconcile({}, { base }), /reserva/);
});

test('[RC-052] repetir o mesmo registro não libera nem contabiliza o custo de novo', () => {
  const first = reconcile();
  const second = reconcile({}, { records: first.records });
  assert.equal(second.status, 'duplicate');
  assert.deepEqual(second.records, first.records);
  assert.deepEqual(second.state, first.state);
});

test('[RC-052] mesmo reconciliation_id com conteúdo diferente é recusado', () => {
  const first = reconcile();
  assert.throws(
    () => reconcile({ cost: { usd: 0.5, status: 'observed', origin: 'reported' } }, { records: first.records }),
    /reconciliation_id/,
  );
});

test('[RC-053] outro registro tentando encerrar reserva já encerrada é recusado e não soma custo', () => {
  const first = reconcile();
  assert.throws(() => reconcile({ reconciliation_id: 'rec-0002' }, { records: first.records }), /já encerrada/);
});

test('[RC-054] cost.status unknown exige cost.usd null', () => {
  assert.throws(
    () => reconcile({ ...UNKNOWN_CLOSE, cost: { usd: 0.1, status: 'unknown', origin: 'none' } }),
    /cost\.usd/,
  );
});

test('[RC-054] cost.status observed ou estimated exige número finito e não negativo', () => {
  for (const usd of [null, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => reconcile({ cost: { usd, status: 'observed', origin: 'reported' } }), /cost\.usd/, `usd=${usd}`);
  }
  assert.throws(() => reconcile({ cost: { usd: -0.5, status: 'estimated', origin: 'estimated' } }), /cost\.usd/);
});

test('[RC-054] custo observado zero é valor válido; unknown com null é aceito e fica contado como desconhecido', () => {
  const zero = reconcile({ cost: { usd: 0, status: 'observed', origin: 'reported' } });
  assert.equal(zero.record.balance_effect.reserve_released_usd, 2.5);
  const unknown = reconcile({ ...UNKNOWN_CLOSE });
  assert.equal(unknown.status, 'accepted');
  assert.equal(unknown.record.balance_effect.unknown_calls_after, 1);
});

test('[RC-055] closed_unknown sem unknown_treatment counted_in_budget é recusado', () => {
  const { unknown_treatment: _t, ...withoutTreatment } = UNKNOWN_CLOSE;
  assert.throws(() => reconcile(withoutTreatment), /unknown_treatment/);
});

test('[RC-055] closed_unknown libera zero, mantém a reserva no comprometido e conta a chamada como desconhecida', () => {
  const result = reconcile({ ...UNKNOWN_CLOSE });
  assert.deepEqual(result.record.balance_effect, {
    reserved_usd: 2.5, reserve_closed: true, reserve_released_usd: 0, cost_accounted_usd: 0, exposure_unknown_usd: 2.5,
    available_before_usd: 10, net_available_effect_usd: 0, available_after_usd: 10, unknown_calls_after: 1,
  });
  assert.equal(committedUsd(result.state.consumption, result.state.open_reservations), 2.5);
  const verdict = checkReserve({ authorizedTotalUsd: 4, consumption: result.state.consumption, openReservations: result.state.open_reservations, reserveUsd: 1 });
  assert.equal(verdict.remaining_usd, 1.5);
});

test('[RC-056] correção é registro novo com supersedes; o original fica idêntico e o saldo é recalculado', () => {
  const first = reconcile();
  const originalSnapshot = structuredClone(first.records[0] ?? first.record);
  const correction = reconcile(
    { reconciliation_id: 'rec-0002', supersedes: 'rec-0001', cost: { usd: 0.5, status: 'observed', origin: 'reported' } },
    { records: first.records },
  );
  assert.equal(correction.status, 'accepted');
  assert.equal(correction.records.length, 2);
  assert.deepEqual(correction.records[0], originalSnapshot);
  assert.deepEqual(correction.record.balance_effect, {
    reserved_usd: 2.5, reserve_closed: true, reserve_released_usd: 2.5, cost_accounted_usd: 0.5, exposure_unknown_usd: 0,
    available_before_usd: 10, net_available_effect_usd: 2, available_after_usd: 12, unknown_calls_after: 0,
  });
  assert.equal(correction.state.consumption.known_usd, 0.5);
});

test('[RC-056] correção que aponta reconciliação inexistente ou de outra reserva é recusada', () => {
  const first = reconcile();
  assert.throws(() => reconcile({ reconciliation_id: 'rec-0002', supersedes: 'rec-9999' }, { records: first.records }), /supersedes/);
  assert.throws(
    () => reconcile({ reconciliation_id: 'rec-0002', supersedes: 'rec-0001', reserve_id: 'res-outra' }, { records: first.records }),
    /reserva/,
  );
});

test('[RC-050] registro de reconciliação sem project_id ou com change divergente é recusado', () => {
  const { project_id: _omitted, ...withoutProject } = reconciliation();
  assert.throws(
    () => rec.reconcileRecord({ base: baseState(), records: [], record: withoutProject, invocations: INVOCATIONS, identity: IDENTITY, totalUsd: TOTAL_USD }),
    /project_id/,
  );
  assert.throws(() => reconcile({ scope: { change: 'outra-change' } }), /change/);
});
