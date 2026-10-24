import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHANGE, DERIVED_PROJECT_ID, addWorktree, cloneRepo, makeRepo } from './fixture.mjs';
import { MILESTONES, importCheckpoint, writeMilestoneCheckpoint } from '../../harness/checkpoint.mjs';
import { changeDir, localId } from '../../harness/identity.mjs';
import { canStartPaidCall, createState, loadState, prepareReservation, saveState } from '../../harness/state.mjs';
import { ConfigError } from '../../harness/policy.mjs';

function checkpointPath(root) {
  return join(changeDir(root, CHANGE), 'checkpoint.json');
}

function readCheckpoint(root) {
  return JSON.parse(readFileSync(checkpointPath(root), 'utf8'));
}

// Estado com consumo, rodada e contadores definidos, sem reservas abertas.
function seedState(root, patch = {}) {
  const created = createState(root, CHANGE, { mode: 'runner' });
  return saveState(root, CHANGE, { ...created, round: 2, contract_hash: 'hash-contrato', attempt_id: 'att-1', ...patch });
}

function reconciliationRecord(overrides = {}) {
  return {
    id: 'rec-1',
    kind: 'reconciliation',
    checkpoint_seq: 1,
    observed_consumption: [{ call_id: 'c1', usd: 0.4, source: 'reported' }],
    reservations: [],
    evidence_to_revalidate: [],
    approver: 'Douglas',
    date: '2026-10-23',
    ...overrides,
  };
}

test('[RS-011] checkpoint nao muda entre invocacoes dentro da fatia', () => {
  const root = makeRepo();
  const state = seedState(root);
  writeMilestoneCheckpoint(changeDir(root, CHANGE), state, 'slice_approved');
  const before = readFileSync(checkpointPath(root), 'utf8');

  prepareReservation(root, CHANGE, { reserved_usd: 0.5 });
  prepareReservation(root, CHANGE, { reserved_usd: 0.5 });
  prepareReservation(root, CHANGE, { reserved_usd: 0.5 });

  assert.equal(readFileSync(checkpointPath(root), 'utf8'), before);
});

test('[RS-012] checkpoint registra reserva aberta, chamadas de custo desconhecido e rodada', () => {
  const root = makeRepo();
  const state = seedState(root, {
    consumption: { known_usd: 1.5, estimated_usd: 0.25, unknown_calls: 2 },
    counters: { 'implement-gate': { attempts: 2 } },
    authorization_ids: ['auth-1'],
    approved_evidence_hash: 'hash-evidencia',
  });
  const sessionId = prepareReservation(root, CHANGE, { reserved_usd: 1 });
  const current = loadState(root, CHANGE);

  writeMilestoneCheckpoint(changeDir(root, CHANGE), current, 'slice_approved');

  const cp = readCheckpoint(root);
  assert.equal(cp.checkpoint_seq, 1);
  assert.equal(cp.project_id, state.project_id);
  assert.equal(cp.local_id, localId(root));
  assert.equal(cp.change, CHANGE);
  assert.equal(cp.execution_id, state.execution_id);
  assert.equal(cp.contract_hash, 'hash-contrato');
  assert.equal(cp.round, 2);
  assert.deepEqual(cp.counters, { 'implement-gate': { attempts: 2 } });
  assert.equal(cp.consumption.unknown_calls, 2);
  assert.equal(cp.consumption.known_usd, 1.5);
  assert.equal(cp.consumption.estimated_usd, 0.25);
  assert.deepEqual(cp.open_reservations.map((item) => item.session_id), [sessionId]);
  assert.equal(cp.attempt_id, 'att-1');
  assert.deepEqual(cp.authorization_ids, ['auth-1']);
  assert.equal(cp.approved_evidence_hash, 'hash-evidencia');
});

test('[RS-012] checkpoint_seq cresce a cada marco gravado', () => {
  const root = makeRepo();
  const state = seedState(root);
  writeMilestoneCheckpoint(changeDir(root, CHANGE), state, 'contract_approved');

  writeMilestoneCheckpoint(changeDir(root, CHANGE), state, 'slice_approved');

  assert.equal(readCheckpoint(root).checkpoint_seq, 2);
});

test('[RS-011] marco fora da lista e recusado e nenhum checkpoint e gravado', () => {
  const root = makeRepo();
  const state = seedState(root);

  assert.deepEqual(MILESTONES, ['contract_approved', 'slice_approved', 'archived']);
  assert.throws(() => writeMilestoneCheckpoint(changeDir(root, CHANGE), state, 'invocation'), ConfigError);
  assert.equal(existsSync(checkpointPath(root)), false);
});

