// Suporte das suítes F7 (impressão, suíte obrigatória, aprovação). Nenhum helper chama o
// modelo: a saída da suíte vem de um arquivo TAP do repositório temporário e os checks são
// comandos locais do próprio repositório.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateChange, archiveApproval } from '../../harness/validate.mjs';
import { CHANGE, makeRepo } from './fixture.mjs';
import { writeTree } from '../helpers.mjs';

export const CHANGE_DIR = `openspec/changes/${CHANGE}`;
export const SPEC_FILE = `${CHANGE_DIR}/specs/harness-acceptance/spec.md`;
export const SUITE = 'harness-unit';
export const EXEC = 'exec-f7-0001';
export const RUNTIME = Object.freeze({ node: '22.0.0', claude: '2.1.309', openspec: '1.14.3' });
const REPORT = 'report.tap';
const EXIT_FILE = 'exit.code';
export const TEST_REPORT_COMMAND = `cat ${REPORT}; exit $(cat ${EXIT_FILE})`;
export const PASS_AC011 = 'TAP version 13\nok 1 - [AC-011] caso passa\n1..1\n# tests 1\n# pass 1\n# fail 0\n';
export const EMPTY_TAP = 'TAP version 13\n1..0\n# tests 0\n# pass 0\n# fail 0\n';
export const PROPOSAL = '# Proposta\n\n- **Comportamento novo:** sim\n- **Estado do contrato:** aprovado\n';
export const HUMAN_DATE = '2026-10-23T12:00:00.000Z';

export function scenario(id, extra = {}) {
  return { id, title: `caso ${id}`, revision: 1, verification: 'teste', ...extra };
}

function scenarioLines(item) {
  const lines = [`#### Scenario: ${item.title}`, `- **ID:** ${item.id}`, `- **Revisão:** ${item.revision}`];
  if (item.verification) lines.push(`- **Verificação:** ${item.verification}`);
  if (item.justification) lines.push(`- **Justificativa:** ${item.justification}`);
  if (item.approval) lines.push(`- **Aprovação:** ${item.approval}`);
  if (item.dependsOn) lines.push(`- **Depende de:** ${item.dependsOn}`);
  if (item.notApplicable) lines.push('- **Não aplicável:** sim', `- **Condição de disparo:** ${item.trigger}`);
  return lines.join('\n');
}

export function specText(scenarios) {
  return `## ADDED Requirements\n\n### Requirement: Cobertura da change\n\n${scenarios.map(scenarioLines).join('\n\n')}\n`;
}

// Template de teste: checks.test referencia a suíte de checks.test_report (D12).
export function defaultTemplate(extraChecks = {}) {
  return {
    checks: {
      test: { command: 'node --test', suite: SUITE },
      test_report: { command: TEST_REPORT_COMMAND, format: 'tap', suite: SUITE },
      lint: 'true',
      typecheck: 'true',
      ...extraChecks,
    },
  };
}

// Registro humano em authorizations.json (origin human, escopo da change).
// Registro revision sem purpose recebe a finalidade scenario_change (A.3, item E): registro sem finalidade não vale.
export function humanRecord(id, kind, scope, extra = {}) {
  const purpose = kind === 'revision' ? { purpose: 'scenario_change' } : {};
  return {
    id, kind, origin: 'human', ...purpose, scope: { change: CHANGE, ...scope }, reason: 'teste', approver: 'Douglas',
    author: 'douglas', recorded_at: HUMAN_DATE, project_id: '3f2c9a1e-6b7d-4e8f-9a0b-1c2d3e4f5a6b', ...extra,
  };
}

// Repositório temporário com a change, o template, o relatório TAP e o código de saída da suíte.
export function setupRepo({
  scenarios = [scenario('AC-011')], tap = PASS_AC011, exit = 0, template = defaultTemplate(),
  authorizations = null, files = {}, proposal = PROPOSAL,
} = {}) {
  const root = makeRepo();
  writeTree(root, {
    'template.json': template,
    [`${CHANGE_DIR}/proposal.md`]: proposal,
    [`${CHANGE_DIR}/design.md`]: '# Design\n',
    [SPEC_FILE]: specText(scenarios),
    [REPORT]: tap,
    [EXIT_FILE]: String(exit),
    ...files,
  });
  if (authorizations) setAuthorizations(root, authorizations);
  return root;
}

export function setSpec(root, scenarios) {
  writeFileSync(join(root, SPEC_FILE), specText(scenarios));
}

export function setTap(root, tap) {
  writeFileSync(join(root, REPORT), tap);
}

export function setExit(root, code) {
  writeFileSync(join(root, EXIT_FILE), String(code));
}

export function setAuthorizations(root, records) {
  writeFileSync(join(root, CHANGE_DIR, 'authorizations.json'), `${JSON.stringify(records, null, 2)}\n`);
}

export function setTemplate(root, template) {
  writeFileSync(join(root, 'template.json'), `${JSON.stringify(template, null, 2)}\n`);
}

// Validação final da change com a identidade e o ambiente de teste.
export function validate(root, options = {}) {
  return validateChange({ root, change: CHANGE, executionId: EXEC, runtime: RUNTIME, ...options });
}

export function archive(root) {
  return archiveApproval({ root, change: CHANGE, runtime: RUNTIME });
}

export function readSummary(root) {
  return JSON.parse(readFileSync(join(root, CHANGE_DIR, 'evidence-summary.json'), 'utf8'));
}

export function codes(result) {
  return result.failures.map((failure) => `${failure.id}:${failure.code}`);
}
