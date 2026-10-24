// Interrupção durante a avaliação de gate (C.3, D8, D25, RC-042 a RC-046): timeout com encerramento da
// árvore de processos, sinal externo, término não confirmado e recuperação que reexecuta o gate do início.
// Sem esperas longas: o gate travado é uma fixture que dorme mais que um timeout curto injetado, e o sinal
// vem de um emissor injetado. Nenhum teste chama o modelo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHANGE, makeRepo } from './fixture.mjs';
import { runCommand } from '../../gates/checks.mjs';
import { groupAlive } from '../../harness/process-group.mjs';
import { guardedEvaluation } from '../../harness/gate-guard.mjs';
import { resumeExecution } from '../../harness/runner.mjs';
import { approveSlice, runSlice } from '../../harness/slice.mjs';
import { TRANSITIONS } from '../../harness/machine.mjs';
import { localDir } from '../../harness/identity.mjs';
import { createState, loadState, saveState } from '../../harness/state.mjs';
import { gateImplement, interrupt } from '../../harness/cli-actions.mjs';
import { passed, scripted } from './f6-support.mjs';

const EXECUTION_ID = '0c9b8a7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d';
// A fixture dorme bem mais que o timeout injetado; o teste nunca espera o sono inteiro.
const HUNG_SECONDS = 30;
const SHORT_TIMEOUT_MS = 200;
const GRACE_MS = 200;
const FAST_LIMIT_MS = 5000;
const POLL_MS = 20;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function awaitingGate(root, extra = {}) {
  const created = createState(root, CHANGE, { mode: 'runner', executionId: EXECUTION_ID });
  return saveState(root, CHANGE, { ...created, state: 'awaiting_gate', stop_reason: null, ...extra });
}

function eventsOf(root) {
  const path = join(localDir(root, CHANGE), 'events.jsonl');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

// Gate travado: lança um processo que dorme HUNG_SECONDS e registra o pid no guarda.
function hungGate(root, spawned) {
  const evaluate = async ({ onSpawn }) => {
    evaluate.calls += 1;
    await runCommand(`sleep ${HUNG_SECONDS}`, { cwd: root, onSpawn: (pid) => { spawned.push(pid); onSpawn(pid); } });
    return { outcome: 'passed', failures: [], errorClass: null };
  };
  evaluate.calls = 0;
  return evaluate;
}

async function waitGone(pid) {
  const deadline = Date.now() + FAST_LIMIT_MS;
  while (groupAlive(pid) && Date.now() < deadline) await sleep(POLL_MS);
}

function killGroup(pid) {
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // grupo já encerrado
  }
}

const guard = (root, evaluate, options = {}) => guardedEvaluation({
  root, change: CHANGE, gate: 'implement', evaluate, timeoutMs: SHORT_TIMEOUT_MS, killGraceMs: GRACE_MS,
  signalSource: new EventEmitter(), executionId: EXECUTION_ID, ...options,
});

test('[RC-059] gate travado: o timeout encerra a árvore e a execução vai a interrupted sem reconciliação financeira', async () => {
  const root = makeRepo();
  awaitingGate(root);
  const spawned = [];
  const started = Date.now();

  const result = await guard(root, hungGate(root, spawned));

  assert.ok(Date.now() - started < FAST_LIMIT_MS, 'o guarda não pode esperar o sono da fixture');
  assert.equal(result.status, 'interrupted');
  assert.equal(result.cause, 'timeout');
  assert.equal(result.termination_confirmed, true);
  assert.equal(groupAlive(spawned[0]), false, 'a árvore de processos do gate foi encerrada');
  const state = loadState(root, CHANGE);
  assert.equal(state.state, 'interrupted');
  assert.equal(state.stop_reason, null, 'sem reserva: não exige reconciliação financeira (RC-046)');
  assert.deepEqual(state.open_reservations, []);
  assert.equal(state.termination_unconfirmed ?? null, null);
  assert.equal(state.gate_interruptions.at(-1).partial_result, 'discarded');
  const events = eventsOf(root).filter((event) => event.phase === 'interrupt');
  assert.equal(events.length, 1);
  assert.equal(events[0].cause, 'gate_timeout');
});

test('[RC-059] resultado tardio do gate interrompido é descartado e não aprova a fatia', async () => {
  const root = makeRepo();
  awaitingGate(root);
  const spawned = [];
  const evaluate = hungGate(root, spawned);

  await guard(root, evaluate);
  await waitGone(spawned[0]);
  await sleep(POLL_MS * 5);

  const state = loadState(root, CHANGE);
  assert.equal(state.state, 'interrupted');
  assert.equal(approveSlice(root, CHANGE, { gate: 'implement' }).ok, false, 'interrupted → approved não está na tabela');
  assert.equal((state.slice_approvals ?? []).length, 0);
});

