// "No invented numbers" check. Every amount, date, percent and number in an answer must equal
// a value in a tool result of the same conversation. Values are parsed with their unit, not matched as text.
import type { ToolCall } from '../tools/tools.ts';
import { formatBps, parseAmountToCents } from '../tools/money.ts';

interface Allowed {
  money: Set<string>; // "PEN:12000"
  dates: Set<string>;
  percents: Set<string>; // "3.5%"
  ints: Set<string>;
}

const DATE = /\b\d{4}-\d{2}-\d{2}\b/g;

function collect(value: unknown, currency: string | undefined, key: string, a: Allowed) {
  if (Array.isArray(value)) {
    value.forEach((v) => collect(v, currency, key, a));
  } else if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const cur = typeof obj.currency === 'string' ? obj.currency : currency;
    for (const [k, v] of Object.entries(obj)) collect(v, cur, k, a);
  } else if (typeof value === 'number') {
    // Typed pools: cents only as money, bps only as percents, other numbers (counts, days, rule numbers) as ints.
    if (key.endsWith('_cents')) {
      if (currency) a.money.add(`${currency}:${value}`);
    } else if (key.endsWith('_bps')) {
      a.percents.add(formatBps(value));
    } else {
      a.ints.add(String(value));
    }
  } else if (typeof value === 'string') {
    for (const d of value.match(DATE) ?? []) a.dates.add(d);
  }
}

const IDS = /\b(?:QP|DRF|TKT)-DEMO-\d+\b/g;
// Money with a symbol or code before it ("S/ 9.75", "PEN 9.75", "US$ 1.00") or a word after it ("9.75 soles").
const MONEY = /(S\/|US\$|PEN|USD)\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?|(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s?(soles|sol|d[oó]lares|dollars?|PEN|USD)\b/gi;
const PERCENT = /\d+(?:\.\d+)?%/g;

/** Returns a list of problems. Empty list = every number in the answer comes from a tool result. */
export function inventedNumbers(answer: string, calls: ToolCall[]): string[] {
  const a: Allowed = { money: new Set(), dates: new Set(), percents: new Set(), ints: new Set() };
  calls.forEach((c) => {
    collect(c.input, undefined, '', a);
    collect(c.output, undefined, '', a);
  });
  const problems: string[] = [];
  let rest = answer.replace(IDS, ' ');
  rest = rest.replace(MONEY, (m, sym?: string, u1?: string, f1?: string, u2?: string, f2?: string, word?: string) => {
    const units = u1 ?? u2 ?? '';
    const frac = f1 ?? f2;
    const cents = parseAmountToCents(frac ? `${units}.${frac}` : units);
    const tag = (sym ?? word ?? '').toLowerCase();
    const cur = tag === 's/' || tag === 'pen' || tag.startsWith('sol') ? 'PEN' : 'USD';
    if (cents === null || !a.money.has(`${cur}:${cents}`)) problems.push(`money ${m}`);
    return ' ';
  });
  rest = rest.replace(DATE, (d) => {
    if (!a.dates.has(d)) problems.push(`date ${d}`);
    return ' ';
  });
  rest = rest.replace(PERCENT, (p) => {
    // Compare the value, not the text: "3.50%" equals "3.5%".
    if (!a.percents.has(p) && !a.percents.has(`${Number(p.slice(0, -1))}%`)) problems.push(`percent ${p}`);
    return ' ';
  });
  for (const n of rest.match(/\d+\.\d+/g) ?? []) problems.push(`decimal ${n} with no currency`);
  rest = rest.replace(/\d+\.\d+/g, ' ');
  for (const n of rest.match(/\d+/g) ?? []) {
    if (!a.ints.has(String(Number(n)))) problems.push(`number ${n}`);
  }
  return problems;
}
