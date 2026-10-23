import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRepoFile } from './helpers.mjs';

const newProject = readRepoFile('.claude/skills/new-project/SKILL.md');
const templateCheck = readRepoFile('.claude/skills/template-check/SKILL.md');
const templateUpdate = readRepoFile('.claude/skills/template-update/SKILL.md');

test('new-project copia modelos para docs agents', () => {
  assert.match(newProject, /templates\/docs\/agents/);
  assert.match(newProject, /<target>\/docs\/agents/);
});

test('new-project remove caminhos template_only', () => {
  assert.match(newProject, /template_only/);
});

test('new-project preenche checks', () => {
  assert.match(newProject, /checks\.test/);
  assert.match(newProject, /checks\.lint/);
  assert.match(newProject, /checks\.typecheck/);
  assert.match(newProject, /leave it empty|deixe vazio|empty string/i);
});

test('template-check valida checks e suite', () => {
  assert.match(templateCheck, /template_only/);
  assert.match(templateCheck, /checks\.test/);
  assert.match(templateCheck, /checks\.lint/);
  assert.match(templateCheck, /checks\.typecheck/);
});

test('template-update avisa sobre migracao de caminhos owned', () => {
  assert.match(templateUpdate, /docs\/agents/);
  assert.match(templateUpdate, /explicit migration|migração explícita/i);
});
