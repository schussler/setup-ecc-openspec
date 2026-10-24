// Testes da skill spec-create ampliada (F4). O nome de cada teste começa com o
// ID do cenário em openspec/changes/add-spec-harness/specs/*.
//
// Dois tipos de teste neste arquivo:
// - Verificação ESTÁTICA de conteúdo: confere que o texto das instruções contém
//   o que o cenário exige. Não avalia a qualidade da entrevista.
// - Comportamental: fixtures temporárias de specs, checadas por scripts/harness/contract.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, makeTempDir, readRepoFile, writeTree } from '../helpers.mjs';
import { checkScenarios } from '../../harness/contract.mjs';

// Texto da skill e do roteiro embutido, lidos como um só conjunto de instruções.
const skillText = () =>
  readRepoFile('.claude/skills/spec-create/SKILL.md') + '\n' + readRepoFile('.claude/skills/spec-create/interview.md');

// Registro de autorização humana do tipo revision (formato de authorizations.json), identificado (D32, RC-050).
const PROJECT_ID = '3f2c9a1e-6b7d-4e8f-9a0b-1c2d3e4f5a6b';
const CHANGE = 'contrato-teste';
const REVISION_AUTH = {
  id: 'R-1', kind: 'revision', purpose: 'scenario_change', project_id: PROJECT_ID, scope: { change: CHANGE, scenario: 'check' },
  reason: 'exceção aprovada', approver: 'Douglas', source: 'cli', date: '2026-10-23',
};

// Monta uma change temporária com um spec contendo os blocos de cenário dados.
// authorizations: registros gravados em authorizations.json (padrão: nenhum).
function makeChange(scenarioBlocks, authorizations = []) {
  const repo = makeTempDir('contract-');
  const root = join(repo, 'openspec', 'changes', CHANGE);
  writeTree(repo, { '.harness-project.json': { project_id: PROJECT_ID } });
  const body = ['## ADDED Requirements', '', '### Requirement: Exemplo', '', 'O sistema SHALL existir.', '', ...scenarioBlocks].join('\n');
  const files = { 'specs/exemplo/spec.md': body };
  if (authorizations.length > 0) files['authorizations.json'] = authorizations.map((r) => JSON.stringify(r)).join('\n');
  writeTree(root, files);
  return root;
}

// Bloco de cenário com campos em negrito, no formato dos specs da change.
function scenario(name, fields) {
  const lines = [`#### Scenario: ${name}`];
  for (const [key, value] of Object.entries(fields)) lines.push(`- **${key}:** ${value}`);
  lines.push('- **WHEN** a condição ocorre', '- **THEN** o comportamento acontece', '');
  return lines.join('\n');
}

const VALID = { ID: 'HI-900', 'Revisão': '1' };

// ---------------------------------------------------------------------------
// Verificação estática de conteúdo, não avaliação da entrevista.
// ---------------------------------------------------------------------------

test('[HI-001] investigação antes de perguntar: fatos do repositório não são perguntados', () => {
  const text = skillText();
  assert.match(text, /[Ii]nvestigate before asking/);
  assert.match(text, /repository|repo/i);
  assert.match(text, /not available|unavailable/i);
});

test('[HI-002] perguntas em pequenos grupos com recomendação, justificativa e tradeoffs', () => {
  const text = skillText();
  assert.match(text, /small groups/i);
  assert.match(text, /at most four/i);
  assert.match(text, /[Rr]ecommended/);
  assert.match(text, /[Jj]ustification/);
  assert.match(text, /[Tt]radeoffs?/);
});

test('[HI-004] spec-create proíbe gerar código e testes de aceitação e delega ao spec-accept', () => {
  const text = skillText();
  assert.match(text, /[Nn]ever write (implementation )?(code|tests)/);
  assert.match(text, /acceptance tests/);
  assert.match(text, /spec-accept/);
});

