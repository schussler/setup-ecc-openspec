import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recordBaseline, scoreImplementation } from '../../gates/implement-gate.mjs';
import { REPO_ROOT, makeTempDir, writeTree } from '../helpers.mjs';

const PASSING = "import { test } from 'node:test';\ntest('ok', () => {});\n";
const FAILING = "import { test } from 'node:test';\nimport assert from 'node:assert';\ntest('quebra', () => assert.equal(1, 2));\n";
const SKIPPING = "import { test } from 'node:test';\ntest('ok', () => {});\ntest('pula', { skip: true }, () => {});\n";
const NOVO = "import { test } from 'node:test';\ntest('novo caso', () => {});\n";

function project({ lint = 'true', typecheck = 'true', test: suite = 'node --test', testFile = 'node --test {file}', files = {}, runState } = {}) {
  const checks = { test: suite, lint, typecheck };
  if (testFile) checks.test_file = testFile;
  const trees = { 'template.json': { checks }, ...files };
  if (runState) trees['.harness-local/c/run-state.json'] = runState;
  const root = writeTree(makeTempDir(), trees);
  mkdirSync(join(root, 'openspec/changes/c'), { recursive: true });
  return root;
}

const gatesFile = (root) => JSON.parse(readFileSync(join(root, 'openspec/changes/c/gates.json'), 'utf8'));

function runCli(root, args) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, [join(REPO_ROOT, 'scripts/gates/implement-gate.mjs'), ...args, '--root', root], { encoding: 'utf8', env });
  return { code: child.status, stdout: child.stdout, stderr: child.stderr };
}

test('[SG-001] aprova com casos antigos em 100% sem exigir caso novo', async () => {
  const root = project({ files: { 'test/antigo.test.mjs': PASSING } });
  await recordBaseline({ root, change: 'c', legacyWrite: true });
  const result = await scoreImplementation({ root, change: 'c', legacyWrite: true });
  assert.equal(result.gate, 'implement');
  assert.equal(result.passed, true);
  assert.equal(result.evidence.old_pct, 100);
  assert.equal(result.evidence.lint_errors, 0);
  assert.equal(result.evidence.type_errors, 0);
  assert.equal(result.evidence.new_pct, null, 'new_pct sem caso novo fica nulo, nunca vira 100');
  assert.equal(result.verdict, 'pass');
});

test('[SG-002] caso antigo falhando reprova e old_pct fica abaixo de 100', async () => {
  const root = project({ files: { 'test/antigo.test.mjs': FAILING, 'test/outro.test.mjs': PASSING } });
  await recordBaseline({ root, change: 'c', legacyWrite: true });
  const result = await scoreImplementation({ root, change: 'c', legacyWrite: true });
  assert.equal(result.passed, false);
  assert.equal(result.evidence.old_pct, 50);
});

test('[SG-003] erro de lint reprova com lint_errors maior que zero', async () => {
  const root = project({ lint: 'echo "error: x"; exit 1', files: { 'test/a.test.mjs': PASSING } });
  await recordBaseline({ root, change: 'c', legacyWrite: true });
  const result = await scoreImplementation({ root, change: 'c', legacyWrite: true });
  assert.equal(result.passed, false);
  assert.ok(result.evidence.lint_errors > 0);
});

test('[SG-004] caso criado depois do baseline conta em new_pct e nao em old_pct', async () => {
  const root = project({ files: { 'test/antigo.test.mjs': PASSING } });
  await recordBaseline({ root, change: 'c', legacyWrite: true });
  writeTree(root, { 'test/novo.test.mjs': NOVO });
  const result = await scoreImplementation({ root, change: 'c', legacyWrite: true });
  assert.equal(result.passed, true);
  assert.equal(result.evidence.old_pct, 100);
  assert.equal(result.evidence.new_pct, 100);
  assert.deepEqual(result.cases.filter((c) => c.group === 'new').map((c) => c.id), ['test/novo.test.mjs > novo caso']);
});

test('[SG-004] mesmo nome de caso em arquivo novo conta como caso novo', async () => {
  const root = project({ files: { 'test/antigo.test.mjs': PASSING } });
  await recordBaseline({ root, change: 'c', legacyWrite: true });
  writeTree(root, { 'test/novo.test.mjs': PASSING });
  const result = await scoreImplementation({ root, change: 'c', legacyWrite: true });
  assert.equal(result.evidence.new_pct, 100);
  assert.deepEqual(result.cases.filter((c) => c.group === 'new').map((c) => c.id), ['test/novo.test.mjs > ok']);
});

test('[SG-005] saida nao zero reprova com contagem favoravel no gate por arquivo', async () => {
  const testFile = 'echo "# pass 3"; echo "# fail 0"; exit 1 # {file}';
  const root = project({ testFile, files: { 'test/antigo.test.mjs': PASSING } });
  await recordBaseline({ root, change: 'c', legacyWrite: true });
  const result = await scoreImplementation({ root, change: 'c', legacyWrite: true });
  assert.notEqual(result.verdict, 'pass', 'contagem favoravel nao pode aprovar');
  assert.equal(result.passed, false);
});

