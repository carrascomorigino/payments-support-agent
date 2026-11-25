// Refund rules (data/refund-policy.md) in code, and the draft store.
// Safety rule: the AI can only make a DRAFT. Only the page's confirm button submits it.
import { DEMO_TODAY, findPayment, type Payment } from './data.ts';
import type { Currency } from './money.ts';

export const REFUND_WINDOW_DAYS = 30;

export interface Eligibility {
  payment_id: string;
  eligible: boolean;
  reason: string;
  policy_rule: number; // rule number in data/refund-policy.md (0 = bad data, not a policy rule)
  days_since_payment: number;
  window_days: number;
  refund_cents: number; // 0 when not eligible
  fee_returned: false;
  currency: Currency;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

function verdict(p: Payment): { eligible: boolean; reason: string; rule: number } {
  if (daysBetween(p.date, DEMO_TODAY) < 0) return { eligible: false, reason: 'The payment date is in the future. Check the payment ID.', rule: 0 };
  if (p.status === 'failed') return { eligible: false, reason: 'The payment failed, so it was not charged.', rule: 4 };
  if (p.status === 'pending') return { eligible: false, reason: 'The payment is still pending. Wait until it is completed.', rule: 5 };
  if (p.status === 'refunded') return { eligible: false, reason: `The payment was already refunded on ${p.refunded_on}.`, rule: 6 };
  if (p.status === 'disputed') return { eligible: false, reason: 'A dispute is open for this payment. The dispute team decides.', rule: 7 };
  if (p.category === 'transfer') return { eligible: false, reason: 'Transfers to a person cannot be refunded here.', rule: 8 };
  if (daysBetween(p.date, DEMO_TODAY) > REFUND_WINDOW_DAYS) {
    return { eligible: false, reason: `The payment is more than ${REFUND_WINDOW_DAYS} days old.`, rule: 2 };
  }
  return { eligible: true, reason: 'The payment is completed and inside the refund window.', rule: 1 };
}

export function checkRefundEligibility(paymentId: unknown): Eligibility | { error: string } {
  if (typeof paymentId !== 'string') return { error: 'payment_id must be a string like QP-DEMO-0007.' };
  const p = findPayment(paymentId);
  if (!p) return { error: `No payment with the ID ${paymentId}.` };
  const v = verdict(p);
  return {
    payment_id: p.id,
    eligible: v.eligible,
    reason: v.reason,
    policy_rule: v.rule,
    days_since_payment: daysBetween(p.date, DEMO_TODAY),
    window_days: REFUND_WINDOW_DAYS,
    refund_cents: v.eligible ? p.amount_cents : 0,
    fee_returned: false,
    currency: p.currency,
  };
}

export interface RefundDraft {
  draft_id: string;
  payment_id: string;
  merchant: string;
  refund_cents: number;
  currency: Currency;
  reason: string;
  status: 'draft' | 'submitted';
}

/** The only face of the store that the tools get: it can make a draft, nothing more. */
export interface DraftMaker {
  create(paymentId: string, reason: string): RefundDraft | { error: string };
}

/**
 * Page-memory store for refund drafts.
 * - `maker` (create only) goes to the tools, so the AI side can never submit.
 * - `submit()` is called only by the confirm button in the UI.
 */
export class RefundStore {
  private drafts = new Map<string, RefundDraft>();
  private next = 1;

  readonly maker: DraftMaker = Object.freeze({
    create: (paymentId: string, reason: string) => this.create(paymentId, reason),
  });

  private create(paymentId: string, reason: string): RefundDraft | { error: string } {
    const e = checkRefundEligibility(paymentId);
    if ('error' in e) return e;
    if (!e.eligible) return { error: `Not eligible: ${e.reason}` };
    const open = [...this.drafts.values()].find((d) => d.payment_id === e.payment_id);
    if (open) return { error: `A refund (${open.status}) already exists for ${e.payment_id}: ${open.draft_id}.` };
    const p = findPayment(e.payment_id)!;
    const draft: RefundDraft = {
      draft_id: `DRF-DEMO-${String(this.next++).padStart(3, '0')}`,
      payment_id: p.id,
      merchant: p.merchant,
      refund_cents: e.refund_cents,
      currency: p.currency,
      reason: reason.slice(0, 200),
      status: 'draft',
    };
    this.drafts.set(draft.draft_id, draft);
    return { ...draft };
  }

  /** UI only (the confirm button). No tool can reach this. */
  submit(draftId: string): RefundDraft | undefined {
    const d = this.drafts.get(draftId);
    if (!d || d.status !== 'draft') return undefined;
    d.status = 'submitted';
    return { ...d };
  }

  get(draftId: string): RefundDraft | undefined {
    const d = this.drafts.get(draftId);
    return d && { ...d };
  }

  submittedCount(): number {
    return [...this.drafts.values()].filter((d) => d.status === 'submitted').length;
  }
}
