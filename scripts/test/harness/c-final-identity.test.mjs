// Identidade dos casos por arquivo (C.2, D27, D28): checks.test_report.file_command, com o marcador
// {file}, dá a identidade "<arquivo>::<nome completo>". A suíte (command) segue como autoridade do código
// de saída e das contagens; a soma por arquivo precisa bater com ela. Sem file_command, nome repetido
// reprova com inventory_ambiguous. Nenhuma colisão é silenciosa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateChecksSchema } from '../../gates/checks.mjs';
import { REPO_ROOT } from './fixture.mjs';
import {
  caseEntry, codes, defaultTemplate, readSummary, scenario, setupRepo, tapOf, validate, writeManifest, writeTree,
} from './a-support.mjs';

const NAME = '[AC-011] caso repetido';
const FILE_A = 't/a.test.mjs';
const FILE_B = 't/b.test.mjs';
// Saída por arquivo vem de per-file/<base>.tap; o runner só substitui {file} pelo caminho entre aspas.
const FILE_COMMAND = 'cat "per-file/$(basename {file} .test.mjs).tap"';

// files (D27): glob declarado pelo projeto com os arquivos que file_command executa, os mesmos da suíte.
const SUITE_FILES = 't/*.test.mjs';

function fileModeTemplate(files = SUITE_FILES) {
  const template = defaultTemplate();
  const report = { ...template.checks.test_report, file_command: FILE_COMMAND, ...(files === undefined ? {} : { files }) };
  return { checks: { ...template.checks, test_report: report } };
}

const withoutFiles = () => {
  const template = fileModeTemplate();
  const { files: _files, ...report } = template.checks.test_report;
  return { checks: { ...template.checks, test_report: report } };
};

function repo({ suiteLines, perFile, template }) {
  return setupRepo({
    scenarios: [scenario('AC-011')],
    tap: tapOf(suiteLines),
    template,
    files: {
      [FILE_A]: "test('caso repetido', () => {});\n",
      [FILE_B]: "test('caso repetido', () => {});\n",
      'per-file/a.tap': tapOf(perFile.a),
      'per-file/b.tap': tapOf(perFile.b),
    },
  });
}

test('[AC-028] colisão de mesmo nome em dois arquivos é resolvida com file_command', async () => {
  const root = repo({
    suiteLines: [`ok 1 - ${NAME}`, `ok 2 - ${NAME}`],
    perFile: { a: [`ok 1 - ${NAME}`], b: [`ok 1 - ${NAME}`] },
    template: fileModeTemplate(),
  });
  writeManifest(root, [caseEntry(root, { file: FILE_B, name: NAME, scenarios: ['AC-011'] })]);

  const result = await validate(root);

  assert.equal(result.approved, true, JSON.stringify(result.failures));
  const ids = readSummary(root).cases.map((item) => item.case_id).sort();
  assert.deepEqual(ids, [`${FILE_A}::${NAME}`, `${FILE_B}::${NAME}`]);
  assert.equal(readSummary(root).case_counts.total, 2);
  assert.equal(readSummary(root).case_counts.tap_total, 2);
});

test('[AC-028] cenário do manifesto usa o caso do próprio arquivo, não o homônimo de outro arquivo', async () => {
  const root = repo({
    suiteLines: [`ok 1 - ${NAME}`, `ok 2 - ${NAME} # SKIP pulado`],
    perFile: { a: [`ok 1 - ${NAME}`], b: [`ok 1 - ${NAME} # SKIP pulado`] },
    template: fileModeTemplate(),
  });
  // O manifesto vincula o caso de a.test.mjs; o homônimo pulado em b.test.mjs não decide o cenário.
  writeManifest(root, [caseEntry(root, { file: FILE_A, name: NAME, scenarios: ['AC-011'] })]);

  const result = await validate(root);

  const scenarioCase = result.cases.find((item) => item.id === 'AC-011');
  assert.equal(scenarioCase.status, 'pass', JSON.stringify(result.cases));
  const inventory = readSummary(root).cases;
  assert.equal(inventory.find((item) => item.case_id === `${FILE_B}::${NAME}`).status, 'skip');
});

test('[AC-028] soma por arquivo diferente do total da suíte reprova com inventory_mismatch', async () => {
  const root = repo({
    suiteLines: [`ok 1 - ${NAME}`, `ok 2 - ${NAME}`, 'ok 3 - outro caso'],
    perFile: { a: [`ok 1 - ${NAME}`], b: [`ok 1 - ${NAME}`] },
    template: fileModeTemplate(),
  });

  const result = await validate(root);

  assert.equal(result.approved, false);
  assert.ok(codes(result).includes('<suite>:inventory_mismatch'), codes(result).join(', '));
});

