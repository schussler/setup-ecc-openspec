// Textos das skills de distribuição: new-project, template-update, template-migrate e template-check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRepoFile } from '../helpers.mjs';

const newProject = readRepoFile('.claude/skills/new-project/SKILL.md');
const templateUpdate = readRepoFile('.claude/skills/template-update/SKILL.md');
const templateMigrate = readRepoFile('.claude/skills/template-migrate/SKILL.md');
const templateCheck = readRepoFile('.claude/skills/template-check/SKILL.md');

// Devolve a primeira linha do texto que contém todos os termos.
function lineWith(text, ...terms) {
  return text.split('\n').find((line) => terms.every((term) => line.includes(term)));
}

test('[RS-019] new-project gera project_id novo e nao herda o do template', () => {
  const line = lineWith(newProject, '.harness-project.json', 'project_id');
  assert.ok(line, 'new-project cita project_id de .harness-project.json');
  assert.match(newProject, /renew-id\.mjs/);
  assert.match(newProject, /não herda|nao herda|does not inherit/i);
});

test('[RS-023] template-update nunca sobrescreve .harness-project.json', () => {
  const line = lineWith(templateUpdate, '.harness-project.json');
  assert.ok(line, 'template-update cita .harness-project.json');
  assert.match(line, /never|nunca/i);
});

test('distribuicao: new-project copia scripts/harness e .claude/harness junto com scripts/gates', () => {
  assert.ok(lineWith(newProject, 'scripts/gates', 'scripts/harness'), 'linha com gates e harness');
  assert.ok(lineWith(newProject, 'scripts/harness', 'necess'), 'scripts/harness declarado como necessário');
  assert.match(newProject, /\.claude\/harness/);
});

test('distribuicao: template-update copia todos os caminhos managed, incluindo scripts/harness e .claude/harness', () => {
  assert.ok(lineWith(templateUpdate, 'scripts/harness', 'managed'), 'linha com scripts/harness e managed');
  assert.match(templateUpdate, /\.claude\/harness/);
  assert.match(templateUpdate, /migrate\.mjs check-update/);
});

test('distribuicao: template-update e template-migrate recusam quando sobra scripts/gates sem scripts/harness', () => {
  for (const [name, text] of [['template-update', templateUpdate], ['template-migrate', templateMigrate]]) {
    assert.match(text, /recus|refus/i, `${name} recusa`);
    assert.match(text, /scripts\/gates/, `${name} cita scripts/gates`);
    assert.match(text, /scripts\/harness/, `${name} cita scripts/harness`);
  }
  assert.match(templateMigrate, /--items managed/);
});

test('distribuicao: new-project cria .harness-local/ no .gitignore e declara checks.test_report', () => {
  assert.match(newProject, /\.harness-local\//);
  assert.match(newProject, /\.gitignore/);
  assert.match(newProject, /checks\.test_report/);
  assert.match(newProject, /"format": "tap"/);
});

test('distribuicao: template-check descreve os dois formatos de checks.test e o format tap', () => {
  assert.ok(lineWith(templateCheck, 'checks.test', 'string'), 'formato string');
  assert.ok(lineWith(templateCheck, 'checks.test', 'suite'), 'formato objeto com suite');
  assert.match(templateCheck, /checks\.test_report\.format/);
  assert.match(templateCheck, /\btap\b/);
  assert.match(templateCheck, /scripts\/harness\/template-check\.mjs/);
});

test('distribuicao: template-check verifica os imports dos gates contra os caminhos managed', () => {
  assert.ok(lineWith(templateCheck, 'scripts/gates', 'managed'), 'linha sobre imports dos gates e managed');
});
