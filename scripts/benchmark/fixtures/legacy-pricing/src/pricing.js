// Order total calculation. Grew over the years; please keep the totals stable,
// the finance team reconciles invoices against them.

export function calculateOrderTotal(order) {
  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    throw new Error('order must have items');
  }
  let subtotal = 0;
  let bulk = false;
  for (const item of order.items) {
    if (item.quantity <= 0 || item.price < 0) {
      throw new Error('invalid item ' + item.sku);
    }
    let line = item.price * item.quantity;
    if (item.quantity >= 10) {
      line = line - line * 0.1;
      bulk = true;
    }
    subtotal = subtotal + line;
  }
  let discount = 0;
  if (order.coupon && !bulk) {
    if (order.coupon === 'WELCOME10') {
      if (order.customer && order.customer.orders === 0) {
        discount = subtotal * 0.1;
      }
    } else if (order.coupon === 'VIP20') {
      if (order.customer && order.customer.tier === 'vip') {
        discount = subtotal * 0.2;
      }
    }
  }
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
