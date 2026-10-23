import { calculateOrderTotal } from './pricing.js';

// Text invoice. The discount label repeats the coupon rules from pricing.js so
// the invoice can explain which discount was applied.
export function formatInvoice(order) {
  const totals = calculateOrderTotal(order);
  const lines = order.items.map((item) => {
    let line = item.price * item.quantity;
    let note = '';
    if (item.quantity >= 10) {
      line = line - line * 0.1;
      note = ' (volume -10%)';
    }
    return `${item.sku} x${item.quantity}: ${line.toFixed(2)}${note}`;
  });
  let label = 'sem cupom';
  const bulk = order.items.some((item) => item.quantity >= 10);
  if (order.coupon && !bulk) {
    if (order.coupon === 'WELCOME10' && order.customer && order.customer.orders === 0) {
      label = 'WELCOME10 -10%';
    } else if (order.coupon === 'VIP20' && order.customer && order.customer.tier === 'vip') {
      label = 'VIP20 -20%';
    } else {
      label = `${order.coupon} não aplicável`;
    }
  } else if (order.coupon && bulk) {
    label = `${order.coupon} não acumula com volume`;
  }
  return [
    ...lines,
    `Subtotal: ${totals.subtotal.toFixed(2)}`,
    `Desconto (${label}): -${totals.discount.toFixed(2)}`,
    `Frete: ${totals.shipping.toFixed(2)}`,
    `Total: ${totals.total.toFixed(2)}`,
  ].join('\n');
}