test('[SP-002] [HI-005] premissas vão para ## Premissas e não são decisões aprovadas', () => {
  const text = skillText();
  assert.match(text, /## Premissas/);
  assert.match(text, /not (an )?approved decision/i);
});

test('[SP-003] fallback usa o roteiro embutido no diretório da skill', () => {
  const text = skillText();
  assert.match(text, /grill-me/);
  assert.match(text, /interview\.md/);
  assert.ok(existsSync(join(REPO_ROOT, '.claude/skills/spec-create/interview.md')));
  assert.match(readRepoFile('.claude/skills/spec-create/interview.md'), /Fallback/);
});

test('[HI-003] estática: o contrato lista cada campo obrigatório', () => {
  const text = skillText();
  const requiredFields = [
    /[Oo]bjective/,
    /[Ss]cope/,
    /[Nn]on-goals|[Ee]xclusions/,
    /ID/,
    /revision/,
    /[Ii]nvariants/,
    /[Ii]nterfaces/,
    /[Rr]isks/,
    /[Ss]lices/,
    /[Pp]re-existing behavior/,
    /[Rr]equired tests/,
    /[Ss]andbox/,
    /Comportamento novo/,
    /\.claude\/harness\/policy\.md/,
    /policy\.json/,
  ];
  for (const field of requiredFields) assert.match(text, field, String(field));
});

test('[HI-007] exceção ao contrato é registrada com motivo e como revisão', () => {
  const text = skillText();
  assert.match(text, /exception/i);
  assert.match(text, /`revision`/);
  assert.match(text, /reason/i);
});

test('[HI-008] estática: check:<nome> exige justificativa e aprovação humana', () => {
  const text = skillText();
  assert.match(text, /`check:<name>`/);
  assert.match(text, /justification/i);
  assert.match(text, /human approval/i);
});

test('[HI-010] [HI-011] estática: não aplicável exige condição de disparo', () => {
  const text = skillText();
  assert.match(text, /trigger condition/i);
  assert.match(text, /never not applicable|without a trigger condition/i);
});

test('[HI-005] estática: a confirmação humana vale como comportamento, não por teste', () => {
  const text = skillText();
  assert.match(text, /confirm[a-z]* .*behavior/i);
  assert.match(text, /not .*each (test|acceptance test)/i);
});

// "Comportamento novo" não tem ID próprio no spec; pertence ao requisito de HI-010 e HI-011.
test('[HI-010] estática: comportamento novo declarado com aprovação humana', () => {
  const text = skillText();
  assert.match(text, /Comportamento novo: (sim|não|yes|no)/);
  assert.match(text, /Comportamento novo[\s\S]{0,200}human approval/i);
});

// ---------------------------------------------------------------------------
// Comportamental: contract.mjs sobre fixtures temporárias.
// ---------------------------------------------------------------------------

test('[HI-003] cenário sem ID é recusado pelo contrato', () => {
  const root = makeChange([scenario('sem id', { 'Revisão': '1' })]);
  const errors = checkScenarios(root);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'HI-003');
  assert.equal(errors[0].scenario, 'sem id');
});

test('[HI-003] cenário sem revisão é recusado pelo contrato', () => {
  const root = makeChange([scenario('sem revisao', { ID: 'HI-901' })]);
  const errors = checkScenarios(root);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'HI-003');
});

test('[HI-003] cenário com ID e revisão é aceito', () => {
  const root = makeChange([scenario('completo', VALID)]);
  assert.deepEqual(checkScenarios(root), []);
});

test('[HI-008] check com justificativa e aprovação é aceito, sem teste funcional', () => {
  const root = makeChange(
    [
      scenario('documento de politica', {
        ...VALID,
        'Verificação': 'check:lint',
        'Justificativa': 'mudança documental sem comportamento executável',
        'Aprovação': 'auth:R-1',
      }),
    ],
    [REVISION_AUTH],
  );
  assert.deepEqual(checkScenarios(root), []);
});

test('[HI-009] check sem justificativa é recusado citando o cenário', () => {
  const root = makeChange(
    [scenario('check sem justificativa', { ...VALID, 'Verificação': 'check:lint', 'Aprovação': 'auth:R-1' })],
    [REVISION_AUTH],
  );
  const errors = checkScenarios(root);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'HI-009');
  assert.equal(errors[0].scenario, 'check sem justificativa');
});

test('[HI-009] check sem aprovação humana é recusado', () => {
  const root = makeChange([
    scenario('check sem aprovacao', { ...VALID, 'Verificação': 'check:typecheck', 'Justificativa': 'tipos apenas' }),
  ]);
  const errors = checkScenarios(root);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'HI-009');
});

test('[HI-010] cenário não aplicável com condição de disparo é aceito', () => {
  const root = makeChange(
    [
      scenario('formato junit', {
        ...VALID,
        'Condição de disparo': 'quando houver formato JUnit',
        'Não aplicável': 'sim',
        'Aprovação': 'auth:R-1',
      }),
    ],
    [REVISION_AUTH],
  );
  assert.deepEqual(checkScenarios(root), []);
});

test('[HI-011] cenário sem condição de disparo declarado não aplicável é recusado', () => {
  const root = makeChange(
    [scenario('sem condicao', { ...VALID, 'Não aplicável': 'sim', 'Aprovação': 'auth:R-1' })],
    [REVISION_AUTH],
  );
  const errors = checkScenarios(root);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'HI-011');
  assert.equal(errors[0].scenario, 'sem condicao');
});
