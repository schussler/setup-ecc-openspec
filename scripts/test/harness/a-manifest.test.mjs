// Manifesto de aceitação: identidade do caso, hash do corpo com helpers e vínculo por caso (A.2, D28).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHANGE, caseEntry, codes, defaultTemplate, scenario, setupRepo, tapOf, validate, writeManifest, writeTree,
} from './a-support.mjs';

const ACCEPT = 'tests/accept.test.mjs';
const OTHER = 'tests/other.test.mjs';
const HELPER = 'tests/helpers/fixture.mjs';

// Mesmo nome em arquivos diferentes só se distingue com a execução por arquivo (file_command, AC-028);
// sem ela, a colisão reprova com inventory_ambiguous (AC-029).
const PER_FILE_COMMAND = 'cat "per-file/$(basename {file} .test.mjs).tap"';
const fileModeTemplate = () => {
  const template = defaultTemplate();
  return { checks: { ...template.checks, test_report: { ...template.checks.test_report, file_command: PER_FILE_COMMAND, files: 'tests/*.test.mjs' } } };
};

test('[AC-024] casos com o mesmo nome em arquivos diferentes são aceitos, e o nome com espaços extras é normalizado', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-024')],
    tap: tapOf(['ok 1 - [AC-024] nome com espaços', 'ok 2 - [AC-024] nome com espaços']),
    template: fileModeTemplate(),
    files: {
      [ACCEPT]: "test('[AC-024] nome com espaços', () => {});\n", [OTHER]: "test('[AC-024] nome com espaços', () => {});\n",
      'per-file/accept.tap': tapOf(['ok 1 - [AC-024] nome com espaços']),
      'per-file/other.tap': tapOf(['ok 1 - [AC-024] nome com espaços']),
    },
  });
  writeManifest(root, [
    caseEntry(root, { file: ACCEPT, name: '  [AC-024]   nome com espaços ', scenarios: ['AC-024'] }),
    caseEntry(root, { file: OTHER, name: '[AC-024] nome com espaços', scenarios: ['AC-024'] }),
  ]);
  const result = await validate(root);
  assert.equal(result.approved, true, JSON.stringify(result.failures));
});

test('[AC-024] dois casos com o mesmo case_id no manifesto são recusados como configuração', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-024')],
    tap: tapOf(['ok 1 - [AC-024] nome']),
    files: { [ACCEPT]: "test('[AC-024] nome', () => {});\n" },
  });
  const entry = caseEntry(root, { file: ACCEPT, name: '[AC-024] nome', scenarios: ['AC-024'] });
  writeManifest(root, [entry, { ...entry, test_name: '  [AC-024]  nome ' }]);
  const result = await validate(root);
  assert.equal(result.stop_reason, 'config_error');
  assert.match(result.message, /case_id duplicado/);
});

test('[AC-025] helper compartilhado alterado muda o corpo dos casos que o declaram e exige reexecução', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-025')],
    tap: tapOf(['ok 1 - [AC-025] usa helper']),
    files: {
      [ACCEPT]: "import { valor } from './helpers/fixture.mjs';\ntest('[AC-025] usa helper', () => valor);\n",
      [HELPER]: 'export const valor = 1;\n',
    },
  });
  writeManifest(root, [caseEntry(root, { file: ACCEPT, name: '[AC-025] usa helper', scenarios: ['AC-025'], helpers: [HELPER] })]);
  assert.equal((await validate(root)).approved, true, 'com o helper original a aprovação vale');

  writeTree(root, { [HELPER]: 'export const valor = 2;\n' });
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.ok(result.failures.some((failure) => failure.id === 'AC-025' && failure.code === 'invalid_evidence'), JSON.stringify(result.failures));
});

test('[AC-026] cenário com dois casos exige os dois: um ausente da saída deixa o cenário como missing', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-024'), scenario('AC-025')],
    tap: tapOf(['ok 1 - [AC-024] primeiro', 'ok 2 - [AC-024] e [AC-025] terceiro']),
    files: {
      [ACCEPT]: "test('[AC-024] primeiro', () => {});\ntest('[AC-024] segundo', () => {});\n",
      [OTHER]: "test('[AC-024] e [AC-025] terceiro', () => {});\n",
    },
  });
  writeManifest(root, [
    caseEntry(root, { file: ACCEPT, name: '[AC-024] primeiro', scenarios: ['AC-024'] }),
    caseEntry(root, { file: ACCEPT, name: '[AC-024] segundo', scenarios: ['AC-024'] }),
    caseEntry(root, { file: OTHER, name: '[AC-024] e [AC-025] terceiro', scenarios: ['AC-024', 'AC-025'] }),
  ]);
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.ok(codes(result).includes('AC-024:missing'), JSON.stringify(result.failures));
  assert.ok(!codes(result).some((code) => code.startsWith('AC-025:')), 'o terceiro caso conta para AC-025 e passou');
});

test('[AC-026] caso com duas tags conta como evidência para os dois cenários', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-024'), scenario('AC-025')],
    tap: tapOf(['ok 1 - [AC-024] e [AC-025] comum']),
    files: { [OTHER]: "test('[AC-024] e [AC-025] comum', () => {});\n" },
  });
  writeManifest(root, [caseEntry(root, { file: OTHER, name: '[AC-024] e [AC-025] comum', scenarios: ['AC-024', 'AC-025'] })]);
  const result = await validate(root);
  assert.equal(result.approved, true, JSON.stringify(result.failures));
  assert.equal(result.cases.find((item) => item.id === 'AC-025').status, 'pass');
});

test('[AC-026] o caso do manifesto precisa de uma tag para cada cenário que ele declara', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-024')],
    tap: tapOf(['ok 1 - [AC-024] sem tag do segundo']),
    files: { [OTHER]: "test('[AC-024] sem tag do segundo', () => {});\n" },
  });
  writeManifest(root, [caseEntry(root, { file: OTHER, name: '[AC-024] sem tag do segundo', scenarios: ['AC-024', 'AC-025'] })]);
  const result = await validate(root);
  assert.equal(result.stop_reason, 'config_error');
  assert.match(result.message, /AC-025/);
});

test('[AC-024] o manifesto com schema_version diferente de 1 é recusado como configuração', async () => {
  const root = setupRepo({ tap: tapOf(['ok 1 - [AC-011] caso']) });
  writeManifest(root, []);
  writeTree(root, { [`openspec/changes/${CHANGE}/acceptance-manifest.json`]: { schema_version: 2, entries: [] } });
  const result = await validate(root);
  assert.equal(result.stop_reason, 'config_error');
});
