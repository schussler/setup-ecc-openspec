import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadChecks, parseTestCounts, countErrors, isTestFile, listTestFiles, runCommand, walkFiles } from '../../gates/checks.mjs';
import { join } from 'node:path';
import { makeTempDir, writeTree } from '../helpers.mjs';

test('checks sem comando falha com mensagem clara', () => {
  const root = writeTree(makeTempDir(), {
    'template.json': { checks: { test: 'node --test', typecheck: 'true' } },
  });
  assert.throws(() => loadChecks(root), (err) => {
    assert.match(err.message, /checks\.lint/);
    assert.match(err.message, /template\.json/);
    return true;
  });
});

test('loadChecks rejeita comando vazio', () => {
  const root = writeTree(makeTempDir(), {
    'template.json': { checks: { test: '', lint: 'true', typecheck: 'true' } },
  });
  assert.throws(() => loadChecks(root), /checks\.test/);
});

test('loadChecks falha quando template.json nao existe', () => {
  assert.throws(() => loadChecks(makeTempDir()), /template\.json/);
});

test('loadChecks devolve os comandos exigidos e os opcionais', () => {
  const root = writeTree(makeTempDir(), {
    'template.json': { checks: { test: 'a', lint: 'b', typecheck: 'c', test_file: 'd {file}' } },
  });
  assert.deepEqual(loadChecks(root), { test: 'a', lint: 'b', typecheck: 'c', test_file: 'd {file}' });
});

test('parseTestCounts le o resumo do node --test (spec e tap)', () => {
  assert.deepEqual(parseTestCounts('ℹ tests 4\nℹ pass 3\nℹ fail 1\n'), { pass: 3, fail: 1 });
  assert.deepEqual(parseTestCounts('# tests 2\n# pass 2\n# fail 0\n'), { pass: 2, fail: 0 });
});

test('parseTestCounts le jest, vitest e pytest', () => {
  assert.deepEqual(parseTestCounts('Tests:       1 failed, 4 passed, 5 total'), { pass: 4, fail: 1 });
  assert.deepEqual(parseTestCounts(' Tests  4 passed | 1 failed (5)'), { pass: 4, fail: 1 });
  assert.deepEqual(parseTestCounts('===== 4 passed, 1 failed in 0.12s ====='), { pass: 4, fail: 1 });
  assert.deepEqual(parseTestCounts('===== 3 passed in 0.12s ====='), { pass: 3, fail: 0 });
});

test('parseTestCounts devolve null para formato desconhecido', () => {
  assert.equal(parseTestCounts('ok'), null);
});

test('countErrors e zero com saida limpa e pelo menos um com falha', () => {
  assert.equal(countErrors({ code: 0, output: 'error: nada' }), 0);
  assert.equal(countErrors({ code: 1, output: '' }), 1);
  assert.equal(countErrors({ code: 1, output: 'error: a\nerror: b\nok' }), 2);
});

test('isTestFile reconhece as convencoes suportadas', () => {
  for (const f of ['a.test.mjs', 'src/b.spec.ts', 'tests/test_x.py', 'x_test.go', 'pkg/y_test.py']) {
    assert.equal(isTestFile(f), true, f);
  }
  for (const f of ['src/test.mjs', 'testing.md', 'src/latest.js']) {
    assert.equal(isTestFile(f), false, f);
  }
});

test('listTestFiles ignora node_modules e .git', () => {
  const root = writeTree(makeTempDir(), {
    'test/a.test.mjs': '',
    'node_modules/x/b.test.mjs': '',
    '.git/c.test.mjs': '',
    'src/d.mjs': '',
  });
  assert.deepEqual(listTestFiles(root), ['test/a.test.mjs']);
});

test('listTestFiles ignora o toolset em .claude e openspec', () => {
  const root = writeTree(makeTempDir(), {
    'test/a.test.mjs': '',
    '.claude/skills/x/tests/test_y.py': '',
    'openspec/changes/c/z.test.mjs': '',
  });
  assert.deepEqual(listTestFiles(root), ['test/a.test.mjs']);
});

test('walkFiles aceita caminho de arquivo', () => {
  const root = writeTree(makeTempDir(), { 'a/b.txt': '' });
  assert.deepEqual(walkFiles(root, join(root, 'a/b.txt')), ['a/b.txt']);
});

test('runCommand devolve codigo de saida e saida combinada', async () => {
  const result = await runCommand('echo out; echo err 1>&2; exit 3', { cwd: makeTempDir() });
  assert.equal(result.code, 3);
  assert.match(result.output, /out/);
  assert.match(result.output, /err/);
  assert.equal(typeof result.durationMs, 'number');
});
