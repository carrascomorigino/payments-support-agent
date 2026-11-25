// Money helpers. All amounts are integer cents. No floats touch money.
// Rounding rule (one rule, everywhere): a percent fee is rounded half up to the cent.
// Example: 1046.5 cents -> 1047 cents; 1046.49 cents -> 1046 cents.

export type Currency = 'PEN' | 'USD';
export const CURRENCIES: readonly Currency[] = ['PEN', 'USD'];

const SYMBOL: Record<Currency, string> = { PEN: 'S/', USD: 'US$' };

/** amount * bps / 10000, rounded half up. Inputs must be non-negative safe integers. */
export function percentOfCents(amountCents: number, bps: number): number {
  if (!Number.isSafeInteger(amountCents) || !Number.isSafeInteger(bps) || amountCents < 0 || bps < 0) {
    throw new RangeError('percentOfCents needs non-negative integers');
  }
  // Integer math: floor((a*b + 5000) / 10000) is round half up for non-negative values.
  return Math.floor((amountCents * bps + 5000) / 10000);
}

/** 12345 PEN -> "S/ 123.45". */
export function formatMoney(cents: number, currency: Currency): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const units = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}${SYMBOL[currency]} ${units}.${rest}`;
}

/** 350 bps -> "3.5%". */
export function formatBps(bps: number): string {
  const whole = Math.floor(bps / 100);
  const frac = String(bps % 100).padStart(2, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}%` : `${whole}%`;
}

/** "250", "250.5", "250.50", "1,250.00" -> cents. String parsing only (no parseFloat). Returns null if not valid. */
export function parseAmountToCents(text: string): number | null {
  const m = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const units = Number(m[1].replace(/,/g, ''));
  const frac = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  const cents = units * 100 + frac;
  return Number.isSafeInteger(cents) ? cents : null;
}
