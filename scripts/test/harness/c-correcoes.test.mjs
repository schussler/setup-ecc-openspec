// Regressões das correções C1 (aprovação de fatia e de execução), C2 (transição de interrupção),
// da interrupção sem reserva (RC-046) e da liberação de lock vencido (RS-017). Gate e validação são
// injetados: nenhum teste chama o modelo nem roda a suíte real da fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHANGE, makeRepo } from './fixture.mjs';
import { changeDir, localDir, projectId } from '../../harness/identity.mjs';
import { acquireLock, lockPath } from '../../harness/lock.mjs';
import { createState, loadState, saveState } from '../../harness/state.mjs';
import { gateImplement, interrupt, validateFinal } from '../../harness/cli-actions.mjs';
import { writeTree } from '../helpers.mjs';

const EXECUTION_ID = '5a1c0e2b-3d4f-4a6b-8c9d-0e1f2a3b4c5d';
const CASE = { id: 'E2E-001', status: 'pass' };
const GREEN_GATE = { gate: 'implement', passed: true, failures: [], cases: [CASE], paid: false, cost_source: 'none' };
const RED_GATE = {
  gate: 'implement', passed: false, failures: [{ id: 'E2E-001', status: 'fail' }], cases: [{ id: 'E2E-001', status: 'fail' }],
  paid: false, cost_source: 'none',
};
const BASELINE = { created_at: '2026-10-24T00:00:00.000Z', test_files: [], case_ids: [] };

// Estado de runner em `state`, com baseline do gate de implementação e os campos extras.
function runnerState(root, state, extra = {}) {
  const created = loadState(root, CHANGE) ?? createState(root, CHANGE, { mode: 'runner', executionId: EXECUTION_ID });
  return saveState(root, CHANGE, {
    ...created, state, stop_reason: null, gates: { implement: { baseline: BASELINE, attempts: [] } }, ...extra,
  });
}

