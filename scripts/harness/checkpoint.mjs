// Checkpoint versionado (F2, D2 e D19). Gravado só nos marcos; a importação
// de outro ambiente exige reconciliação antes de qualquer chamada paga.
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { assertChangeName, assertSameIdentity, projectId, changeDir } from './identity.mjs';
import { ConfigError, checkSchemaCompatibility, loadPolicy } from './policy.mjs';
import { SCHEMA_VERSION, buildInitialState, writeFileAtomic } from './state.mjs';

export const MILESTONES = ['contract_approved', 'slice_approved', 'archived'];
export const CHECKPOINT_FILE = 'checkpoint.json';
// Evidência de fatia sem validação final aprovada: nunca apresentada como aprovação (D16).
export const PARTIAL_EVIDENCE = 'parcial, não aprovada';
const MODES = ['legacy', 'runner'];

function readCheckpointFile(path) {
  if (!existsSync(path)) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new ConfigError(`checkpoint ilegível (${err.message}): ${path}`);
  }
  if (parsed === null || typeof parsed !== 'object' || !Number.isInteger(parsed.checkpoint_seq)) {
    throw new ConfigError(`checkpoint sem checkpoint_seq válido: ${path}`);
  }
  return parsed;
}

// Estado da evidência no checkpoint: aprovada, parcial (marco de fatia sem aprovação) ou nula.
function evidenceStatus(milestone, state) {
  if (state.approved_evidence_hash) return 'aprovada';
  return milestone === 'slice_approved' ? PARTIAL_EVIDENCE : null;
}

// dir é openspec/changes/<change>. Só os marcos gravam checkpoint.
export function writeMilestoneCheckpoint(dir, state, milestone) {
  if (!MILESTONES.includes(milestone)) {
    throw new ConfigError(`marco de checkpoint inválido: "${milestone}"`);
  }
  if (basename(dir) !== assertChangeName(state.change)) {
    throw new ConfigError(`diretório ${dir} não corresponde à change ${state.change}`);
  }
  const path = join(dir, CHECKPOINT_FILE);
  const previous = readCheckpointFile(path);
  const checkpoint = {
    checkpoint_seq: (previous?.checkpoint_seq ?? 0) + 1,
    milestone,
    schema_version: SCHEMA_VERSION,
    project_id: state.project_id,
    local_id: state.local_id ?? null,
    change: state.change,
    execution_id: state.execution_id,
    contract_hash: state.contract_hash ?? null,
    round: state.round,
    counters: state.counters ?? {},
    consumption: { ...state.consumption },
    open_reservations: state.open_reservations,
    attempt_id: state.attempt_id ?? null,
    authorization_ids: state.authorization_ids ?? [],
    approved_evidence_hash: state.approved_evidence_hash ?? null,
    evidence_status: evidenceStatus(milestone, state),
  };
  writeFileAtomic(path, `${JSON.stringify(checkpoint, null, 2)}\n`);
  return checkpoint;
}

// Devolve o estado a ser gravado pelo chamador: awaiting_decision com
// reconciliation_required, consumo e reservas do checkpoint. Não grava nada.
export function importCheckpoint(root, change, { localState = null, mode } = {}) {
  const cp = readCheckpointFile(join(changeDir(root, change), CHECKPOINT_FILE));
  if (cp === null) throw new ConfigError(`checkpoint ausente em ${changeDir(root, change)}`);
  checkSchemaCompatibility(cp.schema_version, SCHEMA_VERSION);
  assertSameIdentity(cp, { project_id: projectId(root), change });
  if (localState) {
    assertSameIdentity(localState, { project_id: cp.project_id, change: cp.change, execution_id: cp.execution_id });
  }
  const base = localState ?? buildInitialState(root, change, { mode: requireMode(mode), executionId: cp.execution_id });
  return {
    ...base,
    round: cp.round,
    counters: cp.counters,
    consumption: cp.consumption,
    open_reservations: cp.open_reservations,
    attempt_id: cp.attempt_id,
    authorization_ids: cp.authorization_ids,
    contract_hash: cp.contract_hash,
    approved_evidence_hash: cp.approved_evidence_hash,
    state: 'awaiting_decision',
    stop_reason: 'reconciliation_required',
    imported_checkpoint_seq: cp.checkpoint_seq,
    policy_version: loadPolicy(root).version,
  };
}

function requireMode(mode) {
  if (!MODES.includes(mode)) throw new ConfigError('importação sem estado local exige mode legacy ou runner');
  return mode;
}