test('[RS-013] importar checkpoint de outra maquina mantem o consumo e exige reconciliacao', () => {
  const origin = makeRepo();
  const originState = seedState(origin, { consumption: { known_usd: 10, estimated_usd: 0, unknown_calls: 0 } });
  writeMilestoneCheckpoint(changeDir(origin, CHANGE), originState, 'contract_approved');
  const worktree = addWorktree(origin, 'wt-outra-maquina');
  mkdirSync(changeDir(worktree, CHANGE), { recursive: true });
  copyFileSync(checkpointPath(origin), checkpointPath(worktree));

  const imported = importCheckpoint(worktree, CHANGE, { mode: 'runner' });
  const saved = saveState(worktree, CHANGE, imported);

  assert.equal(saved.state, 'awaiting_decision');
  assert.equal(saved.stop_reason, 'reconciliation_required');
  assert.equal(saved.consumption.known_usd, 10);
});

test('[RS-014] invocacao paga sem registro de reconciliacao nao inicia e nao reserva custo', () => {
  const origin = makeRepo();
  writeMilestoneCheckpoint(changeDir(origin, CHANGE), seedState(origin), 'contract_approved');
  const worktree = addWorktree(origin, 'wt-sem-reconciliacao');
  mkdirSync(changeDir(worktree, CHANGE), { recursive: true });
  copyFileSync(checkpointPath(origin), checkpointPath(worktree));
  saveState(worktree, CHANGE, importCheckpoint(worktree, CHANGE, { mode: 'runner' }));
  const before = loadState(worktree, CHANGE);

  assert.equal(canStartPaidCall(before, []).allowed, false);
  assert.throws(
    () => prepareReservation(worktree, CHANGE, { reserved_usd: 1 }, { authorizations: [] }),
    (err) => err instanceof ConfigError && err.stopReason === 'reconciliation_required',
  );
  const after = loadState(worktree, CHANGE);
  assert.equal(after.revision, before.revision);
  assert.equal(after.open_reservations.length, 0);
});

test('[RS-014] registro de reconciliacao sem decisao sobre a reserva aberta nao libera a chamada', () => {
  const origin = makeRepo();
  seedState(origin);
  const sessionId = prepareReservation(origin, CHANGE, { reserved_usd: 1 });
  writeMilestoneCheckpoint(changeDir(origin, CHANGE), loadState(origin, CHANGE), 'contract_approved');
  const worktree = addWorktree(origin, 'wt-reserva-sem-decisao');
  mkdirSync(changeDir(worktree, CHANGE), { recursive: true });
  copyFileSync(checkpointPath(origin), checkpointPath(worktree));
  const saved = saveState(worktree, CHANGE, importCheckpoint(worktree, CHANGE, { mode: 'runner' }));

  const incomplete = reconciliationRecord({ checkpoint_seq: 1, reservations: [] });
  assert.equal(canStartPaidCall(saved, [incomplete]).allowed, false);

  const complete = reconciliationRecord({
    checkpoint_seq: 1,
    reservations: [{ session_id: sessionId, decision: 'closed_unknown' }],
  });
  assert.equal(canStartPaidCall(saved, [complete]).allowed, true);
});

test('[RS-008] importar checkpoint sobre estado local de outra change para com config_error', () => {
  const origin = makeRepo();
  writeMilestoneCheckpoint(changeDir(origin, CHANGE), seedState(origin), 'contract_approved');
  const local = { ...loadState(origin, CHANGE), change: 'outra-change' };

  assert.throws(
    () => importCheckpoint(origin, CHANGE, { localState: local, mode: 'runner' }),
    (err) => err instanceof ConfigError && err.stopReason === 'config_error',
  );
});

test('[RS-008] checkpoint de outro projeto (project_id diferente) para com config_error', () => {
  const origin = makeRepo();
  writeMilestoneCheckpoint(changeDir(origin, CHANGE), seedState(origin), 'contract_approved');
  const cp = readCheckpoint(origin);
  writeFileSync(checkpointPath(origin), JSON.stringify({ ...cp, project_id: DERIVED_PROJECT_ID }, null, 2));

  assert.throws(
    () => importCheckpoint(origin, CHANGE, { mode: 'runner' }),
    (err) => err instanceof ConfigError && err.stopReason === 'config_error',
  );
});

test('[RS-018] checkpoint de outro clone com o mesmo project_id importa e exige reconciliação', () => {
  const origin = makeRepo();
  writeMilestoneCheckpoint(changeDir(origin, CHANGE), seedState(origin), 'contract_approved');
  const clone = cloneRepo(origin, 'clone-checkpoint');
  mkdirSync(changeDir(clone, CHANGE), { recursive: true });
  copyFileSync(checkpointPath(origin), checkpointPath(clone));

  const imported = importCheckpoint(clone, CHANGE, { mode: 'runner' });

  assert.equal(imported.state, 'awaiting_decision');
  assert.equal(imported.stop_reason, 'reconciliation_required');
  assert.equal(imported.local_id, localId(clone), 'a diferença de local_id é esperada, não é erro');
  assert.notEqual(imported.local_id, localId(origin));
});
