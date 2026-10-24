// specloop install (framework-cli): só os caminhos managed, sem tocar nos owned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, readManifest } from '../helpers.mjs';
import { contents, gitRepo, runCli, snapshot } from './support.mjs';

const OWNED = {
  'CLAUDE.md': '# Meu projeto\n',
  'docs/agents/architecture.md': '# Arquitetura própria\n',
  '.claude/settings.json': '{ "permissions": { "allow": ["Bash(make:*)"] } }\n',
};

test('[SL-006] install copia os managed', () => {
  const project = gitRepo(OWNED);

  const result = runCli(['install', '--yes'], { cwd: project });

  assert.equal(result.code, 0, result.stderr);
  const installed = contents(snapshot(project));
  for (const entry of readManifest().managed) {
    const expected = contents(snapshot(REPO_ROOT, entry));
    assert.ok(Object.keys(expected).length > 0, `${entry} existe no pacote`);
    for (const [file, hash] of Object.entries(expected)) assert.equal(installed[file], hash, file);
  }
  for (const [file, content] of Object.entries(OWNED)) assert.equal(readFileSync(join(project, file), 'utf8'), content, file);
});

test('[SL-007] install repetido nao altera nada', () => {
  const project = gitRepo(OWNED);
  assert.equal(runCli(['install', '--yes'], { cwd: project }).code, 0);
  const before = snapshot(project);

  const result = runCli(['install', '--yes'], { cwd: project });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(snapshot(project), before);
});
