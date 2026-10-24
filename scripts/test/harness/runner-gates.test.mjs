// Portões do runner antes e depois de cada invocação (F5). O binário é o simulador
// local, e cada teste conta as chamadas dele. Nome de cada teste começa pelo ID.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { runHarnessStep } from '../../harness/runner.mjs';
import { createState, loadState } from '../../harness/state.mjs';
import { REPO_ROOT, CHANGE, makeRepo } from './fixture.mjs';
import { FAKE_CLAUDE_BIN, newCallLog, simulatorCalls, simulatorEnv } from './simulator.mjs';
import { writeTree } from '../helpers.mjs';

const TOOLS = ['Read'];
const PROMPT = '/spec-implement add-spec-harness';
const CHANGE_DIR = `openspec/changes/${CHANGE}`;
const OK_OUTPUT = { type: 'result', subtype: 'success', is_error: false, result: 'ok' };
const HUMAN = { origin: 'human', scope: { change: CHANGE }, recorded_at: '2026-10-23T12:00:00.000Z', author: 'douglas' };
// Testes de orçamento exercitam o modo financeiro, que é explícito desde add-silent-consumption-observability.
const FINANCIAL = { provisional: true, modo_financeiro: true };

// Concessão no formato D23: total_usd e per_call_usd (por chamada = menor entre 2 e o total).
function grant(id, totalUsd, extra = {}) {
  return { id, kind: 'budget', total_usd: totalUsd, per_call_usd: Math.min(2, totalUsd), reason: 'teste', approver: 'Douglas', ...HUMAN, ...extra };
}

function probe(result, extra = {}) {
  return { id: `probe-${result}`, kind: 'probe_result', result, reason: 'sonda P.2', approver: 'Douglas', ...HUMAN, ...extra };
}

function writeAuthorizations(root, records) {
  writeTree(root, { [`${CHANGE_DIR}/authorizations.json`]: records });
}

function step(root, log, output, options = {}) {
  return runHarnessStep({
    root, change: CHANGE, bin: FAKE_CLAUDE_BIN, prompt: PROMPT, allowedTools: TOOLS,
    env: simulatorEnv(log, output), ...options,
  });
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

test('[HE-005] sem autorização de orçamento nenhuma invocação começa', async () => {
  const root = makeRepo();
  writeAuthorizations(root, []);
  const log = newCallLog();
  const outcome = await step(root, log, OK_OUTPUT, { profile: FINANCIAL });
  assert.equal(outcome.invoked, false);
  assert.equal(outcome.stop_reason, 'authorization_required');
  assert.equal(outcome.state, 'awaiting_decision');
  assert.equal(simulatorCalls(log).length, 0);
});

test('[RC-021] candidato de gasto no perfil não autoriza nenhum gasto', async () => {
  const root = makeRepo();
  writeAuthorizations(root, []);
  const log = newCallLog();
  const outcome = await step(root, log, OK_OUTPUT, { profile: { ...FINANCIAL, candidate_usd_per_change: 30 } });
  assert.equal(outcome.invoked, false);
  assert.equal(simulatorCalls(log).length, 0);
});

test('[PO-013] perfil com limite de turnos sem probe_result enforced para com config_error antes da primeira chamada', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  const outcome = await step(root, log, OK_OUTPUT, { profile: { max_turns: 1 } });
  assert.equal(outcome.invoked, false);
  assert.equal(outcome.state, 'config_blocked');
  assert.equal(outcome.stop_reason, 'config_error');
  assert.equal(simulatorCalls(log).length, 0);
});

test('[PO-013] probe_result enforced humano libera o perfil, e o limite de turnos não vai para o comando', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30), probe('enforced')]);
  const log = newCallLog();
  const outcome = await step(root, log, OK_OUTPUT, { profile: { max_turns: 1 } });
  assert.equal(outcome.invoked, true);
  const calls = simulatorCalls(log);
  assert.equal(calls.length, 1);
  assert.ok(!calls[0].args.includes('--max-turns'));
});

test('[PO-013] probe_result não enforced ou de origem não humana não libera o perfil', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30), probe('not_enforced'), probe('enforced', { origin: 'agent' })]);
  const log = newCallLog();
  const outcome = await step(root, log, OK_OUTPUT, { profile: { max_turns: 1 } });
  assert.equal(outcome.stop_reason, 'config_error');
  assert.equal(simulatorCalls(log).length, 0);
});

