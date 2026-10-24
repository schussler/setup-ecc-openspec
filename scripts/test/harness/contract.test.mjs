// Testes do validador de contrato (scripts/harness/contract.mjs, F4, D21b).
// O nome de cada teste começa com o ID do cenário em openspec/changes/add-spec-harness/specs/*.
// Fixtures temporárias: change com specs, proposal/design e authorizations.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeTempDir, writeTree } from '../helpers.mjs';
import { checkContract, checkScenarios } from '../../harness/contract.mjs';

// Identificação do projeto e da change (D32, RC-050): todo registro de authorizations.json precisa delas.
const PROJECT_ID = 'ae7fabc2-4918-45fa-aefa-3c9519aba014';
const CHANGE = 'contrato-teste';
const REVISION_AUTH = {
  id: 'R-1', kind: 'revision', purpose: 'scenario_change', project_id: PROJECT_ID, scope: { change: CHANGE, scenario: 'HI-900', revision: 1 },
  reason: 'exceção aprovada', approver: 'mantenedor', source: 'cli', date: '2026-10-23',
};
const BUDGET_AUTH = { ...REVISION_AUTH, id: 'B-1', kind: 'budget' };
const REVOKE_OF_R1 = { ...REVISION_AUTH, id: 'R-2', kind: 'revision', revokes: 'R-1' };
const VALID = { ID: 'HI-900', 'Revisão': '1' };
const AUTH_REF = 'auth:R-1';

function scenario(name, fields) {
  const lines = [`#### Scenario: ${name}`];
  for (const [key, value] of Object.entries(fields)) lines.push(`- **${key}:** ${value}`);
  lines.push('- **WHEN** a condição ocorre', '- **THEN** o comportamento acontece', '');
  return lines.join('\n');
}

// Monta a change em <repo>/openspec/changes/<change>, com .harness-project.json no repositório:
// specs/exemplo/spec.md com os cenários, mais os arquivos extras dados. authorizations === undefined
// não cria o arquivo. Devolve o diretório da change.
function makeChange(scenarioBlocks, { authorizations, proposal, design } = {}) {
  const repo = makeTempDir('contract-');
  const root = join(repo, 'openspec', 'changes', CHANGE);
  writeTree(repo, { '.harness-project.json': { project_id: PROJECT_ID } });
  const body = ['## ADDED Requirements', '', '### Requirement: Exemplo', '', 'O sistema SHALL existir.', '', ...scenarioBlocks].join('\n');
  const files = { 'specs/exemplo/spec.md': body };
  if (authorizations !== undefined) files['authorizations.json'] = authorizations.map((r) => JSON.stringify(r)).join('\n');
  if (proposal !== undefined) files['proposal.md'] = proposal;
  if (design !== undefined) files['design.md'] = design;
  writeTree(root, files);
  return root;
}

const ONE = (name, fields, auth = [REVISION_AUTH]) => makeChange([scenario(name, fields)], { authorizations: auth });
const codes = (errors) => errors.map((e) => e.code);

// ---------------------------------------------------------------------------
// Positivos
// ---------------------------------------------------------------------------

test('[HI-008] check com justificativa e auth:<id> válido é aceito', () => {
  const root = ONE('documento', {
    ...VALID,
    'Verificação': 'check:lint',
    'Justificativa': 'mudança documental sem comportamento executável',
    'Aprovação': AUTH_REF,
  });
  assert.deepEqual(checkScenarios(root), []);
});

test('[HI-010] não aplicável com condição de disparo e auth:<id> válido é aceito', () => {
  const root = ONE('formato junit', {
    ...VALID,
    'Não aplicável': 'sim',
    'Condição de disparo': 'quando houver formato JUnit',
    'Aprovação': AUTH_REF,
  });
  assert.deepEqual(checkScenarios(root), []);
});

test('[HI-007] revisão 2 com auth:<id> do tipo revision válido é aceita', () => {
  const root = ONE('revisado', { ID: 'HI-900', 'Revisão': '2', 'Aprovação': AUTH_REF });
  assert.deepEqual(checkScenarios(root), []);
});

test('[HI-010] comportamento novo: não com auth:<id> válido é aceito na change', () => {
  const root = makeChange([scenario('completo', VALID)], {
    authorizations: [REVISION_AUTH],
    proposal: '## Contrato\n\n- **Comportamento novo:** não\n- **Aprovação:** auth:R-1\n',
  });
  assert.deepEqual(checkContract(root), []);
});

test('[HI-010] comportamento novo: sim dispensa aprovação na change', () => {
  const root = makeChange([scenario('completo', VALID)], {
    proposal: '## Contrato\n\n- **Comportamento novo:** sim\n',
  });
  assert.deepEqual(checkContract(root), []);
});

