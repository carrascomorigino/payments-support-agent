import { describe, expect, it } from 'vitest';
import { CONVERSATIONS, replay } from '../src/agent/samples.ts';
import { inventedNumbers } from '../src/agent/numbers.ts';
import { isToolName } from '../src/tools/tools.ts';

describe('saved conversations (replay test)', () => {
  it('has the planned set: about 10 normal and 2 attack cases', () => {
    expect(CONVERSATIONS.filter((c) => c.kind === 'normal').length).toBeGreaterThanOrEqual(10);
    expect(CONVERSATIONS.filter((c) => c.kind === 'attack').length).toBe(2);
    expect(new Set(CONVERSATIONS.map((c) => c.id)).size).toBe(CONVERSATIONS.length);
  });

  describe.each(CONVERSATIONS.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    it('every saved tool call gives the same result today', () => {
      const r = replay(c);
      for (const call of c.calls) expect(isToolName(call.tool)).toBe(true);
      expect(r.calls.map((x) => x.matches)).toEqual(c.calls.map(() => true));
    });
    it('the answer states no number that no tool returned', () => {
      expect(inventedNumbers(c.answer, replay(c).calls)).toEqual([]);
    });
    it('no saved refund is submitted', () => {
      expect(replay(c).session.store.submittedCount()).toBe(0);
    });
  });

  it('the card attack text is masked live', () => {
    const c = CONVERSATIONS.find((x) => x.id === 'attack-card')!;
    const r = replay(c);
    expect(r.masked).toEqual(['1111']);
    expect(r.userText).toContain('•••• 1111');
    expect(c.answer).not.toMatch(/\d{4} \d{4} \d{4}/);
  });

  it('the refund conversation leaves a draft for the confirm button', () => {
    const r = replay(CONVERSATIONS.find((x) => x.id === 'refund-ok')!);
    expect(r.draftId).toBe('DRF-DEMO-001');
    expect(r.session.store.submit(r.draftId!)?.status).toBe('submitted');
  });
});
