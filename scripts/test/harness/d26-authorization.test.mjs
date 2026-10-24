// Autorizações de revisão (D32, RC-047 a RC-050): aprovação de contrato pelo hash e pela versão,
// adequação de testes sem execução, exceção só com chave prevista na política e identificação de
// projeto e change. Os módulos são importados como namespace para que cada teste falhe pelo
// comportamento, e não pela ausência de uma exportação.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as authorize from '../../harness/authorize.mjs';
import { checkContract } from '../../harness/contract.mjs';
import { ConfigError, loadPolicy } from '../../harness/policy.mjs';
import { CHANGE, PROJECT_ID, REPO_ROOT, makeRepo } from './fixture.mjs';
import { writeTree } from '../helpers.mjs';
import {
  EMPTY_TAP, caseEntry, caseIdOf, purposeRecord, scenario, setAuthorizations, setupRepo, tapOf, validate, writeManifest,
} from './a-support.mjs';

const NOW = new Date('2026-10-23T12:00:00.000Z');
const DIR_REL = `openspec/changes/${CHANGE}`;
const PROPOSAL_APPROVED = '# Proposta\n\n- **Estado do contrato:** aprovado\n';
const DESIGN_A = '# Design\n\nDecisão A.\n';
const DESIGN_B = '# Design\n\nDecisão B.\n';
const APPROVAL_INPUT = { kind: 'revision', purpose: 'contract_approval', scope: { contract_approval: true }, reason: 'aprovação do contrato', approver: 'mantenedor' };

// Repositório com contrato aprovado (proposal, design e um spec). Devolve raiz e diretório da change.
function contractRepo() {
  const root = makeRepo();
  writeTree(root, {
    [`${DIR_REL}/proposal.md`]: PROPOSAL_APPROVED,
    [`${DIR_REL}/design.md`]: DESIGN_A,
    [`${DIR_REL}/specs/harness-x/spec.md`]: '## ADDED Requirements\n\n### Requirement: X\n\nTexto.\n',
  });
  return { root, dir: join(root, DIR_REL) };
}

// Grava authorizations.json no formato canônico (lista JSON, 2 espaços), como authorize.mjs.
const writeAuthorizations = (dir, records) => writeFileSync(join(dir, 'authorizations.json'), `${JSON.stringify(records, null, 2)}\n`);
const approvalErrors = (dir) => checkContract(dir).filter((error) => error.code === 'HI-015');
const identityErrors = (dir) => checkContract(dir).filter((error) => error.code === 'HI-016');

test('[RC-047] aprovação de contrato vale enquanto o hash e a versão são os atuais', () => {
  const { root, dir } = contractRepo();
  const first = authorize.buildRecord(root, CHANGE, APPROVAL_INPUT, [], { now: NOW, author: 'mantenedor' });
  writeAuthorizations(dir, [first]);
  assert.deepEqual(approvalErrors(dir), []);

  writeFileSync(join(dir, 'design.md'), DESIGN_B);
  const stale = approvalErrors(dir);
  assert.equal(stale.length, 1, JSON.stringify(stale));
  assert.match(stale[0].message, /hash/);
});

test('[RC-047] aprovação anterior com o mesmo hash não vale quando a versão mais nova tem outro hash', () => {
  const { root, dir } = contractRepo();
  const first = authorize.buildRecord(root, CHANGE, APPROVAL_INPUT, [], { now: NOW, author: 'mantenedor' });
  writeFileSync(join(dir, 'design.md'), DESIGN_B);
  const second = authorize.buildRecord(root, CHANGE, APPROVAL_INPUT, [first], { now: NOW, author: 'mantenedor' });
  assert.equal(second.contract_version, 2);
  writeFileSync(join(dir, 'design.md'), DESIGN_A);
  writeAuthorizations(dir, [first, second]);
  const errors = approvalErrors(dir);
  assert.equal(errors.length, 1, JSON.stringify(errors));
  assert.match(errors[0].message, /versão/);
});

test('[RC-047] aprovação registra hash e versão do contrato e sobe a versão a cada aprovação', () => {
  const { root, dir } = contractRepo();
  const first = authorize.buildRecord(root, CHANGE, APPROVAL_INPUT, [], { now: NOW, author: 'mantenedor' });
  assert.equal(first.contract_version, 1);
  assert.match(first.contract_hash, /^[0-9a-f]{64}$/);
  assert.equal(first.contract_hash, authorize.calculateContractHash(dir));
  const second = authorize.buildRecord(root, CHANGE, APPROVAL_INPUT, [first], { now: NOW, author: 'mantenedor' });
  assert.equal(second.contract_version, 2);
});

