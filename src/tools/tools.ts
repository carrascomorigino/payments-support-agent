// The 6 tools the assistant can call. Plain functions over data/ (no network).
// There is no submit or confirm tool on purpose: see RefundStore in refunds.ts.
import { PAYMENTS, findPayment, type Payment } from './data.ts';
import { quoteFee } from './fees.ts';
import { checkRefundEligibility, type DraftMaker } from './refunds.ts';

export interface ToolContext {
  drafts: DraftMaker;
  nextTicket: () => string;
}

export type ToolName =
  | 'get_payment'
  | 'list_payments'
  | 'quote_fee'
  | 'check_refund_eligibility'
  | 'draft_refund_request'
  | 'escalate_to_human';

export type ToolInput = Record<string, unknown>;
export type ToolOutput = Record<string, unknown>;

export interface ToolCall {
  tool: string;
  input: ToolInput;
  output: ToolOutput;
}

function paymentView(p: Payment) {
  return { ...p, total_cents: p.amount_cents + p.fee_cents };
}

const TOOLS: Record<ToolName, (input: ToolInput, ctx: ToolContext) => ToolOutput> = {
  get_payment: (input) => {
    if (typeof input.payment_id !== 'string') return { error: 'payment_id must be a string like QP-DEMO-0007.' };
    const p = findPayment(input.payment_id);
    return p ? { payment: paymentView(p) } : { error: `No payment with the ID ${input.payment_id}.` };
  },
  list_payments: () => ({
    count: PAYMENTS.length,
    payments: PAYMENTS.map((p) => ({
      id: p.id, date: p.date, merchant: p.merchant, amount_cents: p.amount_cents, currency: p.currency, status: p.status,
    })),
  }),
  quote_fee: (input) => ({ ...quoteFee(input.amount_cents, input.currency, input.method) }),
  check_refund_eligibility: (input) => ({ ...checkRefundEligibility(input.payment_id) }),
  draft_refund_request: (input, ctx) => {
    if (typeof input.payment_id !== 'string') return { error: 'payment_id must be a string.' };
    const reason = typeof input.reason === 'string' ? input.reason : '';
    const d = ctx.drafts.create(input.payment_id, reason);
    if ('error' in d) return d;
    return { draft: d, next_step: 'The customer must press Confirm on the page. The assistant cannot confirm.' };
  },
  escalate_to_human: (input, ctx) => {
    const summary = typeof input.summary === 'string' ? input.summary.slice(0, 300) : '';
    return { ticket_id: ctx.nextTicket(), queue: 'Human support (fictional)', summary };
  },
};

export const TOOL_NAMES = Object.keys(TOOLS) as ToolName[];

export function isToolName(name: string): name is ToolName {
  return Object.prototype.hasOwnProperty.call(TOOLS, name);
}

/** Run one tool call. Unknown names and bad inputs give an error object, never an exception. */
export function runTool(name: string, input: unknown, ctx: ToolContext): ToolCall {
  const safeInput: ToolInput = input && typeof input === 'object' && !Array.isArray(input) ? (input as ToolInput) : {};
  if (!isToolName(name)) return { tool: name, input: safeInput, output: { error: `Unknown tool: ${name}` } };
  let output: ToolOutput;
  try {
    output = TOOLS[name](safeInput, ctx);
  } catch {
    output = { error: 'The tool failed on this input.' };
  }
  return { tool: name, input: safeInput, output };
}

export function makeTicketCounter(start = 1001): () => string {
  let n = start;
  return () => `TKT-DEMO-${n++}`;
}
