# Payments support assistant (demo)

A support assistant that answers from tool results, takes fees from code, and asks before it acts.

**What CI tests:** the tools (fee math, refund rules), the card guard, the confirm rule, and the saved conversations (each tool call gives the same result, and no answer states a number that no tool returned).
**What CI does not test:** answers from a live model. Phase 1 has no live model: the free mode uses a keyword router.

Live: https://demos.mapagino.com/payments-support-agent/

> Demo. Qollqa Pay is fictional. No real money, accounts or cards.

## Try it in 2 minutes, no key

1. Open the saved conversation **Can I get a refund?**. Look at the **Tool trace**: each call has a green mark when code gives the same result today.
2. Press **Review and confirm**, then **Confirm**. Only this click sends the refund. The trace shows it as your click, not the AI.
3. Type a question with a test card number, for example `My card 4111 1111 1111 1111 paid QP-DEMO-0012, why the fee?`. The page hides the number before anything else uses it.
4. Ask your own question about a payment in the table (example: `How much to send S/ 250 by credit card?`).

## Why you can trust the numbers

- **Fees come from code.** Integer cents, one rounding rule (half up to the cent), property tests against exact BigInt math.
- **No invented numbers (CI check).** A test parses every amount, date, percent and number in each saved answer and free-mode template, and checks it against the tool results of that conversation.
- **Confirm before actions.** The AI side can only make a draft. The tools get a create-only object; the submit function is reachable only from the Confirm button. A test runs 500 random tool-call sequences and finds zero submitted refunds.
- **Card guard.** Card numbers (13-19 digits, known card prefix, Luhn check, with spaces, dashes or other short separators) are masked. Best effort, not PCI protection: see the limits in the threat list.

Details and the threat list: [docs/architecture.md](docs/architecture.md).

## Stack

React + TypeScript + Vite, static build on GitHub Pages. Zero server: it runs fully in your browser. Tests: Vitest + fast-check.

## Run it locally

```
npm ci
npm test
npm run dev
```

Add a tool: write the function in `src/tools/tools.ts`, add tests, then use it in `src/agent/modeA.ts`. After a change to `data/` or the tools, run `npm run fill-samples` and read the saved answers again.

## Roadmap

Phase 2: a live mode with your own Anthropic API key (Claude picks the tools; same tools, same confirm rule, same card guard).

## Who built it

[Mapagino](https://mapagino.com), a one-person AI studio in Peru. I worked in payments. Built with Claude.

License: MIT.
