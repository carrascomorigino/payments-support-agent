import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { quoteFee, type FeeQuote } from '../src/tools/fees.ts';
import { PAYMENTS, METHOD_IDS, MAX_AMOUNT_CENTS } from '../src/tools/data.ts';
import { formatBps, formatMoney, parseAmountToCents, percentOfCents } from '../src/tools/money.ts';

const ok = (r: ReturnType<typeof quoteFee>) => {
  if ('error' in r) throw new Error(r.error);
  return r as FeeQuote;
};

describe('money helpers', () => {
  it('rounds half up to the cent', () => {
    expect(percentOfCents(29900, 350)).toBe(1047); // 1046.5
    expect(percentOfCents(8990, 350)).toBe(315); // 314.65
    expect(percentOfCents(4230, 150)).toBe(63); // 63.45
    expect(percentOfCents(1, 4999)).toBe(0); // 0.4999
    expect(percentOfCents(1, 5000)).toBe(1); // 0.5
  });
  it('matches exact BigInt rounding for any amount (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_AMOUNT_CENTS }), fc.integer({ min: 0, max: 10000 }), (a, bps) => {
        const expected = Number((BigInt(a) * BigInt(bps) + 5000n) / 10000n);
        expect(percentOfCents(a, bps)).toBe(expected);
      }),
    );
  });
  it('formats and parses without floats', () => {
    expect(formatMoney(12345, 'PEN')).toBe('S/ 123.45');
    expect(formatMoney(5, 'USD')).toBe('US$ 0.05');
    expect(formatBps(350)).toBe('3.5%');
    expect(formatBps(150)).toBe('1.5%');
    expect(formatBps(200)).toBe('2%');
    expect(parseAmountToCents('250')).toBe(25000);
    expect(parseAmountToCents('0.1')).toBe(10);
    expect(parseAmountToCents('1,250.05')).toBe(125005);
    expect(parseAmountToCents('1.234')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
  });
  it('parse(format(x)) gives x back (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (c) => {
        expect(parseAmountToCents(formatMoney(c, 'PEN').slice(3))).toBe(c);
      }),
    );
  });
});

describe('quote_fee', () => {
  it('each method follows its rule', () => {
    expect(ok(quoteFee(25000, 'PEN', 'wallet_balance')).fee_cents).toBe(0);
    expect(ok(quoteFee(25000, 'PEN', 'debit_card')).fee_cents).toBe(375);
    expect(ok(quoteFee(25000, 'PEN', 'credit_card')).fee_cents).toBe(975);
    expect(ok(quoteFee(25000, 'PEN', 'bank_transfer')).fee_cents).toBe(200);
  });
  it('applies the debit minimum', () => {
    const q = ok(quoteFee(1800, 'PEN', 'debit_card'));
    expect(q.percent_part_cents).toBe(27);
    expect(q.min_applied).toBe(true);
    expect(q.fee_cents).toBe(50);
  });
  it('rejects bad input', () => {
    for (const bad of [0, -5, 1.5, '100', NaN, MAX_AMOUNT_CENTS + 1]) expect(quoteFee(bad, 'PEN', 'debit_card')).toHaveProperty('error');
    expect(quoteFee(100, 'EUR', 'debit_card')).toHaveProperty('error');
    expect(quoteFee(100, 'PEN', 'crypto')).toHaveProperty('error');
  });
  it('fee is a whole number, at least the minimum, and total = amount + fee (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_AMOUNT_CENTS }), fc.constantFrom(...METHOD_IDS), fc.constantFrom('PEN', 'USD'), (a, m, c) => {
        const q = ok(quoteFee(a, c, m));
        expect(Number.isSafeInteger(q.fee_cents)).toBe(true);
        expect(q.fee_cents).toBeGreaterThanOrEqual(q.min_cents);
        expect(q.total_cents).toBe(a + q.fee_cents);
      }),
    );
  });
  it('every fee in data/payments.json follows the fee table', () => {
    for (const p of PAYMENTS) expect(ok(quoteFee(p.amount_cents, p.currency, p.method)).fee_cents, p.id).toBe(p.fee_cents);
  });
});
