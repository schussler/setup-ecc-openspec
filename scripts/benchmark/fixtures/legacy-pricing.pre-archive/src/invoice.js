import { hasVolumeDiscount, priceLine, resolveCoupon } from './discounts.js';
import { calculateOrderTotal } from './pricing.js';

// Text invoice. Line amounts and the discount label come from the rules in
// discounts.js; the totals always come from calculateOrderTotal.
export function formatInvoice(order) {
  const totals = calculateOrderTotal(order);
  const lines = order.items.map((item) => {
    const { amount, volume } = priceLine(item);
    const note = volume ? ' (volume -10%)' : '';
    return `${item.sku} x${item.quantity}: ${amount.toFixed(2)}${note}`;
  });
  const volume = hasVolumeDiscount(order.items);
  const { label } = resolveCoupon({ coupon: order.coupon, customer: order.customer, volume });
  return [
    ...lines,
    `Subtotal: ${totals.subtotal.toFixed(2)}`,
    `Desconto (${label}): -${totals.discount.toFixed(2)}`,
    `Frete: ${totals.shipping.toFixed(2)}`,
    `Total: ${totals.total.toFixed(2)}`,
  ].join('\n');
}
