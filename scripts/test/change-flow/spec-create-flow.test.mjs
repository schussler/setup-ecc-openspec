import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRepoFile } from '../helpers.mjs';

const specCreate = readRepoFile('.claude/skills/spec-create/SKILL.md');

test('spec-create exige classificação prévia pela change-flow', () => {
  assert.ok(specCreate.includes('Antes deste passo, a skill `change-flow` classifica o pedido.'));
});

test('spec-create descreve o contrato curto do caminho 2', () => {
  assert.ok(specCreate.includes('No caminho 2 o contrato é curto: `proposal.md` e `specs/`, sem `design.md` quando não houver decisão de arquitetura.'));
});

test('spec-create mantém o gate que não pode ser pulado', () => {
  assert.ok(specCreate.includes('cannot be skipped'));
});
