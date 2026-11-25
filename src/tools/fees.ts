import { FEES, MAX_AMOUNT_CENTS, METHOD_IDS, type MethodId } from './data.ts';
import { CURRENCIES, percentOfCents, type Currency } from './money.ts';

export interface FeeQuote {
  amount_cents: number;
  currency: Currency;
  method: MethodId;
  method_label: string;
  percent_bps: number;
  percent_part_cents: number;
  fixed_cents: number;
  min_cents: number;
  min_applied: boolean;
  fee_cents: number;
  total_cents: number;
}

export type FeeError = { error: string };

/** Fee for one payment. Integer cents in, integer cents out. Rule: percent (half up) + fixed, then the minimum. */
export function quoteFee(amountCents: unknown, currency: unknown, method: unknown): FeeQuote | FeeError {
  if (typeof amountCents !== 'number' || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
    return { error: 'amount_cents must be a whole number of cents, more than 0.' };
  }
  if (amountCents > MAX_AMOUNT_CENTS) return { error: `amount_cents is above the limit of ${MAX_AMOUNT_CENTS} cents.` };
  if (typeof currency !== 'string' || !CURRENCIES.includes(currency as Currency)) {
    return { error: `currency must be one of: ${CURRENCIES.join(', ')}.` };
  }
  if (typeof method !== 'string' || !METHOD_IDS.includes(method as MethodId)) {
    return { error: `method must be one of: ${METHOD_IDS.join(', ')}.` };
  }
  const rule = FEES[method as MethodId];
  const percentPart = percentOfCents(amountCents, rule.percent_bps);
  const raw = percentPart + rule.fixed_cents;
  const fee = Math.max(raw, rule.min_cents);
  return {
    amount_cents: amountCents,
    currency: currency as Currency,
    method: method as MethodId,
    method_label: rule.label,
    percent_bps: rule.percent_bps,
    percent_part_cents: percentPart,
    fixed_cents: rule.fixed_cents,
    min_cents: rule.min_cents,
    min_applied: fee > raw,
    fee_cents: fee,
    total_cents: amountCents + fee,
  };
}
