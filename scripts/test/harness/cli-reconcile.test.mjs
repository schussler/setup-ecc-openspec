// CLI reconcile: registro de reconciliação D26 integrado ao estado da execução (RC-050 a RC-058).
// Os valores de saldo vêm do cálculo do runner; nenhum valor informado vira saldo autoritativo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROJECT_ID } from './fixture.mjs';
import { CHANGE, CHANGE_DIR, EXEC, changeRepo, cli, seedRunner, stateOf, writeRecord, writeText } from './cli-support.mjs';

const SHA = 'b'.repeat(64);
const RESERVE = 'res-1';
const INVOCATION = 'inv-1';

// Concessão de orçamento humana, identificada (D32), com total 12,5 e por chamada 2.
function writeBudget(root, totalUsd = 12.5) {
  writeText(root, `${CHANGE_DIR}/authorizations.json`, `${JSON.stringify([{
    id: 'bud-1', kind: 'budget', origin: 'human', project_id: PROJECT_ID, scope: { change: CHANGE },
    total_usd: totalUsd, per_call_usd: 2, reason: 'teste', approver: 'Douglas', recorded_at: '2026-10-23T12:00:00.000Z',
  }], null, 2)}\n`);
}

// Execução com uma reserva aberta de 2,5 da invocação inv-1, como após uma chamada com custo desconhecido.
function openReservation(root, extra = {}) {
  return seedRunner(root, {
    state: 'awaiting_decision',
    stop_reason: 'reconciliation_required',
    invocations: [{ invocation_id: INVOCATION, execution_id: EXEC }],
    open_reservations: [{ session_id: RESERVE, reserved_usd: 2.5, invocation_id: INVOCATION, status: 'open' }],
    ...extra,
  });
}

function record(extra = {}) {
  return {
    kind: 'reconciliation', origin: 'human', project_id: PROJECT_ID, scope: { change: CHANGE },
    reconciliation_id: 'rec-0001', execution_id: EXEC, invocation_id: INVOCATION, reserve_id: RESERVE,
    reserve_decision: 'closed_observed', evidence_available: [{ nome: 'resultado-inv-1.json', sha256: SHA }],
    cost: { usd: 0.42, status: 'observed', origin: 'reported' },
    human_decision: { decided_by: 'procedimento humano', decided_at: '2026-10-24T10:00:00Z', note: 'custo informado pela CLI' },
    ...extra,
  };
}

async function reconcile(root, extra = {}) {
  const path = writeRecord(root, extra.reconciliation_id ?? 'rec-0001', record(extra));
  return cli(root, 'reconcile', ['--record', path]);
}

test('[RC-058] reserva de 2,50 com custo observado de 0,42 e saldo antes de 10,00 libera 2,08 e deixa 12,08', async () => {
  const root = changeRepo();
  writeBudget(root);
  openReservation(root);
  const result = await reconcile(root);
  assert.equal(result.status, 'accepted');
  assert.deepEqual(result.balance_effect, {
    reserved_usd: 2.5, reserve_closed: true, reserve_released_usd: 2.5, cost_accounted_usd: 0.42,
    exposure_unknown_usd: 0, available_before_usd: 10, net_available_effect_usd: 2.08, available_after_usd: 12.08,
    unknown_calls_after: 0,
  });
  assert.deepEqual(stateOf(root).open_reservations, []);
  assert.equal(stateOf(root).consumption.known_usd, 0.42);
});

test('[RC-057] closed_unknown libera zero, mantém 2,50 como exposição desconhecida e conta uma chamada desconhecida', async () => {
  const root = changeRepo();
  writeBudget(root);
  openReservation(root);
  const result = await reconcile(root, {
    reserve_decision: 'closed_unknown', unknown_treatment: 'counted_in_budget',
    cost: { usd: null, status: 'unknown', origin: 'none' },
  });
  assert.equal(result.status, 'accepted');
  assert.equal(result.balance_effect.reserve_released_usd, 0);
  assert.equal(result.balance_effect.cost_accounted_usd, 0);
  assert.equal(result.balance_effect.exposure_unknown_usd, 2.5);
  assert.equal(result.balance_effect.net_available_effect_usd, 0);
  assert.equal(result.balance_effect.unknown_calls_after, 1);
  assert.equal(result.balance_effect.available_after_usd, 10);
  assert.equal(stateOf(root).consumption.unknown_exposure_usd, 2.5);
});

