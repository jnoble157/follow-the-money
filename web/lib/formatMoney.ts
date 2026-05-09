// Newsroom register for amounts. Always grouped, never rounded in prose.
// Compact form ($1.18M) is allowed only on chart axes; we expose it explicitly
// so callers have to ask for it.

export function formatMoney(
  amount: number,
  options: { compact?: boolean; cents?: boolean } = {},
): string {
  const { compact = false, cents = false } = options;
  if (compact) {
    if (Math.abs(amount) >= 1_000_000) {
      return `$${(amount / 1_000_000).toFixed(2)}M`;
    }
    if (Math.abs(amount) >= 1_000) {
      return `$${(amount / 1_000).toFixed(0)}k`;
    }
    return `$${amount.toFixed(0)}`;
  }
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}
