// Card-number guard. Runs on every visitor message, before the text is shown, routed or sent anywhere.
// Best effort, not PCI protection: it finds 13-19 digit card numbers that pass the Luhn check
// (the standard check digit test for card numbers), also with spaces or dashes between digit groups.

export interface GuardResult {
  text: string;
  masked: string[]; // last 4 digits of each masked number
}

export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// Card numbers start with a known network prefix (IIN): 2221-2720 or 51-55 (Mastercard), 4 (Visa),
// 34/37 (Amex), 30/36/38 (Diners), 35 (JCB), 6 (Discover and others). This stops most false masks:
// dates (19xx, 20xx), Peru phone numbers (9xx) and plain counts do not start like a card.
function knownPrefix(d: string): boolean {
  const two = Number(d.slice(0, 2));
  const four = Number(d.slice(0, 4));
  return d[0] === '4' || d[0] === '6' || (two >= 51 && two <= 55) || (four >= 2221 && four <= 2720) || [30, 34, 35, 36, 37, 38].includes(two);
}

const isCard = (digits: string) => digits.length >= 13 && digits.length <= 19 && knownPrefix(digits) && luhnValid(digits);
const mask = (digits: string) => `•••• ${digits.slice(-4)}`;

/**
 * A "run" is digit groups joined by short separators: spaces (also double, NBSP, newline), dashes,
 * underscores, dots or slashes ("4111 1111 1111 1111", "4111-1111-1111-1111", "4111 - 1111 - ...").
 * If the whole run is a card, mask it. Else look for a card made of whole groups inside it
 * (example: "on 2026-11-20 4111 1111 1111 1111" is one run; the card is its last 4 groups).
 * Windows stop at 19 digits, so the work grows in a straight line with the input (no slow inputs).
 */
const RUN = /\d+(?:[\s\-_./]{1,3}\d+)*/g;
const SEP = /[\s\-_./]{1,3}/g;

function maskRun(run: string, masked: string[]): string {
  const groups = run.split(SEP);
  const seps = run.match(SEP) ?? [];
  const all = groups.join('');
  if (isCard(all)) {
    masked.push(all.slice(-4));
    return mask(all);
  }
  // Left to right; at each start, the longest window of whole groups (max 19 digits) that is a card.
  for (let start = 0; start < groups.length; start++) {
    let best = -1;
    let digits = '';
    for (let end = start; end < groups.length; end++) {
      digits += groups[end];
      if (digits.length > 19) break;
      if (isCard(digits)) best = end + 1;
    }
    if (best < 0) continue;
    const join = (from: number, to: number) =>
      groups.slice(from, to).map((g, i) => (i === 0 ? g : seps[from + i - 1] + g)).join('');
    const card = groups.slice(start, best).join('');
    const before = start > 0 ? join(0, start) + seps[start - 1] : '';
    masked.push(card.slice(-4));
    const after = best < groups.length ? seps[best - 1] + maskRun(join(best, groups.length), masked) : '';
    return before + mask(card) + after;
  }
  return run;
}

export function guardCards(text: string): GuardResult {
  const masked: string[] = [];
  // NFKC turns full-width digits into plain digits, so they cannot hide a card number.
  const out = text.normalize('NFKC').replace(RUN, (run) => maskRun(run, masked));
  return { text: out, masked };
}
