// Ponto de entrada do runner para as skills (SP-004 a SP-008). Uso:
//   node scripts/harness/cli.mjs <subcomando> --change <nome> [--root <dir>] [opções]
// Subcomandos: start, run, gate-implement, gate-archive, validate-final, checkpoint, fail, interrupt,
// resume, reconcile, report, summary. Cada um devolve JSON com status e usa só funções existentes.
// Só run chama o modelo (cli-run.mjs), pelo runner e dentro da autorização budget vigente.
// Código de saída: 0 sucesso, 1 retry, 2 parada ou recusa, 3 erro.
import { resolve } from 'node:path';
import { HANDLERS as ACTIONS } from './cli-actions.mjs';
import { run } from './cli-run.mjs';
import { parseArgs, isMain } from '../gates/gate-store.mjs';

// interrupted: gate interrompido por prazo ou sinal (D8), uma parada.
const HANDLERS = Object.freeze({ ...ACTIONS, run });

export const EXIT_CODES = Object.freeze({ ok: 0, retry: 1, stop: 2, refused: 2, interrupted: 2, error: 3 });
const SUCCESS_STATUSES = ['pass', 'started', 'recorded', 'accepted', 'duplicate', 'written', 'resumed', 'ok'];
const USAGE = `uso: cli.mjs <${Object.keys(HANDLERS).join('|')}> --change <nome> [--root <dir>]`;

// Despacha um subcomando. Nunca lança: erro vira { status: 'error' }.
export async function dispatch(argv) {
  const { command, options } = parseArgs(argv);
  const handler = HANDLERS[command];
  if (!handler) return { status: 'error', error: `subcomando desconhecido "${command ?? ''}". ${USAGE}` };
  if (!options.change) return { status: 'error', error: `falta --change. ${USAGE}` };
  const root = resolve(options.root ?? process.cwd());
  try {
    return { command, ...(await handler({ root, change: options.change, options })) };
  } catch (err) {
    return { command, status: 'error', error: err.message, stop_reason: err.stopReason ?? null };
  }
}

export function exitCodeOf(result) {
  if (SUCCESS_STATUSES.includes(result.status)) return 0;
  return EXIT_CODES[result.status] ?? EXIT_CODES.error;
}

if (isMain(import.meta.url)) {
  const result = await dispatch(process.argv.slice(2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(exitCodeOf(result));
}