test('[HI-007] authorizations.json em formato de array é lido', () => {
  const root = makeChange([scenario('documento', { ...VALID, 'Verificação': 'check:lint', 'Justificativa': 'doc', 'Aprovação': AUTH_REF })]);
  writeTree(root, { 'authorizations.json': JSON.stringify([REVISION_AUTH], null, 2) });
  assert.deepEqual(checkScenarios(root), []);
});

// ---------------------------------------------------------------------------
// Negativos: Aprovação
// ---------------------------------------------------------------------------

test('[HI-009] aprovação em texto livre é recusada', () => {
  const root = ONE('texto livre', { ...VALID, 'Verificação': 'check:lint', 'Justificativa': 'doc', 'Aprovação': 'mantenedor, 2026-10-23' });
  const errors = checkScenarios(root);
  assert.deepEqual(codes(errors), ['HI-009']);
  assert.equal(errors[0].scenario, 'texto livre');
});

test('[HI-009] aprovação "sim" é recusada', () => {
  const root = ONE('sim', { ...VALID, 'Verificação': 'check:lint', 'Justificativa': 'doc', 'Aprovação': 'sim' });
  assert.deepEqual(codes(checkScenarios(root)), ['HI-009']);
});

test('[HI-009] aprovação "true" é recusada', () => {
  const root = ONE('true', { ...VALID, 'Verificação': 'check:lint', 'Justificativa': 'doc', 'Aprovação': 'true' });
  assert.deepEqual(codes(checkScenarios(root)), ['HI-009']);
});

test('[HI-009] auth:<id> inexistente em authorizations.json é recusado', () => {
  const root = ONE('inexistente', { ...VALID, 'Verificação': 'check:lint', 'Justificativa': 'doc', 'Aprovação': 'auth:R-999' });
  assert.deepEqual(codes(checkScenarios(root)), ['HI-009']);
});

test('[HI-009] auth:<id> sem arquivo authorizations.json é recusado', () => {
  const root = makeChange([scenario('sem arquivo', { ...VALID, 'Verificação': 'check:lint', 'Justificativa': 'doc', 'Aprovação': AUTH_REF })]);
  assert.deepEqual(codes(checkScenarios(root)), ['HI-009']);
});

test('[HI-009] auth:<id> de tipo diferente de revision é recusado', () => {
  const root = ONE('tipo errado', { ...VALID, 'Verificação': 'check:lint', 'Justificativa': 'doc', 'Aprovação': 'auth:B-1' }, [BUDGET_AUTH]);
  assert.deepEqual(codes(checkScenarios(root)), ['HI-009']);
});

test('[HI-009] auth:<id> revogado por registro com revokes é recusado', () => {
  const root = ONE('revogado', { ...VALID, 'Verificação': 'check:lint', 'Justificativa': 'doc', 'Aprovação': AUTH_REF }, [REVISION_AUTH, REVOKE_OF_R1]);
  assert.deepEqual(codes(checkScenarios(root)), ['HI-009']);
});

test('[HI-009] revisão alterada sem Aprovação é recusada', () => {
  const root = ONE('revisado sem aprovacao', { ID: 'HI-900', 'Revisão': '2' });
  const errors = checkScenarios(root);
  assert.deepEqual(codes(errors), ['HI-009']);
  assert.equal(errors[0].scenario, 'revisado sem aprovacao');
});

test('[HI-010] comportamento novo: não sem auth:<id> é recusado na change', () => {
  const root = makeChange([scenario('completo', VALID)], {
    authorizations: [REVISION_AUTH],
    proposal: '## Contrato\n\n- **Comportamento novo:** não\n- **Aprovação:** mantenedor\n',
  });
  assert.deepEqual(codes(checkContract(root)), ['HI-009']);
});

test('[HI-010] change sem declaração de comportamento novo é recusada', () => {
  const root = makeChange([scenario('completo', VALID)], { proposal: '## Contrato\n' });
  assert.deepEqual(codes(checkContract(root)), ['HI-010']);
});

// ---------------------------------------------------------------------------
// Negativos: verificação, justificativa, cenário
// ---------------------------------------------------------------------------

test('[HI-009] check sem justificativa é recusado mesmo com auth:<id> válido', () => {
  const root = ONE('sem justificativa', { ...VALID, 'Verificação': 'check:lint', 'Aprovação': AUTH_REF });
  const errors = checkScenarios(root);
  assert.deepEqual(codes(errors), ['HI-009']);
  assert.equal(errors[0].scenario, 'sem justificativa');
});

test('[HI-008] check com nome inexistente em checks é recusado', () => {
  const root = ONE('check inexistente', { ...VALID, 'Verificação': 'check:nao-existe', 'Justificativa': 'doc', 'Aprovação': AUTH_REF });
  assert.deepEqual(codes(checkScenarios(root)), ['HI-008']);
});

test('[HI-003] cenário sem ID é recusado', () => {
  const root = ONE('sem id', { 'Revisão': '1' });
  assert.deepEqual(codes(checkScenarios(root)), ['HI-003']);
});
