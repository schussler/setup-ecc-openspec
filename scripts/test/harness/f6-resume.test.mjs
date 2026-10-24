// Retomada, rodada local, contadores incertos, relatório de parada e replanejamento
// (F6, RC-012, RC-013, RC-017 a RC-020, RC-028).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, CHANGE } from './fixture.mjs';
import { loadState } from '../../harness/state.mjs';
import { openLocalRound } from '../../harness/resume.mjs';
import { emptyCounters } from '../../harness/counters.mjs';
import { buildStopReport } from '../../harness/stop-report.mjs';
import { newCallLog, simulatorCalls } from './simulator.mjs';
import { grant, paidOutput, patchState, step, writeAuthorizations, OK_OUTPUT, HUMAN, readAuthorizationsFile } from './f6-support.mjs';

const ROUND_RECORD = { id: 'round-1', kind: 'round', reason: 'nova rodada após correção', approver: 'Douglas', ...HUMAN };

test('[RC-017] retomada com chamada interrompida mantém a reserva aberta e marca a chamada como interrompida', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  await step(root, log, OK_OUTPUT);
  patchState(root, { state: 'invoking' });
  const outcome = await step(root, log, OK_OUTPUT);
  const state = loadState(root, CHANGE);
  const report = buildStopReport({ outcome, state, objective: 'fatia F6' });
  assert.equal(outcome.invoked, false);
  assert.equal(outcome.state, 'interrupted');
  assert.equal(outcome.stop_reason, 'reconciliation_required');
  assert.equal(state.open_reservations.length, 1);
  assert.equal(report.attempts.interrupted_calls, 1);
  assert.equal(simulatorCalls(log).length, 1);
});

test('[RC-018] alteração encontrada na retomada fica pendente de validação e a aprovação anterior não vale', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  await step(root, log, OK_OUTPUT);
  patchState(root, { observed_hashes: { 'src/soma.mjs': 'h1' }, approved_evidence_hash: 'aprovado-1' });
  await step(root, log, OK_OUTPUT, { observe: () => ({ 'src/soma.mjs': 'h2' }) });
  const state = loadState(root, CHANGE);
  assert.deepEqual(state.pending_validation, ['src/soma.mjs']);
  assert.equal(state.approved_evidence_hash, null);
});

test('[RC-019] parada com uma única hipótese plausível não completa a lista com hipóteses inventadas', () => {
  const outcome = { state: 'awaiting_decision', stop_reason: 'budget_exhausted' };
  const report = buildStopReport({
    outcome,
    hypotheses: [{ text: 'limite por chamada baixo para o modelo escolhido', basis: 'evidence' }],
  });
  assert.equal(report.hypotheses.length, 1);
  assert.equal(report.hypotheses[0].basis, 'evidência');
});

test('[RC-019] o relatório aceita no máximo três hipóteses', () => {
  const hypotheses = [1, 2, 3, 4].map((index) => ({ text: `hipótese ${index}`, basis: 'suspeita' }));
  const report = buildStopReport({ outcome: { state: 'awaiting_decision', stop_reason: 'repeated_symptom' }, hypotheses });
  assert.equal(report.hypotheses.length, 3);
});

test('[RC-012] ampliação pela configuração proposta sem autorização não aumenta o saldo', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 3)]);
  const log = newCallLog();
  await step(root, log, paidOutput(3));
  // Configuração acima do teto da política é recusada antes de qualquer processo (PO-002).
  await assert.rejects(step(root, log, OK_OUTPUT, { profile: { provisional: true, candidate_usd_per_change: 60 } }), /amplia o teto/);
  assert.equal(simulatorCalls(log).length, 1);
});

test('[RC-013] nova rodada sem autorização round é recusada e nada muda', () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  patchState(root, { state: 'awaiting_decision', stop_reason: 'correction_limit', counters: { ...emptyCounters(), corrections: { implement: 3 } } });
  const before = loadState(root, CHANGE);
  const result = openLocalRound(root, CHANGE);
  assert.equal(result.ok, false);
  assert.equal(result.stop_reason, 'human_decision_needed');
  assert.equal(loadState(root, CHANGE).round, before.round);
});

test('[RC-013] nova rodada com autorização round zera contadores locais e preserva o consumo', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  await step(root, log, paidOutput(3));
  patchState(root, { state: 'awaiting_decision', stop_reason: 'correction_limit', counters: { ...emptyCounters(), corrections: { implement: 3 } } });
  writeAuthorizations(root, [grant('budget-1', 30), ROUND_RECORD]);
  const result = openLocalRound(root, CHANGE);
  const state = loadState(root, CHANGE);
  assert.equal(result.ok, true);
  assert.equal(state.round, 2);
  assert.deepEqual(state.counters.corrections, {});
  assert.equal(state.consumption.known_usd, 3);
  assert.equal(state.state, 'ready');
  assert.equal(readAuthorizationsFile(root).length, 2);
});

test('[RC-028] contadores incertos exigem autorização round para iniciar a rodada reconciliada', () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  patchState(root, { state: 'awaiting_decision', stop_reason: 'human_decision_needed', counters_certain: false });
  assert.equal(openLocalRound(root, CHANGE).ok, false);
  writeAuthorizations(root, [grant('budget-1', 30), ROUND_RECORD]);
  const result = openLocalRound(root, CHANGE);
  assert.equal(result.ok, true);
  assert.equal(loadState(root, CHANGE).counters_certain, false);
});

test('[RC-020] segunda rodada local gera recomendação de replanejamento no relatório', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30), ROUND_RECORD]);
  patchState(root, { state: 'awaiting_decision', stop_reason: 'correction_limit' });
  assert.equal(openLocalRound(root, CHANGE).ok, true);
  const report = buildStopReport({ outcome: { state: 'awaiting_decision', stop_reason: 'correction_limit' }, state: loadState(root, CHANGE) });
  assert.match(report.recommendation, /replanejamento/);
});

test('[RC-020] três paradas com o mesmo motivo também geram recomendação de replanejamento', () => {
  const stops = [1, 2, 3].map(() => ({ stop_reason: 'time_limit' }));
  const report = buildStopReport({ outcome: { state: 'awaiting_decision', stop_reason: 'time_limit' }, state: { round: 1, stop_history: stops, counters: {}, consumption: {}, open_reservations: [] } });
  assert.match(report.recommendation, /replanejamento/);
});
