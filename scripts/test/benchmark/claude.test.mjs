import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildClaudeArgs, buildStepPrompt, invokeClaude, readAllowedTools } from '../../benchmark/lib/claude.mjs';
import { makeTempDir, writeTree, REPO_ROOT } from '../helpers.mjs';

const FAKE = [process.execPath, join(REPO_ROOT, 'scripts/test/benchmark/fake-claude.mjs')];

test('skill nomeada no prompt executa via claude -p', () => {
  const prompt = buildStepPrompt('spec-create', '--headless criar parser');
  assert.equal(prompt, '/spec-create --headless criar parser');
  const args = buildClaudeArgs({ prompt, allowedTools: ['Read', 'Bash(git status:*)'] });
  assert.equal(args[0], '-p');
  assert.equal(args[1], prompt);
  assert.deepEqual(args.slice(args.indexOf('--output-format'), args.indexOf('--output-format') + 2), ['--output-format', 'json']);
  const tools = args.indexOf('--allowedTools');
  assert.deepEqual(args.slice(tools + 1, tools + 3), ['Read', 'Bash(git status:*)']);
});

test('headless nao usa dangerously-skip-permissions', () => {
  const args = buildClaudeArgs({ prompt: '/x', allowedTools: ['Read'], model: 'haiku', addDirs: ['/tmp/a'] });
  assert.ok(!args.includes('--dangerously-skip-permissions'));
  assert.ok(!args.includes('--bare'));
  assert.deepEqual(args.slice(args.indexOf('--permission-mode'), args.indexOf('--permission-mode') + 2), ['--permission-mode', 'dontAsk']);
  assert.ok(args.includes('--add-dir'));
  assert.ok(args.includes('haiku'));
});

test('buildClaudeArgs exige lista de ferramentas', () => {
  assert.throws(() => buildClaudeArgs({ prompt: '/x', allowedTools: [] }), /allowedTools/);
});

test('readAllowedTools le permissions.allow do projeto', () => {
  const root = writeTree(makeTempDir(), { '.claude/settings.json': { permissions: { allow: ['Read', 'Edit'] } } });
  assert.deepEqual(readAllowedTools(root), ['Read', 'Edit']);
  assert.throws(() => readAllowedTools(makeTempDir()), /settings\.json/);
});

test('invokeClaude devolve custo, turnos e negacoes', async () => {
  const log = join(makeTempDir(), 'calls.jsonl');
  const result = await invokeClaude({
    bin: FAKE, cwd: makeTempDir(), prompt: '/spec-implement c', allowedTools: ['Read'],
    env: { FAKE_CLAUDE_LOG: log, FAKE_CLAUDE_COST: '0.25' },
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.cost_usd, 0.25);
  assert.equal(result.num_turns, 2);
  assert.deepEqual(result.permission_denials, []);
  const call = JSON.parse(readFileSync(log, 'utf8').trim());
  assert.equal(call.args[1], '/spec-implement c');
});

test('invokeClaude marca erro do agente e saida invalida', async () => {
  const error = await invokeClaude({ bin: FAKE, cwd: makeTempDir(), prompt: '/x', allowedTools: ['Read'], env: { FAKE_CLAUDE_MODE: 'error' } });
  assert.equal(error.status, 'error');
  const garbage = await invokeClaude({ bin: FAKE, cwd: makeTempDir(), prompt: '/x', allowedTools: ['Read'], env: { FAKE_CLAUDE_MODE: 'garbage' } });
  assert.equal(garbage.status, 'error');
  assert.match(garbage.reason, /JSON/);
});

test('invocacao excede tempo limite', async () => {
  const started = Date.now();
  const result = await invokeClaude({
    bin: FAKE, cwd: makeTempDir(), prompt: '/x', allowedTools: ['Read'],
    timeoutMs: 300, killGraceMs: 100, env: { FAKE_CLAUDE_MODE: 'sleep' },
  });
  assert.equal(result.status, 'timeout');
  assert.equal(result.reason, 'timeout');
  assert.ok(Date.now() - started < 5000);
});

test('invokeClaude registra falha de spawn sem derrubar o runner', async () => {
  const result = await invokeClaude({ bin: ['/nao/existe/claude'], cwd: makeTempDir(), prompt: '/x', allowedTools: ['Read'] });
  assert.equal(result.status, 'error');
  assert.match(result.reason, /spawn/);
  assert.equal(result.cost_usd, null);
});
