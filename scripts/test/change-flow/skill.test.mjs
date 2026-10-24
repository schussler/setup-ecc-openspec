import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRepoFile } from '../helpers.mjs';

const skill = readRepoFile('.claude/skills/change-flow/SKILL.md');

test('[CF-001] classificação não usa tamanho do diff', () => {
  assert.ok(skill.includes('O tamanho do diff não é critério de classificação.'));
});

test('[CF-002] interface qualificada', () => {
  assert.ok(skill.includes('Aparência de componente não é contrato de API.'));
  assert.ok(skill.includes('Só mudança de contrato externo leva ao caminho 3 por interface.'));
});

test('[CF-003] dúvida menor não sobe de caminho', () => {
  assert.ok(skill.includes('Dúvida que não muda escopo, comportamento, compatibilidade nem aceite vira premissa registrada e não sobe o caminho.'));
});

test('[CF-004] caminho 1 sem change OpenSpec', () => {
  assert.ok(skill.includes('No caminho 1 o registro vai para `docs/agents/issue-tracker.md` e não se cria change OpenSpec.'));
  assert.ok(skill.includes('Escalada que amplie escopo ou custo exige confirmação.'));
});

test('[CF-005] caminho 2 confirma decisões faltantes', () => {
  assert.ok(skill.includes('No caminho 2 apresente um contrato curto'));
  assert.ok(skill.includes('execução supervisionada nesta versão'));
});

test('[CF-006] caminho 3 usa fluxo completo', () => {
  assert.ok(skill.includes('No caminho 3 use `spec-create`'));
  assert.ok(skill.includes('aprovação formal'));
});

test('[CF-007] lacuna de verificação é declarada', () => {
  assert.ok(skill.includes('Verificação proporcional'));
  assert.ok(skill.includes('Quando uma verificação não puder ser feita, declare a lacuna.'));
});

test('[CF-008] guardrails presentes em todos os caminhos', () => {
  assert.ok(skill.includes('Guardrails em todos os caminhos: segredos, permissões, escopo declarado e nenhum push, PR ou publicação sem pedido explícito.'));
});

test('[CF-009] pedido comum sem nomear skill', () => {
  const frontmatter = skill.split('---')[1];
  assert.ok(frontmatter.includes('troque a cor do botão'));
});
