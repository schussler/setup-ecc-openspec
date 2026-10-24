// Suíte obrigatória, identidade de casos e formato do relatório (F7, AC-005, AC-011 a AC-017).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTapCases } from '../../harness/test-report.mjs';
import { codes, defaultTemplate, EMPTY_TAP, scenario, setupRepo, validate } from './f7-support.mjs';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const fixture = (name) => readFileSync(join(FIXTURES, name), 'utf8');
const statusesOf = (cases) => cases.map((item) => `${item.name}=${item.status}`);

test('[AC-011] caso com falha na suíte obrigatória reprova a validação final', async () => {
  const root = setupRepo({
    exit: 1,
    tap: 'TAP version 13\nnot ok 1 - [AC-011] caso falha\n1..1\n# pass 0\n# fail 1\n',
  });
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.ok(codes(result).includes('AC-011:fail'), JSON.stringify(result.failures));
});

test('[AC-012] saída com código diferente de zero reprova mesmo com contagem favorável', async () => {
  const root = setupRepo({
    exit: 1,
    tap: 'TAP version 13\nok 1 - [AC-011] caso passa\n1..1\n# pass 3\n# fail 0\n',
  });
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.ok(codes(result).some((code) => code.endsWith(':suite_exit')), JSON.stringify(result.failures));
});

test('[AC-013] cenário coberto por teste acrescentado a arquivo existente conta como coberto', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-013')],
    tap: 'TAP version 13\nok 1 - arquivo-existente.test.mjs\nok 2 - [AC-013] acrescentado ao arquivo existente\n1..2\n# pass 2\n# fail 0\n',
  });
  const result = await validate(root);
  assert.equal(result.approved, true, JSON.stringify(result.failures));
});

test('[AC-014] checks.test e checks.test_report com suite diferente param com config_error sem executar a suíte', async () => {
  const template = defaultTemplate();
  template.checks.test_report.command = 'echo ran > marcador.txt; cat report.tap; exit $(cat exit.code)';
  template.checks.test = { command: 'node --test', suite: 'outra-suite' };
  const root = setupRepo({ template });
  const result = await validate(root);
  assert.equal(result.stop_reason, 'config_error');
  assert.equal(result.approved, false);
  assert.equal(existsSync(join(root, 'marcador.txt')), false, 'a suíte não pode ser executada');
});

test('[AC-016] formato junit é bloqueado com diagnóstico que nomeia checks.test_report.format', async () => {
  const template = defaultTemplate();
  template.checks.test_report.format = 'junit';
  const root = setupRepo({ template });
  const result = await validate(root);
  assert.equal(result.stop_reason, 'config_error');
  assert.match(result.message, /checks\.test_report\.format/);
  assert.match(result.message, /tap/);
  assert.match(result.message, /"format": "tap"/);
});

test('[AC-017] TAP do Node 22 ou superior: ok, not ok, # SKIP e # TODO viram pass, fail e skip pela fonte tap', () => {
  const cases = parseTapCases([
    'TAP version 13',
    '# Subtest: [AC-011] a',
    'ok 1 - [AC-011] a',
    'not ok 2 - [AC-012] b',
    'ok 3 - [AC-013] c \\# SKIP # SKIP motivo',
    'not ok 4 - [AC-014] d \\# TODO # TODO ainda não',
  ].join('\n'));
  assert.deepEqual(cases.map((item) => item.status), ['pass', 'fail', 'skip', 'skip']);
  assert.ok(cases.every((item) => item.source === 'tap'));
});

test('[AC-017] fixture real do Node 22 ou superior (ok, not ok, SKIP, TODO) é reconhecida caso a caso', () => {
  const cases = parseTapCases(fixture('tap-node22-mixed.tap'));
  assert.deepEqual(statusesOf(cases).map((text) => text.replace(/\\#/g, '#')), [
    '[AC-011] caso que passa=pass',
    '[AC-012] caso que falha=fail',
    '[AC-013] caso ignorado # SKIP=skip',
    '[AC-014] caso previsto # TODO=skip',
    '[AC-015] caso filtrado=pass',
  ]);
});

test('[AC-015] fixture de saída filtrada do Node 22 ou superior não satisfaz os ids que faltam', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-011'), scenario('AC-012')],
    tap: fixture('tap-node22-filtered.tap').replace('[AC-013]', '[AC-099]'),
  });
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.ok(codes(result).includes('AC-012:missing'), JSON.stringify(result.failures));
});

test('[AC-015] contagem igual com identidade diferente reprova com missing para o id esperado', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-011'), scenario('AC-012')],
    tap: 'TAP version 13\nok 1 - [AC-011] a\nok 2 - [AC-099] b\n1..2\n# pass 2\n# fail 0\n',
  });
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.ok(codes(result).includes('AC-012:missing'), JSON.stringify(result.failures));
});

test('[AC-005] caso obrigatório com # SKIP não satisfaz o critério e a validação reprova', async () => {
  const root = setupRepo({ tap: 'TAP version 13\nok 1 - [AC-011] caso pulado # SKIP sem motivo\n1..1\n# pass 1\n# fail 0\n' });
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.ok(codes(result).includes('AC-011:skip'), JSON.stringify(result.failures));
  assert.equal(result.cases.find((item) => item.id === 'AC-011').status, 'skip');
});

test('[AC-011] cenário obrigatório sem nenhum caso executado reprova como missing', async () => {
  const root = setupRepo({ tap: EMPTY_TAP });
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.ok(codes(result).includes('AC-011:missing'), JSON.stringify(result.failures));
});
