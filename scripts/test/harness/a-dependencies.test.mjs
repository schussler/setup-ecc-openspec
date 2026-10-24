// Dependências declaradas (Depende de), propagação transitiva e reexecução completa (A.3, D21b, D15).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkContract } from '../../harness/contract.mjs';
import { changeDir } from '../../harness/identity.mjs';
import {
  CHANGE, humanRecord, scenario, setAuthorizations, setSpec, setupRepo, tapOf, validate, writeTree,
} from './a-support.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CHECKS = ['lint', 'typecheck'];
const DESIGN = (text) => `# Design\n\n${text}\n`;
const HI014 = (errors) => errors.filter((error) => error.code === 'HI-014');

function contractOf(root) {
  return checkContract(changeDir(root, CHANGE), { checks: CHECKS });
}

test('[HI-014] Depende de com cenário inexistente é recusado com a referência citada', () => {
  const root = setupRepo({ scenarios: [scenario('AC-011', { dependsOn: 'RC-099' })] });
  const errors = HI014(contractOf(root));
  assert.equal(errors.length, 1, JSON.stringify(errors));
  assert.match(errors[0].message, /RC-099/);
});

test('[HI-014] Depende de com IF- não declarado em design.md é recusado', () => {
  const root = setupRepo({ scenarios: [scenario('AC-011', { dependsOn: 'IF-cliente' })] });
  assert.match(HI014(contractOf(root))[0]?.message ?? '', /IF-cliente/);
});

test('[HI-014] Depende de com IF- declarado na seção de interfaces de design.md é aceito', () => {
  const root = setupRepo({ scenarios: [scenario('AC-011', { dependsOn: 'IF-cliente' })] });
  writeTree(root, { [`openspec/changes/${CHANGE}/design.md`]: DESIGN('## Interfaces e regras compartilhadas\n\n- IF-cliente: contrato do cliente\n') });
  assert.deepEqual(HI014(contractOf(root)), []);
});

test('[HI-014] Depende de com texto livre é recusado', () => {
  const root = setupRepo({ scenarios: [scenario('AC-011', { dependsOn: 'depois do login' })] });
  assert.equal(HI014(contractOf(root)).length, 1);
});

test('[HI-014] Depende de com fatia F<n> só é aceito se a fatia existe na tabela de Fatias', () => {
  const root = setupRepo({ scenarios: [scenario('AC-011', { dependsOn: 'F9' })] });
  writeTree(root, { [`openspec/changes/${CHANGE}/design.md`]: DESIGN('## Fatias\n\n| Fatia | Conteúdo |\n|---|---|\n| F1 | base |\n') });
  assert.equal(HI014(contractOf(root)).length, 1, 'F9 não existe');
  writeTree(root, { [`openspec/changes/${CHANGE}/design.md`]: DESIGN('## Fatias\n\n| Fatia | Conteúdo |\n|---|---|\n| F9 | fim |\n') });
  assert.deepEqual(HI014(contractOf(root)), []);
});

test('[EV-007] revisão percorre dependências transitivas: C depende de B, que depende de A, e C também fica invalidado', async () => {
  const scenarios = [scenario('AC-031'), scenario('AC-032', { dependsOn: 'AC-031' }), scenario('AC-033', { dependsOn: 'AC-032' })];
  const tap = tapOf(['ok 1 - [AC-031] a', 'ok 2 - [AC-032] b', 'ok 3 - [AC-033] c']);
  const root = setupRepo({ scenarios, tap });
  assert.equal((await validate(root)).approved, true);

  setSpec(root, [scenario('AC-031', { revision: 2, approval: 'auth:rev-031' }), scenarios[1], scenarios[2]]);
  setAuthorizations(root, [humanRecord('rev-031', 'revision', { scenario: 'AC-031', revision: 2 })]);
  const result = await validate(root);
  assert.equal(result.approved, false);
  const invalid = new Set(result.failures.map((failure) => failure.id));
  assert.ok(invalid.has('AC-032') && invalid.has('AC-033'), JSON.stringify(result.failures));
});

test('[EV-011] a validação final reexecuta a suíte obrigatória inteira, sem seleção por cenário', async () => {
  const template = {
    checks: {
      test: { command: 'node --test', suite: 'harness-unit' },
      test_report: { command: 'echo rodou >> rodadas.txt; cat report.tap; exit $(cat exit.code)', suite: 'harness-unit', format: 'tap' },
      lint: 'true',
      typecheck: 'true',
    },
  };
  const root = setupRepo({ template, scenarios: [scenario('AC-011')] });
  await validate(root);
  await validate(root);
  assert.equal(readFileSync(join(root, 'rodadas.txt'), 'utf8').trim().split('\n').length, 2);
});
