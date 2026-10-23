import { findCustomer } from './customers.js';
import { createInvoice } from './billing/invoice.js';
import { sendInvoiceEmail } from './notifications/email.js';

export function issueInvoice(customerId, items, issuedAt = new Date().toISOString()) {
  const customer = findCustomer(customerId);
  const invoice = createInvoice({ customerId, tier: customer.tier, legacyContract: customer.legacyContract, items, issuedAt });
  sendInvoiceEmail(invoice, customer);
  return invoice;
}
