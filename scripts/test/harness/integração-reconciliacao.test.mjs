// Reconciliação pelo runner, não só pelo módulo isolado (B.2): uma reserva aberta sem registro D26
// bloqueia a próxima chamada paga, e o registro encerrado a libera. Usa o simulador, sem modelo real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROJECT_ID } from './fixture.mjs';
import { CHANGE, CHANGE_DIR, EXEC, changeRepo, cli, seedRunner, stateOf, writeRecord, writeText } from './cli-support.mjs';
import { newCallLog, simulatorCalls } from './simulator.mjs';
import { OK_OUTPUT, step } from './f6-support.mjs';

// Reserva e reconciliação são fluxo financeiro: o modo financeiro é explícito (add-silent-consumption-observability).
const FINANCIAL = { provisional: true, modo_financeiro: true };

const INVOCATION = 'inv-1';
const RESERVE = 'res-1';

function writeBudget(root) {
  writeText(root, `${CHANGE_DIR}/authorizations.json`, `${JSON.stringify([{
    id: 'bud-1', kind: 'budget', origin: 'human', project_id: PROJECT_ID, scope: { change: CHANGE },
    total_usd: 12.5, per_call_usd: 2, reason: 'teste', approver: 'mantenedor', recorded_at: '2026-10-23T12:00:00.000Z',
  }], null, 2)}\n`);
}

function openReservation(root) {
  return seedRunner(root, {
    state: 'awaiting_decision',
    stop_reason: 'reconciliation_required',
    invocations: [{ invocation_id: INVOCATION, execution_id: EXEC }],
    open_reservations: [{ session_id: RESERVE, reserved_usd: 2.5, invocation_id: INVOCATION, status: 'open' }],
  });
}

function reconciliationRecord(extra = {}) {
  return {
    kind: 'reconciliation', origin: 'human', project_id: PROJECT_ID, scope: { change: CHANGE },
    reconciliation_id: 'rec-0001', execution_id: EXEC, invocation_id: INVOCATION, reserve_id: RESERVE,
    reserve_decision: 'closed_observed', evidence_available: [{ nome: 'resultado.json', sha256: 'c'.repeat(64) }],
    cost: { usd: 0.42, status: 'observed', origin: 'reported' },
    human_decision: { decided_by: 'procedimento humano', decided_at: '2026-10-24T10:00:00Z', note: 'custo informado pela CLI' },
    ...extra,
  };
}

test('[RC-057] runner não inicia chamada paga com reserva aberta sem registro de reconciliação', async () => {
  const root = changeRepo();
  writeBudget(root);
  openReservation(root);
  const log = newCallLog();
  const result = await step(root, log, OK_OUTPUT, { executionId: EXEC, profile: FINANCIAL });
  assert.equal(result.invoked, false);
  assert.equal(result.stop_reason, 'reconciliation_required');
  assert.deepEqual(simulatorCalls(log), []);
});

test('[RC-057] após o registro D26 da reserva, o runner volta a invocar e contabiliza o custo observado', async () => {
  const root = changeRepo();
  writeBudget(root);
  openReservation(root);
  const path = writeRecord(root, 'rec-0001', reconciliationRecord());
  assert.equal((await cli(root, 'reconcile', ['--record', path])).status, 'accepted');
  const log = newCallLog();
  const result = await step(root, log, OK_OUTPUT, { executionId: EXEC, profile: FINANCIAL });
  assert.equal(result.invoked, true);
  assert.equal(simulatorCalls(log).length, 1);
  assert.equal(stateOf(root).consumption.known_usd, 0.42);
});
