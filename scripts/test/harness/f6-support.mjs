// Helpers das suítes F6 (estados, paradas, retomada e interrupção). Nenhum helper
// chama o modelo: o binário é sempre o simulador fixtures/fake-claude.mjs.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runHarnessStep } from '../../harness/runner.mjs';
import { runSlice } from '../../harness/slice.mjs';
import { createState, loadState, saveState } from '../../harness/state.mjs';
import { CHANGE } from './fixture.mjs';
import { FAKE_CLAUDE_BIN, simulatorEnv } from './simulator.mjs';
import { writeTree } from '../helpers.mjs';

export const CHANGE_DIR = `openspec/changes/${CHANGE}`;
export const TOOLS = ['Read'];
export const PROMPT = '/spec-implement add-spec-harness';
export const CORRECTION_PROMPT = '/spec-implement add-spec-harness (correção)';
export const HUMAN = { origin: 'human', scope: { change: CHANGE }, recorded_at: '2026-10-23T12:00:00.000Z', author: 'mantenedor' };
export const OK_OUTPUT = { type: 'result', subtype: 'success', is_error: false, result: 'ok' };

// Saída paga do simulador: o custo informado vira consumo conhecido.
export function paidOutput(costUsd) {
  return { ...OK_OUTPUT, total_cost_usd: costUsd };
}

// Concessão de orçamento no formato D23 (por chamada = menor entre 2 e o total).
export function grant(id, totalUsd, extra = {}) {
  return { id, kind: 'budget', total_usd: totalUsd, per_call_usd: Math.min(2, totalUsd), reason: 'teste', approver: 'mantenedor', ...HUMAN, ...extra };
}

export function writeAuthorizations(root, records) {
  writeTree(root, { [`${CHANGE_DIR}/authorizations.json`]: records });
}

export function readAuthorizationsFile(root) {
  return JSON.parse(readFileSync(join(root, CHANGE_DIR, 'authorizations.json'), 'utf8'));
}

export function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

// Uma etapa do runner com o simulador. Opções extras sobrescrevem as padrão.
export function step(root, log, output, options = {}) {
  return runHarnessStep({
    root, change: CHANGE, bin: FAKE_CLAUDE_BIN, prompt: PROMPT, allowedTools: TOOLS,
    env: simulatorEnv(log, output), ...options,
  });
}

// Uma fatia completa (invocação, avaliações, correções) com o simulador.
// `evaluate` e `snapshot` são injetados: o gate real não é chamado aqui.
export function slice(root, log, options = {}) {
  return runSlice({
    root, change: CHANGE, bin: FAKE_CLAUDE_BIN, prompt: PROMPT, correctionPrompt: CORRECTION_PROMPT,
    allowedTools: TOOLS, env: simulatorEnv(log, OK_OUTPUT), gate: 'implement', snapshot: () => 'h0',
    ...options,
  });
}

// Altera campos do estado atual pela única via de escrita (saveState), sem pular validações.
export function patchState(root, patch) {
  const current = loadState(root, CHANGE) ?? createState(root, CHANGE, { mode: 'runner' });
  return saveState(root, CHANGE, { ...current, ...patch });
}

// Avaliação do gate escrita como lista de respostas, em ordem.
export function scripted(responses) {
  const queue = [...responses];
  const calls = [];
  const evaluate = async (context) => {
    calls.push(context);
    if (queue.length === 0) throw new Error('avaliações do roteiro esgotadas');
    return queue.shift();
  };
  evaluate.calls = calls;
  return evaluate;
}

export const passed = () => ({ outcome: 'passed', failures: [], errorClass: null });
export const failed = (failures) => ({ outcome: 'failed', failures, errorClass: 'assert' });

export function checkpointExists(root) {
  return existsSync(join(root, CHANGE_DIR, 'checkpoint.json'));
}
