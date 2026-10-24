// Bloqueio por change do harness (F2, D1). O lock fica em
// <git-common-dir>/harness/locks/<change>.lock, é criado com 'wx' e só vence por
// heartbeat (lock_stale_seconds). Nunca é removido pelo runner sem a liberação em
// etapas de releaseStaleLock (RS-017, RS-020). Diagnósticos de lock vão para events.jsonl
// só pelo detentor (ou pela liberação sob o mesmo lock), com kind "lock" (TE-009).
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { assertChangeName, changeDir, commonGitDir, identityOf, localId, projectId } from './identity.mjs';
import { ConfigError, loadPolicy } from './policy.mjs';
import { loadState, writeFileAtomic } from './state.mjs';
import { loadAuthorizations } from './contract.mjs';
import { recordLockEvent } from './telemetry.mjs';

const HUMAN_DECISION = 'human_decision_needed';
const LOCK_HELD = 'lock_held';
const LOCK_UNREADABLE = 'lock_unreadable';
const STALE_LOCK = 'stale_lock';
const AUTHORIZATIONS_FILE = 'authorizations.json';
const LOCK_RELEASE_KIND = 'lock_release';
const HUMAN_ORIGIN = 'human';

export function lockPath(root, change) {
  return join(commonGitDir(root), 'harness', 'locks', `${assertChangeName(change)}.lock`);
}

function iso(ms) {
  return new Date(ms).toISOString();
}

// Devolve { raw, body } com body null quando o conteúdo não é um objeto JSON; null se o arquivo não existe.
function readLockFile(path) {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  let body = null;
  try {
    const parsed = JSON.parse(raw);
    body = parsed !== null && typeof parsed === 'object' ? parsed : null;
  } catch {
    body = null;
  }
  return { raw, body };
}

// Só o heartbeat define vencimento (RS-010). Origem (host) não entra. Lock sem heartbeat legível não vence.
function isExpired(body, { now, staleSeconds }) {
  const ageMs = now - Date.parse(body?.heartbeat_at);
  return Number.isFinite(ageMs) && ageMs > staleSeconds * 1000;
}

function refusal(path, body, { now, staleSeconds }) {
  if (isExpired(body, { now, staleSeconds })) {
    return { acquired: false, stopReason: STALE_LOCK, state: 'awaiting_decision', path, lock: body };
  }
  return { acquired: false, stopReason: LOCK_HELD, path, lock: body };
}

