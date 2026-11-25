import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SiteFooter, SiteHeader } from './shell/Shell.tsx';
import { newSession, respond, type Session } from './agent/modeA.ts';
import { CONVERSATIONS, replay, type Conversation } from './agent/samples.ts';
import { PAYMENTS, FEES } from './tools/data.ts';
import { formatMoney } from './tools/money.ts';
import type { ToolCall } from './tools/tools.ts';
import type { RefundDraft } from './tools/refunds.ts';

const REPO = 'https://github.com/carrascomorigino/payments-support-agent';

interface TraceEntry extends ToolCall {
  matches?: boolean; // saved conversations only: replay result
  button?: boolean; // a click on the page, not a tool call
}

interface Turn {
  key: number;
  user: string;
  masked: string[];
  answer: string;
  trace: TraceEntry[];
  draftId?: string;
  session: Session;
  saved?: Conversation;
}

const EXAMPLES = [
  'Where is QP-DEMO-0003?',
  'Why was I charged a fee on QP-DEMO-0012?',
  'Refund QP-DEMO-0007',
  'I do not recognize QP-DEMO-0011',
  'How much to send S/ 250 by credit card?',
];

let keySeq = 1;

export function App() {
  const live = useRef<Session>(newSession());
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [, setTick] = useState(0); // re-render after a confirm (the store lives outside React state)
  const [confirming, setConfirming] = useState<{ turn: Turn; draft: RefundDraft } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lastAnswerRef = useRef<HTMLDivElement>(null);
  const focusAnswer = useRef(false);

  useEffect(() => {
    if (!focusAnswer.current) return;
    focusAnswer.current = false;
    lastAnswerRef.current?.focus();
  }, [turns]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (confirming && !d.open) d.showModal();
    if (!confirming && d.open) d.close();
  }, [confirming]);

  function openSaved(c: Conversation) {
    const r = replay(c);
    setActiveChip(c.id);
    focusAnswer.current = true;
    setTurns([{ key: keySeq++, user: r.userText, masked: r.masked, answer: c.answer, trace: r.calls, draftId: r.draftId, session: r.session, saved: c }]);
  }

  function onAsk(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    const r = respond(q, live.current);
    setQ('');
    setActiveChip(null);
    focusAnswer.current = true;
    const turn: Turn = { key: keySeq++, user: r.userText, masked: r.masked, answer: r.answer, trace: r.calls, draftId: r.draftId, session: live.current };
    setTurns((t) => [...t.filter((x) => !x.saved), turn]);
  }

  function onConfirm() {
    if (!confirming) return;
    const { turn, draft } = confirming;
    const done = turn.session.store.submit(draft.draft_id);
    if (done) {
      turn.trace.push({ tool: 'submitRefund (Confirm button)', input: { draft_id: draft.draft_id }, output: { status: done.status }, button: true });
    }
    setConfirming(null);
    setTick((n) => n + 1);
  }

  const shown = turns.at(-1);

  return (
    <>
      <SiteHeader />
      <main id="contenido" className="page page-wide">
        <header className="intro">
          <p className="eyebrow">AI demo · Tool use</p>
          <h1 className="display demo-title">Qollqa Pay support assistant</h1>
          <p className="lead">It answers from tool results, takes fees from code, and asks you before it acts.</p>
          <p className="note banner" role="note">
            Demo. Qollqa Pay is fictional. No real money, accounts or cards. Never type a real card number.
          </p>
        </header>

        <section aria-labelledby="chips-title" className="samples">
          <h2 id="chips-title" className="eyebrow">Saved conversations (no key)</h2>
          <p className="hint">
            Written with Claude Code. When you open one, the page runs its tool calls again with code and marks each result that
            matches. Free mode below has no AI: it uses a keyword router. Live answers from a model are not tested here.
          </p>
          <div className="chips">
            {CONVERSATIONS.filter((c) => c.kind === 'normal').map((c) => (
              <button key={c.id} type="button" className="chip" aria-pressed={activeChip === c.id} onClick={() => openSaved(c)}>
                {c.label}
              </button>
            ))}
          </div>
          <h3 className="eyebrow attack-title">Attack examples · Saved example, not a live test</h3>
          <div className="chips">
            {CONVERSATIONS.filter((c) => c.kind === 'attack').map((c) => (
              <button key={c.id} type="button" className="chip chip-attack" aria-pressed={activeChip === c.id} onClick={() => openSaved(c)}>
                {c.label}
              </button>
            ))}
          </div>
        </section>

        <div className="workspace">
          <section aria-labelledby="chat-title" className="chat">
            <h2 id="chat-title" className="visually-hidden">Chat</h2>
            <div className="chat-log">
              {turns.length === 0 && <p className="empty">Open a saved conversation, or ask a question below. Use a payment ID from the table.</p>}
              {turns.map((t, i) => (
                <div key={t.key} className="turn">
                  {t.saved && (
                    <p className="hint saved-note">
                      {t.saved.kind === 'attack' ? 'Saved example, not a live test. ' : 'Saved conversation. '}
                      Tool results are re-run live by code.
                    </p>
                  )}
                  <p className="bubble bubble-user"><span className="visually-hidden">You: </span>{t.user}</p>
                  {t.masked.length > 0 && (
                    <p className="note mask-note" role="status">
                      The page hid {t.masked.length === 1 ? 'a card number' : `${t.masked.length} card numbers`} ({t.masked.map((l) => `•••• ${l}`).join(', ')}) before anything else used it.
                    </p>
                  )}
                  <div className="bubble bubble-bot" tabIndex={-1} ref={i === turns.length - 1 ? lastAnswerRef : undefined}>
                    <span className="visually-hidden">Assistant: </span>
                    {t.answer}
                  </div>
                  {t.draftId && <DraftCard turn={t} onReview={(draft) => setConfirming({ turn: t, draft })} />}
                </div>
              ))}
            </div>

            <form onSubmit={onAsk} className="ask">
              <label htmlFor="q" className="visually-hidden">Your question</label>
              <input id="q" className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Example: Refund QP-DEMO-0007" autoComplete="off" maxLength={500} />
              <button type="submit" className="button button-primary" disabled={!q.trim()}>Ask</button>
            </form>
            <div className="examples">
              <p className="hint">Free mode (no AI, no key) answers these kinds of questions. Try one:</p>
              <ul>
                {EXAMPLES.map((ex) => (
                  <li key={ex}>
                    <button type="button" className="link-button" onClick={() => setQ(ex)}>{ex}</button>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* tabIndex: the panel can scroll, so keyboard users must be able to reach it */}
          <aside aria-labelledby="trace-title" className="card trace" tabIndex={0}>
            <h2 id="trace-title" className="trace-title">Tool trace</h2>
            <p className="hint">Each tool call, its input and its result. Every number in the answer comes from here.</p>
            {!shown || shown.trace.length === 0 ? (
              <p className="empty">{shown ? 'No tool calls for this answer.' : 'No tool calls yet.'}</p>
            ) : (
              <ol className="trace-list">
                {shown.trace.map((c, i) => (
                  <li key={i} className={c.button ? 'trace-item trace-button' : 'trace-item'}>
                    <p className="trace-head">
                      <code>{c.tool}</code>
                      {c.matches === true && <span className="tag tag-ok">✓ matches code</span>}
                      {c.matches === false && <span className="tag tag-bad">✗ result changed</span>}
                      {c.button && <span className="tag">Your click, not the AI</span>}
                    </p>
                    <p className="trace-label">Input</p>
                    <pre>{JSON.stringify(c.input, null, 1)}</pre>
                    <p className="trace-label">Result</p>
                    <pre>{JSON.stringify(c.output, null, 1)}</pre>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>

        <section aria-labelledby="payments-title" className="payments">
          <h2 id="payments-title" className="eyebrow">The demo account (fictional). Demo date: 2026-11-20.</h2>
          <div className="table-wrap" tabIndex={0} role="region" aria-labelledby="payments-title">
            <table>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Date</th>
                  <th scope="col">Merchant</th>
                  <th scope="col" className="num">Amount</th>
                  <th scope="col" className="num">Fee</th>
                  <th scope="col">Method</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {PAYMENTS.map((p) => (
                  <tr key={p.id}>
                    <td><code>{p.id}</code></td>
                    <td>{p.date}</td>
                    <td>{p.merchant}</td>
                    <td className="num">{formatMoney(p.amount_cents, p.currency)}</td>
                    <td className="num">{formatMoney(p.fee_cents, p.currency)}</td>
                    <td>{FEES[p.method].label}</td>
                    <td><span className={`status status-${p.status}`}>{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <dialog ref={dialogRef} className="card confirm" aria-labelledby="confirm-title" onClose={() => setConfirming(null)}>
        {confirming && (
          <>
            <h2 id="confirm-title" className="trace-title">Send this refund request?</h2>
            <dl className="draft-facts">
              <dt>Draft</dt><dd>{confirming.draft.draft_id}</dd>
              <dt>Payment</dt><dd>{confirming.draft.payment_id} · {confirming.draft.merchant}</dd>
              <dt>Refund</dt><dd>{formatMoney(confirming.draft.refund_cents, confirming.draft.currency)} (the fee is not returned)</dd>
            </dl>
            <p className="hint">Demo: no real money moves. Only this button sends the request. The assistant cannot press it.</p>
            <div className="confirm-actions">
              <button type="button" className="button button-secondary" onClick={() => setConfirming(null)}>Cancel</button>
              <button type="button" className="button button-primary" onClick={onConfirm}>Confirm</button>
            </div>
          </>
        )}
      </dialog>

      <SiteFooter>
        <div className="footer-group">
          <h2 className="footer-title">This demo</h2>
          <p>
            Fictional wallet, fake data. Runs fully in your browser: no server, no analytics. Open source (MIT). Built by{' '}
            <a href="https://mapagino.com" target="_blank" rel="noopener noreferrer">Mapagino</a> with Claude.
          </p>
        </div>
        <div className="footer-group">
          <h2 className="footer-title">More</h2>
          <ul>
            <li><a href="https://demos.mapagino.com/">All demos</a></li>
            <li><a href={REPO} target="_blank" rel="noopener noreferrer">Code on GitHub</a></li>
          </ul>
        </div>
      </SiteFooter>
    </>
  );
}

function DraftCard({ turn, onReview }: { turn: Turn; onReview: (d: RefundDraft) => void }) {
  const d = turn.session.store.get(turn.draftId!);
  if (!d) return null;
  return (
    <div className="card draft">
      <p className="trace-head">
        <strong>Refund {d.status === 'draft' ? 'draft' : 'request sent'}</strong> <code>{d.draft_id}</code>
      </p>
      <p>
        {formatMoney(d.refund_cents, d.currency)} for {d.payment_id} ({d.merchant}).
        {d.status === 'submitted' && ' You confirmed it. Demo: no real money moved.'}
      </p>
      {d.status === 'draft' && (
        <button type="button" className="button button-primary" onClick={() => onReview(d)}>Review and confirm</button>
      )}
    </div>
  );
}
