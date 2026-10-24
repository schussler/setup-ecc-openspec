// Caminho de --claude-bin: executável com espaço no caminho chega inteiro, sem shell (cli-run binOf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { binOf } from '../../harness/cli-run.mjs';
import { ConfigError } from '../../harness/policy.mjs';

function folderWithSpace() {
  const dir = join(mkdtempSync(join(tmpdir(), 'bin-argv-')), 'pasta com espaço');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'claude sim.mjs');
  writeFileSync(file, '');
  return file;
}

test('executável existente com espaço no caminho vira um único elemento', () => {
  const exe = folderWithSpace();
  assert.deepEqual(binOf({ 'claude-bin': exe }), [exe]);
});

test('array JSON preserva argumentos com espaço', () => {
  const argv = ['node', '/x y/fake claude.mjs', '--flag valor'];
  assert.deepEqual(binOf({ 'claude-bin': JSON.stringify(argv) }), argv);
});

test('array JSON inválido é recusado antes de qualquer execução', () => {
  assert.throws(() => binOf({ 'claude-bin': '[não é json' }), ConfigError);
  assert.throws(() => binOf({ 'claude-bin': '["node", 3]' }), ConfigError);
});

test('comando separado por espaços continua valendo para o simulador', () => {
  assert.deepEqual(binOf({ 'claude-bin': 'node sim.mjs' }), ['node', 'sim.mjs']);
});

test('sem --claude-bin usa o comando padrão', () => {
  assert.deepEqual(binOf({}), ['claude']);
});
