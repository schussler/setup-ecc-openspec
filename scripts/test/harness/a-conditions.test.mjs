// Condições de não aplicabilidade, exceção humana e relatório de condição não avaliada (A.5, D30, AC-021, AC-027).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_TAP, allowExceptions, exceptionRecord, humanRecord, purposeRecord, scenario, setupRepo, validate } from './a-support.mjs';

test('[AC-027] condição de disparo não reconhecida vira obrigatória e o relatório informa que não foi avaliada', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-041', { notApplicable: true, trigger: 'quando o time estiver disponível', approval: 'auth:na-041' })],
    tap: EMPTY_TAP,
    authorizations: [humanRecord('na-041', 'revision', { scenario: 'AC-041', revision: 1 })],
  });
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.ok(JSON.stringify(result).includes('condição não avaliada: quando o time estiver disponível'), JSON.stringify(result));
});

test('[AC-021] condição "quando houver chamada paga" com contagem de chamadas pagas zero deixa o cenário não aplicável', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-042', { notApplicable: true, trigger: 'quando houver chamada paga', approval: 'auth:na-042' })],
    tap: EMPTY_TAP,
    authorizations: [humanRecord('na-042', 'revision', { scenario: 'AC-042', revision: 1 })],
  });
  const result = await validate(root, { paidCalls: 0 });
  assert.equal(result.approved, true, JSON.stringify(result.failures));
});

test('[AC-021] condição "quando houver chamada paga" sem informação de chamadas é condição não avaliada e obrigatória', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-042', { notApplicable: true, trigger: 'quando houver chamada paga', approval: 'auth:na-042' })],
    tap: EMPTY_TAP,
    authorizations: [humanRecord('na-042', 'revision', { scenario: 'AC-042', revision: 1 })],
  });
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.ok(JSON.stringify(result).includes('condição não avaliada: quando houver chamada paga'));
});

test('[D30] exceção humana (purpose exception) torna não obrigatório um cenário cuja condição é verdadeira', async () => {
  const root = setupRepo({
    scenarios: [scenario('AC-043', { notApplicable: true, trigger: 'quando houver formato tap', approval: 'auth:na-043' })],
    tap: EMPTY_TAP,
    authorizations: [
      humanRecord('na-043', 'revision', { scenario: 'AC-043', revision: 1 }),
      exceptionRecord('exc-043', { scenario: 'AC-043' }, 'excecao-teste'),
    ],
  });
  allowExceptions(root, ['excecao-teste']);
  const result = await validate(root);
  assert.equal(result.approved, true, JSON.stringify(result.failures));
});
