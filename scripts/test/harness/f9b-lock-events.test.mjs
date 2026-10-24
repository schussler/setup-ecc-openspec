// Diagnósticos de lock em events.jsonl (TE-009, decisão aprovada 1): só o detentor do lock grava
// kind "lock"; partida recusada não acrescenta linha e mostra o diagnóstico na saída do comando.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CHANGE, makeRepo, PROJECT_ID } from './fixture.mjs';
import { acquireLock, lockPath, releaseLock } from '../../harness/lock.mjs';
import { readLockEvents } from '../../harness/telemetry.mjs';
import { grant, OK_OUTPUT, step, writeAuthorizations } from './f6-support.mjs';
import { newCallLog, simulatorCalls } from './simulator.mjs';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const EVENTS_PATH = (root) => join(root, '.harness-local', CHANGE, 'events.jsonl');
const eventsText = (root) => (existsSync(EVENTS_PATH(root)) ? readFileSync(EVENTS_PATH(root), 'utf8') : '');

test('[TE-009] o detentor do lock grava kind lock com identificação própria ao liberar', () => {
  // Arrange
  const root = makeRepo();
  const executionId = randomUUID();

  // Act
  const acquired = acquireLock(root, CHANGE, { executionId });
  releaseLock(root, CHANGE, executionId);

  // Assert
  assert.equal(acquired.acquired, true);
  const events = readLockEvents(root, CHANGE);
  assert.deepEqual(events.map((event) => event.event), ['released']);
  for (const event of events) {
    assert.equal(event.kind, 'lock');
    assert.equal(event.lock_id, acquired.lock.lock_id);
    assert.equal(event.execution_id, executionId);
    assert.equal(event.change, CHANGE);
    assert.equal(event.project_id, PROJECT_ID);
    assert.equal(typeof event.local_id, 'string');
    assert.equal(typeof event.at, 'string');
  }
});

test('[TE-009] partida recusada por lock_held não acrescenta linha e mostra project_id, change e local_id na saída', async () => {
  // Arrange: outro processo detém o lock com heartbeat recente.
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  acquireLock(root, CHANGE, { executionId: randomUUID() });
  const before = eventsText(root);
  const log = newCallLog();

  // Act
  const outcome = await step(root, log, OK_OUTPUT);

  // Assert
  assert.equal(outcome.stop_reason, 'lock_held');
  assert.equal(eventsText(root), before, 'a partida recusada não pode acrescentar linha');
  assert.equal(simulatorCalls(log).length, 0);
  assert.equal(outcome.diagnostic.project_id, PROJECT_ID);
  assert.equal(outcome.diagnostic.change, CHANGE);
  assert.equal(typeof outcome.diagnostic.local_id, 'string');
  assert.deepEqual(readLockEvents(root, CHANGE), [], 'nenhum diagnóstico de lock foi gravado pela partida recusada');
});

test('[TE-009] partida recusada por lock_unreadable não acrescenta linha e informa o hash do conteúdo na saída', async () => {
  // Arrange
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const content = '{"change": "add-spec-harness", "heartbeat';
  mkdirSync(dirname(lockPath(root, CHANGE)), { recursive: true });
  writeFileSync(lockPath(root, CHANGE), content);

  // Act
  const outcome = await step(root, newCallLog(), OK_OUTPUT);

  // Assert
  assert.equal(outcome.stop_reason, 'lock_unreadable');
  assert.equal(existsSync(EVENTS_PATH(root)), false, 'a partida recusada não cria nem altera events.jsonl');
  assert.equal(outcome.diagnostic.lock_sha256, sha256(content));
  assert.equal(outcome.diagnostic.project_id, PROJECT_ID);
  assert.equal(readFileSync(lockPath(root, CHANGE), 'utf8'), content);
});
