// Máquina de estados, contadores e tabela de transições (F6, D8, D9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './fixture.mjs';
import { applyTransition, assertStateInvariant, STATES, STOP_REASONS, TRANSITIONS } from '../../harness/machine.mjs';
import { countGateEvaluation, countInvocation, dispatchCorrection, emptyCounters, startRound } from '../../harness/counters.mjs';

function stateIn(state, extra = {}) {
  return { state, stop_reason: null, round: 1, attempt_id: 0, counters: emptyCounters(), ...extra };
}

test('[RC-001] transição de invoking para approved é recusada e o estado não muda', () => {
  const current = stateIn('invoking');
  const before = structuredClone(current);
  const result = applyTransition(current, 'approved');
  assert.equal(result.ok, false);
  assert.deepEqual(current, before);
});

test('[RC-001] a tabela só aceita os destinos listados para cada origem', () => {
  assert.ok(TRANSITIONS.invoking.includes('awaiting_gate'));
  assert.ok(!TRANSITIONS.invoking.includes('approved'));
  assert.equal(applyTransition(stateIn('ready'), 'approved').ok, false);
});

test('[RC-001] estados da máquina são os de policy.json', () => {
  const policy = JSON.parse(readFileSync(join(REPO_ROOT, '.claude', 'harness', 'policy.json'), 'utf8'));
  assert.deepEqual([...STATES], policy.states);
});

test('[RC-002] motivos de parada de machine.mjs são os de policy.json', () => {
  const policy = JSON.parse(readFileSync(join(REPO_ROOT, '.claude', 'harness', 'policy.json'), 'utf8'));
  assert.deepEqual([...STOP_REASONS], policy.stop_reasons);
});

test('[RC-002] estado ready com stop_reason preenchido é recusado pela invariante', () => {
  assert.throws(() => assertStateInvariant({ state: 'ready', stop_reason: 'budget_exhausted' }), /stop_reason/);
});

test('[RC-002] a parada grava o motivo e a saída da parada o limpa', () => {
  const stopped = applyTransition(stateIn('ready'), 'awaiting_decision', { stopReason: 'budget_exhausted' });
  assert.equal(stopped.ok, true);
  assert.equal(stopped.state.stop_reason, 'budget_exhausted');
  const resumed = applyTransition(stopped.state, 'ready');
  assert.equal(resumed.ok, true);
  assert.equal(resumed.state.stop_reason, null);
});

test('[RC-002] motivo de parada em estado que não é de parada é recusado', () => {
  const result = applyTransition(stateIn('ready'), 'awaiting_gate', { stopReason: 'budget_exhausted' });
  assert.equal(result.ok, false);
});

test('[RC-003] avaliação de gate não conta como invocação do modelo', () => {
  const afterInvocation = countInvocation(stateIn('ready'));
  const afterGate = countGateEvaluation(countGateEvaluation(afterInvocation));
  assert.equal(afterGate.counters.invocations, 1);
  assert.equal(afterGate.counters.gate_evaluations, 2);
});

test('[RC-004] attempt_id continua ao abrir nova rodada e round aumenta em uma unidade', () => {
  const current = stateIn('invoking', {
    attempt_id: 5,
    counters: { ...emptyCounters(), invocations: 4, corrections: { implement: 2 } },
  });
  const result = startRound({ ...current, state: 'awaiting_decision', stop_reason: 'correction_limit' }, { authorized: true });
  assert.equal(result.ok, true);
  assert.equal(result.state.attempt_id, 5);
  assert.equal(result.state.round, 2);
  assert.equal(result.state.counters.invocations, 0);
  assert.deepEqual(result.state.counters.corrections, {});
});

test('[RC-005] correção despachada consome o limite antes de saber se houve alteração', () => {
  const next = dispatchCorrection(stateIn('correction_requested'), 'implement', 3);
  assert.equal(next.ok, true);
  assert.equal(next.state.counters.corrections.implement, 1);
});

test('[RC-007] quarta correção do mesmo gate na rodada é recusada com correction_limit', () => {
  let current = stateIn('awaiting_gate');
  for (let index = 0; index < 3; index += 1) {
    const dispatched = dispatchCorrection(current, 'implement', 3);
    assert.equal(dispatched.ok, true);
    current = dispatched.state;
  }
  const refused = dispatchCorrection(current, 'implement', 3);
  assert.equal(refused.ok, false);
  assert.equal(refused.stop_reason, 'correction_limit');
  assert.equal(refused.state.counters.corrections.implement, 3);
});
