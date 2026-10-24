// Telemetria local (F9, D17, TE-001 e TE-002): um evento por passo, modelo solicitado e efetivo,
// custo com origem e nunca zero quando a CLI não informa custo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHANGE, makeRepo } from './fixture.mjs';
import { eventFromInvocation, readEvents, recordEvent } from '../../harness/telemetry.mjs';
import { simulatedInvocation } from './f9-support.mjs';
import { runHarnessStep } from '../../harness/runner.mjs';
import { FAKE_CLAUDE_BIN, newCallLog, simulatorEnv } from './simulator.mjs';
import { writeTree } from '../helpers.mjs';

const CONTEXT = { agent: 'implementador', function: 'invocacao', model: 'claude-sonnet-5', effort: 'high' };
const REQUIRED_FIELDS = [
  'agent', 'function', 'provider', 'model_requested', 'model_effective', 'model_divergent',
  'effort_requested', 'effort_effective', 'duration_ms', 'tokens', 'cost_usd', 'cost_source',
  'status', 'cases', 'checks', 'results', 'hashes', 'corrections_requested', 'changes_produced',
  'stops', 'interruptions', 'human_decisions', 'reserves',
];

test('[TE-001] evento registra modelo solicitado e efetivo divergentes e marca a divergência', async () => {
  // Arrange
  const root = makeRepo();
  const result = await simulatedInvocation({
    type: 'result', is_error: false, subtype: 'success', result: 'ok', total_cost_usd: 0.3, modelUsage: { 'claude-haiku-5-5': {} },
  });

  // Act
  const event = recordEvent(root, CHANGE, eventFromInvocation(result, CONTEXT));

  // Assert
  assert.equal(event.model_requested, 'claude-sonnet-5');
  assert.equal(event.model_effective, 'claude-haiku-5-5');
  assert.equal(event.model_divergent, true);
  assert.deepEqual(readEvents(root, CHANGE), [event]);
});

test('[TE-001] modelo efetivo igual ao solicitado não é marcado como divergente', async () => {
  // Arrange
  const root = makeRepo();
  const result = await simulatedInvocation({
    type: 'result', is_error: false, subtype: 'success', result: 'ok', total_cost_usd: 0.3, modelUsage: { 'claude-sonnet-5': {} },
  });

  // Act
  const event = recordEvent(root, CHANGE, eventFromInvocation(result, CONTEXT));

  // Assert
  assert.equal(event.model_divergent, false);
});

test('[TE-001] evento traz agente, função, provedor, esforço, duração, tokens, status, casos, correções e decisões', async () => {
  // Arrange
  const root = makeRepo();
  const result = await simulatedInvocation({ type: 'result', is_error: false, subtype: 'success', result: 'ok', total_cost_usd: 0.3 });

  // Act
  const event = recordEvent(root, CHANGE, eventFromInvocation(result, CONTEXT));

  // Assert
  for (const field of REQUIRED_FIELDS) assert.ok(field in event, `campo ausente: ${field}`);
  assert.equal(event.agent, 'implementador');
  assert.equal(event.effort_requested, 'high');
  assert.equal(typeof event.duration_ms, 'number');
});

