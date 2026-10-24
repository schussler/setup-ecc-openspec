// Caminhos protegidos resolvidos por projeto (A.3, item F, D14): testes de aceitação e insumos do manifesto.
// O projeto de fixture não usa os caminhos fixos do template (scripts/test/harness), e por isso a proteção
// precisa vir do acceptance-manifest.json do próprio projeto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseEntry, defaultTemplate, scenario, setupRepo, tapOf, validate, writeManifest } from './a-support.mjs';

const TEST = 'tests/acceptance/caso.test.mjs';
const HELPER = 'tests/acceptance/helper.mjs';
const NAME = '[AC-071] caso de projeto';
const SUITE = 'harness-unit';

// Suíte cujo comando altera um arquivo durante a validação: a alteração deve ser detectada como protegida.
function templateChanging(path) {
  const command = `echo "// alterado" >> ${path}; cat report.tap; exit $(cat exit.code)`;
  const template = defaultTemplate();
  template.checks.test_report = { command, suite: SUITE, format: 'tap' };
  return template;
}

test('[EV-003] teste de aceitação listado no manifesto, fora de policy.json, alterado durante a validação vira protected_change', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-071')],
    tap: tapOf([`ok 1 - ${NAME}`]),
    template: templateChanging(TEST),
    files: { [TEST]: `test('${NAME}', () => {});\n` },
  });
  writeManifest(root, [caseEntry(root, { file: TEST, name: NAME, scenarios: ['AC-071'] })]);
  const result = await validate(root);
  assert.equal(result.stop_reason, 'protected_change', JSON.stringify(result));
  assert.ok(result.protected_changes.includes(TEST), JSON.stringify(result.protected_changes));
});

test('[EV-003] helper declarado no manifesto alterado durante a validação vira protected_change', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-071')],
    tap: tapOf([`ok 1 - ${NAME}`]),
    template: templateChanging(HELPER),
    files: {
      [TEST]: `import { valor } from './helper.mjs';\ntest('${NAME}', () => valor);\n`,
      [HELPER]: 'export const valor = 1;\n',
    },
  });
  writeManifest(root, [caseEntry(root, { file: TEST, name: NAME, scenarios: ['AC-071'], helpers: [HELPER] })]);
  const result = await validate(root);
  assert.equal(result.stop_reason, 'protected_change', JSON.stringify(result));
  assert.ok(result.protected_changes.includes(HELPER), JSON.stringify(result.protected_changes));
});

test('[EV-003] o próprio acceptance-manifest.json alterado durante a validação vira protected_change', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-071')],
    tap: tapOf([`ok 1 - ${NAME}`]),
    template: templateChanging('openspec/changes/add-spec-harness/acceptance-manifest.json'),
    files: { [TEST]: `test('${NAME}', () => {});\n` },
  });
  writeManifest(root, [caseEntry(root, { file: TEST, name: NAME, scenarios: ['AC-071'] })]);
  const result = await validate(root);
  assert.equal(result.stop_reason, 'protected_change', JSON.stringify(result));
});

test('[EV-003] o caminho protegido do manifesto é resolvido pelo projeto, e não pelo template: sem alteração a validação aprova', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-071')],
    tap: tapOf([`ok 1 - ${NAME}`]),
    files: { [TEST]: `test('${NAME}', () => {});\n` },
  });
  writeManifest(root, [caseEntry(root, { file: TEST, name: NAME, scenarios: ['AC-071'] })]);
  const result = await validate(root);
  assert.equal(result.approved, true, JSON.stringify(result.failures));
});
