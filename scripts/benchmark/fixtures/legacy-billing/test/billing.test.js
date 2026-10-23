import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInvoice } from '../src/billing/invoice.js';

test('fatura soma as linhas em centavos', () => {
  const invoice = createInvoice({ customerId: 'c-100', tier: 'regular', items: [{ sku: 'A', quantity: 2, unitCents: 1250 }, { sku: 'B', quantity: 1, unitCents: 99 }], issuedAt: '2026-11-01T10:00:00.000Z' });
  assert.equal(invoice.subtotalCents, 2599);
  assert.equal(invoice.discountCents, 0);
  assert.equal(invoice.totalCents, 2599);
});

test('cliente gold tem 5 por cento de desconto arredondado para baixo', () => {
  const invoice = createInvoice({ customerId: 'c-400', tier: 'gold', items: [{ sku: 'A', quantity: 1, unitCents: 1999 }], issuedAt: '2026-11-01T10:00:00.000Z' });
  assert.equal(invoice.discountCents, 99);
  assert.equal(invoice.totalCents, 1900);
});

test('fatura rejeita itens invalidos', () => {
  assert.throws(() => createInvoice({ customerId: 'c-100', tier: 'regular', items: [], issuedAt: 'x' }), /needs items/);
  assert.throws(() => createInvoice({ customerId: 'c-100', tier: 'regular', items: [{ sku: 'A', quantity: 0, unitCents: 1 }], issuedAt: 'x' }), /invalid quantity/);
  assert.throws(() => createInvoice({ customerId: 'c-100', tier: 'regular', items: [{ sku: 'A', quantity: 1, unitCents: 1.5 }], issuedAt: 'x' }), /invalid price/);
});
