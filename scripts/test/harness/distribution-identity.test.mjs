// Identidade do projeto derivado (RS-019).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renewProjectId } from '../../../.claude/skills/new-project/renew-id.mjs';
import { makeTempDir, writeTree } from '../helpers.mjs';

test('[RS-019] renew-id gera project_id novo, preserva as outras chaves e nao repete o do template', () => {
  const dir = makeTempDir('distribution-id-');
  const file = join(dir, '.harness-project.json');
  writeTree(dir, { '.harness-project.json': { project_id: 'ae7fabc2-4918-45fa-aefa-3c9519aba014', outra: 1 } });
  const next = renewProjectId(file);
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.notEqual(next, 'ae7fabc2-4918-45fa-aefa-3c9519aba014');
  assert.match(saved.project_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(saved.outra, 1);
});

test('[RS-019] renew-id cria o arquivo quando ele não existe', () => {
  const file = join(makeTempDir('distribution-id-'), '.harness-project.json');
  renewProjectId(file);
  assert.equal(typeof JSON.parse(readFileSync(file, 'utf8')).project_id, 'string');
});

