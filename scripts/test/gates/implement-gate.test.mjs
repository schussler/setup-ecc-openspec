import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { recordBaseline, scoreImplementation, decideVerdict, MAX_CORRECTIONS } from '../../gates/implement-gate.mjs';
import { makeTempDir, writeTree } from '../helpers.mjs';

const PASSING = "import { test } from 'node:test';\ntest('ok', () => {});\n";
const FAILING = "import { test } from 'node:test';\nimport assert from 'node:assert';\ntest('quebra', () => assert.equal(1, 2));\n";

function project({ lint = 'true', typecheck = 'true', testFile = 'node --test {file}', files = {} } = {}) {
  const checks = { test: 'node --test', lint, typecheck };
  if (testFile) checks.test_file = testFile;
  const root = writeTree(makeTempDir(), { 'template.json': { checks }, ...files });
  mkdirSync(join(root, 'openspec/changes/c'), { recursive: true });
  return root;
}

const gates = (root) => JSON.parse(readFileSync(join(root, 'openspec/changes/c/gates.json'), 'utf8'));

test('gate de implementacao aprova com tres condicoes', async () => {
  const root = project({ files: { 'test/antigo.test.mjs': PASSING } });
  recordBaseline({ root, change: 'c' });
  writeTree(root, { 'test/novo.test.mjs': PASSING });
  const result = await scoreImplementation({ root, change: 'c' });
  assert.equal(result.verdict, 'pass');
  assert.equal(result.old.pct, 100);
  assert.equal(result.new.pct, 100);
  assert.equal(result.lint_errors + result.type_errors, 0);
  assert.equal(gates(root).implement.attempts.length, 1);
});

test('gate de implementacao reprova teste antigo falhando', async () => {
  const root = project({ files: { 'test/antigo.test.mjs': FAILING, 'test/outro.test.mjs': PASSING } });
  recordBaseline({ root, change: 'c' });
  const result = await scoreImplementation({ root, change: 'c' });
  assert.notEqual(result.verdict, 'pass');
  assert.equal(result.old.pct, 50);
});

test('gate de implementacao reprova erro de lint', async () => {
  const root = project({ lint: 'echo "error: x"; exit 1', files: { 'test/a.test.mjs': PASSING } });
  recordBaseline({ root, change: 'c' });
  const result = await scoreImplementation({ root, change: 'c' });
  assert.notEqual(result.verdict, 'pass');
  assert.ok(result.lint_errors > 0);
});

test('testes novos separados dos antigos pelo baseline', async () => {
  const root = project({ files: { 'test/antigo.test.mjs': PASSING } });
  recordBaseline({ root, change: 'c' });
  writeTree(root, { 'test/novo.test.mjs': FAILING });
  const result = await scoreImplementation({ root, change: 'c' });
  assert.deepEqual(result.old.files, ['test/antigo.test.mjs']);
  assert.deepEqual(result.new.files, ['test/novo.test.mjs']);
  assert.equal(result.old.pct, 100);
  assert.equal(result.new.pct, 0);
});

test('teste antigo removido conta como falha', async () => {
  const root = project({ files: { 'test/antigo.test.mjs': PASSING } });
  recordBaseline({ root, change: 'c' });
  rmSync(join(root, 'test/antigo.test.mjs'));
  const result = await scoreImplementation({ root, change: 'c' });
  assert.deepEqual(result.removed_tests, ['test/antigo.test.mjs']);
  assert.notEqual(result.verdict, 'pass');
});

test('sem test_file roda a suite inteira e nao separa', async () => {
  const root = project({ testFile: null, files: { 'test/a.test.mjs': PASSING } });
  recordBaseline({ root, change: 'c' });
  const result = await scoreImplementation({ root, change: 'c' });
  assert.equal(result.split, false);
  assert.equal(result.verdict, 'pass');
});

test('score sem baseline falha com mensagem', async () => {
  const root = project();
  await assert.rejects(scoreImplementation({ root, change: 'c' }), /baseline/);
});

test('ciclo para apos tres correcoes', () => {
  const previous = Array.from({ length: MAX_CORRECTIONS }, (_, i) => ({ failures: 10 - i }));
  assert.equal(MAX_CORRECTIONS, 3);
  assert.equal(decideVerdict({ passed: false, failures: 1 }, previous), 'stop');
  assert.equal(decideVerdict({ passed: false, failures: 1 }, previous.slice(0, 2)), 'retry');
});

test('ciclo para sem melhora entre tentativas', () => {
  assert.equal(decideVerdict({ passed: false, failures: 4 }, [{ failures: 4 }]), 'stop');
  assert.equal(decideVerdict({ passed: false, failures: 5 }, [{ failures: 4 }]), 'stop');
  assert.equal(decideVerdict({ passed: false, failures: 3 }, [{ failures: 4 }]), 'retry');
  assert.equal(decideVerdict({ passed: true, failures: 0 }, [{ failures: 4 }]), 'pass');
});

test('baseline novo reinicia as tentativas', async () => {
  const root = project({ files: { 'test/a.test.mjs': PASSING } });
  recordBaseline({ root, change: 'c' });
  await scoreImplementation({ root, change: 'c' });
  recordBaseline({ root, change: 'c' });
  assert.equal(gates(root).implement.attempts.length, 0);
});

test('baseline novo preserva as sessoes anteriores no historico', async () => {
  const root = project({ files: { 'test/a.test.mjs': PASSING } });
  recordBaseline({ root, change: 'c' });
  await scoreImplementation({ root, change: 'c' });
  recordBaseline({ root, change: 'c' });
  const { history } = gates(root).implement;
  assert.equal(history.length, 1);
  assert.equal(history[0].attempts.length, 1);
  assert.equal(history[0].attempts[0].verdict, 'pass');
});
