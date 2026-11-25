// Fills the saved tool outputs in samples/conversations.json by running the tools.
// Run after a change to data/ or the tools: npm run fill-samples. Then check the answers by hand:
// tests/samples.test.ts fails if an answer states a number that no tool result has.
import { readFileSync, writeFileSync } from 'node:fs';
import { newSession } from '../src/agent/modeA.ts';
import { runTool } from '../src/tools/tools.ts';
import type { Conversation } from '../src/agent/samples.ts';

const path = new URL('../samples/conversations.json', import.meta.url);
const file = JSON.parse(readFileSync(path, 'utf8')) as { note: string; conversations: Conversation[] };

for (const c of file.conversations) {
  const s = newSession();
  c.calls = c.calls.map(({ tool, input }) => ({ tool, input, output: runTool(tool, input, s.ctx).output }));
}
writeFileSync(path, JSON.stringify(file, null, 2) + '\n');
console.log(`Filled ${file.conversations.length} conversations.`);
