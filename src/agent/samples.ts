// Saved conversations (samples/conversations.json) and the replay check.
// Replay = run each saved tool call again against data/ and compare with the saved result.
import file from '../../samples/conversations.json';
import { guardCards } from '../tools/cardGuard.ts';
import { runTool, type ToolCall } from '../tools/tools.ts';
import { newSession, type Session } from './modeA.ts';

export interface SavedCall {
  tool: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
}

export interface Conversation {
  id: string;
  label: string;
  kind: 'normal' | 'attack';
  user: string; // raw text: the card guard runs on it live, like on typed text
  calls: SavedCall[];
  answer: string;
}

export const CONVERSATIONS = file.conversations as Conversation[];

export interface Replayed {
  session: Session;
  userText: string;
  masked: string[];
  calls: (ToolCall & { matches: boolean })[];
  draftId?: string;
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

export function sameValue(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

export function replay(c: Conversation): Replayed {
  const session = newSession();
  const g = guardCards(c.user);
  let draftId: string | undefined;
  const calls = c.calls.map((saved) => {
    const live = runTool(saved.tool, saved.input, session.ctx);
    const draft = live.output.draft as { draft_id?: string } | undefined;
    if (draft?.draft_id) draftId = draft.draft_id;
    return { ...live, matches: sameValue(live.output, saved.output) };
  });
  return { session, userText: g.text, masked: g.masked, calls, draftId };
}
