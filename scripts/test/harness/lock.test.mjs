import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHANGE, PROJECT_ID, addWorktree, makeRepo } from './fixture.mjs';
import { acquireLock, heartbeat, releaseLock, releaseStaleLock } from '../../harness/lock.mjs';
import { localDir, localId } from '../../harness/identity.mjs';
import { ConfigError, loadPolicy } from '../../harness/policy.mjs';
import { createState, loadState } from '../../harness/state.mjs';

const T0 = Date.parse('2026-10-23T10:00:00.000Z');
const DATE = '2026-10-23';

function lockFile(root, change = CHANGE) {
  return join(realpathSync(join(root, '.git')), 'harness', 'locks', `${change}.lock`);
}

function readLock(root, change = CHANGE) {
  return JSON.parse(readFileSync(lockFile(root, change), 'utf8'));
}

function acquire(root, options = {}) {
  return acquireLock(root, CHANGE, { executionId: randomUUID(), now: T0, host: 'host-a', pid: 1234, ...options });
}

function authorizationsFile(root) {
  return join(root, 'openspec', 'changes', CHANGE, 'authorizations.json');
}

function writeAuthorizations(root, records) {
  writeFileSync(authorizationsFile(root), `${JSON.stringify(records, null, 2)}\n`);
}

// Registro humano de lock_release citando o lock (projeto, change e execução).
function lockRelease(overrides = {}) {
  return {
    id: 'auth-release',
    kind: 'lock_release',
    origin: 'human',
    project_id: PROJECT_ID,
    execution_id: overrides.execution_id ?? 'exec-vencido',
    scope: { change: CHANGE },
    reason: 'processo morto',
    approver: 'Douglas',
    date: DATE,
    ...overrides,
  };
}

// Cria um lock de outro host com heartbeat no instante informado.
function foreignLock(root, { executionId = randomUUID(), heartbeatAt = T0, host = 'outro-host' } = {}) {
  mkdirSync(join(realpathSync(join(root, '.git')), 'harness', 'locks'), { recursive: true });
  const body = {
    project_id: PROJECT_ID,
    change: CHANGE,
    local_id: randomUUID(),
    execution_id: executionId,
    pid: 99,
    host,
    started_at: new Date(heartbeatAt).toISOString(),
    heartbeat_at: new Date(heartbeatAt).toISOString(),
  };
  writeFileSync(lockFile(root), JSON.stringify(body));
  return body;
}

function staleNow(root) {
  return T0 + (loadPolicy(root).lock_stale_seconds + 1) * 1000;
}

function assertRefusal(fn, stopReason, message) {
  assert.throws(fn, (err) => err instanceof ConfigError && err.stopReason === stopReason && (message === undefined || message.test(err.message)));
}

test('[RS-009] lock contém project_id, local_id, execução, pid, host, started_at e heartbeat_at', () => {
  const root = makeRepo();
  const executionId = randomUUID();

  const result = acquire(root, { executionId });

  assert.equal(result.acquired, true);
  const lock = readLock(root);
  assert.equal(lock.execution_id, executionId);
  assert.equal(lock.change, CHANGE);
  assert.equal(lock.project_id, PROJECT_ID);
  assert.equal(lock.local_id, localId(root));
  assert.equal(lock.pid, 1234);
  assert.equal(lock.host, 'host-a');
  assert.equal(lock.started_at, new Date(T0).toISOString());
  assert.equal(lock.heartbeat_at, new Date(T0).toISOString());
  assert.equal('project_key' in lock, false, 'o lock não usa mais identidade derivada do caminho');
});

test('[RS-009] segundo runner da mesma change em outro worktree é recusado com lock_held', () => {
  const root = makeRepo();
  const owner = randomUUID();
  acquire(root, { executionId: owner });
  const worktree = addWorktree(root, 'wt-segundo');

  const result = acquire(worktree, { executionId: randomUUID() });

  assert.equal(result.acquired, false);
  assert.equal(result.stopReason, 'lock_held');
  assert.equal(readLock(root).execution_id, owner, 'o dono do lock não pode ser trocado');
  assert.equal(existsSync(localDir(worktree, CHANGE)), false, 'a recusa não cria estado local');
});

