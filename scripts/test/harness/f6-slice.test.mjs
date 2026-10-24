// Ciclo da fatia conduzido pelo runner: correções, teto, ausência de melhora,
// divergência, decisão humana, quota e timeout (F6, RC-005 a RC-027, SG-017; RC-041 no lugar de SG-018).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, CHANGE } from './fixture.mjs';
import { loadState } from '../../harness/state.mjs';
import { newCallLog, simulatorCalls } from './simulator.mjs';
import {
  CHANGE_DIR, OK_OUTPUT, checkpointExists, failed, grant, passed, scripted, slice, step, writeAuthorizations,
} from './f6-support.mjs';

const hashOf = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

test('[RC-005] correção sem alteração consome o limite e registra produced_change falso', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  const evaluate = scripted([failed(['[AC-001] soma']), passed(), passed()]);
  const result = await slice(root, log, { evaluate, snapshot: () => 'mesmo-hash' });
  const state = loadState(root, CHANGE);
  assert.equal(result.state, 'approved');
  assert.equal(state.counters.corrections.implement, 1);
  assert.equal(state.counters.last_correction.produced_change, false);
  assert.equal(simulatorCalls(log).length, 2);
});

test('[RC-005] correção com alteração registra produced_change verdadeiro', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  const hashes = ['antes', 'depois'];
  const evaluate = scripted([failed(['[AC-001] soma']), passed(), passed()]);
  await slice(root, log, { evaluate, snapshot: () => hashes.shift() ?? 'depois' });
  assert.equal(loadState(root, CHANGE).counters.last_correction.produced_change, true);
});

test('[SG-017] quarta avaliação reprovada depois de três correções para com correction_limit', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  const evaluate = scripted([failed(['a', 'b', 'c', 'd']), failed(['a', 'b', 'c']), failed(['a', 'b']), failed(['a'])]);
  const result = await slice(root, log, { evaluate });
  const state = loadState(root, CHANGE);
  assert.equal(result.state, 'awaiting_decision');
  assert.equal(result.stop_reason, 'correction_limit');
  assert.equal(state.counters.corrections.implement, 3);
  assert.equal(simulatorCalls(log).length, 4);
  assert.equal(evaluate.calls.length, 4);
});

test('[RC-041] avaliação reprovada sem queda de falhas, com sintoma diferente, não para o runner', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  const evaluate = scripted([failed(['a', 'b']), failed(['c', 'd']), passed(), passed()]);
  const result = await slice(root, log, { evaluate });
  assert.equal(result.state, 'approved');
  assert.equal(loadState(root, CHANGE).counters.corrections.implement, 2);
  assert.equal(simulatorCalls(log).length, 3);
});

test('[RC-016] reexecução com o mesmo código que diverge leva a diagnosing e não aprova', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  const evaluate = scripted([passed(), failed(['[AC-004] flaky'])]);
  const result = await slice(root, log, { evaluate });
  const state = loadState(root, CHANGE);
  assert.equal(result.state, 'diagnosing');
  assert.equal(state.stop_reason, null);
  assert.equal(state.counters.diagnostics.implement, 1);
  assert.equal(checkpointExists(root), false);
});

test('[RC-027] ambiguidade de escopo para com human_decision_needed sem alterar o contrato', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const proposal = join(root, CHANGE_DIR, 'proposal.md');
  writeFileSync(proposal, '# contrato aprovado\n');
  const before = hashOf(proposal);
  const log = newCallLog();
  const evaluate = scripted([{ outcome: 'human_decision_needed', failures: [], errorClass: null }]);
  const result = await slice(root, log, { evaluate });
  assert.equal(result.state, 'awaiting_decision');
  assert.equal(result.stop_reason, 'human_decision_needed');
  assert.equal(hashOf(proposal), before);
  assert.equal(simulatorCalls(log).length, 1);
  assert.equal(loadState(root, CHANGE).counters.corrections.implement ?? 0, 0);
});

test('[RC-025] limite de uso da conta para sem nova invocação e não conta como falha de gate', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  const quota = { type: 'result', subtype: 'success', is_error: true, result: 'Claude AI usage limit reached|1760000000' };
  const evaluate = scripted([]);
  const result = await slice(root, log, { evaluate, env: { FAKE_CLAUDE_LOG: log, FAKE_CLAUDE_OUTPUT: JSON.stringify(quota) } });
  const state = loadState(root, CHANGE);
  assert.equal(result.state, 'awaiting_decision');
  assert.equal(result.stop_reason, 'quota_unavailable');
  assert.equal(evaluate.calls.length, 0);
  assert.equal(state.counters.gate_evaluations ?? 0, 0);
  assert.equal(simulatorCalls(log).length, 1);
});

test('[RC-023] timeout para em timeout_unclassified com saída parcial, tempo e comando', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  const result = await step(root, log, OK_OUTPUT, {
    timeoutMs: 300, killGraceMs: 200, env: { FAKE_CLAUDE_LOG: log, FAKE_CLAUDE_HANG: '1' },
  });
  const state = loadState(root, CHANGE);
  assert.equal(result.state, 'awaiting_decision');
  assert.equal(result.stop_reason, 'timeout_unclassified');
  assert.deepEqual(state.timeout_diagnostic.required, ['partial_output', 'duration_ms', 'command']);
  assert.equal(typeof state.timeout_diagnostic.duration_ms, 'number');
  assert.equal(typeof state.timeout_diagnostic.partial_output, 'string');
  assert.ok(Array.isArray(state.timeout_diagnostic.command));
});

test('[RS-011] checkpoint não é gravado nem muda entre as invocações da fatia', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  const seen = [];
  const responses = scripted([failed(['a', 'b', 'c']), failed(['a', 'b']), passed(), passed()]);
  const evaluate = async (context) => {
    seen.push(checkpointExists(root));
    return responses(context);
  };
  const result = await slice(root, log, { evaluate });
  assert.equal(result.state, 'approved');
  assert.equal(simulatorCalls(log).length, 3);
  assert.deepEqual(seen, [false, false, false, false]);
  assert.equal(checkpointExists(root), true);
  const checkpoint = JSON.parse(readFileSync(join(root, CHANGE_DIR, 'checkpoint.json'), 'utf8'));
  assert.equal(checkpoint.checkpoint_seq, 1);
  assert.equal(checkpoint.milestone, 'slice_approved');
});

test('[RC-003] cada avaliação do gate aumenta gate_evaluations e não invocations', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  await slice(root, log, { evaluate: scripted([passed(), passed()]) });
  const state = loadState(root, CHANGE);
  assert.equal(state.counters.invocations, 1);
  assert.equal(state.counters.gate_evaluations, 2);
});
