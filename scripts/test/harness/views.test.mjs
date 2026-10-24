import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHANGE } from './fixture.mjs';
import { deriveGatesView, deriveSummary, ensureCurrentView } from '../../harness/views.mjs';

const STATE = {
  project_id: '3f2c9a1e-6b7d-4e8f-9a0b-1c2d3e4f5a6b',
  change: CHANGE,
  execution_id: '00000000-0000-4000-8000-000000000001',
  revision: 2,
  gates: { implement: { passed: false } },
};

test('[RS-002] visao com revisao diferente da do estado e regenerada antes do uso', () => {
  const stale = { derived_from_revision: 1, gates: { implement: { passed: true } } };

  const result = ensureCurrentView(STATE, stale, deriveGatesView);

  assert.equal(result.regenerated, true);
  assert.equal(result.view.derived_from_revision, 2);
  assert.deepEqual(result.view.gates, STATE.gates);
});

test('[RS-002] visao com a revisao atual e reutilizada sem regenerar', () => {
  const current = deriveGatesView(STATE);

  const result = ensureCurrentView(STATE, current, deriveGatesView);

  assert.equal(result.regenerated, false);
  assert.equal(result.view, current);
});

test('[RS-002] ausencia de visao causa regeneracao', () => {
  const result = ensureCurrentView(STATE, null, deriveGatesView);

  assert.equal(result.regenerated, true);
  assert.equal(result.view.derived_from_revision, STATE.revision);
});

test('[RS-002] deriveGatesView carrega a identidade e a revisao do estado', () => {
  const view = deriveGatesView(STATE);

  assert.equal(view.derived_from_revision, 2);
  assert.equal(view.project_id, STATE.project_id);
  assert.equal(view.change, CHANGE);
  assert.equal(view.execution_id, STATE.execution_id);
});

test('[RS-002] deriveSummary marca a revisao de origem e nomeia a change', () => {
  const summary = deriveSummary(STATE);

  assert.equal(summary.derived_from_revision, 2);
  assert.match(summary.markdown, new RegExp(CHANGE));
  assert.match(summary.markdown, /revisão 2/);
});