// Lock sem JSON objeto ou sem heartbeat válido é ilegível (RS-022). Não vence por heartbeat.
function hasValidHeartbeat(body) {
  return body !== null && Number.isFinite(Date.parse(body.heartbeat_at));
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

// Diagnóstico de partida recusada (TE-009): vai à saída do comando, nunca ao events.jsonl.
// lock_sha256 identifica o conteúdo observado e não é prova de autoria (RS-022).
function lockDiagnostic(root, change, raw) {
  return { project_id: projectId(root), change, local_id: localId(root), lock_sha256: sha256(raw) };
}

// Partida recusada ou adquirida sem liberação: nenhuma linha é gravada em events.jsonl. A
// aquisição não cria estado no worktree (RS-016); só a liberação pelo detentor grava kind "lock".
export function acquireLock(root, change, { executionId, now = Date.now(), host = hostname(), pid = process.pid } = {}) {
  const path = lockPath(root, change);
  mkdirSync(dirname(path), { recursive: true });
  let fd;
  try {
    fd = openSync(path, 'wx');
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    const existing = readLockFile(path);
    const diagnostic = lockDiagnostic(root, change, existing?.raw ?? '');
    if (existing === null || !hasValidHeartbeat(existing.body)) {
      return { acquired: false, blockedBy: LOCK_HELD, stopReason: LOCK_UNREADABLE, path, diagnostic };
    }
    const staleSeconds = loadPolicy(root).lock_stale_seconds;
    return { ...refusal(path, existing.body, { now, staleSeconds }), blockedBy: LOCK_HELD, diagnostic };
  }
  const body = {
    ...identityOf(root, change, executionId),
    lock_id: randomUUID(),
    pid,
    host,
    started_at: iso(now),
    heartbeat_at: iso(now),
  };
  try {
    writeFileSync(fd, `${JSON.stringify(body, null, 2)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return { acquired: true, path, lock: body };
}

// Adquire o lock e, se o lock estiver vencido (stale_lock), libera-o somente com lock_release humano
// que cite o execution_id do lock (RS-017). Sem esse registro, devolve a recusa original (RS-010).
// A remoção passa por releaseStaleLock, que revalida identidade, vencimento e conteúdo.
export function acquireLockReleasingAuthorized(root, change, options = {}) {
  const first = acquireLock(root, change, options);
  if (first.acquired || first.stopReason !== STALE_LOCK) return first;
  const { records, errors } = loadAuthorizations(changeDir(root, change));
  if (errors.length > 0) return first;
  const release = records.find((record) => record?.kind === LOCK_RELEASE_KIND
    && record.origin === HUMAN_ORIGIN
    && record.execution_id === first.lock?.execution_id
    && record.scope?.change === change);
  if (!release) return first;
  try {
    releaseStaleLock(root, change, { authorizationId: release.id, openReservations: openReservationsOf(root, change) });
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    return first;
  }
  return acquireLock(root, change, options);
}

// Reservas abertas da change, para o aviso de reconciliação do evento de liberação. Estado ilegível conta como zero.
function openReservationsOf(root, change) {
  try {
    return loadState(root, change)?.open_reservations?.length ?? 0;
  } catch {
    return 0;
  }
}

// Renova o heartbeat do próprio lock. Outro execution_id é recusado.
export function heartbeat(root, change, executionId, now = Date.now()) {
  const path = lockPath(root, change);
  const existing = readLockFile(path)?.body ?? null;
  if (existing === null || existing.execution_id !== executionId) {
    throw new ConfigError('heartbeat recusado: o lock pertence a outra execução', { stopReason: LOCK_HELD });
  }
  writeFileAtomic(path, `${JSON.stringify({ ...existing, heartbeat_at: iso(now) }, null, 2)}\n`);
}

// Remoção normal, ao término da execução que possui o lock. O evento é gravado antes da remoção,
// ainda sob o lock.
export function releaseLock(root, change, executionId, { record = true } = {}) {
  const path = lockPath(root, change);
  const existing = readLockFile(path)?.body ?? null;
  if (existing === null) return { released: false };
  if (existing.execution_id !== executionId) {
    throw new ConfigError('liberação recusada: o lock pertence a outra execução', { stopReason: LOCK_HELD });
  }
  if (record) recordLockEvent(root, change, { event: 'released', lock_id: existing.lock_id, execution_id: executionId });
  unlinkSync(path);
  return { released: true };
}

function nonEmpty(value) {
  return typeof value === 'string' && value.length > 0;
}

// Lê authorizations.json da change (lista de registros, somente acréscimo). Ausente = lista vazia.
function readAuthorizations(root, change) {
  const path = join(changeDir(root, change), AUTHORIZATIONS_FILE);
  if (!existsSync(path)) return [];
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new ConfigError(`${AUTHORIZATIONS_FILE} ilegível (${err.message})`, { stopReason: HUMAN_DECISION });
  }
  if (!Array.isArray(parsed)) throw new ConfigError(`${AUTHORIZATIONS_FILE} deve ser uma lista de registros`, { stopReason: HUMAN_DECISION });
  return parsed;
}

function humanDecision(message) {
  return new ConfigError(message, { stopReason: HUMAN_DECISION });
}

// Etapa 1: o registro lock_release cita o mesmo projeto, change e execução do lock.
function assertLockIdentity(record, body, { root, change }) {
  const matches = record.project_id === projectId(root)
    && record.execution_id === body.execution_id
    && record.scope?.change === change
    && body.project_id === record.project_id
    && body.change === change;
  if (!matches) throw humanDecision('identidade do registro lock_release não confere com o lock');
}

// Etapa 3: registro humano do tipo lock_release, completo e não revogado.
function assertLockReleaseAuthorization(records, record) {
  const valid = record.kind === LOCK_RELEASE_KIND
    && record.origin === 'human'
    && nonEmpty(record.reason) && nonEmpty(record.approver) && nonEmpty(record.date);
  if (!valid) throw humanDecision('registro não é autorização lock_release humana completa');
  if (records.some((item) => item.revokes === record.id)) {
    throw humanDecision(`autorização lock_release "${record.id}" revogada`);
  }
}

// Libera lock vencido somente em cinco etapas (RS-017, RS-020):
// 1. identidade do registro lock_release × lock; 2. vencimento pelo heartbeat;
// 3. autorização humana vigente; 4. releitura e conferência do conteúdo validado;
// 5. remoção e evento. hooks.beforeRemove existe só para teste da etapa 4.
export function releaseStaleLock(root, change, { authorizationId, now = Date.now(), openReservations = 0, hooks = {} } = {}) {
  const path = lockPath(root, change);
  const validated = readLockFile(path);
  if (validated === null) throw humanDecision('lock ausente; nada foi liberado');
  const body = validated.body;
  if (body === null) throw new ConfigError('lock ilegível; nada foi liberado', { stopReason: LOCK_HELD });

  const records = readAuthorizations(root, change);
  const record = records.find((item) => item?.id === authorizationId);
  if (!record) throw humanDecision(`autorização lock_release "${authorizationId}" ausente em ${AUTHORIZATIONS_FILE}`);

  assertLockIdentity(record, body, { root, change });

  const staleSeconds = loadPolicy(root).lock_stale_seconds;
  if (!isExpired(body, { now, staleSeconds })) {
    throw new ConfigError('lock ainda dentro do prazo de heartbeat; não é vencido', { stopReason: LOCK_HELD });
  }

  assertLockReleaseAuthorization(records, record);

  hooks.beforeRemove?.(path);
  const reread = readLockFile(path);
  if (reread === null || reread.raw !== validated.raw) {
    throw new ConfigError('conteúdo do lock mudou após a validação (renovado ou substituído); lock mantido', { stopReason: LOCK_HELD });
  }

  const reconciliationRequired = openReservations > 0;
  recordLockEvent(root, change, {
    event: 'released', lock_id: body.lock_id ?? null, execution_id: body.execution_id,
    authorization_id: record.id, stale: true, reconciliation_required: reconciliationRequired,
  }, { at: iso(now) });
  unlinkSync(path);
  return { released: true, reconciliation_required: reconciliationRequired };
}

// Libera lock ilegível (RS-022, D24): só com autorização lock_release humana cujo lock_sha256
// é o hash do conteúdo observado no diagnóstico da partida recusada, e só se o arquivo atual
// tem esse mesmo hash, relido imediatamente antes da remoção. O diagnóstico não é gravado em
// events.jsonl (TE-009), então o hash chega pelo registro humano.
export function releaseUnreadableLock(root, change, { authorizationId, hooks = {} } = {}) {
  const path = lockPath(root, change);
  const current = readLockFile(path);
  if (current === null) throw humanDecision('lock ausente; nada foi liberado');
  const records = readAuthorizations(root, change);
  const record = records.find((item) => item?.id === authorizationId);
  if (!record) throw humanDecision(`autorização lock_release "${authorizationId}" ausente em ${AUTHORIZATIONS_FILE}`);
  assertLockReleaseAuthorization(records, record);
  if (record.scope?.change !== change) throw humanDecision('autorização lock_release de outra change');

  const currentHash = sha256(current.raw);
  if (record.lock_sha256 !== currentHash) {
    throw humanDecision('hash do lock diferente do registrado na autorização; lock mantido');
  }

  hooks.beforeRemove?.(path);
  const reread = readLockFile(path);
  if (reread === null || reread.raw !== current.raw) {
    throw new ConfigError('conteúdo do lock mudou após o diagnóstico; lock mantido', { stopReason: LOCK_HELD });
  }
  recordLockEvent(root, change, { event: 'released', authorization_id: record.id, unreadable: true, lock_sha256: currentHash });
  unlinkSync(path);
  return { released: true };
}
