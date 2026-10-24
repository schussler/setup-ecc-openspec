// Gate de implementação com checks.test_report declarado: os casos vêm só do comando estruturado
// (TAP) do projeto, por arquivo com file_command ou pela suíte com command. checks.test_file, de
// saída legível, não é usado nesse modo. Regressão da rodada 1 do experimento add-kebab-case-helper:
// nome de caso com "# SKIP" literal era lido como diretiva na saída spec e reprovava o gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildBaseline, evaluateImplementation } from '../../gates/implement-gate.mjs';
import { makeTempDir, writeTree } from '../helpers.mjs';

const TAP_FILE = 'node --test --test-reporter=tap {file}';
const TAP_SUITE = 'node --test --test-reporter=tap "test/**/*.test.mjs"';
const LITERAL_DIRECTIVE = "import { test } from 'node:test';\ntest('nome com # SKIP e # TODO literais', () => {});\n";
const REAL_SKIP = "import { test } from 'node:test';\ntest('ignorado de verdade', { skip: 'motivo' }, () => {});\n";
const PASSING = "import { test } from 'node:test';\ntest('ok', () => {});\n";

function project(report, { testFile = 'node --test {file}', files = {} } = {}) {
  const checks = {
    test: { command: 'node --test "test/**/*.test.mjs"', suite: 's' },
    test_report: { command: TAP_SUITE, suite: 's', format: 'tap', ...report },
    lint: 'true',
    typecheck: 'true',
  };
  if (testFile) checks.test_file = testFile;
  const root = writeTree(makeTempDir(), { 'template.json': { checks }, ...files });
  mkdirSync(join(root, 'openspec/changes/c'), { recursive: true });
  return root;
}

async function evaluate(root) {
  return evaluateImplementation({ root, baseline: await buildBaseline({ root }) });
}

test('[SG-001] com file_command declarado, nome com # SKIP literal passa pela leitura TAP por arquivo', async () => {
  const root = project({ file_command: TAP_FILE, files: 'test/**/*.test.mjs' }, { files: { 'test/literal.test.mjs': LITERAL_DIRECTIVE } });

  const result = await evaluate(root);

  assert.equal(result.passed, true, JSON.stringify(result.cases));
  assert.deepEqual(result.cases.map((item) => [item.status, item.source]), [['pass', 'tap']]);
  assert.match(result.cases[0].id, /^test\/literal\.test\.mjs > nome com/);
});

test('[SG-001] com test_report, checks.test_file de saída legível não é executado', async () => {
  // test_file falharia (código 1) se fosse usado.
  const root = project({ file_command: TAP_FILE, files: 'test/**/*.test.mjs' }, {
    testFile: 'node -e "process.exit(1)" {file}', files: { 'test/ok.test.mjs': PASSING },
  });

  const result = await evaluate(root);

  assert.equal(result.passed, true);
  assert.equal(result.evidence.exit_failures, 0);
});

test('[SG-006] skip real na TAP por arquivo continua skip e não aprova', async () => {
  const root = project({ file_command: TAP_FILE, files: 'test/**/*.test.mjs' }, { files: { 'test/skip.test.mjs': REAL_SKIP } });

  const result = await evaluate(root);

  assert.equal(result.passed, false);
  assert.deepEqual(result.cases.map((item) => item.status), ['skip']);
});

test('[SG-001] sem file_command, os casos vêm da suíte TAP de checks.test_report.command', async () => {
  const root = project({}, { files: { 'test/literal.test.mjs': LITERAL_DIRECTIVE } });

  const result = await evaluate(root);

  assert.equal(result.passed, true, JSON.stringify(result.cases));
  // A TAP escapa "#" no nome como "\#"; a identidade segue a do leitor TAP da validação final.
  assert.deepEqual(result.cases.map((item) => [item.id, item.status, item.source]), [['nome com \\# SKIP e \\# TODO literais', 'pass', 'tap']]);
});

test('[AC-016] test_report com formato incompatível é erro de configuração antes de executar a suíte', async () => {
  const root = project({ format: 'junit' }, { files: { 'test/ok.test.mjs': PASSING } });

  await assert.rejects(() => buildBaseline({ root }), /checks\.test_report\.format "junit" não é suportado/);
});
