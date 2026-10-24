// Lock ilegível (F6, tarefa 2.8, RS-022, D24): bloqueio com lock_unreadable, arquivo
// preservado, hash registrado no diagnóstico e liberação só com hash igual.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHANGE, makeRepo } from './fixture.mjs';
import { acquireLock, lockPath, releaseUnreadableLock } from '../../harness/lock.mjs';
import { loadState } from '../../harness/state.mjs';
import { writeTree } from '../helpers.mjs';

const T0 = Date.parse('2026-10-23T10:00:00.000Z');
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

function acquire(root) {
  return acquireLock(root, CHANGE, { executionId: randomUUID(), now: T0, host: 'host-a', pid: 1234 });
}

function writeLock(root, content) {
  mkdirSync(join(realpathSync(join(root, '.git')), 'harness', 'locks'), { recursive: true });
  writeFileSync(lockPath(root, CHANGE), content);
}

function diagnosticEvents(root) {
  const path = join(root, '.harness-local', CHANGE, 'events.jsonl');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function lockReleaseRecord(overrides = {}) {
  return {
    id: 'lock-ilegivel-1', kind: 'lock_release', origin: 'human', scope: { change: CHANGE },
    reason: 'lock de processo morto', approver: 'Douglas', date: '2026-10-23', ...overrides,
  };
}

test('[RS-022] lock com JSON truncado para com lock_unreadable, preserva o arquivo e informa o hash na saída', () => {
  const root = makeRepo();
  const content = '{"change": "add-spec-harness", "heartbeat';
  writeLock(root, content);
  const result = acquire(root);
  assert.equal(result.acquired, false);
  assert.equal(result.blockedBy, 'lock_held');
  assert.equal(result.stopReason, 'lock_unreadable');
  assert.equal(readFileSync(lockPath(root, CHANGE), 'utf8'), content);
  assert.equal(result.diagnostic.lock_sha256, sha256(content));
  assert.deepEqual(diagnosticEvents(root), [], 'a partida recusada não grava em events.jsonl (TE-009)');
});

test('[RS-022] lock com JSON válido mas sem heartbeat válido também é ilegível', () => {
  const root = makeRepo();
  writeLock(root, JSON.stringify({ change: CHANGE, execution_id: randomUUID() }));
  const result = acquire(root);
  assert.equal(result.stopReason, 'lock_unreadable');
});

test('[RS-022] lock ilegível não cria nem altera o estado da change', () => {
  const root = makeRepo();
  writeLock(root, '{truncado');
  acquire(root);
  assert.equal(loadState(root, CHANGE), null);
});

test('[RS-022] liberação de lock ilegível sem autorização humana é recusada e o arquivo permanece', () => {
  const root = makeRepo();
  writeLock(root, '{truncado');
  acquire(root);
  assert.throws(() => releaseUnreadableLock(root, CHANGE, { authorizationId: 'inexistente' }), /autorização/);
  assert.equal(existsSync(lockPath(root, CHANGE)), true);
});

test('[RS-022] liberação recusada quando o arquivo mudou depois do diagnóstico', () => {
  const root = makeRepo();
  writeLock(root, '{truncado');
  acquire(root);
  const registered = sha256('{truncado');
  writeTree(root, {
    [`openspec/changes/${CHANGE}/authorizations.json`]: [lockReleaseRecord({ lock_sha256: registered })],
  });
  writeFileSync(lockPath(root, CHANGE), '{truncado mais um pouco');
  assert.throws(() => releaseUnreadableLock(root, CHANGE, { authorizationId: 'lock-ilegivel-1' }), /hash/);
  assert.equal(existsSync(lockPath(root, CHANGE)), true);
});

test('[RS-022] liberação com hash igual ao registrado e autorização humana remove o lock e registra o evento', () => {
  const root = makeRepo();
  writeLock(root, '{truncado');
  acquire(root);
  writeTree(root, {
    [`openspec/changes/${CHANGE}/authorizations.json`]: [lockReleaseRecord({ lock_sha256: sha256('{truncado') })],
  });
  const result = releaseUnreadableLock(root, CHANGE, { authorizationId: 'lock-ilegivel-1' });
  assert.equal(result.released, true);
  assert.equal(existsSync(lockPath(root, CHANGE)), false);
  assert.ok(diagnosticEvents(root).some((item) => item.kind === 'lock' && item.event === 'released' && item.unreadable === true));
});

test('[RS-022] autorização de lock ilegível sem vínculo com o hash é recusada', () => {
  const root = makeRepo();
  writeLock(root, '{truncado');
  acquire(root);
  writeTree(root, {
    [`openspec/changes/${CHANGE}/authorizations.json`]: [lockReleaseRecord()],
  });
  assert.throws(() => releaseUnreadableLock(root, CHANGE, { authorizationId: 'lock-ilegivel-1' }), /hash/);
  assert.equal(existsSync(lockPath(root, CHANGE)), true);
});
