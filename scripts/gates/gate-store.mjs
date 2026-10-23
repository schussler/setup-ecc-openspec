// Reads and writes openspec/changes/<change>/gates.json, the per-change log
// of every gate evaluation. It is archived together with the change.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

export function decideVerdict({ passed, failures }, previous) {
  if (passed) return 'pass';
  if (previous.length >= MAX_CORRECTIONS) return 'stop';
  const last = previous.at(-1);
  if (last && failures >= last.failures) return 'stop';
  return 'retry';
}

export const pct = (pass, total) => (total === 0 ? null : Math.round((pass / total) * 10000) / 100);

// Exit codes shared by the gate CLIs. `fail` is for gates without a cycle.
export const EXIT = Object.freeze({ pass: 0, retry: 1, fail: 1, stop: 2, error: 3 });

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
