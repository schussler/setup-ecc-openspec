// Heurística de mock como aviso para revisão humana (A.3, item D, AC-010): não comprova conformidade,
// não aprova e não reprova, e não muda o status do caso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordPreexisting } from '../../harness/red.mjs';

const MOCK_OUTPUT = "TypeError: Cannot read properties of undefined (reading 'total')\n";

test('[AC-010] falha com sinal de mock gera o aviso "mock suspeito para revisão" sem mudar o status do caso', () => {
  const result = recordPreexisting([{ name: '[AC-010] lê total', status: 'fail', output: MOCK_OUTPUT }]);
  const [record] = result.records;
  assert.equal(record.status, 'preexisting_fail', JSON.stringify(record));
  assert.equal(record.notice, 'mock suspeito para revisão');
});

test('[AC-010] o aviso de mock não aprova: caso que passa continua preexisting_pass sem aviso', () => {
  const result = recordPreexisting([{ name: '[AC-010] lê total', status: 'pass', output: MOCK_OUTPUT }]);
  assert.equal(result.records[0].status, 'preexisting_pass');
  assert.equal(result.records[0].notice ?? null, null);
});