test('[RC-057] kept mantém a reserva aberta e não altera o saldo', async () => {
  const root = changeRepo();
  writeBudget(root);
  openReservation(root);
  const result = await reconcile(root, {
    reserve_decision: 'kept', cost: { usd: null, status: 'unknown', origin: 'none' },
  });
  assert.equal(result.status, 'accepted');
  assert.equal(result.balance_effect.reserve_closed, false);
  assert.equal(result.balance_effect.net_available_effect_usd, 0);
  assert.equal(result.balance_effect.available_after_usd, 10);
  assert.equal(stateOf(root).open_reservations.length, 1);
});

test('[RC-058] custo acima da reserva gera efeito líquido negativo sem truncamento, com aviso', async () => {
  const root = changeRepo();
  writeBudget(root);
  openReservation(root);
  const result = await reconcile(root, { cost: { usd: 3, status: 'observed', origin: 'reported' } });
  assert.equal(result.status, 'accepted');
  assert.equal(result.balance_effect.net_available_effect_usd, -0.5);
  assert.equal(result.balance_effect.available_after_usd, 9.5);
  assert.ok(result.warnings.some((text) => /acima da reserva/.test(text)));
});

test('[RC-052] repetir o mesmo registro é duplicata: não libera nem contabiliza o custo de novo', async () => {
  const root = changeRepo();
  writeBudget(root);
  openReservation(root);
  await reconcile(root);
  const before = JSON.stringify(stateOf(root).consumption);
  const again = await reconcile(root);
  assert.equal(again.status, 'duplicate');
  assert.equal(JSON.stringify(stateOf(root).consumption), before);
  assert.equal(stateOf(root).reconciliations.length, 1);
});

test('[RC-052] mesmo reconciliation_id com conteúdo diferente é recusado sem alterar o estado', async () => {
  const root = changeRepo();
  writeBudget(root);
  openReservation(root);
  await reconcile(root);
  const snapshot = JSON.stringify(stateOf(root).consumption);
  const other = await reconcile(root, { cost: { usd: 0.9, status: 'observed', origin: 'reported' } });
  assert.equal(other.status, 'refused');
  assert.equal(JSON.stringify(stateOf(root).consumption), snapshot);
});

test('[RC-051] invocação que não existe na execução é recusada sem alterar o estado', async () => {
  const root = changeRepo();
  writeBudget(root);
  openReservation(root);
  const result = await reconcile(root, { invocation_id: 'inv-inexistente' });
  assert.equal(result.status, 'refused');
  assert.match(result.error, /inv-inexistente/);
  assert.deepEqual(stateOf(root).open_reservations.map((entry) => entry.session_id), [RESERVE]);
});

test('[RC-050] registro sem project_id é recusado', async () => {
  const root = changeRepo();
  writeBudget(root);
  openReservation(root);
  const result = await reconcile(root, { project_id: undefined });
  assert.equal(result.status, 'refused');
  assert.match(result.error, /project_id/);
});

test('[RC-045] balance_effect informado que diverge do calculado é recusado', async () => {
  const root = changeRepo();
  writeBudget(root);
  openReservation(root);
  const result = await reconcile(root, {
    balance_effect: { reserved_usd: 2.5, reserve_closed: true, reserve_released_usd: 2.5, cost_accounted_usd: 0.42,
      exposure_unknown_usd: 0, available_before_usd: 10, net_available_effect_usd: 9, available_after_usd: 19, unknown_calls_after: 0 },
  });
  assert.equal(result.status, 'refused');
  assert.match(result.error, /divergente/);
});

test('[RC-034] reconcile sem concessão de orçamento vigente é recusado: sem saldo não há efeito', async () => {
  const root = changeRepo();
  openReservation(root);
  const result = await reconcile(root);
  assert.equal(result.status, 'refused');
  assert.equal(result.stop_reason, 'authorization_required');
});

test('[RC-053] reserva já encerrada não aceita segunda reconciliação com outro identificador', async () => {
  const root = changeRepo();
  writeBudget(root);
  openReservation(root);
  await reconcile(root);
  const second = await reconcile(root, { reconciliation_id: 'rec-0002' });
  assert.equal(second.status, 'refused');
  assert.match(second.error, /já encerrada/);
});
