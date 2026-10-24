import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { checkScope } from '../../gates/scope-check.mjs';
import { makeTempDir, writeTree } from '../helpers.mjs';

test('[SG-016] arquivo operacional excluido por policy.json nao aparece em out_of_scope', () => {
  const root = writeTree(makeTempDir(), {
    'src/a.js': '1',
    '.claude/harness/policy.json': { excluded_paths: ['run-state*', '.harness-local/'] },
  });
  const git = (...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: root, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  const base = git('rev-parse', 'HEAD').trim();
  writeTree(root, { '.harness-local/c/run-state.json': '{}', 'run-state.json': '{}', 'fora.txt': '' });
  const result = checkScope({ root, base, scoped: ['src/'] });
  assert.deepEqual(result.out_of_scope, ['fora.txt']);
});
