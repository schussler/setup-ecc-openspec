import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueInvoice } from '../src/index.js';

test('contrato legado e isento da taxa de servico', () => {
  const regular = issueInvoice('c-300', [{ sku: 'A', quantity: 1, unitCents: 1000 }], '2026-11-01T10:00:00.000Z');
  assert.equal(regular.serviceFeeCents, 0);
  assert.equal(regular.totalCents, 1000);
  const gold = issueInvoice('c-200', [{ sku: 'A', quantity: 1, unitCents: 2000 }], '2026-11-01T10:00:00.000Z');
  assert.equal(gold.serviceFeeCents, 0);
  assert.equal(gold.totalCents, 1900);
  const payer = issueInvoice('c-100', [{ sku: 'A', quantity: 1, unitCents: 1000 }], '2026-11-01T10:00:00.000Z');
  assert.ok(payer.serviceFeeCents > 0, 'cliente com contrato a partir de 2024 paga a taxa');
});
