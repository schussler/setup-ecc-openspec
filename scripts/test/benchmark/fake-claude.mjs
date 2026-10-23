#!/usr/bin/env node
// Stand-in for the `claude` CLI in tests. Logs its argv and cwd to
// FAKE_CLAUDE_LOG (one JSON line per call) and behaves per FAKE_CLAUDE_MODE:
//   ok (default) → prints a success result; sleep → hangs; error → is_error;
//   garbage → prints non-JSON. FAKE_CLAUDE_COST sets total_cost_usd and
//   FAKE_CLAUDE_DENIALS (JSON array of commands) sets permission_denials.
// FAKE_CLAUDE_HOOK, when set, is a module path whose default export runs with
// { args, cwd } before the result is printed (used to simulate agent edits).
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const mode = process.env.FAKE_CLAUDE_MODE ?? 'ok';
if (process.env.FAKE_CLAUDE_LOG) {
  appendFileSync(process.env.FAKE_CLAUDE_LOG, `${JSON.stringify({ args, cwd: process.cwd() })}\n`);
}
if (process.env.FAKE_CLAUDE_HOOK) {
  const hook = await import(pathToFileURL(process.env.FAKE_CLAUDE_HOOK).href);
  await hook.default({ args, cwd: process.cwd() });
}
if (mode === 'sleep') {
  setInterval(() => {}, 1000);
} else if (mode === 'garbage') {
  console.log('not json');
} else {
  console.log(JSON.stringify({
    type: 'result',
    subtype: mode === 'error' ? 'error_during_execution' : 'success',
    is_error: mode === 'error',
    result: process.env.FAKE_CLAUDE_RESULT ?? (mode === 'error' ? 'falhou' : 'ok'),
    total_cost_usd: Number(process.env.FAKE_CLAUDE_COST ?? 0.01),
    duration_ms: 5,
    num_turns: 2,
    permission_denials: JSON.parse(process.env.FAKE_CLAUDE_DENIALS ?? '[]')
      .map((command) => ({ tool_name: 'Bash', tool_input: { command } })),
    session_id: 'fake',
  }));
}
