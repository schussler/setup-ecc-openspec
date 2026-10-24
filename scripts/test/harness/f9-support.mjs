// Apoio dos testes de telemetria e relatório (F9). Os valores vêm de fixtures e do simulador:
// nenhuma chamada ao modelo real e nenhum custo real.
import { utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { invokeHarness } from '../../harness/claude.mjs';
import { buildEvent } from '../../harness/telemetry.mjs';
import { FAKE_CLAUDE_BIN, newCallLog, simulatorEnv } from './simulator.mjs';

export const NOW = Date.parse('2026-10-23T12:00:00.000Z');
export const DAY_MS = 24 * 60 * 60 * 1000;
export const RUNTIME_22 = Object.freeze({ node_version: '22.12.0' });
export const GENERATED_AT = '2026-10-23T12:00:00.000Z';

const SESSION_ID = '5b0f3c1e-2d4a-4b6c-8e9f-0a1b2c3d4e5f';
const PROMPT = '/spec-implement add-spec-harness';
const TOOLS = ['Read', 'Grep'];

// Uma invocação real do runner contra o simulador, com a saída JSON informada.
export function simulatedInvocation(output) {
  return invokeHarness({
    bin: FAKE_CLAUDE_BIN, cwd: tmpdir(), prompt: PROMPT, allowedTools: TOOLS,
    sessionId: SESSION_ID, maxBudgetUsd: 2, env: simulatorEnv(newCallLog(), output),
  });
}

// Data de modificação do arquivo recuado em dias em relação a NOW (teste com datas simuladas).
export function ageFile(path, daysAgo) {
  const seconds = (NOW - daysAgo * DAY_MS) / 1000;
  utimesSync(path, seconds, seconds);
}

// Evento de chamada paga, com valores padrão que os testes sobrescrevem.
export function callEvent(fields = {}) {
  return buildEvent({
    agent: 'implementador', function: 'invocacao', status: 'ok', cost_usd: 1, cost_source: 'reported', ...fields,
  }, { at: GENERATED_AT });
}
