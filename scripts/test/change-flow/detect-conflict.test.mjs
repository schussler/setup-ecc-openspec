import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { REPO_ROOT } from '../helpers.mjs';

const MODULE = join(REPO_ROOT, '.claude/skills/change-flow/change-flow.mjs');
const { detectRuleConflict } = await import(pathToFileURL(MODULE).href);

test('[CF-010] regra antiga incondicional é reportada', () => {
  const texto = '# Regras\n\n- **Zero código sem spec:** nenhuma alteração sem spec.\n';
  assert.deepEqual(detectRuleConflict(texto), { conflict: true, line: 3 });
});

test('[CF-011] regra atualizada não gera conflito', () => {
  const texto = '- **Caminhos por risco:** ver a skill `change-flow`.\n';
  assert.deepEqual(detectRuleConflict(texto), { conflict: false });
});

test('texto sem a frase antiga não gera conflito', () => {
  assert.deepEqual(detectRuleConflict('# Sem regra antiga\n'), { conflict: false });
});

test('CLAUDE.md do template não tem regra antiga pela CLI', () => {
  const saida = execFileSync(process.execPath, [MODULE, 'conflict', join(REPO_ROOT, 'CLAUDE.md')], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(saida), { conflict: false });
});
