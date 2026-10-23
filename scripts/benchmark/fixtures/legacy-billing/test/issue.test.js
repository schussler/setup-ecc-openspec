import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueInvoice } from '../src/index.js';
import { sentEmails } from '../src/notifications/email.js';

test('emite fatura e envia e-mail ao cliente', () => {
  const invoice = issueInvoice('c-400', [{ sku: 'A', quantity: 1, unitCents: 2000 }], '2026-11-01T10:00:00.000Z');
  assert.equal(invoice.discountCents, 100);
  const last = sentEmails().at(-1);
  assert.equal(last.to, 'diego@example.com');
  assert.equal(last.subject, 'Sua fatura de 2026-11-01');
  assert.match(last.body, /Cliente desde 2025\./);
  assert.match(last.body, /^Total: R\$ \d+,\d{2}$/m);
});

test('cliente desconhecido e rejeitado', () => {
  assert.throws(() => issueInvoice('c-999', [{ sku: 'A', quantity: 1, unitCents: 1 }]), /unknown customer c-999/);
});
