import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { guardCards, luhnValid } from '../src/tools/cardGuard.ts';

// Public test card numbers from card networks' documentation (not real cards).
const TEST_CARDS = ['4111111111111111', '5555555555554444', '378282246310005', '6011111111111117', '4242424242424242'];

function group(d: string, sep: string, size = 4) {
  return d.match(new RegExp(`.{1,${size}}`, 'g'))!.join(sep);
}

// Make a Luhn-valid number of a given length (for property tests).
function withCheckDigit(body: string): string {
  for (let d = 0; d <= 9; d++) if (luhnValid(body + d)) return body + d;
  throw new Error('unreachable');
}

describe('card guard', () => {
  it('masks public test cards: plain, with spaces, with dashes', () => {
    for (const c of TEST_CARDS) {
      for (const text of [c, group(c, ' '), group(c, '-')]) {
        const r = guardCards(`my card is ${text}, help`);
        expect(r.text).toBe(`my card is •••• ${c.slice(-4)}, help`);
        expect(r.masked).toEqual([c.slice(-4)]);
      }
    }
  });
  it('masks a card next to a date or another number in the same run', () => {
    const r = guardCards('on 2026-11-20 4111 1111 1111 1111 twice');
    expect(r.text).toBe('on 2026-11-20 •••• 1111 twice');
    const two = guardCards('cards 4111 1111 1111 1111 5555 5555 5555 4444');
    expect(two.masked).toEqual(['1111', '4444']);
    expect(two.text).toBe('cards •••• 1111 •••• 4444');
  });
  it('keeps dates, amounts, payment IDs and phone numbers', () => {
    const text = 'QP-DEMO-0007 on 2026-11-12 for S/ 1,299.00, call 987 654 321';
    expect(guardCards(text)).toEqual({ text, masked: [] });
  });
  it('keeps digit runs that fail the Luhn check', () => {
    expect(guardCards('4111 1111 1111 1112').masked).toEqual([]);
  });
  it('masks any Luhn-valid 13-19 digit number with any grouping (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 13, max: 19 }).chain((n) => fc.tuple(fc.stringMatching(new RegExp(`^4\\d{${n - 2}}$`)), fc.constantFrom('', ' ', '-'), fc.integer({ min: 3, max: 6 }))),
        ([body, sep, size]) => {
          const card = withCheckDigit(body);
          const shown = sep ? group(card, sep, size) : card;
          const r = guardCards(`pay ${shown} now`);
          expect(r.text).not.toMatch(/\d{5,}/);
          expect(r.text.replace(/\D/g, '')).toBe(card.slice(-4));
        },
      ),
    );
  });
  it('never changes text with no long digit runs (property)', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const t = s.replace(/\d{5,}/g, '');
        if ((t.match(/\d/g) ?? []).length >= 13) return;
        expect(guardCards(t).text).toBe(t);
      }),
    );
  });
  it('running it twice changes nothing more', () => {
    const once = guardCards('4111-1111-1111-1111').text;
    expect(guardCards(once).text).toBe(once);
  });
});

describe('card guard, critics pass', () => {
  it('masks odd separators and full-width digits', () => {
    for (const t of ['4111  1111 1111 1111', '4111 - 1111 - 1111 - 1111', '4111/1111/1111/1111', '4111_1111_1111_1111', '4111\n1111\n1111\n1111', '4111 1111 1111 1111', '４１１１１１１１１１１１１１１１']) {
      expect(guardCards(`card ${t} ok`).masked).toEqual(['1111']);
    }
  });
  it('does not mask two dates or two phone numbers', () => {
    expect(guardCards('2026-04-01 2026-11-12').masked).toEqual([]);
    expect(guardCards('987 654 321 987 654 321').masked).toEqual([]);
  });
  it('stays fast on a very long digit run', () => {
    const long = Array.from({ length: 5000 }, (_, i) => String(1000 + (i % 9000))).join(' ');
    const t0 = performance.now();
    guardCards(long);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
