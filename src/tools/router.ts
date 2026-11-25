// Keyword router for the free mode (no AI). It maps a message to one of the 5 question types.
// Plain code: same input, same result. English and some Spanish keywords.
import type { MethodId } from './data.ts';
import { parseAmountToCents, type Currency } from './money.ts';

export type Route =
  | { intent: 'status'; paymentId: string }
  | { intent: 'fee_explain'; paymentId: string }
  | { intent: 'refund'; paymentId: string }
  | { intent: 'dispute'; paymentId?: string }
  | { intent: 'quote'; amountCents: number; currency: Currency; methods: MethodId[] }
  | { intent: 'list' }
  | { intent: 'need_id'; about: 'refund' | 'fee_explain' | 'status' }
  | { intent: 'need_amount' }
  | { intent: 'unknown' };

const ID = /\bQP-DEMO-(\d{4})\b/i;
const DISPUTE = /recogni[sz]e|unknown charge|fraud|dispute|stolen|unauthori[sz]ed|reconozco|no autoric|fraude|disputa/i;
const REFUND = /refund|money back|reembols|devoluci|devuelv/i;
const QUOTE = /how much|cost|price|cu[aá]nto|cuesta|costo/i;
const FEE = /fee|charge|commission|comisi|cobr|cargo/i;
const STATUS = /where|status|happen|fail|pending|estado|d[oó]nde|pas[oó]|fall/i;
const LIST = /my payments|recent|history|list|all payments|mis pagos|historial|[uú]ltimos pagos/i;

const METHOD_WORDS: [RegExp, MethodId][] = [
  [/credit|cr[eé]dito/i, 'credit_card'],
  [/debit|d[eé]bito/i, 'debit_card'],
  [/bank|banc|transfer/i, 'bank_transfer'],
  [/wallet|balance|saldo|billetera/i, 'wallet_balance'],
];

// "S/ 250", "S/250.50", "US$ 40", "$40", "250 soles", "40 dollars", "1,250.00 PEN"
const AMOUNT = /(S\/|US\$|\$)?\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s?(soles|sol|pen|usd|dollars?|d[oó]lares)?/i;

function findAmount(text: string): { cents: number; currency: Currency } | null {
  const scrubbed = text.replace(ID, ' ');
  const m = AMOUNT.exec(scrubbed);
  if (!m) return null;
  const cents = parseAmountToCents(m[2]);
  if (cents === null || cents <= 0) return null;
  const sym = (m[1] ?? '').toUpperCase();
  const word = (m[3] ?? '').toLowerCase();
  const usd = sym === 'US$' || sym === '$' || /usd|dollar|d[oó]lar/.test(word) || /\bdollars?\b|\bUSD\b|d[oó]lares/i.test(scrubbed);
  return { cents, currency: usd ? 'USD' : 'PEN' };
}

function findMethods(text: string): MethodId[] {
  return METHOD_WORDS.filter(([re]) => re.test(text)).map(([, id]) => id);
}

export function route(text: string): Route {
  const idMatch = ID.exec(text);
  const paymentId = idMatch ? `QP-DEMO-${idMatch[1]}` : undefined;

  if (DISPUTE.test(text)) return { intent: 'dispute', paymentId };
  if (REFUND.test(text)) return paymentId ? { intent: 'refund', paymentId } : { intent: 'need_id', about: 'refund' };
  if (!paymentId && (QUOTE.test(text) || (FEE.test(text) && findAmount(text)))) {
    const amount = findAmount(text);
    if (!amount) return { intent: 'need_amount' };
    const found = findMethods(text);
    const methods: MethodId[] = found.length ? found : ['wallet_balance', 'debit_card', 'credit_card', 'bank_transfer'];
    return { intent: 'quote', amountCents: amount.cents, currency: amount.currency, methods };
  }
  if (FEE.test(text)) return paymentId ? { intent: 'fee_explain', paymentId } : { intent: 'need_id', about: 'fee_explain' };
  if (paymentId) return { intent: 'status', paymentId };
  if (LIST.test(text)) return { intent: 'list' };
  if (STATUS.test(text)) return { intent: 'need_id', about: 'status' };
  return { intent: 'unknown' };
}
