// Classificação de falha de RED (F8, D10, AC-007 e AC-008). As saídas de falha vêm de testes
// reais do Node, executados em pasta temporária, além de fixtures de mensagens conhecidas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptRed, classifyRedFailure } from '../../harness/red.mjs';
import { runNodeTests } from './f8-support.mjs';

const MISSING_MODULE_TEST = {
  'caso.test.mjs': "import { nada } from './inexistente.mjs';\nimport { test } from 'node:test';\ntest('[AC-007] usa módulo', () => { nada(); });\n",
};
const FAILING_ASSERTION_TEST = {
  'caso.test.mjs': "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\ntest('[AC-008] soma', () => { assert.equal(1 + 1, 3); });\n",
};

test('[AC-007] falha real com Cannot find module é environment e não conta como RED', () => {
  const { code, output } = runNodeTests(MISSING_MODULE_TEST);
  assert.notEqual(code, 0);
  assert.match(output, /Cannot find module|ERR_MODULE_NOT_FOUND/);
  assert.equal(classifyRedFailure(output), 'environment');
  assert.equal(acceptRed({ name: '[AC-007] usa módulo', output }).accepted, false);
});

test('[AC-007] erros de módulo, sintaxe, importação e configuração são environment', () => {
  const fixtures = [
    "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'zod' imported from /repo/x.mjs",
    "SyntaxError: Unexpected token '}'",
    'Error [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts"',
    'sh: jest: command not found',
    'ConfigError: checks.test_report.format "junit" não é suportado',
    'Erro de importação: export nomeado inexistente',
  ];
  for (const output of fixtures) assert.equal(classifyRedFailure(output), 'environment', output);
});

test('[AC-007] entrada ambígua ou vazia é environment por segurança', () => {
  assert.equal(classifyRedFailure(''), 'environment');
  assert.equal(classifyRedFailure(undefined), 'environment');
  assert.equal(classifyRedFailure('algo deu errado'), 'environment');
});

test('[AC-007] assertion e erro de módulo na mesma saída: environment tem precedência', () => {
  const output = "AssertionError [ERR_ASSERTION]: expected 1\nCannot find module '/x/y.mjs'";
  assert.equal(classifyRedFailure(output), 'environment');
});

test('[AC-007] stub NotImplemented sem asserção de comportamento não conta como RED', () => {
  const output = 'Error: NotImplemented\n    at classifyRedFailure (red.mjs:1:1)';
  const result = acceptRed({ name: '[AC-007] stub', output });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'not_implemented');
});

test('[AC-008] falha real de asserção é behavioral e conta como RED', () => {
  const { code, output } = runNodeTests(FAILING_ASSERTION_TEST);
  assert.notEqual(code, 0);
  assert.equal(classifyRedFailure(output), 'behavioral');
  assert.equal(acceptRed({ name: '[AC-008] soma', output }).accepted, true);
});

test('[AC-008] AssertionError com expected e actual é behavioral', () => {
  const output = 'AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:\n\n1 !== 2\n';
  assert.equal(classifyRedFailure(output), 'behavioral');
});

test('[AC-008] valor esperado e valor obtido em lista de diagnóstico são behavioral', () => {
  const output = "  expected: 3\n  actual: 2\n  operator: 'strictEqual'";
  assert.equal(classifyRedFailure(output), 'behavioral');
});
