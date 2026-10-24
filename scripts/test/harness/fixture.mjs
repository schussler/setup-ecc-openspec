// Repositórios temporários reais (git init) para os testes do harness.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const CHANGE = 'add-spec-harness';
export const PROJECT_ID = '3f2c9a1e-6b7d-4e8f-9a0b-1c2d3e4f5a6b';
export const DERIVED_PROJECT_ID = '7d1e4c2b-0a9f-4b3e-8c6d-5e4f3a2b1c0d';
const PROJECT_FILE = '.harness-project.json';

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 'teste', GIT_AUTHOR_EMAIL: 'teste@example.com', GIT_COMMITTER_NAME: 'teste', GIT_COMMITTER_EMAIL: 'teste@example.com' },
  });
}

// Grava .harness-project.json e o versiona, como um projeto real faria.
export function writeProjectFile(root, projectId) {
  writeFileSync(join(root, PROJECT_FILE), `${JSON.stringify({ project_id: projectId }, null, 2)}\n`);
  git(root, ['add', PROJECT_FILE]);
  git(root, ['commit', '-q', '-m', `identidade do projeto ${projectId}`]);
}

function copyPolicy(root) {
  mkdirSync(join(root, '.claude', 'harness'), { recursive: true });
  cpSync(join(REPO_ROOT, '.claude', 'harness', 'policy.json'), join(root, '.claude', 'harness', 'policy.json'));
}

// Cria um repositório com um commit vazio, a política real e o project_id do template.
export function makeRepo({ projectId = PROJECT_ID } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'harness-')));
  git(root, ['init', '-q']);
  git(root, ['commit', '-q', '--allow-empty', '-m', 'base']);
  writeProjectFile(root, projectId);
  copyPolicy(root);
  mkdirSync(join(root, 'openspec', 'changes', CHANGE), { recursive: true });
  return root;
}

// Clona o repositório (o .harness-project.json versionado vem junto) e devolve o caminho real.
export function cloneRepo(source, name) {
  const path = join(mkdtempSync(join(tmpdir(), 'harness-clone-')), name);
  git(tmpdir(), ['clone', '-q', source, path]);
  copyPolicy(path);
  mkdirSync(join(path, 'openspec', 'changes', CHANGE), { recursive: true });
  return realpathSync(path);
}

// Adiciona um worktree ao mesmo clone e devolve o caminho real dele.
export function addWorktree(root, name) {
  const path = join(mkdtempSync(join(tmpdir(), 'harness-wt-')), name);
  git(root, ['worktree', 'add', '-q', '--detach', path]);
  copyPolicy(path);
  return realpathSync(path);
}
