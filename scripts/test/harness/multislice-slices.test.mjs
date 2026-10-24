// Fatias declaradas em tasks.md (change add-multislice-run): ordem, modo legado e cenários por fatia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { declaredSlices } from '../../harness/slice.mjs';

const TASKS = `# Tarefas

## Fatia: primeira

- Cenários: E2E-001
- [ ] 1.1 criar o marcador

## Fatia: segunda

- Cenários: E2E-002, E2E-003
- [ ] 2.1 criar o segundo marcador
`;

test('[MS-001] fatias declaradas são lidas em ordem, com seus cenários', () => {
  const slices = declaredSlices(TASKS);
  assert.deepEqual(slices.map((slice) => slice.name), ['primeira', 'segunda']);
  assert.deepEqual(slices[1].scenarios, ['E2E-002', 'E2E-003']);
});

test('[MS-002] sem cabeçalho "Fatia:" a lista é vazia (modo legado)', () => {
  assert.deepEqual(declaredSlices('# Tarefas\n\n## 1. Grupo\n\n- [ ] 1.1 tarefa\n'), []);
});

test('[MS-008] fatia sem linha de cenários exige lista vazia de cenários', () => {
  const [slice] = declaredSlices('## Fatia: só\n\n- [ ] 1.1 tarefa\n');
  assert.deepEqual(slice.scenarios, []);
});
