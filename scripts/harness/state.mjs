// Estado operacional do harness (F2, D2). Único escritor de run-state.json:
// gravação atômica (temporário, fsync, rename), revisão anterior em .prev,
// recuperação por .prev, reserva gravada antes de qualquer processo.
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { assertSameIdentity, identityOf, localDir, projectId } from './identity.mjs';
import { ConfigError, checkSchemaCompatibility, loadPolicy } from './policy.mjs';
import { emptyCounters } from './counters.mjs';

export const SCHEMA_VERSION = '1.0.0';
export const STATE_FILE = 'run-state.json';
export const PREV_FILE = 'run-state.json.prev';
const MODES = ['legacy', 'runner'];
const RESERVATION_OPEN = 'open';
const ZERO_CONSUMPTION = { known_usd: 0, estimated_usd: 0, unknown_calls: 0 };

function configError(message, stopReason) {
  return new ConfigError(message, stopReason ? { stopReason } : {});
}

function configBlocked(message) {
  const err = new ConfigError(message);
  err.state = 'config_blocked';
  return err;
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertMode(mode) {
  if (!MODES.includes(mode)) throw configError(`modo inválido: "${mode}" (use legacy ou runner)`);
}

// Gravação atômica: temporário no mesmo diretório, fsync, rename. beforeRename
// existe só para testes de falha entre o temporário e o rename (RS-004).
export function writeFileAtomic(path, content, { beforeRename } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const fd = openSync(tmp, 'wx');
    try {
      writeFileSync(fd, content);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    beforeRename?.(tmp);
    renameSync(tmp, path);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
  const dirFd = openSync(dirname(path), 'r');
  try {
    fsyncSync(dirFd);
  } finally {
    closeSync(dirFd);
  }
}

// Lê um arquivo de estado. Devolve { exists, state } com state null quando ilegível.
function readStateFile(path) {
  if (!existsSync(path)) return { exists: false, state: null };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    const valid = parsed !== null && typeof parsed === 'object' && Number.isInteger(parsed.revision) && parsed.revision >= 1;
    return { exists: true, state: valid ? parsed : null };
  } catch {
    return { exists: true, state: null };
  }
}

function validateLoaded(root, change, state) {
  checkSchemaCompatibility(state.schema_version, SCHEMA_VERSION);
  assertMode(state.mode);
  assertSameIdentity(state, { project_id: projectId(root), change });
  return state;
}

// Carrega o estado atual. Sem arquivo, devolve null. Se run-state.json estiver
// ilegível, usa .prev e marca recovered. Se nenhuma revisão for legível, para
// com config_error sem recriar o estado (RS-005, RS-006).
export function loadState(root, change) {
  const dir = localDir(root, change);
  const main = readStateFile(join(dir, STATE_FILE));
  if (main.state) return validateLoaded(root, change, main.state);
  const prev = readStateFile(join(dir, PREV_FILE));
  if (prev.state) return { ...validateLoaded(root, change, prev.state), recovered: true };
  if (!main.exists && !prev.exists) return null;
  throw configBlocked(`nenhuma revisão legível do estado em ${dir}; não recrie do zero`);
}

// Estado inicial de uma execução, sem gravar nada.
export function buildInitialState(root, change, { mode, executionId = randomUUID() }) {
  assertMode(mode);
  return {
    schema_version: SCHEMA_VERSION,
    policy_version: loadPolicy(root).version,
    mode,
    revision: 1,
    ...identityOf(root, change, executionId),
    state: 'ready',
    stop_reason: null,
    round: 1,
    counters: emptyCounters(),
    consumption: { ...ZERO_CONSUMPTION },
    open_reservations: [],
    authorization_ids: [],
    attempt_id: 0,
    invocations_total: 0,
    active_ms: 0,
    previous_execution_id: null,
    counters_certain: true,
    observed_hashes: {},
    pending_validation: [],
    stop_history: [],
    timeout_diagnostic: null,
    contract_hash: null,
    approved_evidence_hash: null,
    imported_checkpoint_seq: null,
  };
}

export function createState(root, change, { mode, executionId } = {}) {
  const dir = localDir(root, change);
  if (existsSync(join(dir, STATE_FILE)) || existsSync(join(dir, PREV_FILE))) {
    throw configError(`estado já existe em ${dir}; use loadState`);
  }
  const state = buildInitialState(root, change, { mode, executionId });
  writeFileAtomic(join(dir, STATE_FILE), serialize(state));
  return state;
}

// Grava uma nova revisão. Modo e identidade não podem mudar (RS-008, RS-015).
// Antes de trocar o principal, guarda a revisão atual em .prev. hooks.beforeRename
// é só para teste (RS-004).
export function saveState(root, change, next, { hooks = {} } = {}) {
  const current = loadState(root, change);
  assertMode(next.mode);
  if (current && current.mode !== next.mode) {
    throw configError(`modo alterado de "${current.mode}" para "${next.mode}"; o modo é imutável`);
  }
  // Nova execução só se identifica pelo previous_execution_id apontando para a atual (RS-024, RC-035).
  const replacesExecution = current && next.execution_id !== current.execution_id && next.previous_execution_id === current.execution_id;
  assertSameIdentity(next, current
    ? { project_id: current.project_id, change: current.change, execution_id: replacesExecution ? next.execution_id : current.execution_id }
    : { project_id: projectId(root), change });
  const dir = localDir(root, change);
  const stored = { ...next, schema_version: SCHEMA_VERSION, revision: current ? current.revision + 1 : 1 };
  if (current) writeFileAtomic(join(dir, PREV_FILE), serialize(current));
  writeFileAtomic(join(dir, STATE_FILE), serialize(stored), { beforeRename: hooks.beforeRename });
  return stored;
}

function isValidReconciliation(record, state) {
  const decisions = new Map((record.reservations ?? []).map((item) => [item.session_id, item.decision]));
  const allDecided = state.open_reservations.every((item) => ['kept', 'closed_observed', 'closed_unknown'].includes(decisions.get(item.session_id)));
  return typeof record.approver === 'string' && record.approver.length > 0
    && typeof record.date === 'string' && Array.isArray(record.observed_consumption)
    && Array.isArray(record.evidence_to_revalidate) && allDecided;
}

// Chamada paga só começa se a importação de checkpoint foi reconciliada (RS-013, RS-014).
export function canStartPaidCall(state, authorizations = []) {
  if (state.imported_checkpoint_seq === null || state.imported_checkpoint_seq === undefined) {
    return { allowed: true, stop_reason: null };
  }
  const reconciled = authorizations.some((record) => record?.kind === 'reconciliation'
    && record.checkpoint_seq === state.imported_checkpoint_seq
    && isValidReconciliation(record, state));
  return reconciled ? { allowed: true, stop_reason: null } : { allowed: false, stop_reason: 'reconciliation_required' };
}

// Grava a reserva e devolve o session_id gerado aqui. Chamar antes de criar o processo.
export function prepareReservation(root, change, reservation, { authorizations = [] } = {}) {
  const current = loadState(root, change);
  if (!current) throw configError('sem estado para reservar; crie o estado antes');
  const gate = canStartPaidCall(current, authorizations);
  if (!gate.allowed) throw configError('invocação paga bloqueada até reconciliação', gate.stop_reason);
  if (typeof reservation.reserved_usd !== 'number' || !Number.isFinite(reservation.reserved_usd) || reservation.reserved_usd < 0) {
    throw configError('reserved_usd deve ser número finito e não negativo');
  }
  const sessionId = randomUUID();
  const entry = {
    session_id: sessionId,
    reserved_usd: reservation.reserved_usd,
    status: RESERVATION_OPEN,
    invocation_id: reservation.invocation_id ?? null,
    attempt_id: current.attempt_id,
    opened_at: new Date().toISOString(),
  };
  saveState(root, change, { ...current, open_reservations: [...current.open_reservations, entry] });
  return sessionId;
}
