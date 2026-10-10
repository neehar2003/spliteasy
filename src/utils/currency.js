// All monetary amounts are handled internally as integer paise (1 rupee = 100 paise)
// to avoid floating point rounding errors. Rupee values are only used at the
// UI boundary (form inputs and display).

export const PAISE_PER_RUPEE = 100;

/** Convert a rupee amount (number or numeric string) to integer paise. */
export function rupeesToPaise(rupees) {
  const n = typeof rupees === 'string' ? parseFloat(rupees) : rupees;
  if (!Number.isFinite(n)) return NaN;
  // Round to avoid binary float artifacts like 19.99 * 100 = 1998.9999999998
  return Math.round(n * PAISE_PER_RUPEE);
}

/** Convert integer paise to a rupee number. */
export function paiseToRupees(paise) {
  return paise / PAISE_PER_RUPEE;
}

/** Format integer paise as an INR currency string, e.g. "₹1,234.50". */
export function formatPaise(paise, { showSign = false } = {}) {
  if (!Number.isFinite(paise)) return '₹0.00';
  const rupees = paiseToRupees(Math.abs(paise));
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
  const sign = paise < 0 ? '-' : showSign && paise > 0 ? '+' : '';
  return `${sign}${formatted}`;
}

/**
 * Split an integer amount in paise into `count` shares as evenly as possible.
 * The sum of the returned shares always equals the original amount exactly;
 * any leftover paise (from division remainder) are distributed one-by-one to
 * the first shares so no money is created or lost.
 */
export function splitEqually(totalPaise, count) {
  if (count <= 0) return [];
  const base = Math.floor(totalPaise / count);
  const remainder = totalPaise - base * count;
  const shares = new Array(count).fill(base);
  for (let i = 0; i < remainder; i++) {
    shares[i] += 1;
  }
  return shares;
}

/**
 * Split an integer amount in paise by percentages (0-100, may have decimals).
 * Percentages must sum to 100 (checked by caller/validation). Rounding
 * leftovers are assigned to the largest shares first to keep the exact total.
 */
export function splitByPercentage(totalPaise, percentages) {
  const raw = percentages.map((p) => (totalPaise * p) / 100);
  const floors = raw.map((r) => Math.floor(r));
  let allocated = floors.reduce((a, b) => a + b, 0);
  let remainder = totalPaise - allocated;

  const order = raw
    .map((r, i) => ({ i, frac: r - floors[i] }))
    .sort((a, b) => b.frac - a.frac);

  const shares = [...floors];
  for (let k = 0; k < remainder; k++) {
    shares[order[k % order.length].i] += 1;
  }
  return shares;
}
