// Esquema de checks.test e checks.test_report, modo legado e normalização para os gates (A.1, D27).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadChecks } from '../../gates/checks.mjs';
import { PASS_AC011, defaultTemplate, makeRepo, readSummary, scenario, setupRepo, validate, writeTree } from './a-support.mjs';

const CONFIG = 'template.json';

function rootWithTemplate(template) {
  const root = makeRepo();
  writeTree(root, { [CONFIG]: { checks: template } });
  return root;
}

test('[AC-022] checks.test em string com checks.test_report declarado para com config_error antes de executar a suíte', async () => {
  const template = defaultTemplate();
  template.checks.test = 'node --test';
  template.checks.test_report.command = 'echo ran > marcador.txt; cat report.tap; exit $(cat exit.code)';
  const root = setupRepo({ template });
  const result = await validate(root);
  assert.equal(result.stop_reason, 'config_error');
  assert.match(result.message, /checks\.test/);
  assert.match(result.message, /suite/);
  assert.equal(existsSync(join(root, 'marcador.txt')), false, 'a suíte não pode ser executada');
});

test('[AC-023] projeto sem checks.test_report roda no modo legado e o resumo declara o modo', async () => {
  const template = { checks: { test: 'cat report.tap; exit $(cat exit.code)', lint: 'true', typecheck: 'true' } };
  const root = setupRepo({ template, tap: PASS_AC011 });
  const result = await validate(root);
  assert.equal(result.approved, true, JSON.stringify(result.failures));
  const summary = readSummary(root);
  assert.equal(summary.tests.mode, 'legacy');
  assert.equal(summary.tests.suite, null);
  assert.ok(summary.limitations.some((text) => /legado/.test(text)), 'o modo legado aparece nas limitações');
});

test('[AC-014] loadChecks recusa checks.test e checks.test_report com suite diferente, nomeando as duas suites', () => {
  const template = defaultTemplate();
  template.checks.test = { command: 'node --test', suite: 'outra-suite' };
  const root = rootWithTemplate(template.checks);
  assert.throws(() => loadChecks(root), (err) => /suite/.test(err.message)
    && /outra-suite/.test(err.message) && /harness-unit/.test(err.message));
});

test('[AC-016] loadChecks recusa format fora de tap com diagnóstico que nomeia checks.test_report.format', () => {
  const template = defaultTemplate();
  template.checks.test_report.format = 'junit';
  const root = rootWithTemplate(template.checks);
  assert.throws(() => loadChecks(root), (err) => /checks\.test_report\.format/.test(err.message)
    && /tap/.test(err.message) && /"format": "tap"/.test(err.message));
});

test('[AC-022] loadChecks recusa checks.test em string quando checks.test_report está declarado', () => {
  const template = defaultTemplate();
  template.checks.test = 'node --test';
  const root = rootWithTemplate(template.checks);
  assert.throws(() => loadChecks(root), (err) => /checks\.test/.test(err.message) && /suite/.test(err.message));
});

test('[AC-023] loadChecks aceita checks.test em string sem checks.test_report, no modo legado', () => {
  const root = rootWithTemplate({ test: 'npm test', lint: 'npm run lint', typecheck: 'npx tsc' });
  assert.equal(loadChecks(root).test, 'npm test');
});

test('[AC-014] loadChecks devolve o comando normalizado quando checks.test é objeto com suite', () => {
  const root = rootWithTemplate({
    test: { command: 'node --test "scripts/test/**/*.test.mjs"', suite: 'template' },
    test_report: { command: 'node --test --test-reporter=tap "scripts/test/**/*.test.mjs"', suite: 'template', format: 'tap' },
    lint: 'node scripts/gates/lint.mjs',
    typecheck: 'node scripts/gates/syntax-check.mjs scripts',
  });
  assert.equal(loadChecks(root).test, 'node --test "scripts/test/**/*.test.mjs"');
});

test('[AC-022] checks.test objeto sem suite é config_error que nomeia checks.test.suite', () => {
  const root = rootWithTemplate({ test: { command: 'node --test' }, lint: 'true', typecheck: 'true' });
  assert.throws(() => loadChecks(root), (err) => /checks\.test\.suite/.test(err.message));
});

test('[AC-023] o relatório de validação mantém o caso legado com o cenário vinculado por tag', async () => {
  const template = { checks: { test: 'cat report.tap; exit $(cat exit.code)', lint: 'true', typecheck: 'true' } };
  const root = setupRepo({ template, scenarios: [scenario('AC-011')], tap: PASS_AC011 });
  const result = await validate(root);
  assert.equal(result.cases.find((item) => item.id === 'AC-011').status, 'pass');
});
