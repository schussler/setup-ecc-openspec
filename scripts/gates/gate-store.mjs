// Reads and writes openspec/changes/<change>/gates.json, the per-change log
// of every gate evaluation. It is archived together with the change.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ChecksError } from './checks.mjs';

export function changeDir(root, change) {
  if (!change || /[\\/]|\.\./.test(change)) throw new ChecksError(`nome de change inválido: "${change ?? ''}"`);
  const dir = join(root, 'openspec', 'changes', change);
  if (!existsSync(dir)) throw new ChecksError(`change não encontrada: openspec/changes/${change}/`);
  return dir;
}

export function readGates(root, change) {
  const path = join(changeDir(root, change), 'gates.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
}

export function writeGates(root, change, gates) {
  writeFileSync(join(changeDir(root, change), 'gates.json'), `${JSON.stringify(gates, null, 2)}\n`);
}

// Modo da execução, lido de .harness-local/<change>/run-state.json. Sem o arquivo,
// a execução é tratada como legacy (fluxo atual, ver design D20).
export function runMode(root, change) {
  const path = join(root, '.harness-local', change, 'run-state.json');
  if (!existsSync(path)) return 'legacy';
  try {
    return JSON.parse(readFileSync(path, 'utf8')).mode ?? 'legacy';
  } catch (err) {
    throw new ChecksError(`run-state.json ilegível: ${err.message}`);
  }
}

// Só execução legacy aceita a escrita de gates.json pela CLI (SG-019).
export function assertLegacyWrite(root, change) {
  const mode = runMode(root, change);
  if (mode !== 'legacy') {
    throw new ChecksError(`mode_mismatch: --legacy-write só é aceito em execução legacy; run-state.json indica modo "${mode}" (PM-008)`);
  }
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i].startsWith('--')) {
      options[rest[i].slice(2)] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
    }
  }
  return { command, options };
}

// Self-correction cycle shared by the gates. Constants on purpose: no flag can
// lower a threshold or grant extra attempts.
export const MAX_CORRECTIONS = 3;
export const REQUIRED_PCT = 100;
export const MAX_ERRORS = 0;

// SG-018 (regra legada): só a execução legacy usa esta parada. Uma avaliação reprovada sem
// queda de falhas em relação à anterior encerra o ciclo. O runner novo NÃO chama esta função
// (RC-041): ele para por limite de correções, sintoma repetido, orçamento, tempo ou decisão humana.
export function legacyNoProgressStop(failures, previousFailures) {
  return previousFailures !== undefined && failures >= previousFailures;
}

export function decideVerdict({ passed, failures }, previous) {
  if (passed) return 'pass';
  if (previous.length >= MAX_CORRECTIONS) return 'stop';
  const last = previous.at(-1);
  if (last && legacyNoProgressStop(failures, last.failures)) return 'stop';
  return 'retry';
}

export const pct = (pass, total) => (total === 0 ? null : Math.round((pass / total) * 10000) / 100);

// Resultado comum dos gates (D5). Um gate nunca grava estado: quem grava é a CLI
// legacy, com --legacy-write. Os gates locais não usam recurso pago.
export function gateResult({ gate, passed, failures, cases = [], evidence = {} }) {
  return { gate, passed: passed === true && failures === 0, failures, cases, evidence, paid: false, cost_source: null };
}

// Exit codes shared by the gate CLIs. `fail` is for gates without a cycle.
export const EXIT = Object.freeze({ pass: 0, retry: 1, fail: 1, stop: 2, error: 3 });

// True when the module is the process entry point, not when it is imported
// (also safe under `node -e`, where there is no script path).
export function isMain(moduleUrl) {
  return Boolean(process.argv[1]) && moduleUrl === pathToFileURL(process.argv[1]).href;
}

export async function runCli(main) {
  try {
    const result = await main();
    console.log(JSON.stringify(result, null, 2));
    process.exit(EXIT[result.verdict] ?? EXIT.pass);
  } catch (err) {
    console.log(JSON.stringify({ verdict: 'error', error: err.message }, null, 2));
    process.exit(EXIT.error);
  }
}
