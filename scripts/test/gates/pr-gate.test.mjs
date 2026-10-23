import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { checkPr } from '../../gates/pr-gate.mjs';
import { makeTempDir, writeTree } from '../helpers.mjs';

function repo(files = {}) {
  const root = writeTree(makeTempDir(), {
    'template.json': { checks: { test: 'true', lint: 'true', typecheck: 'true' } },
    'openspec/changes/archive/2026-01-01-velha/proposal.md': 'x',
    ...files,
  });
  const git = (...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: root });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return root;
}

test('gate de pr aprova arvore limpa sem change ativa', async () => {
  const result = await checkPr({ root: repo() });
  assert.equal(result.verdict, 'pass');
});

test('gate de pr bloqueia change ativa', async () => {
  const result = await checkPr({ root: repo({ 'openspec/changes/nova/proposal.md': 'x' }) });
  assert.equal(result.verdict, 'fail');
  assert.deepEqual(result.active_changes, ['nova']);
});

test('gate de pr bloqueia arvore suja', async () => {
  const root = repo();
  writeTree(root, { 'solto.txt': 'x' });
  const result = await checkPr({ root });
  assert.equal(result.verdict, 'fail');
  assert.deepEqual(result.dirty_files, ['solto.txt']);
});

test('gate de pr bloqueia suite falhando', async () => {
  const root = repo({ 'template.json': { checks: { test: 'exit 1', lint: 'true', typecheck: 'true' } } });
  const result = await checkPr({ root });
  assert.equal(result.verdict, 'fail');
  assert.equal(result.tests_passed, false);
});
