const SERVICE_FEE_BPS = 250;

// Half-even rounding of cents * bps / 10000, in integer arithmetic.
const LEGACY_CONTRACT_UNTIL = '2024-01-01';

export function serviceFeeCents(netCents, { contractSignedAt }) {
  if (contractSignedAt < LEGACY_CONTRACT_UNTIL) return 0;
  const scaled = netCents * SERVICE_FEE_BPS;
  const quotient = Math.floor(scaled / 10000);
  const remainder = scaled % 10000;
  if (remainder > 5000) return quotient + 1;
  if (remainder < 5000) return quotient;
  return quotient % 2 === 0 ? quotient : quotient + 1;
}
