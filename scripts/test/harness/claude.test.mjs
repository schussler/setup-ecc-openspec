// Testes da invocação headless do harness (F5). O binário é o simulador local,
// nunca o modelo. Nome de cada teste começa pelo ID do cenário em headless-execution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildHarnessArgs, invokeHarness, readAllowedTools } from '../../harness/claude.mjs';
import { FAKE_CLAUDE_BIN, newCallLog, simulatorCalls, simulatorEnv } from './simulator.mjs';

const SESSION_ID = '5b0f3c1e-2d4a-4b6c-8e9f-0a1b2c3d4e5f';
const TOOLS = ['Read', 'Grep'];
const PROMPT = '/spec-implement add-spec-harness';

function argsFor(overrides = {}) {
  return buildHarnessArgs({ prompt: PROMPT, allowedTools: TOOLS, sessionId: SESSION_ID, ...overrides });
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

async function invoke(output, extra = {}) {
  const logPath = newCallLog();
  const result = await invokeHarness({
    bin: FAKE_CLAUDE_BIN,
    cwd: tmpdir(),
    prompt: PROMPT,
    allowedTools: TOOLS,
    sessionId: SESSION_ID,
    maxBudgetUsd: 2,
    env: simulatorEnv(logPath, output, extra.env),
    ...extra,
  });
  return { result, calls: simulatorCalls(logPath) };
}

test('[HE-001] argumentos com prompt da skill, json e session-id', () => {
  const args = argsFor({ maxBudgetUsd: 2 });
  assert.equal(args[0], '-p');
  assert.equal(args[1], PROMPT);
  assert.equal(valueAfter(args, '--output-format'), 'json');
  assert.equal(valueAfter(args, '--session-id'), SESSION_ID);
});

test('[HE-002] nunca usa dangerously-skip-permissions nem bare e usa dontAsk', () => {
  const args = argsFor({ maxBudgetUsd: 2 });
  assert.ok(!args.includes('--dangerously-skip-permissions'));
  assert.ok(!args.includes('--bare'));
  assert.equal(valueAfter(args, '--permission-mode'), 'dontAsk');
});

test('[HE-003] nunca passa fallback-model', () => {
  assert.ok(!argsFor({ maxBudgetUsd: 2, model: 'claude-haiku-5-5' }).includes('--fallback-model'));
});

test('[HE-004] teto por chamada vai em --max-budget-usd e some sem teto', () => {
  assert.equal(valueAfter(argsFor({ maxBudgetUsd: 2.5 }), '--max-budget-usd'), '2.5');
  assert.ok(!argsFor().includes('--max-budget-usd'));
});

test('[HE-001] allowedTools vai por último e lista vazia é recusada', () => {
  const args = argsFor({ model: 'claude-haiku-5-5', effort: 'low' });
  assert.deepEqual(args.slice(args.indexOf('--allowedTools') + 1), TOOLS);
  assert.equal(valueAfter(args, '--effort'), 'low');
  assert.throws(() => argsFor({ allowedTools: [] }), /allowedTools/);
});

test('[HE-001] lista de ferramentas vem de permissions.allow em .claude/settings.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'settings-'));
  mkdirSync(join(dir, '.claude'));
  writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: TOOLS } }));
  assert.deepEqual(readAllowedTools(dir), TOOLS);
});

test('[HE-006] sucesso com custo informado vira custo reportado', async () => {
  const { result, calls } = await invoke({ type: 'result', subtype: 'success', is_error: false, result: 'ok', total_cost_usd: 0.42, num_turns: 2 });
  assert.equal(result.status, 'success');
  assert.equal(result.stop_reason, null);
  assert.equal(result.cost_usd, 0.42);
  assert.equal(result.cost_source, 'reported');
  assert.equal(calls.length, 1);
  assert.equal(valueAfter(calls[0].args, '--max-budget-usd'), '2');
});

test('[HE-006] is_error sem causa identificada vira error sem causa, nunca limite de turnos', async () => {
  const { result } = await invoke({ type: 'result', is_error: true, result: 'falha qualquer', total_cost_usd: 0.1 });
  assert.equal(result.status, 'error');
  assert.equal(result.cause, null);
  assert.equal(result.stop_reason, null);
});

test('[HE-006] binário ausente vira erro de spawn sem causa de limite', async () => {
  const result = await invokeHarness({ bin: ['/nao/existe/claude'], cwd: tmpdir(), prompt: PROMPT, allowedTools: TOOLS, sessionId: SESSION_ID });
  assert.equal(result.status, 'error');
  assert.match(result.cause, /^spawn/);
  assert.equal(result.stop_reason, null);
});

test('[RC-010] custo ausente na saída vira custo desconhecido, nunca zero', async () => {
  const { result } = await invoke({ type: 'result', is_error: false, subtype: 'success', result: 'ok' });
  assert.equal(result.status, 'success');
  assert.equal(result.cost_usd, null);
  assert.equal(result.cost_source, 'unknown');
});

test('[RC-025] limite de uso da conta vira quota_unavailable', async () => {
  const { result } = await invoke({ type: 'result', is_error: true, result: 'Claude AI usage limit reached|1760000000' });
  assert.equal(result.status, 'quota_unavailable');
  assert.equal(result.stop_reason, 'quota_unavailable');
});

test('[RC-023] timeout vira timeout_unclassified com custo desconhecido', async () => {
  const { result } = await invoke(undefined, {
    env: { FAKE_CLAUDE_HANG: '1' },
    timeoutMs: 300,
    killGraceMs: 100,
  });
  assert.equal(result.status, 'timeout_unclassified');
  assert.equal(result.stop_reason, 'timeout_unclassified');
  assert.equal(result.cost_source, 'unknown');
});
