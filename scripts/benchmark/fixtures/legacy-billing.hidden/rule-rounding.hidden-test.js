import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueInvoice } from '../src/index.js';

const fee = (customerId, unitCents) => issueInvoice(customerId, [{ sku: 'A', quantity: 1, unitCents }], '2026-11-01T10:00:00.000Z');

test('taxa de servico arredonda ao centavo par em centavos inteiros', () => {
  const cases = [
    ['c-100', 1140, 28, 1168],
    ['c-100', 1180, 30, 1210],
    ['c-100', 1000, 25, 1025],
    ['c-400', 1200, 28, 1168],
  ];
  for (const [customerId, unitCents, expectedFee, expectedTotal] of cases) {
    const invoice = fee(customerId, unitCents);
    assert.equal(invoice.serviceFeeCents, expectedFee, `${customerId} ${unitCents}`);
    assert.equal(invoice.totalCents, expectedTotal, `${customerId} ${unitCents}`);
    assert.ok(Number.isInteger(invoice.serviceFeeCents) && Number.isInteger(invoice.totalCents));
  }
});