test('[RC-047] o hash muda quando qualquer spec, proposta ou design muda', () => {
  const { dir } = contractRepo();
  const before = authorize.calculateContractHash(dir);
  writeFileSync(join(dir, 'specs', 'harness-x', 'spec.md'), '## ADDED Requirements\n\nOutro texto.\n');
  assert.notEqual(authorize.calculateContractHash(dir), before);
});

test('[RC-048] adequação de testes sem execução válida no estado atual não aprova o cenário', async () => {
  const FILE = 'tests/adequacao.test.mjs';
  const NAME = '[AC-041] comportamento';
  const root = setupRepo({
    scenarios: [scenario('AC-041')],
    tap: EMPTY_TAP,
    authorizations: [purposeRecord('adq-041', 'test_adequacy', { scenario: 'AC-041', revision: 1, cases: [caseIdOf(FILE, NAME)] })],
  });
  writeTree(root, { [FILE]: `test('${NAME}', () => {});\n` });
  writeManifest(root, [caseEntry(root, { file: FILE, name: NAME, scenarios: ['AC-041'] })]);
  const result = await validate(root);
  assert.equal(result.approved, false, JSON.stringify(result.failures));
});

test('[RC-049] exceção sem chave prevista em allowed_exceptions é recusada ao registrar', () => {
  const root = makeRepo();
  const input = { kind: 'revision', purpose: 'exception', scope: { scenario: 'AC-021' }, reason: 'motivo', approver: 'mantenedor' };
  assert.throws(() => authorize.buildRecord(root, CHANGE, input, [], { now: NOW, author: 'mantenedor' }), ConfigError);
  assert.throws(
    () => authorize.buildRecord(root, CHANGE, { ...input, policyKey: 'chave-inexistente' }, [], { now: NOW, author: 'mantenedor' }),
    /allowed_exceptions/,
  );
});

test('[RC-049] policy.json declara allowed_exceptions como lista e nenhuma exceção é prevista hoje', () => {
  const policy = loadPolicy(REPO_ROOT);
  assert.deepEqual(policy.allowed_exceptions, []);
});

test('[RC-049] exceção gravada à mão sem chave prevista não dispensa o cenário obrigatório', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-021', { notApplicable: true, trigger: 'quando houver formato tap', approval: 'auth:exc-021' })],
    tap: tapOf(['ok 1 - [AC-011] outro']),
  });
  setAuthorizations(root, [purposeRecord('exc-021', 'exception', { scenario: 'AC-021' })]);
  const result = await validate(root);
  assert.equal(result.approved, false, JSON.stringify(result.failures));
});

test('[RC-050] registro de autorização sem project_id é recusado e não aprova o contrato', () => {
  const { root, dir } = contractRepo();
  const record = authorize.buildRecord(root, CHANGE, APPROVAL_INPUT, [], { now: NOW, author: 'mantenedor' });
  const { project_id: _omitted, ...withoutProject } = record;
  writeAuthorizations(dir, [withoutProject]);
  const errors = identityErrors(dir);
  assert.ok(errors.length >= 1, 'registro sem project_id deveria ser recusado');
  assert.match(errors[0].message, /project_id/);
});

test('[RC-050] registro com change divergente do diretório é recusado', () => {
  const { root, dir } = contractRepo();
  const record = authorize.buildRecord(root, CHANGE, APPROVAL_INPUT, [], { now: NOW, author: 'mantenedor' });
  writeAuthorizations(dir, [{ ...record, scope: { ...record.scope, change: 'outra-change' } }]);
  const errors = identityErrors(dir);
  assert.ok(errors.length >= 1, 'change divergente deveria ser recusado');
  assert.match(errors[0].message, /change/);
});

test('[RC-050] registro com project_id de outro projeto é recusado', () => {
  const { root, dir } = contractRepo();
  const record = authorize.buildRecord(root, CHANGE, APPROVAL_INPUT, [], { now: NOW, author: 'mantenedor' });
  writeAuthorizations(dir, [{ ...record, project_id: '7d1e4c2b-0a9f-4b3e-8c6d-5e4f3a2b1c0d' }]);
  assert.ok(identityErrors(dir).length >= 1);
});

test('[RC-050] registro novo com change diferente da change gravada é recusado ao construir', () => {
  const { root } = contractRepo();
  const input = { ...APPROVAL_INPUT, scope: { contract_approval: true, change: 'outra-change' } };
  assert.throws(() => authorize.buildRecord(root, CHANGE, input, [], { now: NOW, author: 'mantenedor' }), /change/);
  assert.equal(authorize.buildRecord(root, CHANGE, APPROVAL_INPUT, [], { now: NOW, author: 'mantenedor' }).project_id, PROJECT_ID);
});
