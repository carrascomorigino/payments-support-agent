import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { checkRefundEligibility, RefundStore, type Eligibility } from '../src/tools/refunds.ts';
import { runTool, makeTicketCounter, TOOL_NAMES, type ToolContext } from '../src/tools/tools.ts';
import { PAYMENTS } from '../src/tools/data.ts';

const elig = (id: string) => checkRefundEligibility(id) as Eligibility;

describe('refund rules (data/refund-policy.md)', () => {
  it('gives the expected verdict and rule for each payment state', () => {
    expect(elig('QP-DEMO-0007')).toMatchObject({ eligible: true, policy_rule: 1, refund_cents: 29900, days_since_payment: 8 });
    expect(elig('QP-DEMO-0001')).toMatchObject({ eligible: false, policy_rule: 2 }); // too old
    expect(elig('QP-DEMO-0003')).toMatchObject({ eligible: false, policy_rule: 4 }); // failed
    expect(elig('QP-DEMO-0009')).toMatchObject({ eligible: false, policy_rule: 5 }); // pending
    expect(elig('QP-DEMO-0006')).toMatchObject({ eligible: false, policy_rule: 6 }); // refunded
    expect(elig('QP-DEMO-0010')).toMatchObject({ eligible: false, policy_rule: 7 }); // disputed
    expect(elig('QP-DEMO-0004')).toMatchObject({ eligible: false, policy_rule: 8 }); // transfer
  });
  it('accepts lower case IDs and rejects unknown ones', () => {
    expect(elig('qp-demo-0007').eligible).toBe(true);
    expect(checkRefundEligibility('QP-DEMO-9999')).toHaveProperty('error');
    expect(checkRefundEligibility(7)).toHaveProperty('error');
  });
  it('never returns the fee', () => {
    for (const p of PAYMENTS) {
      const e = elig(p.id);
      expect(e.fee_returned).toBe(false);
      expect(e.refund_cents).toBe(e.eligible ? p.amount_cents : 0);
    }
  });
});

describe('confirm is enforced in code', () => {
  it('the tool list has no submit or confirm tool', () => {
    expect(TOOL_NAMES.some((n) => /submit|confirm|send|approve/i.test(n))).toBe(false);
  });

  it('the tools get only a create function', () => {
    const store = new RefundStore();
    expect(Object.keys(store.maker)).toEqual(['create']);
    expect(Object.isFrozen(store.maker)).toBe(true);
  });

  // A fake model that calls any tool (real or made up), with any input, in any order.
  const anyName = fc.oneof(
    fc.constantFrom(...TOOL_NAMES),
    fc.constantFrom('submit_refund', 'confirm_refund', '__proto__', 'constructor', 'toString', 'hasOwnProperty'),
    fc.string(),
  );
  const anyId = fc.oneof(fc.constantFrom(...PAYMENTS.map((p) => p.id)), fc.string());
  const anyInput = fc.oneof(
    fc.record({ payment_id: anyId, reason: fc.string(), confirm: fc.boolean(), confirmed: fc.boolean(), draft_id: fc.string() }),
    fc.record({ amount_cents: fc.integer(), currency: fc.string(), method: fc.string() }),
    fc.anything(),
  );

  it('no sequence of tool calls submits a refund without the button (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(anyName, anyInput), { maxLength: 30 }), (seq) => {
        const store = new RefundStore();
        const ctx: ToolContext = { drafts: store.maker, nextTicket: makeTicketCounter() };
        for (const [name, input] of seq) runTool(name, input, ctx);
        expect(store.submittedCount()).toBe(0);
      }),
      { numRuns: 500 },
    );
  });

  it('only the button (store.submit) submits, and only once', () => {
    const store = new RefundStore();
    const ctx: ToolContext = { drafts: store.maker, nextTicket: makeTicketCounter() };
    const out = runTool('draft_refund_request', { payment_id: 'QP-DEMO-0007', reason: 'x', confirm: true }, ctx).output;
    const id = (out.draft as { draft_id: string }).draft_id;
    expect(store.get(id)?.status).toBe('draft');
    expect(store.submit(id)?.status).toBe('submitted');
    expect(store.submit(id)).toBeUndefined();
    expect(runTool('draft_refund_request', { payment_id: 'QP-DEMO-0007' }, ctx).output).toHaveProperty('error');
  });

  it('a draft cannot be made for a payment that is not eligible', () => {
    const store = new RefundStore();
    for (const p of PAYMENTS.filter((x) => !elig(x.id).eligible)) expect(store.maker.create(p.id, '')).toHaveProperty('error');
  });
});
