// Helpers do simulador local do binário claude (fixtures/fake-claude.mjs). Nenhum
// deles chama o modelo: o binário usado é sempre o simulador falso.
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const FAKE_CLAUDE_BIN = [process.execPath, join(HERE, 'fixtures', 'fake-claude.mjs')];

export function newCallLog() {
  return join(mkdtempSync(join(tmpdir(), 'fake-claude-')), 'calls.jsonl');
}

// Chamadas registradas pelo simulador, na ordem em que ocorreram.
export function simulatorCalls(logPath) {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

// Ambiente do simulador: a resposta JSON desejada e variáveis extras (ex.: FAKE_CLAUDE_HANG).
export function simulatorEnv(logPath, output, extra = {}) {
  const base = { FAKE_CLAUDE_LOG: logPath };
  if (output !== undefined) base.FAKE_CLAUDE_OUTPUT = JSON.stringify(output);
  return { ...base, ...extra };
}
