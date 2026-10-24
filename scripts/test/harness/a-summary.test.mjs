// Resumo durável e checkpoint de fatia (A.7, EV-011, EV-012, RS de conteúdo do checkpoint).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { changeDir } from '../../harness/identity.mjs';
import { writeMilestoneCheckpoint } from '../../harness/checkpoint.mjs';
import { createState } from '../../harness/state.mjs';
import { CHANGE, CHANGE_DIR, makeRepo, scenario, setupRepo, tapOf, validate } from './a-support.mjs';

const SUMMARY = `${CHANGE_DIR}/evidence-summary.json`;

test('[EV-012] validação reprovada não grava o resumo durável', async () => {
  const root = setupRepo({ scenarios: [scenario('AC-011'), scenario('AC-012')], tap: tapOf(['ok 1 - [AC-011] caso']) });
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.equal(existsSync(join(root, SUMMARY)), false, 'sem aprovação não há resumo');
});

test('[EV-012] marco de fatia grava checkpoint com evidência parcial, não aprovada, e não grava o resumo', () => {
  const root = makeRepo();
  const state = createState(root, CHANGE, { mode: 'runner' });
  const checkpoint = writeMilestoneCheckpoint(changeDir(root, CHANGE), state, 'slice_approved');
  assert.equal(checkpoint.evidence_status, 'parcial, não aprovada');
  assert.equal(JSON.parse(readFileSync(join(changeDir(root, CHANGE), 'checkpoint.json'), 'utf8')).evidence_status, 'parcial, não aprovada');
  assert.equal(existsSync(join(root, SUMMARY)), false);
});
