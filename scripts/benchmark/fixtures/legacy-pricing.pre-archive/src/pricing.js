// Order total calculation. Grew over the years; please keep the totals stable,
// the finance team reconciles invoices against them.
// Discount rules (volume and coupons) live in discounts.js.
import { hasVolumeDiscount, priceLine, resolveCoupon } from './discounts.js';

export function calculateOrderTotal(order) {
  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    throw new Error('order must have items');
  }
  let subtotal = 0;
  for (const item of order.items) {
    if (item.quantity <= 0 || item.price < 0) {
      throw new Error('invalid item ' + item.sku);
    }
    subtotal = subtotal + priceLine(item).amount;
  }
  const volume = hasVolumeDiscount(order.items);
  const { rate } = resolveCoupon({ coupon: order.coupon, customer: order.customer, volume });
  // rate 0 must give exactly 0, also when subtotal is NaN (NaN * 0 is NaN).
  const discount = rate === 0 ? 0 : subtotal * rate;
  const afterDiscount = subtotal - discount;
  let shipping = 15;
  if (afterDiscount >= 200) {
    shipping = 0;
  }
  const total = afterDiscount + shipping;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    shipping,
    total: Math.round(total * 100) / 100,
  };
}