function eventsOf(root) {
  const path = join(localDir(root, CHANGE), 'events.jsonl');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function passingValidation() {
  return async () => ({ verdict: 'pass', stop_reason: null, execution_id: EXECUTION_ID, message: null });
}

test('[SP-010] gate de implementação com pass aprova a fatia e não a execução', async () => {
  const root = makeRepo();
  runnerState(root, 'awaiting_gate');

  const result = await gateImplement({ root, change: CHANGE, options: {}, evaluate: async () => GREEN_GATE });

  assert.equal(result.status, 'pass');
  assert.equal(result.slice_approved, true);
  const state = loadState(root, CHANGE);
  assert.equal(state.state, 'approved');
  assert.deepEqual(state.slice_approvals.map((item) => item.slice), ['implement']);
  assert.equal(state.execution_approval ?? null, null);
  assert.equal(existsSync(join(changeDir(root, CHANGE), 'checkpoint.json')), true);
});

test('[SP-010] gate com pass fora de awaiting_gate não aprova a fatia nem muda o estado', async () => {
  const root = makeRepo();
  runnerState(root, 'awaiting_decision', { stop_reason: 'human_decision_needed' });

  const result = await gateImplement({ root, change: CHANGE, options: {}, evaluate: async () => GREEN_GATE });

  // O veredito do gate continua pass; a fatia não é aprovada e o motivo fica explícito.
  assert.equal(result.status, 'pass');
  assert.equal(result.slice_approved, false);
  assert.match(result.reason, /transição awaiting_decision → approved recusada/);
  const state = loadState(root, CHANGE);
  assert.equal(state.state, 'awaiting_decision');
  assert.deepEqual(state.slice_approvals ?? [], []);
});

test('[SP-010] gate reprovado não aprova a fatia', async () => {
  const root = makeRepo();
  runnerState(root, 'awaiting_gate');

  const result = await gateImplement({ root, change: CHANGE, options: {}, evaluate: async () => RED_GATE });

  assert.equal(result.status, 'retry');
  const state = loadState(root, CHANGE);
  assert.equal(state.state, 'awaiting_gate');
  assert.deepEqual(state.slice_approvals ?? [], []);
});

test('[SP-010] execução só aprova com todas as fatias obrigatórias e a validação final aprovada', async () => {
  const root = makeRepo();
  runnerState(root, 'awaiting_gate');
  await gateImplement({ root, change: CHANGE, options: {}, evaluate: async () => GREEN_GATE });

  const approved = await validateFinal({ root, change: CHANGE, validate: passingValidation() });

  assert.equal(approved.status, 'pass');
  assert.equal(loadState(root, CHANGE).execution_approval.execution_id, EXECUTION_ID);
});

test('[SP-010] validação aprovada sem fatia aprovada não aprova a execução', async () => {
  const root = makeRepo();
  runnerState(root, 'awaiting_gate');

  const result = await validateFinal({ root, change: CHANGE, validate: passingValidation() });

  assert.equal(result.status, 'refused');
  assert.deepEqual(result.pending_slices, ['implement']);
  assert.equal(loadState(root, CHANGE).execution_approval ?? null, null);
});

test('[SP-010] fatia aprovada com validação final reprovada não aprova a execução', async () => {
  const root = makeRepo();
  runnerState(root, 'awaiting_gate');
  await gateImplement({ root, change: CHANGE, options: {}, evaluate: async () => GREEN_GATE });

  const result = await validateFinal({
    root, change: CHANGE, validate: async () => ({ verdict: 'fail', stop_reason: null, execution_id: EXECUTION_ID }),
  });

  assert.equal(result.status, 'fail');
  assert.equal(loadState(root, CHANGE).execution_approval ?? null, null);
});

// awaiting_gate → interrupted entrou na tabela (D8, interrupção em gate); approved continua fora dela.
test('[RC-001] interrupt recusado de approved deixa o estado em approved e grava apenas transition_refused', async () => {
  const root = makeRepo();
  runnerState(root, 'approved');

  const result = await interrupt({ root, change: CHANGE });

  assert.equal(result.status, 'refused');
  const state = loadState(root, CHANGE);
  assert.equal(state.state, 'approved');
  assert.equal(state.stop_reason, null);
  const events = eventsOf(root);
  assert.equal(events.filter((event) => event.phase === 'interrupt' || event.state === 'interrupted').length, 0);
  const refused = events.filter((event) => event.kind === 'transition_refused');
  assert.equal(refused.length, 1);
  assert.equal(refused[0].from_state, 'approved');
  assert.equal(refused[0].to_state, 'interrupted');
  assert.ok(refused[0].reason.length > 0);
});

test('[RC-046] interrupção sem reserva aberta não exige reconciliação financeira', async () => {
  const root = makeRepo();
  runnerState(root, 'invoking', { open_reservations: [], invocation_id: null });

  const result = await interrupt({ root, change: CHANGE });

  assert.equal(result.status, 'recorded');
  assert.equal(result.state, 'interrupted');
  assert.equal(result.stop_reason, null);
  const state = loadState(root, CHANGE);
  assert.equal(state.state, 'interrupted');
  assert.equal(state.stop_reason, null);
  assert.equal(eventsOf(root).filter((event) => event.phase === 'interrupt').length, 1);
});

test('[RS-017] lock vencido com lock_release humano citando o execution_id é liberado pelo interrupt', async () => {
  const root = makeRepo();
  runnerState(root, 'invoking', {
    invocation_id: 'inv-1',
    open_reservations: [{ session_id: 'sess-1', reserved_usd: 2.5, status: 'open', invocation_id: 'inv-1', attempt_id: 1 }],
  });
  acquireLock(root, CHANGE, { executionId: EXECUTION_ID, now: Date.parse('2000-01-01T00:00:00.000Z') });
  writeTree(root, {
    [`openspec/changes/${CHANGE}/authorizations.json`]: [{
      id: 'lock-1', kind: 'lock_release', origin: 'human', scope: { change: CHANGE }, project_id: projectId(root),
      execution_id: EXECUTION_ID, reason: 'processo morto', approver: 'Douglas', date: '2026-10-24',
      recorded_at: '2026-10-24T12:00:00.000Z', author: 'douglas',
    }],
  });

  const result = await interrupt({ root, change: CHANGE });

  assert.equal(result.status, 'recorded');
  assert.equal(result.state, 'interrupted');
  assert.equal(result.stop_reason, 'reconciliation_required');
  assert.equal(existsSync(lockPath(root, CHANGE)), false);
});

test('[RS-010] lock vencido sem lock_release humano não é removido pelo interrupt', async () => {
  const root = makeRepo();
  runnerState(root, 'invoking', { invocation_id: 'inv-1', open_reservations: [] });
  acquireLock(root, CHANGE, { executionId: EXECUTION_ID, now: Date.parse('2000-01-01T00:00:00.000Z') });

  const result = await interrupt({ root, change: CHANGE });

  assert.equal(result.status, 'refused');
  assert.equal(result.stop_reason, 'stale_lock');
  assert.equal(existsSync(lockPath(root, CHANGE)), true);
  assert.equal(loadState(root, CHANGE).state, 'invoking');
});

// Chamada interrompida sem evento de invocação (o runner morreu): o relatório lê a contagem do estado,
// nunca apresenta total completo com custo desconhecido e mostra a interrupção (D17, RC-017, RC-024).
const INTERRUPTED_STATE = {
  state: 'ready', stop_reason: null, execution_id: EXECUTION_ID, invocations_total: 3, open_reservations: [],
  consumption: { known_usd: 0.15, estimated_usd: 0, unknown_calls: 1, unknown_exposure_usd: 2.5 },
  interruptions: [{ invocation_id: 'inv-3', at: '2026-10-24T03:40:00.000Z', from_state: 'invoking' }],
};

test('[RC-024] relatório mostra a chamada encerrada com custo desconhecido e não apresenta total completo', async () => {
  const { buildReport } = await import('../../harness/report.mjs');
  const report = buildReport({ change: CHANGE, events: [], state: INTERRUPTED_STATE, runtime: { node_version: 'v24.21.0' } });
  assert.equal(report.cost.unknown_calls, 1);
  assert.equal(report.cost.unknown_exposure_usd, 2.5);
  assert.equal(report.cost.total_complete, false);
  assert.equal(report.cost.total_usd, null);
});

test('[RC-017] relatório mostra a interrupção registrada no estado', async () => {
  const { buildReport } = await import('../../harness/report.mjs');
  const report = buildReport({ change: CHANGE, events: [], state: INTERRUPTED_STATE, runtime: { node_version: 'v24.21.0' } });
  assert.equal(report.metrics.interruptions, 1);
});
