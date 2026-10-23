// Discount rules: volume per line and coupons. Single owner of these rules;
// pricing.js and invoice.js use them. Inputs are already validated by
// calculateOrderTotal. No rounding here: it happens once, in the result.

export const VOLUME_MIN_QUANTITY = 10;
export const VOLUME_RATE = 0.1;

const COUPONS = Object.freeze({
  WELCOME10: Object.freeze({
    rate: 0.1,
    label: 'WELCOME10 -10%',
    isEligible: (customer) => customer.orders === 0,
  }),
  VIP20: Object.freeze({
    rate: 0.2,
    label: 'VIP20 -20%',
    isEligible: (customer) => customer.tier === 'vip',
  }),
});

/**
 * Line amount (`price * quantity`), with the volume discount applied.
 * @param {{ price: number, quantity: number }} item
 * @returns {{ amount: number, volume: boolean }}
 */
export function priceLine(item) {
  const line = item.price * item.quantity;
  if (item.quantity >= VOLUME_MIN_QUANTITY) {
    return { amount: line - line * VOLUME_RATE, volume: true };
  }
  return { amount: line, volume: false };
}

/**
 * @param {Array<{ quantity: number }>} items
 * @returns {boolean} true when any line gets the volume discount
 */
export function hasVolumeDiscount(items) {
  return items.some((item) => item.quantity >= VOLUME_MIN_QUANTITY);
}

/**
 * Coupon rate and invoice label. Rate is 0 when the coupon does not apply.
 * @param {{ coupon?: string, customer?: { orders?: number, tier?: string }, volume: boolean }} input
 * @returns {{ rate: number, label: string }}
 */
export function resolveCoupon({ coupon, customer, volume }) {
  if (!coupon) {
    return { rate: 0, label: 'sem cupom' };
  }
  if (volume) {
    return { rate: 0, label: `${coupon} não acumula com volume` };
  }
  const rule = Object.hasOwn(COUPONS, coupon) ? COUPONS[coupon] : undefined;
  if (rule && customer && rule.isEligible(customer)) {
    return { rate: rule.rate, label: rule.label };
  }
  return { rate: 0, label: `${coupon} não aplicável` };
}
