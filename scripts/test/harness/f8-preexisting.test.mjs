// Comportamento pré-existente e falha fabricada por mock (F8, AC-009 e AC-010). Os casos vêm de
// testes reais do Node, executados um por arquivo, para que cada saída de falha seja a do próprio caso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordPreexisting } from '../../harness/red.mjs';
import { parseTapCases } from '../../harness/test-report.mjs';
import { runNodeTests } from './f8-support.mjs';

const CHARACTERIZATION_TEST = {
  'calc.mjs': 'export const soma = (a, b) => a + b;\n',
  'calc.test.mjs': "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { soma } from './calc.mjs';\ntest('[AC-009] caracteriza soma atual', () => { assert.equal(soma(2, 3), 5); });\n",
};

// Um caso em arquivo próprio: a saída de falha pertence só a ele.
function caseOf(name, source) {
  const { output } = runNodeTests({ 'caso.test.mjs': source });
  return { name, output };
}

test('[AC-009] caracterização passa no código atual e vira preexisting_pass antes da alteração', () => {
  const { output } = runNodeTests(CHARACTERIZATION_TEST);
  const cases = parseTapCases(output).map((item) => ({ ...item, output }));
  const result = recordPreexisting(cases);
  assert.deepEqual(result.records, [{ name: '[AC-009] caracteriza soma atual', status: 'preexisting_pass' }]);
  assert.equal(result.characterization_needed, false);
});

test('[AC-009] sem nenhum teste adequado, a caracterização é exigida', () => {
  const result = recordPreexisting([]);
  assert.deepEqual(result.records, []);
  assert.equal(result.characterization_needed, true);
});

test('[AC-010] falha por mock que devolve undefined sem asserção de valor vira aviso de mock suspeito, sem mudar o status', () => {
  const failure = caseOf('[AC-010] lê total do valor devolvido', "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nconst dublê = () => undefined;\ntest('[AC-010] lê total do valor devolvido', () => { const r = dublê(); assert.ok(r.total); });\n");
  const result = recordPreexisting([{ ...failure, status: 'fail' }]);
  assert.equal(result.records[0]?.status, 'preexisting_fail');
  assert.equal(result.records[0]?.notice, 'mock suspeito para revisão');
});

test('[AC-010] falha de asserção de valor em comportamento pré-existente não vira invalid_evidence', () => {
  const failure = caseOf('[AC-010] soma errada', "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('[AC-010] soma errada', () => { assert.equal(2 + 3, 6); });\n");
  const result = recordPreexisting([{ ...failure, status: 'fail' }]);
  assert.equal(result.records[0]?.status, 'preexisting_fail');
});