test('[AC-028] resultado por arquivo diferente do da suíte reprova com inventory_mismatch', async () => {
  const root = repo({
    suiteLines: [`ok 1 - ${NAME}`, `ok 2 - ${NAME}`],
    perFile: { a: [`ok 1 - ${NAME}`], b: [`not ok 1 - ${NAME}`] },
    template: fileModeTemplate(),
  });

  const result = await validate(root);

  assert.equal(result.approved, false);
  assert.ok(codes(result).includes('<suite>:inventory_mismatch'), codes(result).join(', '));
});

test('[AC-029] sem file_command, nome repetido entre casos reprova com inventory_ambiguous e lista o nome', async () => {
  const root = repo({
    suiteLines: [`ok 1 - ${NAME}`, `ok 2 - ${NAME}`],
    perFile: { a: [], b: [] },
    template: defaultTemplate(),
  });

  const result = await validate(root);

  assert.equal(result.approved, false);
  const ambiguous = result.failures.filter((failure) => failure.code === 'inventory_ambiguous');
  assert.equal(ambiguous.length, 1, codes(result).join(', '));
  assert.match(ambiguous[0].message, /caso repetido/);
});

test('[AC-028] file_command sem o marcador {file} é config_error', () => {
  const template = fileModeTemplate();
  assert.throws(() => validateChecksSchema({ ...template.checks, test_report: { ...template.checks.test_report, file_command: 'node --test' } }), /\{file\}/);
});

test('[AC-028] file_command sem checks.test_report.files é config_error que nomeia o campo', async () => {
  assert.throws(() => validateChecksSchema(withoutFiles().checks), /checks\.test_report\.files/);
  const root = repo({
    suiteLines: [`ok 1 - ${NAME}`, `ok 2 - ${NAME}`],
    perFile: { a: [`ok 1 - ${NAME}`], b: [`ok 1 - ${NAME}`] },
    template: withoutFiles(),
  });

  const result = await validate(root);

  assert.equal(result.approved, false);
  assert.equal(result.stop_reason, 'config_error', JSON.stringify(result));
  assert.match(result.message, /checks\.test_report\.files/);
});

test('[AC-028] files com arquivo fora da suíte reprova com inventory_mismatch', async () => {
  const root = repo({
    suiteLines: [`ok 1 - ${NAME}`, `ok 2 - ${NAME}`],
    perFile: { a: [`ok 1 - ${NAME}`], b: [`ok 1 - ${NAME}`] },
    template: fileModeTemplate(['t/*.test.mjs', 't/*.mjs']),
  });
  // t/helper.mjs não é da suíte, mas o glob de files o inclui: a execução por arquivo traz um caso a mais.
  writeTree(root, { 't/helper.mjs': '// apoio\n', 'per-file/helper.mjs.tap': tapOf(['ok 1 - caso de apoio']) });

  const result = await validate(root);

  assert.equal(result.approved, false);
  assert.ok(codes(result).includes('<suite>:inventory_mismatch'), codes(result).join(', '));
});

test('[AC-028] files igual à suíte ignora arquivos de teste fora do glob e o inventário bate', async () => {
  const root = repo({
    suiteLines: [`ok 1 - ${NAME}`, `ok 2 - ${NAME}`],
    perFile: { a: [`ok 1 - ${NAME}`], b: [`ok 1 - ${NAME}`] },
    template: fileModeTemplate(),
  });
  // Fixture com nome de teste fora do glob da suíte: listTestFiles a encontraria, files não.
  writeTree(root, { 'fixtures/x.test.mjs': "test('fixture', () => {});\n", 'per-file/x.tap': tapOf(['ok 1 - caso da fixture']) });
  writeManifest(root, [caseEntry(root, { file: FILE_A, name: NAME, scenarios: ['AC-011'] })]);

  const result = await validate(root);

  assert.equal(result.approved, true, JSON.stringify(result.failures));
  assert.equal(readSummary(root).case_counts.total, 2);
  assert.equal(readSummary(root).case_counts.tap_total, 2);
});

test('[AC-028] template.json declara file_command por arquivo e mantém command, suite e format', () => {
  const report = JSON.parse(readFileSync(join(REPO_ROOT, 'template.json'), 'utf8')).checks.test_report;
  assert.equal(report.file_command, 'node --test --test-reporter=tap {file}');
  assert.equal(report.files, 'scripts/test/**/*.test.mjs');
  assert.equal(report.command, 'node --test --test-reporter=tap "scripts/test/**/*.test.mjs"');
  assert.equal(report.suite, 'template');
  assert.equal(report.format, 'tap');
});
