// Free mode (no AI, no key): card guard -> keyword router -> tools -> answer from a template.
// Every number in an answer is read from a tool result (tests/modeA.test.ts checks this).
import { guardCards } from '../tools/cardGuard.ts';
import { route } from '../tools/router.ts';
import { RefundStore } from '../tools/refunds.ts';
import { makeTicketCounter, runTool, type ToolCall, type ToolContext } from '../tools/tools.ts';
import { formatBps, formatMoney, type Currency } from '../tools/money.ts';
import type { Payment } from '../tools/data.ts';
import type { FeeQuote } from '../tools/fees.ts';
import type { Eligibility, RefundDraft } from '../tools/refunds.ts';

export interface Session {
  store: RefundStore; // submit() is for the confirm button only
  ctx: ToolContext; // what the tools get: create drafts, open tickets
}

export function newSession(): Session {
  const store = new RefundStore();
  return { store, ctx: { drafts: store.maker, nextTicket: makeTicketCounter() } };
}

export interface Reply {
  userText: string; // after the card guard
  masked: string[];
  calls: ToolCall[];
  answer: string;
  draftId?: string;
}

const money = (cents: unknown, cur: Currency) => formatMoney(cents as number, cur);

function feeLine(q: FeeQuote): string {
  const c = q.currency;
  if (q.fee_cents === 0) return `${q.method_label}: no fee.`;
  const parts: string[] = [];
  if (q.percent_bps > 0) parts.push(`${formatBps(q.percent_bps)} of the amount (${money(q.percent_part_cents, c)})`);
  if (q.fixed_cents > 0) parts.push(`a fixed ${money(q.fixed_cents, c)}`);
  if (q.min_applied) {
    return `${q.method_label}: ${parts.join(' plus ')} is below the minimum fee, so the fee is ${money(q.fee_cents, c)}.`;
  }
  return `${q.method_label}: fee ${money(q.fee_cents, c)} = ${parts.join(' plus ')}.`;
}

function statusAnswer(p: Payment & { total_cents: number }): string {
  const c = p.currency;
  const head = `Payment ${p.id} to ${p.merchant} on ${p.date}`;
  switch (p.status) {
    case 'completed':
      return `${head} is completed. Amount: ${money(p.amount_cents, c)}. Fee: ${money(p.fee_cents, c)}. Total charged: ${money(p.total_cents, c)}.`;
    case 'failed':
      return `${head} failed. Reason: ${p.failure_reason}. You were not charged. You can try again after you add money to your wallet.`;
    case 'pending':
      return `${head} is pending. It is not completed yet, and the money has not arrived. Check again later.`;
    case 'refunded':
      return `${head} was refunded on ${p.refunded_on}. Amount returned: ${money(p.amount_cents, c)}. The fee is not returned.`;
    case 'disputed':
      return `${head} has an open dispute. The dispute team checks it and contacts you. You do not need to do anything now.`;
  }
}

const HELP =
  'The free mode answers these questions: where is a payment, why was I charged a fee, can I get a refund, ' +
  'I do not recognize a charge, and how much does it cost to send money. Use a payment ID from the table ' +
  '(example: QP-DEMO-0007). For other questions, a live Claude mode with your own key is planned.';

export function respond(raw: string, s: Session): Reply {
  const g = guardCards(raw);
  const calls: ToolCall[] = [];
  const call = (tool: string, input: Record<string, unknown>) => {
    const c = runTool(tool, input, s.ctx);
    calls.push(c);
    return c.output;
  };
  const r = route(g.text);
  const reply = (answer: string, draftId?: string): Reply => ({ userText: g.text, masked: g.masked, calls, answer, draftId });

  switch (r.intent) {
    case 'status': {
      const out = call('get_payment', { payment_id: r.paymentId });
      if ('error' in out) return reply(`${out.error} Check the ID in the table.`);
      return reply(statusAnswer(out.payment as Payment & { total_cents: number }));
    }
    case 'fee_explain': {
      const out = call('get_payment', { payment_id: r.paymentId });
      if ('error' in out) return reply(`${out.error} Check the ID in the table.`);
      const p = out.payment as Payment;
      const q = call('quote_fee', { amount_cents: p.amount_cents, currency: p.currency, method: p.method }) as unknown as FeeQuote;
      return reply(
        `You paid ${money(p.amount_cents, p.currency)} to ${p.merchant} on ${p.date}. ${feeLine(q)} ` +
          `Total charged: ${money(q.total_cents, p.currency)}.`,
      );
    }
    case 'refund': {
      const out = call('get_payment', { payment_id: r.paymentId });
      if ('error' in out) return reply(`${out.error} Check the ID in the table.`);
      const p = out.payment as Payment;
      const e = call('check_refund_eligibility', { payment_id: p.id }) as unknown as Eligibility;
      if (!e.eligible) {
        const extra = p.category === 'transfer' ? ' Ask the receiver, or say that you do not recognize the charge to open a dispute.' : '';
        return reply(`${p.id} cannot be refunded. ${e.reason} (Policy rule ${e.policy_rule}.)${extra}`);
      }
      const d = call('draft_refund_request', { payment_id: p.id, reason: 'Customer asked for a refund.' });
      if ('error' in d) return reply(`I could not make a draft: ${d.error}`);
      const draft = d.draft as RefundDraft;
      return reply(
        `${p.id} can be refunded: it is ${e.days_since_payment} days old, inside the ${e.window_days}-day window. ` +
          `I made a draft refund of ${money(draft.refund_cents, draft.currency)} (${draft.draft_id}). ` +
          `The fee of ${money(p.fee_cents, p.currency)} is not returned. Press Confirm to send it. I cannot send it for you.`,
        draft.draft_id,
      );
    }
    case 'dispute': {
      let about = 'a charge the customer does not recognize';
      if (r.paymentId) {
        const out = call('get_payment', { payment_id: r.paymentId });
        if (!('error' in out)) {
          const p = out.payment as Payment;
          about = `${p.id}, ${money(p.amount_cents, p.currency)} to ${p.merchant} on ${p.date}`;
        }
      }
      const t = call('escalate_to_human', { summary: `Customer does not recognize ${about}.` });
      return reply(
        `I sent this to a person on the support team: ticket ${t.ticket_id}. ` +
          'Do not ask for a refund of a charge you do not recognize: the dispute team checks it first. ' +
          'Never share your full card number, password or ID number. We never ask for them.',
      );
    }
    case 'quote': {
      const lines = r.methods.map((m) => {
        const q = call('quote_fee', { amount_cents: r.amountCents, currency: r.currency, method: m });
        if ('error' in q) return String(q.error);
        const fq = q as unknown as FeeQuote;
        return `${feeLine(fq)} Total: ${money(fq.total_cents, fq.currency)}.`;
      });
      return reply(`To send ${money(r.amountCents, r.currency)}:\n${lines.join('\n')}`);
    }
    case 'list': {
      const out = call('list_payments', {});
      const ps = out.payments as { id: string; date: string; merchant: string; amount_cents: number; currency: Currency; status: string }[];
      return reply(
        `You have ${out.count} payments:\n` + ps.map((p) => `${p.id}, ${p.date}, ${p.merchant}, ${money(p.amount_cents, p.currency)}, ${p.status}`).join('\n'),
      );
    }
    case 'need_id':
      return reply('Which payment? Add its ID from the table (example: QP-DEMO-0007).');
    case 'need_amount':
      return reply('How much do you want to send? Write the amount (example: S/ 250 by credit card).');
    case 'unknown':
      return reply(HELP);
  }
}
