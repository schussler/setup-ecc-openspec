// Checks declarados, revisão de cenário, suficiência e não aplicabilidade (F7, AC-018 a AC-021).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateApplicability } from '../../harness/validate.mjs';
import {
  CHANGE_DIR, EMPTY_TAP, codes, defaultTemplate, humanRecord, readSummary, scenario, setAuthorizations, setSpec,
  setTap, setupRepo, validate,
} from './f7-support.mjs';
import { CHANGE } from './fixture.mjs';
import { writeTree } from '../helpers.mjs';
import { caseEntry, caseIdOf, purposeRecord } from './a-support.mjs';

const ACCEPT_FILE = 'tests/accept.test.mjs';
const MANIFEST = `${CHANGE_DIR}/acceptance-manifest.json`;
const BODY = "test('[AC-019] comportamento', () => {\n  assert.equal(1, 1);\n});\n";

// Manifesto de aceitação (D28): revisão em que o caso foi gerado e hash do corpo calculado no disco.
function manifest(root, id, revision, file = ACCEPT_FILE) {
  return { schema_version: 1, entries: [caseEntry(root, { file, name: `[${id}] comportamento`, scenarios: [id], revision })] };
}

test('[AC-018] cenário verificado por check:lint passa quando o lint sai com código zero', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-018', {
      verification: 'check:lint', justification: 'a regra é de estilo, sem comportamento funcional',
      approval: 'auth:chk-018',
    })],
    tap: EMPTY_TAP,
    authorizations: [humanRecord('chk-018', 'revision', { scenario: 'AC-018', revision: 1 })],
  });
  const result = await validate(root);
  assert.equal(result.approved, true, JSON.stringify(result.failures));
  assert.deepEqual(result.cases.find((item) => item.id === 'AC-018'), {
    id: 'AC-018', status: 'pass', source: 'check:lint', group: 'scenario',
  });
});

test('[AC-018] o mesmo cenário reprova quando o check declarado sai com código diferente de zero', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-018', {
      verification: 'check:lint', justification: 'a regra é de estilo', approval: 'auth:chk-018',
    })],
    tap: EMPTY_TAP,
    template: defaultTemplate({ lint: 'exit 1' }),
    authorizations: [humanRecord('chk-018', 'revision', { scenario: 'AC-018', revision: 1 })],
  });
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.ok(codes(result).includes('AC-018:check_failed'), JSON.stringify(result.failures));
});

test('[AC-019] caso gerado em revisão antiga do cenário faz o cenário ficar invalid_evidence', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-019', { revision: 2, approval: 'auth:rev-019' })],
    tap: 'TAP version 13\nok 1 - [AC-019] comportamento\n1..1\n# pass 1\n# fail 0\n',
    authorizations: [humanRecord('rev-019', 'revision', { scenario: 'AC-019', revision: 2 })],
    files: { [ACCEPT_FILE]: BODY },
  });
  writeFileSync(join(root, MANIFEST), `${JSON.stringify(manifest(root, 'AC-019', 1), null, 2)}\n`);
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.equal(result.verdict, 'stop');
  assert.equal(result.stop_reason, 'invalid_evidence');
  assert.ok(codes(result).includes('AC-019:invalid_evidence'), JSON.stringify(result.failures));
});

test('[AC-020] revisão nova com corpo de teste inalterado não aprova sem justificativa de suficiência', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-020')],
    tap: 'TAP version 13\nok 1 - [AC-020] comportamento\n1..1\n# pass 1\n# fail 0\n',
    files: { [ACCEPT_FILE]: BODY.replace('AC-019', 'AC-020') },
  });
  writeTree(root, { [MANIFEST]: manifest(root, 'AC-020', 1) });
  assert.equal((await validate(root)).approved, true, 'revisão 1 aprovada');

  setSpec(root, [scenario('AC-020', { revision: 2, approval: 'auth:rev-020' })]);
  setAuthorizations(root, [humanRecord('rev-020', 'revision', { scenario: 'AC-020', revision: 2 })]);
  writeTree(root, { [MANIFEST]: manifest(root, 'AC-020', 2) });
  const cases = [caseIdOf(ACCEPT_FILE, '[AC-020] comportamento')];
  const pending = await validate(root);
  assert.equal(pending.approved, false);
  assert.equal(pending.stop_reason, 'human_decision_needed');
  assert.ok(codes(pending).includes('AC-020:sufficiency_missing'), JSON.stringify(pending.failures));

  setAuthorizations(root, [
    humanRecord('rev-020', 'revision', { scenario: 'AC-020', revision: 2 }),
    purposeRecord('adq-020', 'test_adequacy', { scenario: 'AC-020', revision: 2, cases }),
    purposeRecord('suf-020', 'sufficiency', { scenario: 'AC-020', revision: 2, cases }),
  ]);
  const approved = await validate(root);
  assert.equal(approved.approved, true, JSON.stringify(approved.failures));
  assert.equal(readSummary(root).scenarios['AC-020'].revision, 2);
});

test('[AC-021] condição de disparo verdadeira torna o cenário obrigatório e a ausência reprova', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-021', {
      notApplicable: true, trigger: 'quando houver formato tap', approval: 'auth:na-021',
    })],
    tap: EMPTY_TAP,
    authorizations: [humanRecord('na-021', 'revision', { scenario: 'AC-021', revision: 1 })],
  });
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.ok(codes(result).includes('AC-021:missing'), JSON.stringify(result.failures));
});

test('[AC-021] condição de disparo falsa torna o cenário não aplicável nesta execução', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-021', {
      notApplicable: true, trigger: 'quando houver formato junit', approval: 'auth:na-021',
    })],
    tap: EMPTY_TAP,
    authorizations: [humanRecord('na-021', 'revision', { scenario: 'AC-021', revision: 1 })],
  });
  const result = await validate(root);
  assert.equal(result.approved, true, JSON.stringify(result.failures));
});

test('[AC-021] avaliação de não aplicabilidade: formato declarado decide a condição', () => {
  const junit = { fields: { 'Não aplicável': 'sim', 'Condição de disparo': 'quando houver formato JUnit' } };
  assert.equal(evaluateApplicability(junit, { format: 'junit' }).required, true);
  assert.equal(evaluateApplicability(junit, { format: 'tap' }).required, false);
  const paid = { fields: { 'Não aplicável': 'sim', 'Condição de disparo': 'quando houver chamada paga' } };
  assert.equal(evaluateApplicability(paid, { format: 'tap', paid_calls: null }).required, true, 'condição não avaliável é obrigatória');
  const plain = { fields: { ID: 'AC-021' } };
  assert.equal(evaluateApplicability(plain, { format: 'tap' }).required, true, 'cenário sem condição nunca é não aplicável');
});
