import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { checkScope, outOfScope } from '../../gates/scope-check.mjs';
import { makeTempDir, writeTree } from '../helpers.mjs';

test('outOfScope aceita prefixo de diretorio e arquivo exato', () => {
  assert.deepEqual(
    outOfScope(['src/a.js', 'srcx/b.js', 'README.md', 'test/c.test.js', 'template.json'], ['src/', 'test', 'template.json']),
    ['srcx/b.js', 'README.md'],
  );
});

test('[SG-015] arquivos fora de scoped_paths sao listados', () => {
  const root = writeTree(makeTempDir(), { 'src/a.js': '1', 'README.md': 'x' });
  const git = (...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: root, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  const base = git('rev-parse', 'HEAD').trim();
  writeTree(root, { 'src/a.js': '2', 'src/novo.js': '', 'fora.txt': '', 'README.md': 'y' });
  const result = checkScope({ root, base, scoped: ['src/'] });
  assert.deepEqual(result.out_of_scope, ['README.md', 'fora.txt']);
  assert.equal(result.verdict, 'fail');
});
