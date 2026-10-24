// Suporte dos testes da CLI do runner (cli-*.test.mjs e integração-*.test.mjs). Nenhum helper
// chama o modelo: a CLI não importa o adaptador do claude, e os testes gravam estado direto
// pelo state.mjs, como o runner faria depois do marco de adoção (SP-009).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CHANGE, makeRepo } from './fixture.mjs';
import { createState, loadState, saveState } from '../../harness/state.mjs';
import { dispatch } from '../../harness/cli.mjs';

export { CHANGE };
export const EXEC = 'exec-cli-0001';
export const CHANGE_DIR = `openspec/changes/${CHANGE}`;
export const HUMAN_DATE = '2026-10-23T12:00:00.000Z';
export const MARKER = '- **Marco de adoção registrado:** 2026-10-25 — aprovador: mantenedor\n';

export function writeText(root, relative, text) {
  mkdirSync(dirname(join(root, relative)), { recursive: true });
  writeFileSync(join(root, relative), text);
}

export function readJson(root, relative) {
  return JSON.parse(readFileSync(join(root, relative), 'utf8'));
}

// Repositório com a change mínima (proposta, design e tarefas) e a identidade do projeto.
export function changeRepo() {
  const root = makeRepo();
  writeText(root, `${CHANGE_DIR}/proposal.md`, '# Proposta\n\n- **Comportamento novo:** sim\n');
  writeText(root, `${CHANGE_DIR}/design.md`, '# Design\n');
  writeText(root, `${CHANGE_DIR}/tasks.md`, '# Tarefas\n\n- [ ] 1.1 tarefa\n');
  writeText(root, `${CHANGE_DIR}/specs/harness-cli/spec.md`, '## ADDED Requirements\n');
  writeText(root, 'template.json', `${JSON.stringify({ checks: { test: { command: 'node -e ""', suite: 'template' }, lint: 'node -e ""', typecheck: 'node -e ""' } }, null, 2)}\n`);
  return root;
}

// Marco de adoção registrado no issue-tracker: sem ele, nenhuma execução é atribuída ao runner (SP-009).
export function adopt(root) {
  writeText(root, 'docs/agents/issue-tracker.md', `# Issue tracker\n\n${MARKER}`);
}

// Cria uma execução em modo runner direto no estado (simula a adoção já registrada).
export function seedRunner(root, patch = {}) {
  const created = createState(root, CHANGE, { mode: 'runner', executionId: EXEC });
  return saveState(root, CHANGE, { ...created, ...patch });
}

// Chama a CLI in-process, como o processo faria, e devolve o resultado JSON.
export function cli(root, subcommand, extra = []) {
  return dispatch([subcommand, '--change', CHANGE, '--root', root, ...extra]);
}

export const stateOf = (root) => loadState(root, CHANGE);

export function writeRecord(root, name, record) {
  writeText(root, `record-${name}.json`, `${JSON.stringify(record, null, 2)}\n`);
  return join(root, `record-${name}.json`);
}

export function eventsOf(root) {
  const path = join(root, '.harness-local', CHANGE, 'events.jsonl');
  try {
    return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

export { loadState, createState, saveState };