test('[TE-001] gravação é append-only: a segunda chamada acrescenta sem reescrever a primeira linha', () => {
  // Arrange
  const root = makeRepo();
  const first = recordEvent(root, CHANGE, { agent: 'gate', function: 'implement', cost_source: 'unmeasured', status: 'ok' });

  // Act
  recordEvent(root, CHANGE, { agent: 'gate', function: 'archive', paid: false, status: 'ok' });

  // Assert
  const lines = readFileSync(join(root, '.harness-local', CHANGE, 'events.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0], JSON.stringify(first));
});

test('[TE-002] CLI sem custo grava cost_source unknown e cost_usd nulo, nunca zero', async () => {
  // Arrange
  const root = makeRepo();
  const result = await simulatedInvocation({ type: 'result', is_error: false, subtype: 'success', result: 'ok' });

  // Act
  const event = recordEvent(root, CHANGE, eventFromInvocation(result, CONTEXT));

  // Assert
  assert.equal(event.cost_source, 'unknown');
  assert.equal(event.cost_usd, null);
});

test('[TE-002] custo reportado sem valor numérico também vira unknown', () => {
  // Arrange
  const root = makeRepo();

  // Act
  const event = recordEvent(root, CHANGE, { agent: 'implementador', function: 'invocacao', cost_usd: null, cost_source: 'reported' });

  // Assert
  assert.equal(event.cost_source, 'unknown');
  assert.equal(event.cost_usd, null);
});

test('[TE-002] custo estimado mantém a origem estimated e não vira reported', () => {
  // Arrange
  const root = makeRepo();

  // Act
  const event = recordEvent(root, CHANGE, { agent: 'implementador', function: 'invocacao', cost_usd: 0.5, cost_source: 'estimated' });

  // Assert
  assert.equal(event.cost_source, 'estimated');
  assert.equal(event.cost_usd, 0.5);
});

// Ligação com o runner: uma invocação real (simulador) grava exatamente um evento.
const HUMAN = { origin: 'human', scope: { change: CHANGE }, recorded_at: '2026-10-23T12:00:00.000Z', author: 'mantenedor' };
const BUDGET = { id: 'budget-1', kind: 'budget', total_usd: 10, per_call_usd: 2, reason: 'teste', approver: 'mantenedor', ...HUMAN };
const PROMPT = '/spec-implement add-spec-harness';

async function runOneStep(output) {
  const root = makeRepo();
  writeTree(root, { [`openspec/changes/${CHANGE}/authorizations.json`]: [BUDGET] });
  await runHarnessStep({
    root, change: CHANGE, bin: FAKE_CLAUDE_BIN, prompt: PROMPT, allowedTools: ['Read'],
    env: simulatorEnv(newCallLog(), output), model: 'claude-sonnet-5', effort: 'high', agent: 'implementador',
  });
  return readEvents(root, CHANGE);
}

test('[TE-001] o evento da invocação traz os tokens de usage informados pela CLI', async () => {
  const events = await runOneStep({
    type: 'result', subtype: 'success', is_error: false, result: 'ok', total_cost_usd: 0.2,
    usage: { input_tokens: 1200, output_tokens: 340, cache_creation_input_tokens: 5000, cache_read_input_tokens: 18000 },
  });
  assert.deepEqual(events[0].tokens, {
    input: 1200, output: 340, cache_creation_input: 5000, cache_read_input: 18000, scope: 'main_loop',
  });
});

test('[TE-001] sem usage na saída, os tokens ficam nulos e não viram zero', async () => {
  const events = await runOneStep({ type: 'result', subtype: 'success', is_error: false, result: 'ok', total_cost_usd: 0.2 });
  assert.equal(events[0].tokens, null);
});

test('[TE-001] o runner grava um evento por invocação, com o modelo solicitado e o efetivo', async () => {
  const events = await runOneStep({
    type: 'result', subtype: 'success', is_error: false, result: 'ok', total_cost_usd: 0.2, modelUsage: { 'claude-haiku-5-5': {} },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].agent, 'implementador');
  assert.equal(events[0].model_requested, 'claude-sonnet-5');
  assert.equal(events[0].model_effective, 'claude-haiku-5-5');
  assert.equal(events[0].model_divergent, true);
  assert.equal(events[0].cost_source, 'reported');
});

test('[TE-002] o runner grava custo unknown quando a CLI não informa custo', async () => {
  const events = await runOneStep({ type: 'result', subtype: 'success', is_error: false, result: 'ok' });
  assert.equal(events[0].cost_source, 'unknown');
  assert.equal(events[0].cost_usd, null);
});
