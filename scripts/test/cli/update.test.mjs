// specloop update (framework-cli): diff dos managed, confirmação, manifesto `framework`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../helpers.mjs';
import { PACKAGE_VERSION, gitRepo, legacyProject, runCli, snapshot } from './support.mjs';

const CHANGED = 'scripts/gates/lint.mjs';
const OWNED = {
  'CLAUDE.md': '# Projeto\n',
  'docs/agents/domain.md': '# Domínio próprio\n',
  '.claude/settings.json': '{ "permissions": { "allow": [] } }\n',
  '.harness-project.json': '{ "project_id": "00000000-0000-4000-8000-000000000000" }\n',
};

function staleProject(owned = {}) {
  const project = legacyProject(owned);
  appendFileSync(join(project, CHANGED), '// alteração local antiga\n');
  return project;
}

const readJsonFile = (path) => JSON.parse(readFileSync(path, 'utf8'));

test('[SL-009] update converte manifesto antigo', () => {
  const project = staleProject();

  const result = runCli(['update', '--yes'], { cwd: project });

  assert.equal(result.code, 0, result.stderr);
  assert.equal(readFileSync(join(project, CHANGED), 'utf8'), readFileSync(join(REPO_ROOT, CHANGED), 'utf8'));
  const manifest = readJsonFile(join(project, 'template.json'));
  assert.deepEqual(manifest.framework, { package: 'specloop', version: PACKAGE_VERSION });
  assert.equal('template' in manifest, false);
});

test('[SL-014] update sem confirmacao nao escreve', () => {
  const project = staleProject();
  const before = snapshot(project);

  const result = runCli(['update'], { cwd: project, input: 'n\n' });

  assert.match(result.stdout, new RegExp(CHANGED.replaceAll('/', '\\/')));
  assert.deepEqual(snapshot(project), before);
});

test('[SL-015] update nunca escreve em owned', () => {
  const project = staleProject(OWNED);
  const before = snapshot(project);

  const result = runCli(['update', '--yes'], { cwd: project });

  assert.equal(result.code, 0, result.stderr);
  const after = snapshot(project);
  for (const file of Object.keys(OWNED)) assert.deepEqual(after[file], before[file], file);
});

test('[SL-016] update recusa projeto sem manifesto', () => {
  const project = gitRepo({ 'README.md': '# outro\n' });
  const before = snapshot(project);

  const result = runCli(['update', '--yes'], { cwd: project });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /template\.json/);
  assert.deepEqual(snapshot(project), before);
});
