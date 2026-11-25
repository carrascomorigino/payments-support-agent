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
    a.ints.add(String(value));
    if (key.endsWith('_cents') && currency) a.money.add(`${currency}:${value}`);
    if (key.endsWith('_bps')) a.percents.add(formatBps(value));
  } else if (typeof value === 'string') {
    for (const d of value.match(DATE) ?? []) a.dates.add(d);
    for (const n of value.match(/\d+/g) ?? []) a.ints.add(String(Number(n)));
  }
}

const IDS = /\b(?:QP|DRF|TKT)-DEMO-\d+\b/g;
const MONEY = /(S\/|US\$)\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?/g;
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
  rest = rest.replace(MONEY, (m, sym: string, units: string, frac: string | undefined) => {
    const cents = parseAmountToCents(frac ? `${units}.${frac}` : units);
    const cur = sym === 'S/' ? 'PEN' : 'USD';
    if (cents === null || !a.money.has(`${cur}:${cents}`)) problems.push(`money ${m}`);
    return ' ';
  });
  rest = rest.replace(DATE, (d) => {
    if (!a.dates.has(d)) problems.push(`date ${d}`);
    return ' ';
  });
  rest = rest.replace(PERCENT, (p) => {
    if (!a.percents.has(p)) problems.push(`percent ${p}`);
    return ' ';
  });
  for (const n of rest.match(/\d+/g) ?? []) {
    if (!a.ints.has(String(Number(n)))) problems.push(`number ${n}`);
  }
  return problems;
}