test('[SG-005] saida nao zero reprova com contagem favoravel na suite inteira', async () => {
  const root = project({
    testFile: null,
    test: 'echo "# pass 3"; echo "# fail 0"; exit 1',
    files: { 'test/antigo.test.mjs': PASSING },
  });
  await recordBaseline({ root, change: 'c', legacyWrite: true });
  const result = await scoreImplementation({ root, change: 'c', legacyWrite: true });
  assert.notEqual(result.verdict, 'pass', 'contagem favoravel nao pode aprovar');
  assert.equal(result.passed, false);
});

test('[SG-006] caso antigo ignorado (skip) nao aprova o gate', async () => {
  const root = project({ files: { 'test/antigo.test.mjs': SKIPPING } });
  await recordBaseline({ root, change: 'c', legacyWrite: true });
  const result = await scoreImplementation({ root, change: 'c', legacyWrite: true });
  assert.notEqual(result.verdict, 'pass', 'caso skip nao pode aprovar');
  assert.equal(result.passed, false);
  assert.equal(result.cases.find((c) => c.id === 'test/antigo.test.mjs > pula').status, 'skip');
});

test('[SG-002] caso do baseline ausente na suite reprova como missing', async () => {
  const root = project({ files: { 'test/antigo.test.mjs': PASSING } });
  await recordBaseline({ root, change: 'c', legacyWrite: true });
  writeTree(root, { 'test/antigo.test.mjs': "import { test } from 'node:test';\ntest('outro nome', () => {});\n" });
  const result = await scoreImplementation({ root, change: 'c', legacyWrite: true });
  assert.equal(result.passed, false);
  assert.equal(result.cases.find((c) => c.id === 'test/antigo.test.mjs > ok').status, 'missing');
});

test('[SG-019] baseline antigo sem case_ids continua aceito', async () => {
  const root = project({ files: { 'test/antigo.test.mjs': PASSING } });
  writeTree(root, {
    'openspec/changes/c/gates.json': { implement: { baseline: { test_files: ['test/antigo.test.mjs'] }, attempts: [], history: [] } },
  });
  const result = await scoreImplementation({ root, change: 'c' });
  assert.equal(result.passed, true);
  assert.equal(result.verdict, 'pass');
});

test('[SG-013] resultado declara paid falso e cost_source nulo para gate local', async () => {
  const root = project({ files: { 'test/antigo.test.mjs': PASSING } });
  await recordBaseline({ root, change: 'c', legacyWrite: true });
  const result = await scoreImplementation({ root, change: 'c', legacyWrite: true });
  assert.equal(result.paid, false);
  assert.equal(result.cost_source, null);
});

test('[SG-014] afirmacao do agente na nota nao substitui a execucao do comando', async () => {
  const root = project({ files: { 'test/antigo.test.mjs': FAILING } });
  await recordBaseline({ root, change: 'c', legacyWrite: true });
  const result = await scoreImplementation({ root, change: 'c', note: 'todos os testes passam', legacyWrite: true });
  assert.equal(result.passed, false);
});

test('[AC-003] baseline guarda os IDs dos casos e nao so os arquivos', async () => {
  const root = project({ files: { 'test/antigo.test.mjs': PASSING } });
  const baseline = await recordBaseline({ root, change: 'c' });
  assert.deepEqual(baseline.case_ids, ['test/antigo.test.mjs > ok']);
  assert.deepEqual(baseline.test_files, ['test/antigo.test.mjs']);
});

test('[SG-008] CLI sem --legacy-write imprime e nao grava gates.json', async () => {
  const root = project({ files: { 'test/antigo.test.mjs': PASSING } });
  await recordBaseline({ root, change: 'c', legacyWrite: true });
  const before = readFileSync(join(root, 'openspec/changes/c/gates.json'), 'utf8');
  const child = runCli(root, ['score', '--change', 'c']);
  assert.equal(child.code, 0, child.stderr);
  const printed = JSON.parse(child.stdout);
  assert.equal(printed.written, false);
  assert.equal(readFileSync(join(root, 'openspec/changes/c/gates.json'), 'utf8'), before);
});

test('[SG-019] CLI com --legacy-write grava em execucao legacy', async () => {
  const root = project({ files: { 'test/antigo.test.mjs': PASSING } });
  await recordBaseline({ root, change: 'c', legacyWrite: true });
  const child = runCli(root, ['score', '--change', 'c', '--legacy-write']);
  assert.equal(child.code, 0, child.stderr);
  assert.equal(gatesFile(root).implement.attempts.length, 1);
});

test('[SG-019] --legacy-write recusado quando run-state indica modo runner', async () => {
  const root = project({ files: { 'test/antigo.test.mjs': PASSING }, runState: { mode: 'runner' } });
  const baseline = await recordBaseline({ root, change: 'c' });
  writeTree(root, { 'openspec/changes/c/gates.json': { implement: { baseline, attempts: [], history: [] } } });
  const before = readFileSync(join(root, 'openspec/changes/c/gates.json'), 'utf8');
  const child = runCli(root, ['score', '--change', 'c', '--legacy-write']);
  assert.equal(child.code, 3);
  assert.equal(readFileSync(join(root, 'openspec/changes/c/gates.json'), 'utf8'), before);
});
