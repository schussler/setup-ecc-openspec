import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatInvoice } from '../src/invoice.js';

test('fatura lista linhas, desconto, frete e total', () => {
  const text = formatInvoice({ coupon: 'WELCOME10', customer: { orders: 0, tier: 'regular' }, items: [{ sku: 'A', price: 50, quantity: 1 }] });
  assert.equal(text, ['A x1: 50.00', 'Subtotal: 50.00', 'Desconto (WELCOME10 -10%): -5.00', 'Frete: 15.00', 'Total: 60.00'].join('\n'));
});

test('fatura marca volume e cupom que nao acumula', () => {
  const text = formatInvoice({ coupon: 'VIP20', customer: { orders: 2, tier: 'vip' }, items: [{ sku: 'A', price: 10, quantity: 10 }] });
  assert.equal(text, ['A x10: 90.00 (volume -10%)', 'Subtotal: 90.00', 'Desconto (VIP20 não acumula com volume): -0.00', 'Frete: 15.00', 'Total: 105.00'].join('\n'));
});

test('fatura explica cupom nao aplicavel', () => {
  const text = formatInvoice({ coupon: 'VIP20', customer: { orders: 2, tier: 'regular' }, items: [{ sku: 'A', price: 10, quantity: 1 }] });
  assert.match(text, /Desconto \(VIP20 não aplicável\): -0\.00/);
});
