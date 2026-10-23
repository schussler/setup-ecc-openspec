import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrderTotal } from '../src/pricing.js';

const customer = { orders: 3, tier: 'regular' };

test('soma itens e cobra frete abaixo de 200', () => {
  const result = calculateOrderTotal({ customer, items: [{ sku: 'A', price: 50, quantity: 2 }] });
  assert.deepEqual(result, { subtotal: 100, discount: 0, shipping: 15, total: 115 });
});

test('frete gratis a partir de 200 apos desconto', () => {
  const result = calculateOrderTotal({ customer, items: [{ sku: 'A', price: 100, quantity: 2 }] });
  assert.deepEqual(result, { subtotal: 200, discount: 0, shipping: 0, total: 200 });
});

test('desconto por volume de 10 por cento na linha com 10 unidades', () => {
  const result = calculateOrderTotal({ customer, items: [{ sku: 'A', price: 3, quantity: 10 }, { sku: 'B', price: 5, quantity: 1 }] });
  assert.deepEqual(result, { subtotal: 32, discount: 0, shipping: 15, total: 47 });
});

test('WELCOME10 so vale no primeiro pedido', () => {
  const first = calculateOrderTotal({ coupon: 'WELCOME10', customer: { orders: 0, tier: 'regular' }, items: [{ sku: 'A', price: 50, quantity: 1 }] });
  assert.deepEqual(first, { subtotal: 50, discount: 5, shipping: 15, total: 60 });
  const later = calculateOrderTotal({ coupon: 'WELCOME10', customer, items: [{ sku: 'A', price: 50, quantity: 1 }] });
  assert.equal(later.discount, 0);
});

test('VIP20 so vale para cliente vip', () => {
  const vip = calculateOrderTotal({ coupon: 'VIP20', customer: { orders: 9, tier: 'vip' }, items: [{ sku: 'A', price: 260, quantity: 1 }] });
  assert.deepEqual(vip, { subtotal: 260, discount: 52, shipping: 0, total: 208 });
  const regular = calculateOrderTotal({ coupon: 'VIP20', customer, items: [{ sku: 'A', price: 260, quantity: 1 }] });
  assert.equal(regular.discount, 0);
});

test('cupom nao acumula com desconto por volume', () => {
  const result = calculateOrderTotal({ coupon: 'VIP20', customer: { orders: 9, tier: 'vip' }, items: [{ sku: 'A', price: 10, quantity: 10 }] });
  assert.deepEqual(result, { subtotal: 90, discount: 0, shipping: 15, total: 105 });
});

test('frete gratis considera o valor depois do cupom', () => {
  const result = calculateOrderTotal({ coupon: 'VIP20', customer: { orders: 1, tier: 'vip' }, items: [{ sku: 'A', price: 240, quantity: 1 }] });
  assert.deepEqual(result, { subtotal: 240, discount: 48, shipping: 15, total: 207 });
});

test('arredonda centavos so no resultado', () => {
  const result = calculateOrderTotal({ coupon: 'WELCOME10', customer: { orders: 0, tier: 'regular' }, items: [{ sku: 'A', price: 0.35, quantity: 3 }, { sku: 'B', price: 0.35, quantity: 3 }] });
  assert.deepEqual(result, { subtotal: 2.1, discount: 0.21, shipping: 15, total: 16.89 });
});

test('rejeita pedido sem itens ou item invalido', () => {
  assert.throws(() => calculateOrderTotal({ items: [] }), /must have items/);
  assert.throws(() => calculateOrderTotal({ items: [{ sku: 'Z', price: 1, quantity: 0 }] }), /invalid item Z/);
});
