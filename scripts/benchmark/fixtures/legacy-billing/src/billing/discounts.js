// Gold customers get 5% off the subtotal, rounded down to the cent.
export function tierDiscountCents(subtotalCents, tier) {
  return tier === 'gold' ? Math.floor((subtotalCents * 5) / 100) : 0;
}
