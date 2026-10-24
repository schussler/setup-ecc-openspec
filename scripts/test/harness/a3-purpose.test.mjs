// Propósitos das autorizações de revisão (A.3, item E, D29, D30): lista fechada e escopo obrigatório.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecord } from '../../harness/authorize.mjs';
import { writeTree } from '../helpers.mjs';
import {
  CHANGE, allowExceptions, caseEntry, caseIdOf, exceptionRecord, humanRecord, purposeRecord, scenario, setAuthorizations, setSpec, setupRepo,
  tapOf, validate, writeManifest,
} from './a-support.mjs';
import { makeRepo } from './fixture.mjs';

const NOW = new Date('2026-10-23T12:00:00.000Z');
const build = (root, input, records = []) => buildRecord(root, CHANGE, { reason: 'motivo', approver: 'mantenedor', ...input }, records, { now: NOW, author: 'mantenedor' });

test('[EV-008] purpose fora da lista fechada é recusado ao registrar a autorização', () => {
  const root = makeRepo();
  assert.throws(() => build(root, { kind: 'revision', purpose: 'livre', scope: { scenario: 'AC-011', revision: 2 } }), /purpose/);
});

test('[EV-008] autorização revision sem purpose é recusada', () => {
  const root = makeRepo();
  assert.throws(() => build(root, { kind: 'revision', scope: { scenario: 'AC-011', revision: 2 } }), /purpose obrigatório/);
});

test('[EV-008] scenario_change exige cenário e revisão no escopo', () => {
  const root = makeRepo();
  assert.throws(() => build(root, { kind: 'revision', purpose: 'scenario_change', scope: {} }), /cenário/);
  const record = build(root, { kind: 'revision', purpose: 'scenario_change', scope: { scenario: 'AC-011', revision: 2 } });
  assert.equal(record.purpose, 'scenario_change');
  assert.equal(record.scope.scenario, 'AC-011');
  assert.equal(record.scope.revision, 2);
});

test('[EV-014] test_adequacy e sufficiency exigem a lista de casos no escopo', () => {
  const root = makeRepo();
  for (const purpose of ['test_adequacy', 'sufficiency']) {
    assert.throws(() => build(root, { kind: 'revision', purpose, scope: { scenario: 'AC-011', revision: 2 } }), /cases/, purpose);
  }
  const record = build(root, { kind: 'revision', purpose: 'test_adequacy', scope: { scenario: 'AC-011', revision: 2, cases: ['a.test.mjs::[AC-011] x'] } });
  assert.deepEqual(record.scope.cases, ['a.test.mjs::[AC-011] x']);
});

test('[EV-008] contract_approval exige scope.contract_approval verdadeiro e não aceita cenário no escopo', () => {
  const root = makeRepo();
  writeTree(root, {
    [`openspec/changes/${CHANGE}/proposal.md`]: '# Proposta\n',
    [`openspec/changes/${CHANGE}/design.md`]: '# Design\n',
    [`openspec/changes/${CHANGE}/specs/x/spec.md`]: '# Spec\n',
  });
  assert.throws(() => build(root, { kind: 'revision', purpose: 'contract_approval', scope: {} }), /contract_approval/);
  assert.throws(() => build(root, { kind: 'revision', purpose: 'contract_approval', scope: { contract_approval: true, scenario: 'AC-011' } }), /contract_approval/);
  const record = build(root, { kind: 'revision', purpose: 'contract_approval', scope: { contract_approval: true } });
  assert.equal(record.scope.contract_approval, true);
  assert.match(record.contract_hash, /^[0-9a-f]{64}$/);
  assert.equal(record.contract_version, 1);
});

test('[EV-008] purpose só existe em autorização revision', () => {
  const root = makeRepo();
  assert.throws(() => build(root, { kind: 'round', purpose: 'scenario_change', scope: { scenario: 'AC-011', revision: 2 } }), /purpose/);
});

test('[EV-014] autorização sufficiency não serve como adequação dos testes', async () => {
  const FILE = 'tests/finalidade.test.mjs';
  const NAME = '[AC-040] comportamento';
  const cases = [caseIdOf(FILE, NAME)];
  const root = setupRepo({ scenarios: [scenario('AC-040')], tap: tapOf([`ok 1 - ${NAME}`]), files: { [FILE]: `test('${NAME}', () => {});\n` } });
  writeManifest(root, [caseEntry(root, { file: FILE, name: NAME, scenarios: ['AC-040'] })]);
  assert.equal((await validate(root)).approved, true);

  setSpec(root, [scenario('AC-040', { revision: 2, approval: 'auth:rev-040' })]);
  writeManifest(root, [caseEntry(root, { file: FILE, name: NAME, scenarios: ['AC-040'], revision: 2 })]);
  setAuthorizations(root, [
    humanRecord('rev-040', 'revision', { scenario: 'AC-040', revision: 2 }, { purpose: 'scenario_change' }),
    purposeRecord('suf-040', 'sufficiency', { scenario: 'AC-040', revision: 2, cases }),
  ]);
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.ok(result.failures.some((failure) => failure.id === 'AC-040' && failure.code === 'adequacy_missing'), JSON.stringify(result.failures));
});

test('[AC-021] exceção (purpose exception) dispensa cenário cuja condição é verdadeira, com motivo e escopo do cenário', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-021', { notApplicable: true, trigger: 'quando houver formato tap', approval: 'auth:exc-021' })],
    tap: tapOf(['ok 1 - [AC-011] outro']),
  });
  allowExceptions(root, ['excecao-teste']);
  setAuthorizations(root, [exceptionRecord('exc-021', { scenario: 'AC-021' }, 'excecao-teste')]);
  const result = await validate(root);
  assert.equal(result.approved, true, JSON.stringify(result.failures));
});

test('[AC-021] autorização scenario_change não dispensa cenário obrigatório', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-021', { notApplicable: true, trigger: 'quando houver formato tap', approval: 'auth:exc-021' })],
    tap: tapOf(['ok 1 - [AC-011] outro']),
  });
  setAuthorizations(root, [purposeRecord('exc-021', 'scenario_change', { scenario: 'AC-021', revision: 1 })]);
  const result = await validate(root);
  assert.equal(result.approved, false, JSON.stringify(result));
});
