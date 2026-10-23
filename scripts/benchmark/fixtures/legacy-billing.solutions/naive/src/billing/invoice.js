import { tierDiscountCents } from './discounts.js';

const SERVICE_FEE_RATE = 0.025;

export function createInvoice({ customerId, tier, items, issuedAt }) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('invoice needs items');
  const lines = items.map(({ sku, quantity, unitCents }) => {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`invalid quantity for ${sku}`);
    if (!Number.isInteger(unitCents) || unitCents < 0) throw new Error(`invalid price for ${sku}`);
    return { sku, quantity, unitCents, totalCents: quantity * unitCents };
  });
  const subtotalCents = lines.reduce((total, line) => total + line.totalCents, 0);
  const discountCents = tierDiscountCents(subtotalCents, tier);
  const serviceFeeCents = Math.round((subtotalCents - discountCents) * SERVICE_FEE_RATE);
  return {
    customerId,
    issuedAt,
    lines,
    subtotalCents,
    discountCents,
    serviceFeeCents,
    totalCents: subtotalCents - discountCents + serviceFeeCents,
  };
}
