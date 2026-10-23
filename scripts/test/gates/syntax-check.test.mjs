import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { makeTempDir, writeTree, REPO_ROOT } from '../helpers.mjs';

const CHECK = join(REPO_ROOT, 'scripts/gates/syntax-check.mjs');

function check(cwd, dirs) {
  return spawnSync(process.execPath, [CHECK, ...dirs], { cwd, encoding: 'utf8' });
}

test('checagem de sintaxe acusa script invalido', () => {
  const root = writeTree(makeTempDir(), {
    'src/ok.mjs': 'export const a = 1;\n',
    'src/quebrado.mjs': 'export const = ;\n',
    'node_modules/x/ruim.js': 'const = ;',
  });
  const result = check(root, ['src', 'node_modules']);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /quebrado\.mjs/);
  assert.doesNotMatch(result.stdout, /ok\.mjs/);
  assert.doesNotMatch(result.stdout, /ruim\.js/);
});

test('checagem de sintaxe ignora diretorio inexistente', () => {
  const root = writeTree(makeTempDir(), { 'src/ok.mjs': 'export {};\n' });
  assert.equal(check(root, ['src', 'nao-existe']).status, 0);
});
