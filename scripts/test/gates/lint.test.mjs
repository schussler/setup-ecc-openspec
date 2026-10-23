import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { makeTempDir, writeTree, REPO_ROOT } from '../helpers.mjs';

const LINT = join(REPO_ROOT, 'scripts/gates/lint.mjs');
const skill = (name) => `---\nname: ${name}\ndescription: faz algo\n---\n\n# ${name}\n`;

function lint(root) {
  return spawnSync(process.execPath, [LINT, root], { encoding: 'utf8' });
}

test('lint acusa skill sem frontmatter', () => {
  const root = writeTree(makeTempDir(), {
    'template.json': {},
    '.claude/skills/boa/SKILL.md': skill('boa'),
    '.claude/skills/ruim/SKILL.md': skill('outro-nome'),
    '.claude/skills/sem/SKILL.md': '# sem frontmatter\n',
  });
  const result = lint(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /ruim\/SKILL\.md/);
  assert.match(result.stdout, /sem\/SKILL\.md/);
  assert.doesNotMatch(result.stdout, /boa\/SKILL\.md/);
});

test('lint aceita descricao em bloco', () => {
  const root = writeTree(makeTempDir(), {
    '.claude/skills/bloco/SKILL.md': '---\nname: bloco\ndescription: >\n  texto longo\n---\n',
  });
  assert.equal(lint(root).status, 0);
});

test('lint acusa JSON invalido no manifesto e nas settings', () => {
  const root = writeTree(makeTempDir(), {
    'template.json': '{ invalido',
    '.claude/settings.json': '{ "a": }',
  });
  const result = lint(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /template\.json/);
  assert.match(result.stdout, /settings\.json/);
});

test('lint passa no proprio template', () => {
  assert.equal(lint(REPO_ROOT).status, 0, lint(REPO_ROOT).stdout);
});