test('[RS-009] lock_held não altera o estado da change, mesmo com estado existente', () => {
  const root = makeRepo();
  const owner = randomUUID();
  acquire(root, { executionId: owner });
  createState(root, CHANGE, { mode: 'runner', executionId: owner });
  const before = readFileSync(join(localDir(root, CHANGE), 'run-state.json'), 'utf8');
  const worktree = addWorktree(root, 'wt-sem-mudanca');

  const result = acquire(worktree, { executionId: randomUUID() });

  assert.equal(result.stopReason, 'lock_held');
  assert.equal(readFileSync(join(localDir(root, CHANGE), 'run-state.json'), 'utf8'), before);
  assert.equal(loadState(root, CHANGE).revision, 1);
  assert.equal(existsSync(localDir(worktree, CHANGE)), false);
});

test('[RS-016] lock de outra change não bloqueia esta execução', () => {
  const root = makeRepo();
  const other = acquireLock(root, 'outra-change', { executionId: randomUUID(), now: T0, host: 'host-a', pid: 1 });
  assert.equal(other.acquired, true);

  const result = acquire(root);

  assert.equal(result.acquired, true);
});

test('[RS-010] vencimento só por heartbeat: lock vencido vai a awaiting_decision e não é removido', () => {
  const root = makeRepo();
  const owner = randomUUID();
  acquire(root, { executionId: owner });

  const result = acquire(root, { now: staleNow(root) });

  assert.equal(result.acquired, false);
  assert.equal(result.stopReason, 'stale_lock');
  assert.equal(result.state, 'awaiting_decision');
  assert.equal(readLock(root).execution_id, owner);
});

test('[RS-010] lock dentro do prazo de heartbeat continua válido', () => {
  const root = makeRepo();
  acquire(root);
  const staleSeconds = loadPolicy(root).lock_stale_seconds;

  const result = acquire(root, { now: T0 + (staleSeconds - 1) * 1000 });

  assert.equal(result.acquired, false);
  assert.equal(result.stopReason, 'lock_held');
});

test('[RS-010] vencimento só por heartbeat: lock de outro host com heartbeat vencido vai a awaiting_decision', () => {
  const root = makeRepo();
  const owner = foreignLock(root, { heartbeatAt: T0 });

  const result = acquire(root, { now: staleNow(root) });

  assert.equal(result.stopReason, 'stale_lock');
  assert.equal(result.state, 'awaiting_decision');
  assert.equal(readLock(root).execution_id, owner.execution_id);
});

test('[RS-010] lock ilegível não é tratado como vencido por heartbeat', () => {
  const root = makeRepo();
  mkdirSync(join(realpathSync(join(root, '.git')), 'harness', 'locks'), { recursive: true });
  writeFileSync(lockFile(root), '{truncado');

  const result = acquire(root, { now: staleNow(root) });

  assert.equal(result.acquired, false);
  assert.equal(result.blockedBy, 'lock_held');
  assert.equal(result.stopReason, 'lock_unreadable');
  assert.equal(readFileSync(lockFile(root), 'utf8'), '{truncado');
});

test('[RS-021] lock de outro host com heartbeat recente bloqueia com lock_held e não muda estado', () => {
  const root = makeRepo();
  const owner = foreignLock(root, { heartbeatAt: T0 });
  const before = readFileSync(lockFile(root), 'utf8');

  const result = acquire(root, { now: T0 });

  assert.equal(result.acquired, false);
  assert.equal(result.stopReason, 'lock_held');
  assert.equal(result.state, undefined, 'lock_held não cria estado awaiting_decision');
  assert.equal(readFileSync(lockFile(root), 'utf8'), before);
  assert.equal(readLock(root).execution_id, owner.execution_id);
});

