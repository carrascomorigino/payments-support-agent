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

const isCard = (digits: string) => digits.length >= 13 && digits.length <= 19 && luhnValid(digits);
const mask = (digits: string) => `•••• ${digits.slice(-4)}`;

/**
 * A "run" is digit groups joined by single spaces or dashes ("4111 1111 1111 1111", "2026-11-20").
 * If the whole run is a card, mask it. Else look for the longest card made of whole groups inside it
 * (example: "on 2026-11-20 4111 1111 1111 1111" is one run; the card is its last 4 groups).
 */
const RUN = /\d+(?:[ -]\d+)*/g;

function maskRun(run: string, masked: string[]): string {
  const groups = run.split(/[ -]/);
  const seps = run.match(/[ -]/g) ?? [];
  const all = groups.join('');
  if (isCard(all)) {
    masked.push(all.slice(-4));
    return mask(all);
  }
  // Longest window of whole groups first, then left to right.
  for (let len = groups.length - 1; len >= 1; len--) {
    for (let start = 0; start + len <= groups.length; start++) {
      const digits = groups.slice(start, start + len).join('');
      if (!isCard(digits)) continue;
      const join = (from: number, to: number) =>
        groups.slice(from, to).map((g, i) => (i === 0 ? g : seps[from + i - 1] + g)).join('');
      const end = start + len;
      // The groups before and after can hold another card: guard them too (left to right).
      const before = start > 0 ? maskRun(join(0, start), masked) + seps[start - 1] : '';
      masked.push(digits.slice(-4));
      const after = end < groups.length ? seps[end - 1] + maskRun(join(end, groups.length), masked) : '';
      return before + mask(digits) + after;
    }
  }
  return run;
}

export function guardCards(text: string): GuardResult {
  const masked: string[] = [];
  const out = text.replace(RUN, (run) => maskRun(run, masked));
  return { text: out, masked };
}
