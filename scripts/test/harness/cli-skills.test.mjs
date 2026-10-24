// Skills conectadas à CLI do runner (SP-004 a SP-008, SP-010). Teste textual: cada skill cita o
// subcomando certo, e o modo legado mantém --legacy-write (não removido nesta etapa, tarefa 10.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './fixture.mjs';

const read = (skill) => readFileSync(join(REPO_ROOT, '.claude', 'skills', skill, 'SKILL.md'), 'utf8');
const CLI = 'scripts/harness/cli.mjs';

test('[SP-008] spec-implement pede o gate de implementação à CLI do runner no modo runner', () => {
  const text = read('spec-implement');
  assert.match(text, new RegExp(`${CLI} gate-implement`));
  assert.match(text, new RegExp(`${CLI} start`));
  assert.match(text, /gate-implement[^\n]*--note/);
});

test('[SP-008] spec-implement mantém --legacy-write no modo legacy', () => {
  assert.match(read('spec-implement'), /implement-gate\.mjs score[^\n]*--legacy-write/);
});

test('[SP-006] spec-archive chama gate-archive, validate-final e o checkpoint archived antes de arquivar', () => {
  const text = read('spec-archive');
  assert.match(text, new RegExp(`${CLI} gate-archive`));
  assert.match(text, new RegExp(`${CLI} validate-final`));
  assert.match(text, new RegExp(`${CLI} checkpoint --milestone archived`));
  assert.match(text, new RegExp(`${CLI} report`));
  assert.match(text, /archive-gate\.mjs[^\n]*--legacy-write/);
  assert.ok(text.indexOf('checkpoint --milestone archived') < text.indexOf('openspec archive'));
});

test('[SP-006] handoff grava o ponto de restauração com a visão summary da CLI', () => {
  const text = read('handoff');
  assert.match(text, new RegExp(`${CLI} summary`));
  assert.match(text, new RegExp(`${CLI} fail|${CLI} interrupt|${CLI} resume`));
});

test('[SP-005] spec-accept gera e valida o manifesto pela CLI do manifesto', () => {
  assert.match(read('spec-accept'), /manifest-cli\.mjs generate/);
  assert.match(read('spec-accept'), /manifest-cli\.mjs validate/);
});

test('[SP-004] template-migrate aponta o legacy-run com o subcomando migrate', () => {
  assert.match(read('template-migrate'), /legacy-run\.mjs migrate --change/);
});
