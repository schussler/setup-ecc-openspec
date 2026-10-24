// Processo filho usado pelo teste de interrupção (F6, 6.6): executa uma etapa do runner
// com o simulador (FAKE_CLAUDE_HANG=1 prende a invocação). O teste mata este processo.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHarnessStep } from '../../../harness/runner.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const { HARNESS_ROOT, HARNESS_CHANGE, HARNESS_PROMPT } = process.env;

const outcome = await runHarnessStep({
  root: HARNESS_ROOT,
  change: HARNESS_CHANGE,
  bin: [process.execPath, join(HERE, 'fake-claude.mjs')],
  prompt: HARNESS_PROMPT,
  allowedTools: ['Read'],
  // Interrupção com reserva aberta é um fluxo financeiro: o modo financeiro é explícito.
  profile: { provisional: true, modo_financeiro: true },
  env: {},
});

process.stdout.write(`${JSON.stringify({ state: outcome.state, stop_reason: outcome.stop_reason })}\n`);
