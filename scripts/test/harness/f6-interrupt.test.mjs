// Interrupção no meio de uma invocação simulada (F6, 6.6): o runner morre, o lock
// permanece, a retomada é bloqueada até a liberação humana, e a reconciliação humana
// libera a continuação. Nenhuma chamada ao modelo real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANGE, makeRepo } from './fixture.mjs';
import { lockPath, releaseStaleLock } from '../../harness/lock.mjs';
import { loadState } from '../../harness/state.mjs';
import { newCallLog, simulatorCalls } from './simulator.mjs';
import { grant, OK_OUTPUT, PROMPT, step, writeAuthorizations, HUMAN, readAuthorizationsFile } from './f6-support.mjs';
import { writeTree } from '../helpers.mjs';

// Interrupção com reserva aberta é fluxo financeiro: o modo financeiro é explícito (add-silent-consumption-observability).
const FINANCIAL = { provisional: true, modo_financeiro: true };

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = join(HERE, 'fixtures', 'runner-child.mjs');
const POLL_MS = 50;
const WAIT_LIMIT_MS = 15000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition, label) {
  const deadline = Date.now() + WAIT_LIMIT_MS;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`tempo esgotado esperando: ${label}`);
    await sleep(POLL_MS);
  }
}

function startChild(root, log) {
  return spawn(process.execPath, [CHILD], {
    env: {
      ...process.env,
      HARNESS_ROOT: root,
      HARNESS_CHANGE: CHANGE,
      HARNESS_PROMPT: PROMPT,
      FAKE_CLAUDE_LOG: log,
      FAKE_CLAUDE_HANG: '1',
      // O simulador preso encerra sozinho depois disso, para não sobrar processo órfão.
      FAKE_CLAUDE_HANG_MS: '4000',
      FAKE_CLAUDE_OUTPUT: JSON.stringify(OK_OUTPUT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('[RC-017] [RS-024] interrupção no meio da invocação: lock permanece, retomada exige decisão humana, nenhuma chamada real', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();

  const child = startChild(root, log);
  await waitFor(() => simulatorCalls(log).length === 1, 'invocação simulada iniciar');
  child.kill('SIGKILL');
  await new Promise((resolve) => child.on('exit', resolve));

  // 1. O lock permanece e a partida nova é bloqueada sem tocar no estado.
  assert.equal(existsSync(lockPath(root, CHANGE)), true);
  const lockBody = JSON.parse(readFileSync(lockPath(root, CHANGE), 'utf8'));
  const blocked = await step(root, log, OK_OUTPUT, { profile: FINANCIAL });
  assert.equal(blocked.invoked, false);
  assert.equal(blocked.stop_reason, 'lock_held');
  assert.equal(loadState(root, CHANGE).state, 'invoking');
  assert.equal(simulatorCalls(log).length, 1);

  // 2. Decisão humana: o lock_release cita o execution_id do lock, e o heartbeat vence
  // (o teste envelhece o heartbeat para representar o tempo passado).
  const expired = { ...lockBody, heartbeat_at: '2000-01-01T00:00:00.000Z' };
  writeFileSync(lockPath(root, CHANGE), `${JSON.stringify(expired, null, 2)}\n`);
  const reserved = loadState(root, CHANGE).open_reservations.length;
  writeTree(root, {
    [`openspec/changes/${CHANGE}/authorizations.json`]: [
      ...readAuthorizationsFile(root),
      {
        id: 'lock-1', kind: 'lock_release', origin: 'human', scope: { change: CHANGE }, project_id: lockBody.project_id,
        execution_id: lockBody.execution_id, reason: 'processo morto no meio da invocação', approver: 'Douglas',
        date: '2026-10-23', recorded_at: HUMAN.recorded_at, author: HUMAN.author,
      },
    ],
  });
  const released = releaseStaleLock(root, CHANGE, { authorizationId: 'lock-1', openReservations: reserved });
  assert.equal(released.released, true);
  assert.equal(released.reconciliation_required, true);

  // 3. A retomada encontra a invocação interrompida e para em interrupted, sem chamada.
  const resumed = await step(root, log, OK_OUTPUT, { profile: FINANCIAL });
  assert.equal(resumed.invoked, false);
  assert.equal(resumed.state, 'interrupted');
  assert.equal(resumed.stop_reason, 'reconciliation_required');
  assert.equal(simulatorCalls(log).length, 1);

  // 4. Reconciliação humana: a reserva da chamada interrompida é encerrada como custo desconhecido.
  const [interrupted] = loadState(root, CHANGE).open_reservations;
  writeTree(root, {
    [`openspec/changes/${CHANGE}/authorizations.json`]: [
      ...readAuthorizationsFile(root),
      {
        id: 'reconciliacao-1', kind: 'reconciliation', origin: 'human', scope: { change: CHANGE },
        approver: 'Douglas', date: '2026-10-23', observed_consumption: [], evidence_to_revalidate: [],
        reservations: [{ session_id: interrupted.session_id, decision: 'closed_unknown' }],
        reason: 'chamada interrompida pelo teste', recorded_at: HUMAN.recorded_at, author: HUMAN.author,
      },
    ],
  });
  const continued = await step(root, log, OK_OUTPUT, { profile: FINANCIAL });
  const state = loadState(root, CHANGE);
  assert.equal(continued.invoked, true);
  assert.equal(continued.state, 'awaiting_gate');
  assert.equal(simulatorCalls(log).length, 2);
  // A segunda chamada veio sem custo: a reserva dela segue aberta até reconciliação (RC-011).
  assert.equal(state.open_reservations.length, 1);
  assert.equal(state.open_reservations[0].invocation_id, continued.invocation_id);
  assert.equal(state.consumption.unknown_calls, 2);
});