test('[RS-017] etapa 1 (identidade): registro lock_release de outra execução é recusado e o lock permanece', () => {
  const root = makeRepo();
  const owner = randomUUID();
  acquire(root, { executionId: owner });
  const before = readFileSync(lockFile(root), 'utf8');
  writeAuthorizations(root, [lockRelease({ id: 'auth-outro', execution_id: randomUUID() })]);

  assertRefusal(() => releaseStaleLock(root, CHANGE, { authorizationId: 'auth-outro', now: staleNow(root) }), 'human_decision_needed', /identidade/);
  assert.equal(readFileSync(lockFile(root), 'utf8'), before);
});

test('[RS-017] etapa 1 (identidade): registro lock_release de outro project_id é recusado', () => {
  const root = makeRepo();
  const owner = randomUUID();
  acquire(root, { executionId: owner });
  writeAuthorizations(root, [lockRelease({ id: 'auth-projeto', execution_id: owner, project_id: '7d1e4c2b-0a9f-4b3e-8c6d-5e4f3a2b1c0d' })]);

  assertRefusal(() => releaseStaleLock(root, CHANGE, { authorizationId: 'auth-projeto', now: staleNow(root) }), 'human_decision_needed', /identidade/);
  assert.equal(existsSync(lockFile(root)), true);
});

test('[RS-017] etapa 2 (vencimento): lock dentro do prazo não é liberado mesmo com registro humano', () => {
  const root = makeRepo();
  const owner = randomUUID();
  acquire(root, { executionId: owner });
  writeAuthorizations(root, [lockRelease({ id: 'auth-cedo', execution_id: owner })]);

  assertRefusal(() => releaseStaleLock(root, CHANGE, { authorizationId: 'auth-cedo', now: T0 + 1000 }), 'lock_held', /prazo de heartbeat/);
  assert.equal(existsSync(lockFile(root)), true);
});

test('[RS-017] etapa 3 (autorização): sem authorizations.json a liberação é recusada', () => {
  const root = makeRepo();
  const owner = randomUUID();
  acquire(root, { executionId: owner });

  assertRefusal(() => releaseStaleLock(root, CHANGE, { authorizationId: 'auth-inexistente', now: staleNow(root) }), 'human_decision_needed', /autorização lock_release/);
  assert.equal(existsSync(lockFile(root)), true);
});

test('[RS-017] etapa 3 (autorização): registro de tipo diferente de lock_release é recusado', () => {
  const root = makeRepo();
  const owner = randomUUID();
  acquire(root, { executionId: owner });
  writeAuthorizations(root, [lockRelease({ id: 'auth-budget', execution_id: owner, kind: 'budget' })]);

  assertRefusal(() => releaseStaleLock(root, CHANGE, { authorizationId: 'auth-budget', now: staleNow(root) }), 'human_decision_needed', /autorização lock_release/);
});

test('[RS-017] etapa 3 (autorização): registro sem origem humana é recusado', () => {
  const root = makeRepo();
  const owner = randomUUID();
  acquire(root, { executionId: owner });
  writeAuthorizations(root, [lockRelease({ id: 'auth-agente', execution_id: owner, origin: 'agent' })]);

  assertRefusal(() => releaseStaleLock(root, CHANGE, { authorizationId: 'auth-agente', now: staleNow(root) }), 'human_decision_needed', /autorização lock_release/);
});

test('[RS-017] etapa 3 (autorização): registro revogado por registro posterior é recusado', () => {
  const root = makeRepo();
  const owner = randomUUID();
  acquire(root, { executionId: owner });
  writeAuthorizations(root, [
    lockRelease({ id: 'auth-revogado', execution_id: owner }),
    { id: 'auth-revogacao', kind: 'revocation', origin: 'human', revokes: 'auth-revogado', approver: 'Douglas', date: DATE, reason: 'engano' },
  ]);

  assertRefusal(() => releaseStaleLock(root, CHANGE, { authorizationId: 'auth-revogado', now: staleNow(root) }), 'human_decision_needed', /revogad/);
  assert.equal(existsSync(lockFile(root)), true);
});

