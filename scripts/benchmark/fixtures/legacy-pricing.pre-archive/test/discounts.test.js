import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrderTotal } from '../src/pricing.js';
import { formatInvoice } from '../src/invoice.js';

const newCustomer = { orders: 0, tier: 'regular' };
const regularCustomer = { orders: 3, tier: 'regular' };
const vipCustomer = { orders: 5, tier: 'vip' };

function invoiceLines(order) {
  return formatInvoice(order).split('\n');
}

test('linha com 10 unidades recebe 10 por cento de volume', () => {
  const order = { items: [{ sku: 'A', price: 3, quantity: 10 }] };
  assert.equal(calculateOrderTotal(order).subtotal, 27);
  assert.equal(invoiceLines(order)[0], 'A x10: 27.00 (volume -10%)');
});

test('linha com 9 unidades fica sem desconto por volume', () => {
  const order = { items: [{ sku: 'A', price: 3, quantity: 9 }] };
  assert.equal(calculateOrderTotal(order).subtotal, 27);
  assert.equal(invoiceLines(order)[0], 'A x9: 27.00');
});

test('WELCOME10 da 10 por cento no primeiro pedido', () => {
  const order = { coupon: 'WELCOME10', customer: newCustomer, items: [{ sku: 'A', price: 50, quantity: 1 }] };
  assert.deepEqual(calculateOrderTotal(order), { subtotal: 50, discount: 5, shipping: 15, total: 60 });
  assert.ok(invoiceLines(order).includes('Desconto (WELCOME10 -10%): -5.00'));
});

test('WELCOME10 nao vale para cliente com pedidos anteriores', () => {
  const order = { coupon: 'WELCOME10', customer: regularCustomer, items: [{ sku: 'A', price: 50, quantity: 1 }] };
  assert.deepEqual(calculateOrderTotal(order), { subtotal: 50, discount: 0, shipping: 15, total: 65 });
  assert.ok(invoiceLines(order).includes('Desconto (WELCOME10 não aplicável): -0.00'));
});

test('WELCOME10 sem cliente nao se aplica', () => {
  const order = { coupon: 'WELCOME10', items: [{ sku: 'A', price: 50, quantity: 1 }] };
  assert.deepEqual(calculateOrderTotal(order), { subtotal: 50, discount: 0, shipping: 15, total: 65 });
  assert.ok(invoiceLines(order).includes('Desconto (WELCOME10 não aplicável): -0.00'));
});

test('VIP20 da 20 por cento para cliente vip', () => {
  const order = { coupon: 'VIP20', customer: vipCustomer, items: [{ sku: 'A', price: 260, quantity: 1 }] };
  assert.deepEqual(calculateOrderTotal(order), { subtotal: 260, discount: 52, shipping: 0, total: 208 });
  assert.ok(invoiceLines(order).includes('Desconto (VIP20 -20%): -52.00'));
});

test('VIP20 nao vale para cliente regular', () => {
  const order = { coupon: 'VIP20', customer: regularCustomer, items: [{ sku: 'A', price: 260, quantity: 1 }] };
  assert.deepEqual(calculateOrderTotal(order), { subtotal: 260, discount: 0, shipping: 0, total: 260 });
  assert.ok(invoiceLines(order).includes('Desconto (VIP20 não aplicável): -0.00'));
});

test('cupom ignorado quando alguma linha tem volume', () => {
  const order = {
    coupon: 'VIP20',
    customer: vipCustomer,
    items: [{ sku: 'A', price: 10, quantity: 10 }, { sku: 'B', price: 50, quantity: 1 }],
  };
  assert.deepEqual(calculateOrderTotal(order), { subtotal: 140, discount: 0, shipping: 15, total: 155 });
  assert.ok(invoiceLines(order).includes('Desconto (VIP20 não acumula com volume): -0.00'));
});

