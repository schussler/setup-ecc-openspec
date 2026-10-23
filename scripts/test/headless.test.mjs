import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRepoFile } from './helpers.mjs';

const skill = (name) => readRepoFile(`.claude/skills/${name}/SKILL.md`);
const settings = JSON.parse(readRepoFile('.claude/settings.json'));

test('permissoes definidas em settings do projeto', () => {
  const allow = settings.permissions.allow;
  for (const rule of ['Read', 'Edit', 'Write', 'Bash(openspec:*)', 'Bash(node:*)', 'Bash(git status:*)', 'Bash(git add:*)', 'Bash(git commit:*)']) {
    assert.ok(allow.includes(rule), rule);
  }
  assert.ok(!allow.some((rule) => rule === 'Bash' || rule === 'Bash(*)'), 'Bash irrestrito');
  assert.ok(!allow.some((rule) => /git push|gh |git -C|Bash\(rm/.test(rule)), 'push, gh, git -C ou rm liberado');
});

test('spec-create headless registra premissas', () => {
  const text = skill('spec-create');
  assert.match(text, /--headless/);
  assert.match(text, /## Premissas/);
});

test('spec-implement e spec-archive rodam headless sem perguntas', () => {
  for (const name of ['spec-implement', 'spec-archive']) {
    assert.match(skill(name), /[Hh]eadless/, name);
    assert.match(skill(name), /without asking|sem perguntar|do not ask/i, name);
  }
});

test('new-project aceita modo nao interativo', () => {
  const text = skill('new-project');
  assert.match(text, /--non-interactive/);
  assert.match(text, /--template-source/);
  assert.match(text, /no questions|without asking/i);
});