test('[RS-017] etapa 4 (conferência): o conteúdo validado é comparado com a releitura antes da remoção', () => {
  const root = makeRepo();
  const owner = randomUUID();
  acquire(root, { executionId: owner });
  writeAuthorizations(root, [lockRelease({ id: 'auth-conteudo', execution_id: owner })]);
  const validatedAt = staleNow(root);

  assertRefusal(() => releaseStaleLock(root, CHANGE, {
    authorizationId: 'auth-conteudo',
    now: validatedAt,
    hooks: {
      beforeRemove() {
        // Simula renovação do heartbeat entre a validação e a remoção.
        const body = readLock(root);
        writeFileSync(lockFile(root), JSON.stringify({ ...body, heartbeat_at: new Date(validatedAt).toISOString() }));
      },
    },
  }), 'lock_held', /conteúdo/);
  assert.equal(readLock(root).heartbeat_at, new Date(validatedAt).toISOString());
});

test('[RS-017] liberação válida remove o lock e registra o evento kind lock, event released', () => {
  const root = makeRepo();
  const owner = randomUUID();
  acquire(root, { executionId: owner });
  writeAuthorizations(root, [lockRelease({ id: 'auth-ok', execution_id: owner })]);

  const result = releaseStaleLock(root, CHANGE, { authorizationId: 'auth-ok', now: staleNow(root), openReservations: 0 });

  assert.equal(result.released, true);
  assert.equal(result.reconciliation_required, false);
  assert.equal(existsSync(lockFile(root)), false);
  const events = readFileSync(join(localDir(root, CHANGE), 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(events.at(-1).kind, 'lock');
  assert.equal(events.at(-1).event, 'released');
  assert.equal(events.at(-1).stale, true);
  assert.equal(events.at(-1).execution_id, owner);
  assert.equal(events.at(-1).authorization_id, 'auth-ok');
});

test('[RS-017] liberar lock com reserva aberta exige reconciliação', () => {
  const root = makeRepo();
  const owner = randomUUID();
  acquire(root, { executionId: owner });
  writeAuthorizations(root, [lockRelease({ id: 'auth-reserva', execution_id: owner })]);

  const result = releaseStaleLock(root, CHANGE, { authorizationId: 'auth-reserva', now: staleNow(root), openReservations: 1 });

  assert.equal(result.released, true);
  assert.equal(result.reconciliation_required, true);
});

test('[RS-020] lock substituído entre a validação e a remoção não é removido e o lock atual permanece', () => {
  const root = makeRepo();
  const owner = randomUUID();
  acquire(root, { executionId: owner });
  writeAuthorizations(root, [lockRelease({ id: 'auth-substituido', execution_id: owner })]);
  const replacement = randomUUID();

  assertRefusal(() => releaseStaleLock(root, CHANGE, {
    authorizationId: 'auth-substituido',
    now: staleNow(root),
    hooks: {
      beforeRemove() {
        foreignLock(root, { executionId: replacement, heartbeatAt: staleNow(root) });
      },
    },
  }), 'lock_held', /conteúdo/);
  assert.equal(readLock(root).execution_id, replacement);
});

test('[RS-009] renovação de heartbeat mantém started_at e troca apenas heartbeat_at', () => {
  const root = makeRepo();
  const owner = randomUUID();
  acquire(root, { executionId: owner });
  const later = T0 + 60_000;

  heartbeat(root, CHANGE, owner, later);

  const lock = readLock(root);
  assert.equal(lock.heartbeat_at, new Date(later).toISOString());
  assert.equal(lock.started_at, new Date(T0).toISOString());
});

test('[RS-009] remoção normal ao término exige o execution_id do dono', () => {
  const root = makeRepo();
  const owner = randomUUID();
  acquire(root, { executionId: owner });

  assert.throws(() => releaseLock(root, CHANGE, randomUUID()), ConfigError);
  assert.equal(existsSync(lockFile(root)), true);

  releaseLock(root, CHANGE, owner);
  assert.equal(existsSync(lockFile(root)), false);
});