test('[RC-059] encerramento não confirmado registra término não confirmado e bloqueia nova avaliação', async () => {
  const root = makeRepo();
  awaitingGate(root);
  const spawned = [];
  try {
    const result = await guard(root, hungGate(root, spawned), {
      terminate: async () => ({ confirmed: false, signals: ['SIGTERM', 'SIGKILL'] }),
    });

    assert.equal(result.status, 'interrupted');
    assert.equal(result.termination_confirmed, false);
    const state = loadState(root, CHANGE);
    assert.equal(state.state, 'interrupted');
    assert.equal(state.stop_reason, 'human_decision_needed');
    assert.equal(state.termination_unconfirmed.kind, 'gate');

    const second = hungGate(root, []);
    const refused = await guard(root, second);
    assert.equal(refused.status, 'refused');
    assert.equal(refused.blocked_by, 'termination_unconfirmed');
    assert.equal(second.calls, 0, 'a avaliação nova não inicia (RC-044)');

    const resumed = resumeExecution({ root, change: CHANGE });
    assert.equal(resumed.status, 'refused');
    assert.equal(resumed.stop_reason, 'human_decision_needed');
    assert.equal(loadState(root, CHANGE).state, 'interrupted');
  } finally {
    spawned.forEach(killGroup);
  }
});

test('[RC-059] gate-implement da CLI com gate travado devolve interrupted e não grava tentativa', async () => {
  const root = makeRepo();
  awaitingGate(root, { gates: { implement: { baseline: { test_files: [], case_ids: [] }, attempts: [] } } });
  const spawned = [];
  const evaluate = async ({ root: dir, onSpawn }) => {
    await runCommand(`sleep ${HUNG_SECONDS}`, { cwd: dir, onSpawn: (pid) => { spawned.push(pid); onSpawn(pid); } });
    return { gate: 'implement', passed: true, failures: 0, cases: [{ id: 'X', status: 'pass' }] };
  };

  const result = await gateImplement({
    root, change: CHANGE, options: {}, evaluate,
    guard: { timeoutMs: SHORT_TIMEOUT_MS, killGraceMs: GRACE_MS, signalSource: new EventEmitter() },
  });

  assert.equal(result.status, 'interrupted');
  assert.equal(result.termination_confirmed, true);
  assert.equal(groupAlive(spawned[0]), false);
  const state = loadState(root, CHANGE);
  assert.equal(state.state, 'interrupted');
  assert.deepEqual(state.gates.implement.attempts, [], 'resultado parcial descartado: nenhuma tentativa');
});

test('[RC-060] sinal externo durante o gate encerra a árvore e vai a interrupted', async () => {
  const root = makeRepo();
  awaitingGate(root);
  const spawned = [];
  const source = new EventEmitter();
  const evaluate = hungGate(root, spawned);

  const pending = guard(root, evaluate, { timeoutMs: HUNG_SECONDS * 1000, signalSource: source });
  while (spawned.length === 0) await sleep(POLL_MS);
  source.emit('SIGTERM');
  const result = await pending;

  assert.equal(result.status, 'interrupted');
  assert.equal(result.cause, 'signal');
  assert.equal(result.termination_confirmed, true);
  assert.equal(groupAlive(spawned[0]), false);
  assert.equal(loadState(root, CHANGE).state, 'interrupted');
  assert.equal(eventsOf(root).find((event) => event.phase === 'interrupt').cause, 'gate_signal');
  assert.equal(source.listenerCount('SIGTERM'), 0, 'o guarda remove os ouvintes de sinal');
});

test('[RC-060] interrupção externa registrada pela CLI em awaiting_gate vai a interrupted como interrupção de gate', async () => {
  const root = makeRepo();
  awaitingGate(root, { gate_run: { gate_run_id: 'gate-run-morto', gate: 'implement', started_at: '2026-10-24T00:00:00.000Z', pids: [] } });

  const result = await interrupt({ root, change: CHANGE });

  assert.equal(result.status, 'recorded');
  const state = loadState(root, CHANGE);
  assert.equal(state.state, 'interrupted');
  assert.equal(state.gate_interruptions.at(-1).cause, 'external');
  assert.equal(state.gate_interruptions.at(-1).partial_result, 'discarded');
  assert.equal(state.gate_run ?? null, null);
});

test('[RC-061] retomada da mesma execução volta a awaiting_gate e reexecuta o gate do início', async () => {
  const root = makeRepo();
  awaitingGate(root);
  const spawned = [];
  await guard(root, hungGate(root, spawned));
  await waitGone(spawned[0]);

  const resumed = resumeExecution({ root, change: CHANGE });
  assert.equal(resumed.status, 'resumed');
  assert.equal(resumed.state, 'awaiting_gate');
  assert.equal(resumed.execution_id, EXECUTION_ID);
  const interruption = loadState(root, CHANGE).gate_interruptions.at(-1);
  assert.equal(interruption.partial_result, 'discarded');
  assert.ok(interruption.resumed_at);

  // O gate roda de novo do início, sem nova invocação: o binário inexistente falharia se fosse chamado.
  const evaluate = scripted([passed(), passed()]);
  const result = await runSlice({
    root, change: CHANGE, bin: join(root, 'sem-binario'), prompt: 'p', correctionPrompt: 'c', allowedTools: ['Read'],
    evaluate, gate: 'implement', snapshot: () => 'h0', signalSource: new EventEmitter(),
  });

  assert.equal(result.state, 'approved');
  assert.equal(evaluate.calls.length, 2);
  assert.equal(evaluate.calls[0].round, loadState(root, CHANGE).round);
  assert.equal(loadState(root, CHANGE).gate_rerun_pending ?? null, null);
});

test('[RC-061] tabela aceita awaiting_gate → interrupted e interrupted → awaiting_gate, e não interrupted → approved', () => {
  assert.ok(TRANSITIONS.awaiting_gate.includes('interrupted'));
  assert.ok(TRANSITIONS.interrupted.includes('awaiting_gate'));
  assert.ok(!TRANSITIONS.interrupted.includes('approved'));
});
