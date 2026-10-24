// Limites de tempo ativo e de invocações, identidade de execução e invocação,
// e distinção entre authorization_required e budget_reserve_insufficient (F6, D23).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, CHANGE } from './fixture.mjs';
import { loadState } from '../../harness/state.mjs';
import { buildStopReport } from '../../harness/stop-report.mjs';
import { newCallLog, simulatorCalls } from './simulator.mjs';
import { grant, paidOutput, patchState, step, writeAuthorizations, OK_OUTPUT } from './f6-support.mjs';

const CANDIDATE = { provisional: true };

test('[RC-026] tempo total ativo igual ao limite da política para com time_limit sem invocar', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  patchState(root, { active_ms: 10800 * 1000 });
  const log = newCallLog();
  const outcome = await step(root, log, OK_OUTPUT);
  assert.equal(outcome.invoked, false);
  assert.equal(outcome.stop_reason, 'time_limit');
  assert.equal(outcome.state, 'awaiting_decision');
  assert.equal(simulatorCalls(log).length, 0);
});

test('[RC-026] candidato de tempo menor que a política prevalece como limite efetivo', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  patchState(root, { active_ms: 61 * 1000 });
  const log = newCallLog();
  const outcome = await step(root, log, OK_OUTPUT, { profile: { ...CANDIDATE, candidate_seconds_per_change: 60 } });
  assert.equal(outcome.stop_reason, 'time_limit');
  assert.equal(simulatorCalls(log).length, 0);
});

test('[RC-036] a espera por decisão humana não entra no tempo total: só o tempo ativo acumulado conta', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  patchState(root, {
    state: 'awaiting_decision',
    stop_reason: 'human_decision_needed',
    active_ms: 1000,
    stopped_at: '2026-10-01T00:00:00.000Z',
  });
  const log = newCallLog();
  const outcome = await step(root, log, OK_OUTPUT);
  assert.equal(outcome.invoked, true);
  assert.equal(outcome.state, 'awaiting_gate');
  assert.equal(typeof loadState(root, CHANGE).active_ms, 'number');
});

test('[RC-037] limite de invocações da change para com budget_exhausted antes da próxima invocação', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  const first = await step(root, log, paidOutput(1), { profile: { ...CANDIDATE, candidate_invocations_per_change: 1 } });
  assert.equal(first.invoked, true);
  const second = await step(root, log, paidOutput(1), { profile: { ...CANDIDATE, candidate_invocations_per_change: 1 } });
  const state = loadState(root, CHANGE);
  assert.equal(second.invoked, false);
  assert.equal(second.stop_reason, 'budget_exhausted');
  assert.equal(simulatorCalls(log).length, 1);
  assert.equal(state.consumption.known_usd, 1);
  assert.equal(state.invocations_total, 1);
});

test('[RC-022] tempo por chamada menor entre política e candidato é aplicado como timeout', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  const started = Date.now();
  const outcome = await step(root, log, OK_OUTPUT, {
    profile: { ...CANDIDATE, candidate_seconds_per_call: 1 },
    env: { FAKE_CLAUDE_LOG: log, FAKE_CLAUDE_HANG: '1', FAKE_CLAUDE_HANG_MS: '10000' },
    killGraceMs: 200,
  });
  assert.equal(outcome.stop_reason, 'timeout_unclassified');
  assert.ok(Date.now() - started < 5000);
});

test('[RC-035] nova execução referencia a anterior e mantém consumo e reservas', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  const first = await step(root, log, paidOutput(1));
  const oldExecution = loadState(root, CHANGE).execution_id;
  patchState(root, { state: 'awaiting_decision', stop_reason: 'human_decision_needed' });
  const second = await step(root, log, paidOutput(1), { newExecution: true });
  const state = loadState(root, CHANGE);
  assert.equal(first.invoked, true);
  assert.equal(second.invoked, true);
  assert.notEqual(state.execution_id, oldExecution);
  assert.equal(state.previous_execution_id, oldExecution);
  assert.equal(state.consumption.known_usd, 2);
  assert.equal(state.invocations_total, 2);
});

test('[RS-024] retomada na mesma execução preserva execution_id e não reutiliza invocation_id', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  const first = await step(root, log, OK_OUTPUT);
  const execution = loadState(root, CHANGE).execution_id;
  const second = await step(root, log, OK_OUTPUT);
  assert.equal(loadState(root, CHANGE).execution_id, execution);
  assert.equal(typeof second.invocation_id, 'string');
  assert.notEqual(second.invocation_id, first.invocation_id);
});

test('[RC-038] cada invocação tem invocation_id próprio, distinto de execution_id e de session_id', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  const first = await step(root, log, OK_OUTPUT);
  const second = await step(root, log, OK_OUTPUT);
  const execution = loadState(root, CHANGE).execution_id;
  const ids = [first.invocation_id, second.invocation_id];
  assert.equal(new Set(ids).size, 2);
  for (const id of ids) {
    assert.notEqual(id, execution);
    assert.notEqual(id, first.session_id);
    assert.notEqual(id, second.session_id);
  }
});

test('[RC-031] sem autorização o relatório mostra authorization_required e não budget_reserve_insufficient', async () => {
  const root = makeRepo();
  writeAuthorizations(root, []);
  const outcome = await step(root, newCallLog(), OK_OUTPUT);
  const report = buildStopReport({ outcome, objective: 'fatia F6' });
  assert.equal(outcome.stop_reason, 'authorization_required');
  assert.equal(report.blocker.stop_reason, 'authorization_required');
  assert.notEqual(report.blocker.stop_reason, 'budget_reserve_insufficient');
});

test('[RC-031] autorização vigente sem saldo para com budget_reserve_insufficient e o relatório mostra esse motivo', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 2)]);
  const log = newCallLog();
  // Primeira chamada: limite 1, reserva 1,25, gasto real 1,5. Saldo restante 0,5.
  const outcome = await step(root, log, paidOutput(1.5), { profile: { ...CANDIDATE, candidate_usd_per_call: 1 } });
  const insufficient = await step(root, log, OK_OUTPUT);
  const report = buildStopReport({ outcome: insufficient, objective: 'fatia F6' });
  assert.equal(outcome.invoked, true);
  assert.equal(insufficient.stop_reason, 'budget_reserve_insufficient');
  assert.equal(report.blocker.stop_reason, 'budget_reserve_insufficient');
  assert.equal(simulatorCalls(log).length, 1);
});
