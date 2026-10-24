// Inventário completo dos casos da suíte obrigatória no resumo durável (D16, D28, EV-012).
// O resumo traz cada caso executado (com e sem vínculo) e, separado, o resultado por cenário.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHANGE_DIR, caseEntry, readSummary, scenario, setupRepo, validate, writeManifest } from './a-support.mjs';

const SUMMARY = `${CHANGE_DIR}/evidence-summary.json`;
const LINKED_FILE = 'scripts/test/vinculado.test.mjs';
const LINKED_NAME = '[AC-011] caso vinculado';
// Sete linhas "ok": vínculo pelo manifesto, regressão sem vínculo, duas tags, subtestes aninhados, TODO e SKIP.
const MIXED_TAP = [
  'TAP version 13',
  `# Subtest: ${LINKED_NAME}`,
  `ok 1 - ${LINKED_NAME}`,
  '  ---',
  '  duration_ms: 1.5',
  "  type: 'test'",
  '  ...',
  '# Subtest: regressão sem vínculo',
  'ok 2 - regressão sem vínculo',
  '# Subtest: [AC-011] [AC-012] caso com duas tags',
  'ok 3 - [AC-011] [AC-012] caso com duas tags',
  '# Subtest: grupo',
  '    # Subtest: filho sem vínculo',
  '    ok 1 - filho sem vínculo',
  '    # Subtest: pendente',
  '    ok 2 - pendente # TODO depois',
  '    1..2',
  'ok 4 - grupo',
  '# Subtest: pulado',
  'ok 5 - pulado # SKIP sem ambiente',
  '1..5',
  '# tests 7',
  '# pass 5',
  '# fail 0',
  '',
].join('\n');

function mixedRepo(tap = MIXED_TAP) {
  const root = setupRepo({
    scenarios: [scenario('AC-011'), scenario('AC-012')],
    tap,
    files: { [LINKED_FILE]: `test('${LINKED_NAME}', () => {});\n` },
  });
  writeManifest(root, [caseEntry(root, { file: LINKED_FILE, name: LINKED_NAME, scenarios: ['AC-011'] })]);
  return root;
}

test('[EV-012] resumo durável traz o inventário completo dos casos, com e sem vínculo, e contagens que batem com a TAP', async () => {
  const root = mixedRepo();
  const result = await validate(root);
  assert.equal(result.verdict, 'pass', JSON.stringify(result.failures));
  const summary = readSummary(root);
  assert.deepEqual(summary.cases, [
    { case_id: `${LINKED_FILE}::${LINKED_NAME}`, name: LINKED_NAME, status: 'pass', scenario_ids: ['AC-011'] },
    { case_id: 'regressão sem vínculo', name: 'regressão sem vínculo', status: 'pass', scenario_ids: [] },
    { case_id: '[AC-011] [AC-012] caso com duas tags', name: '[AC-011] [AC-012] caso com duas tags', status: 'pass', scenario_ids: ['AC-011', 'AC-012'] },
    { case_id: 'grupo > filho sem vínculo', name: 'filho sem vínculo', status: 'pass', scenario_ids: [] },
    { case_id: 'grupo > pendente', name: 'pendente', status: 'todo', scenario_ids: [] },
    { case_id: 'grupo', name: 'grupo', status: 'pass', scenario_ids: [] },
    { case_id: 'pulado', name: 'pulado', status: 'skip', scenario_ids: [] },
  ]);
  assert.deepEqual(summary.case_counts, {
    total: 7, tap_total: 7, by_status: { pass: 5, fail: 0, skip: 1, todo: 1 }, linked: 2, unlinked: 5,
  });
  assert.equal(summary.scenarios['AC-011'].status, 'pass');
  assert.equal(summary.scenarios['AC-012'].status, 'pass');
  assert.equal(summary.tests.cases, undefined, 'o inventário fica só em cases');
  assert.equal(readFileSync(join(root, SUMMARY), 'utf8').includes('ok 2 - regressão'), false, 'sem TAP bruto');
});

test('[EV-012] inventário que não bate com a TAP capturada não aprova e registra a divergência', async () => {
  // "ok 6" sem descrição é caso TAP válido que o parser não reconhece: o inventário fica com 7 de 8.
  const root = mixedRepo(MIXED_TAP.replace('1..5', 'ok 6\n1..6'));
  const result = await validate(root);
  assert.equal(result.approved, false);
  const failure = result.failures.find((item) => item.code === 'inventory_mismatch');
  assert.ok(failure, JSON.stringify(result.failures));
  assert.match(failure.message, /7.*8/);
  assert.equal(existsSync(join(root, SUMMARY)), false, 'sem aprovação não há resumo');
});