test('cupom desconhecido com volume mostra nao acumula', () => {
  const order = { coupon: 'BLACK50', items: [{ sku: 'A', price: 10, quantity: 10 }] };
  assert.deepEqual(calculateOrderTotal(order), { subtotal: 90, discount: 0, shipping: 15, total: 105 });
  assert.ok(invoiceLines(order).includes('Desconto (BLACK50 não acumula com volume): -0.00'));
});

test('cupom desconhecido nao da desconto', () => {
  const order = { coupon: 'BLACK50', customer: regularCustomer, items: [{ sku: 'A', price: 50, quantity: 1 }] };
  assert.deepEqual(calculateOrderTotal(order), { subtotal: 50, discount: 0, shipping: 15, total: 65 });
  assert.ok(invoiceLines(order).includes('Desconto (BLACK50 não aplicável): -0.00'));
});

test('codigo de cupom diferencia maiusculas', () => {
  const order = { coupon: 'vip20', customer: vipCustomer, items: [{ sku: 'A', price: 260, quantity: 1 }] };
  assert.deepEqual(calculateOrderTotal(order), { subtotal: 260, discount: 0, shipping: 0, total: 260 });
  assert.ok(invoiceLines(order).includes('Desconto (vip20 não aplicável): -0.00'));
});

test('pedido sem cupom mostra sem cupom', () => {
  const order = { customer: regularCustomer, items: [{ sku: 'A', price: 50, quantity: 1 }] };
  assert.deepEqual(calculateOrderTotal(order), { subtotal: 50, discount: 0, shipping: 15, total: 65 });
  assert.ok(invoiceLines(order).includes('Desconto (sem cupom): -0.00'));
});

test('cupom vazio e tratado como sem cupom', () => {
  const order = { coupon: '', customer: regularCustomer, items: [{ sku: 'A', price: 50, quantity: 1 }] };
  assert.deepEqual(calculateOrderTotal(order), { subtotal: 50, discount: 0, shipping: 15, total: 65 });
  assert.ok(invoiceLines(order).includes('Desconto (sem cupom): -0.00'));
});

test('frete cobrado quando o cupom deixa o valor abaixo de 200', () => {
  const order = { coupon: 'VIP20', customer: vipCustomer, items: [{ sku: 'A', price: 240, quantity: 1 }] };
  assert.deepEqual(calculateOrderTotal(order), { subtotal: 240, discount: 48, shipping: 15, total: 207 });
});

test('frete gratis quando o cupom deixa o valor em 200', () => {
  const order = { coupon: 'VIP20', customer: vipCustomer, items: [{ sku: 'A', price: 250, quantity: 1 }] };
  assert.deepEqual(calculateOrderTotal(order), { subtotal: 250, discount: 50, shipping: 0, total: 200 });
});

test('subtotal arredondado uma vez e nao por linha', () => {
  const order = { items: [{ sku: 'A', price: 0.125, quantity: 1 }, { sku: 'B', price: 0.125, quantity: 1 }] };
  assert.deepEqual(calculateOrderTotal(order), { subtotal: 0.25, discount: 0, shipping: 15, total: 15.25 });
});

test('fatura completa com volume e sem cupom', () => {
  const order = { items: [{ sku: 'A', price: 3, quantity: 10 }, { sku: 'B', price: 5, quantity: 1 }] };
  const expected = [
    'A x10: 27.00 (volume -10%)',
    'B x1: 5.00',
    'Subtotal: 32.00',
    'Desconto (sem cupom): -0.00',
    'Frete: 15.00',
    'Total: 47.00',
  ].join('\n');
  assert.equal(formatInvoice(order), expected);
});

test('fatura rejeita pedido sem itens', () => {
  assert.throws(() => formatInvoice({ items: [] }), { message: 'order must have items' });
});

test('fatura rejeita item com preco negativo', () => {
  assert.throws(() => formatInvoice({ items: [{ sku: 'Z', price: -1, quantity: 1 }] }), { message: 'invalid item Z' });
});
