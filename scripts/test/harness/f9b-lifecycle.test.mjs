// Eventos de ciclo de vida do runner (TE-010, decisão aprovada 2): início, conclusão, falha,
// interrupção e retomada, cada um com execution_id e at. Simulador apenas; nenhuma chamada ao modelo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANGE, makeRepo } from './fixture.mjs';
import { lockPath, releaseStaleLock } from '../../harness/lock.mjs';
import { readEvents, readLifecycleEvents } from '../../harness/telemetry.mjs';
import { loadState } from '../../harness/state.mjs';
import { newCallLog, simulatorCalls } from './simulator.mjs';
import { grant, OK_OUTPUT, PROMPT, readAuthorizationsFile, step, writeAuthorizations } from './f6-support.mjs';
import { writeTree } from '../helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = join(HERE, 'fixtures', 'runner-child.mjs');
const QUOTA_OUTPUT = { type: 'result', subtype: 'success', is_error: false, result: 'Claude AI usage limit reached|1760000000' };
const FAILED_OUTPUT = { type: 'result', subtype: 'error_during_execution', is_error: true, result: 'falhou' };
const WAIT_LIMIT_MS = 15000;
const POLL_MS = 50;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(condition, label) {
  const deadline = Date.now() + WAIT_LIMIT_MS;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`tempo esgotado esperando: ${label}`);
    await sleep(POLL_MS);
  }
}

function setup() {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  return { root, log: newCallLog() };
}

const phases = (root) => readLifecycleEvents(root, CHANGE).map((event) => event.phase);

test('[TE-010] primeira execução grava início e conclusão com o mesmo execution_id e data registrada', async () => {
  // Arrange
  const { root, log } = setup();
  const executionId = randomUUID();

  // Act
  const outcome = await step(root, log, OK_OUTPUT, { executionId });

  // Assert
  const events = readLifecycleEvents(root, CHANGE);
  assert.deepEqual(events.map((event) => event.phase), ['start', 'complete']);
  assert.ok(events.every((event) => event.execution_id === executionId && Number.isFinite(Date.parse(event.at))));
  const invocation = readEvents(root, CHANGE).find((event) => event.invocation_id === outcome.invocation_id);
  assert.ok(invocation, 'a invocação continua com o próprio evento de telemetria');
});

test('[TE-010] invocação que falha grava falha com a causa e o status da invocação', async () => {
  // Arrange
  const { root, log } = setup();

  // Act
  await step(root, log, FAILED_OUTPUT);

  // Assert
  const events = readLifecycleEvents(root, CHANGE);
  assert.deepEqual(events.map((event) => event.phase), ['start', 'fail']);
  assert.equal(events[1].status, 'error');
  assert.equal(events[1].cause, 'error_during_execution');
});

test('[TE-010] retomada da mesma execução grava retomada com o mesmo execution_id, depois conclui', async () => {
  // Arrange: a primeira invocação esgota a cota e a change fica em parada.
  const { root, log } = setup();
  const executionId = randomUUID();
  const first = await step(root, log, QUOTA_OUTPUT, { executionId });
  assert.equal(first.stop_reason, 'quota_unavailable');

  // Act
  await step(root, log, OK_OUTPUT, { executionId });

  // Assert
  const events = readLifecycleEvents(root, CHANGE);
  assert.deepEqual(events.map((event) => event.phase), ['start', 'fail', 'resume', 'complete']);
  assert.ok(events.every((event) => event.execution_id === executionId));
});

test('[TE-010] nova execução a partir de parada grava início que referencia a execução anterior', async () => {
  // Arrange
  const { root, log } = setup();
  const previous = randomUUID();
  await step(root, log, QUOTA_OUTPUT, { executionId: previous });
  const next = randomUUID();

  // Act
  await step(root, log, OK_OUTPUT, { executionId: next, newExecution: true });

  // Assert
  const starts = readLifecycleEvents(root, CHANGE).filter((event) => event.phase === 'start');
  assert.equal(starts.length, 2);
  assert.equal(starts[1].execution_id, next);
  assert.equal(starts[1].previous_execution_id, previous);
  assert.equal(loadState(root, CHANGE).previous_execution_id, previous);
});

test('[TE-010] processo do runner morto no meio da invocação gera interrupção na retomada, com o mesmo execution_id', async () => {
  // Arrange: o runner-filho prende a invocação no simulador; o teste o mata com SIGKILL.
  const { root, log } = setup();
  const child = spawn(process.execPath, [CHILD], {
    env: {
      ...process.env,
      HARNESS_ROOT: root,
      HARNESS_CHANGE: CHANGE,
      HARNESS_PROMPT: PROMPT,
      FAKE_CLAUDE_LOG: log,
      FAKE_CLAUDE_HANG: '1',
      FAKE_CLAUDE_HANG_MS: '4000',
      FAKE_CLAUDE_OUTPUT: JSON.stringify(OK_OUTPUT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitFor(() => simulatorCalls(log).length === 1, 'invocação simulada iniciar');
  child.kill('SIGKILL');
  await new Promise((resolve) => child.on('exit', resolve));
  const invocationId = loadState(root, CHANGE).invocation_id;
  const executionId = loadState(root, CHANGE).execution_id;

  // Libera o lock vencido com autorização humana, como no teste de interrupção da F6.
  const lock = JSON.parse(readFileSync(lockPath(root, CHANGE), 'utf8'));
  writeFileSync(lockPath(root, CHANGE), `${JSON.stringify({ ...lock, heartbeat_at: '2000-01-01T00:00:00.000Z' }, null, 2)}\n`);
  writeTree(root, {
    [`openspec/changes/${CHANGE}/authorizations.json`]: [...readAuthorizationsFile(root), {
      id: 'lock-1', kind: 'lock_release', origin: 'human', scope: { change: CHANGE }, project_id: lock.project_id,
      execution_id: lock.execution_id, reason: 'processo morto no meio da invocação', approver: 'mantenedor',
      date: '2026-10-23',
    }],
  });
  releaseStaleLock(root, CHANGE, { authorizationId: 'lock-1' });

  // Act
  const resumed = await step(root, log, OK_OUTPUT, { executionId });

  // Assert
  assert.equal(resumed.invoked, false);
  const events = readLifecycleEvents(root, CHANGE);
  assert.deepEqual(events.map((event) => event.phase), ['start', 'resume', 'interrupt']);
  assert.equal(events[2].invocation_id, invocationId);
  assert.ok(events.every((event) => event.execution_id === executionId));
  assert.equal(phases(root).length, 3);
});
