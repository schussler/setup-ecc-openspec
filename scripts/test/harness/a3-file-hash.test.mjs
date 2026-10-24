// Hash no nível de arquivo (A.3, item C, AC-025): o campo do manifesto e do resumo é file_hash.
// case_body_hash fica só como alias de leitura no manifesto (documentado em acceptance.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseEntry, readSummary, scenario, setupRepo, tapOf, validate, writeManifest } from './a-support.mjs';

const FILE = 'tests/hash.test.mjs';
const NAME = '[AC-025] usa o arquivo inteiro';

// Manifesto no formato antigo: o mesmo hash gravado com o nome case_body_hash (alias de leitura).
function legacyNamed(entry) {
  const { file_hash: hash, ...rest } = entry;
  return { ...rest, case_body_hash: hash };
}

test('[AC-025] o manifesto com file_hash é aceito e a validação aprova', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-025')],
    tap: tapOf([`ok 1 - ${NAME}`]),
    files: { [FILE]: `test('${NAME}', () => {});\n` },
  });
  writeManifest(root, [caseEntry(root, { file: FILE, name: NAME, scenarios: ['AC-025'] })]);
  const result = await validate(root);
  assert.equal(result.approved, true, JSON.stringify(result.failures));
});

test('[AC-025] case_body_hash no manifesto é lido como alias e o resumo grava file_hash, não o nome antigo', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-025')],
    tap: tapOf([`ok 1 - ${NAME}`]),
    files: { [FILE]: `test('${NAME}', () => {});\n` },
  });
  writeManifest(root, [legacyNamed(caseEntry(root, { file: FILE, name: NAME, scenarios: ['AC-025'] }))]);
  assert.equal((await validate(root)).approved, true);
  const entry = readSummary(root).scenarios['AC-025'];
  assert.ok(typeof entry.file_hash === 'string' && entry.file_hash.length === 64, JSON.stringify(entry));
  assert.equal(entry.case_body_hash, undefined);
});
