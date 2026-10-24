// Reaceitação após revisão de cenário: adequação, suficiência e reexecução (A.4, D29, EV-014, AC-019, AC-020).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  caseEntry, caseIdOf, humanRecord, purposeRecord, scenario, setAuthorizations, setSpec,
  setupRepo, tapOf, validate, writeManifest, writeTree,
} from './a-support.mjs';

const FILE = 'tests/reaceitacao.test.mjs';
const NAME = '[AC-040] comportamento';
const BODY_ONE = `test('${NAME}', () => {});\n`;
const BODY_TWO = `test('${NAME}', () => { /* novo corpo */ });\n`;
const PASS = tapOf([`ok 1 - ${NAME}`]);
const REVISION_ONE = humanRecord('rev-040', 'revision', { scenario: 'AC-040', revision: 2 });
const ADEQUACY = (cases) => purposeRecord('adq-040', 'test_adequacy', { scenario: 'AC-040', revision: 2, cases });
const SUFFICIENCY = (cases) => purposeRecord('suf-040', 'sufficiency', { scenario: 'AC-040', revision: 2, cases });

// Primeira aprovação com a revisão 1 do cenário e o caso já registrado no manifesto.
async function approvedRevisionOne(body) {
  const root = setupRepo({ scenarios: [scenario('AC-040')], tap: PASS, files: { [FILE]: body } });
  writeManifest(root, [caseEntry(root, { file: FILE, name: NAME, scenarios: ['AC-040'] })]);
  const first = await validate(root);
  assert.equal(first.approved, true, JSON.stringify(first.failures));
  return root;
}

test('[EV-014] revisão 2 com corpo de teste alterado não volta sem a adequação registrada, mesmo com manifesto atualizado e suíte verde', async () => {
  const root = await approvedRevisionOne(BODY_ONE);
  setSpec(root, [scenario('AC-040', { revision: 2, approval: 'auth:rev-040' })]);
  setAuthorizations(root, [REVISION_ONE]);
  writeTree(root, { [FILE]: BODY_TWO });
  writeManifest(root, [caseEntry(root, { file: FILE, name: NAME, scenarios: ['AC-040'], revision: 2 })]);

  const pending = await validate(root);
  assert.equal(pending.approved, false);
  assert.ok(pending.failures.some((failure) => failure.id === 'AC-040' && failure.code === 'adequacy_missing'), JSON.stringify(pending.failures));

  setAuthorizations(root, [REVISION_ONE, ADEQUACY([caseIdOf(FILE, NAME)])]);
  const approved = await validate(root);
  assert.equal(approved.approved, true, JSON.stringify(approved.failures));
});

test('[EV-014] revisão 2 com corpo inalterado exige as três verificações: adequação e suficiência e execução pass', async () => {
  const root = await approvedRevisionOne(BODY_ONE);
  setSpec(root, [scenario('AC-040', { revision: 2, approval: 'auth:rev-040' })]);
  writeManifest(root, [caseEntry(root, { file: FILE, name: NAME, scenarios: ['AC-040'], revision: 2 })]);
  const cases = [caseIdOf(FILE, NAME)];

  setAuthorizations(root, [REVISION_ONE, ADEQUACY(cases)]);
  const onlyTwo = await validate(root);
  assert.equal(onlyTwo.approved, false, 'sem suficiência não volta');
  assert.ok(onlyTwo.failures.some((failure) => failure.code === 'sufficiency_missing'), JSON.stringify(onlyTwo.failures));

  setAuthorizations(root, [REVISION_ONE, ADEQUACY(cases), SUFFICIENCY(cases)]);
  const all = await validate(root);
  assert.equal(all.approved, true, JSON.stringify(all.failures));
});

test('[AC-019] caso registrado em revisão antiga do cenário não conta como evidência', async () => {
  const root = setupRepo({ scenarios: [scenario('AC-040', { revision: 2, approval: 'auth:rev-040' })], tap: PASS, files: { [FILE]: BODY_ONE } });
  setAuthorizations(root, [REVISION_ONE]);
  writeManifest(root, [caseEntry(root, { file: FILE, name: NAME, scenarios: ['AC-040'], revision: 1 })]);
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.ok(result.failures.some((failure) => failure.id === 'AC-040' && failure.code === 'invalid_evidence'), JSON.stringify(result.failures));
});

test('[AC-020] a suficiência pela finalidade (purpose) vale quando o corpo do caso não mudou e a revisão mudou', async () => {
  const root = await approvedRevisionOne(BODY_ONE);
  setSpec(root, [scenario('AC-040', { revision: 2, approval: 'auth:rev-040' })]);
  writeManifest(root, [caseEntry(root, { file: FILE, name: NAME, scenarios: ['AC-040'], revision: 2 })]);
  setAuthorizations(root, [REVISION_ONE, ADEQUACY([caseIdOf(FILE, NAME)]), SUFFICIENCY([caseIdOf(FILE, NAME)])]);
  const result = await validate(root);
  assert.equal(result.approved, true, JSON.stringify(result.failures));
});

test('[EV-014] autorização de suficiência que não cobre o caso não vale', async () => {
  const root = await approvedRevisionOne(BODY_ONE);
  setSpec(root, [scenario('AC-040', { revision: 2, approval: 'auth:rev-040' })]);
  writeManifest(root, [caseEntry(root, { file: FILE, name: NAME, scenarios: ['AC-040'], revision: 2 })]);
  setAuthorizations(root, [REVISION_ONE, ADEQUACY([caseIdOf(FILE, NAME)]), SUFFICIENCY(['outro.test.mjs::[AC-040] outro'])]);
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.ok(result.failures.some((failure) => failure.code === 'sufficiency_missing'), JSON.stringify(result.failures));
});
