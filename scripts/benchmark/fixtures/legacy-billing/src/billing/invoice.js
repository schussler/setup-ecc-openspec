import { tierDiscountCents } from './discounts.js';

export function createInvoice({ customerId, tier, items, issuedAt }) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('invoice needs items');
  const lines = items.map(({ sku, quantity, unitCents }) => {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`invalid quantity for ${sku}`);
    if (!Number.isInteger(unitCents) || unitCents < 0) throw new Error(`invalid price for ${sku}`);
    return { sku, quantity, unitCents, totalCents: quantity * unitCents };
  });
  const subtotalCents = lines.reduce((total, line) => total + line.totalCents, 0);
  const discountCents = tierDiscountCents(subtotalCents, tier);
  return {
    customerId,
    issuedAt,
    lines,
    subtotalCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
  };
}