test('[RC-029] registro de orçamento sem origem humana não autoriza gasto', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('agente', 30, { origin: 'agent' })]);
  const log = newCallLog();
  const outcome = await step(root, log, OK_OUTPUT, { profile: FINANCIAL });
  assert.equal(outcome.invoked, false);
  assert.equal(simulatorCalls(log).length, 0);
});

test('[HE-004] o limite efetivo vai em --max-budget-usd e o runner cria o estado em modo runner', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  const outcome = await step(root, log, OK_OUTPUT, { profile: FINANCIAL });
  assert.equal(outcome.invoked, true);
  assert.equal(outcome.limit_usd, 2);
  const [call] = simulatorCalls(log);
  assert.equal(valueAfter(call.args, '--max-budget-usd'), '2');
  assert.equal(loadState(root, CHANGE).mode, 'runner');
});

test('[RC-008] reserva que não cabe no orçamento autorizado não inicia a chamada', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 2)]);
  const log = newCallLog();
  const outcome = await step(root, log, OK_OUTPUT, { profile: FINANCIAL });
  assert.equal(outcome.invoked, false);
  assert.equal(outcome.stop_reason, 'budget_reserve_insufficient');
  assert.equal(outcome.state, 'awaiting_decision');
  assert.equal(simulatorCalls(log).length, 0);
});

test('[RC-009] orçamento esgotado para a próxima chamada e mantém o consumo', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 3)]);
  const log = newCallLog();
  const first = await step(root, log, { ...OK_OUTPUT, total_cost_usd: 3 }, { profile: FINANCIAL });
  assert.equal(first.invoked, true);
  const second = await step(root, log, OK_OUTPUT, { profile: FINANCIAL });
  assert.equal(second.invoked, false);
  assert.equal(second.stop_reason, 'budget_exhausted');
  assert.equal(simulatorCalls(log).length, 1);
  assert.equal(loadState(root, CHANGE).consumption.known_usd, 3);
});

test('[RC-010] [RC-011] custo ausente conta como desconhecido e a reserva segue comprometida', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 4)]);
  const log = newCallLog();
  const first = await step(root, log, OK_OUTPUT, { profile: FINANCIAL });
  assert.equal(first.invoked, true);
  assert.equal(first.result.cost_source, 'unknown');
  const state = loadState(root, CHANGE);
  assert.equal(state.consumption.unknown_calls, 1);
  assert.equal(state.open_reservations.length, 1);
  const second = await step(root, log, OK_OUTPUT, { profile: FINANCIAL });
  assert.equal(second.invoked, false);
  assert.equal(second.stop_reason, 'budget_reserve_insufficient');
  assert.equal(simulatorCalls(log).length, 1);
});

test('[RS-015] estado em modo legacy não recebe chamadas do runner', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  createState(root, CHANGE, { mode: 'legacy' });
  const log = newCallLog();
  const outcome = await step(root, log, OK_OUTPUT);
  assert.equal(outcome.invoked, false);
  assert.equal(outcome.stop_reason, 'mode_mismatch');
  assert.equal(simulatorCalls(log).length, 0);
});

test('[RC-029] runner e skills não importam nem chamam o registro de autorizações', () => {
  const dirs = [join(REPO_ROOT, 'scripts', 'harness'), join(REPO_ROOT, '.claude', 'skills')];
  const files = dirs.flatMap((dir) => readdirSync(dir, { recursive: true }).map((name) => join(dir, name)))
    .filter((path) => /\.(mjs|md)$/.test(path) && statSync(path).isFile())
    .filter((path) => !path.endsWith(join('scripts', 'harness', 'authorize.mjs')));
  // Exceção única (simplify-approval-and-execution, AP-006): o comando `authorize.mjs conversa` da skill
  // spec-create registra a aprovação de contrato dada pelo usuário na conversa. Só essa linha é removida
  // da conferência; `recordAuthorization` e `authorize.mjs record` continuam proibidos em todo lugar.
  const CONVERSATION_COMMAND = /node scripts\/harness\/authorize\.mjs conversa [^\n`]*/;
  const offenders = files.filter((path) => {
    const text = readFileSync(path, 'utf8').replace(new RegExp(CONVERSATION_COMMAND.source, 'g'), '');
    return /authorize\.mjs|recordAuthorization/.test(text);
  }).map((path) => relative(REPO_ROOT, path));
  assert.deepEqual(offenders, []);
  const conversation = files.filter((path) => CONVERSATION_COMMAND.test(readFileSync(path, 'utf8')))
    .map((path) => relative(REPO_ROOT, path));
  assert.deepEqual(conversation, [join('.claude', 'skills', 'spec-create', 'SKILL.md')]);
});
