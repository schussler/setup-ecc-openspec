// Ponto de entrada mínimo de legacy-run.mjs (B.4, PM-007): a CLI migra uma vez e a reexecução não duplica.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, writeTree } from '../helpers.mjs';
import { makeRepo } from './fixture.mjs';

const CHANGE = 'add-service-fee';
const LEGACY_RUN = join(REPO_ROOT, '.claude', 'skills', 'template-migrate', 'legacy-run.mjs');
const NOW_TIME = '2026-10-23T12:00:00.000Z';

function legacyRepo() {
  const root = makeRepo();
  const pass = { attempt: 1, at: '2026-10-22T10:00:00.000Z', note: '', verdict: 'pass' };
  writeTree(root, {
    'template.json': `${JSON.stringify({ checks: { test: 'node --test' } }, null, 2)}\n`,
    [`openspec/changes/${CHANGE}/gates.json`]: `${JSON.stringify({ implement: { attempts: [pass] }, archive: { attempts: [pass] } }, null, 2)}\n`,
    'docs/agents/issue-tracker.md': '# Issue tracker\n\n## Gates\n\n| Data | Change | Gate | Tentativa | O que falhou | O que mudou | Pontuação | Veredito |\n|---|---|---|---|---|---|---|---|\n',
  });
  return root;
}

const runLegacy = (root, args) => spawnSync(process.execPath, [LEGACY_RUN, ...args, '--change', CHANGE, '--root', root], {
  encoding: 'utf8', env: { ...process.env, HARNESS_NOW: NOW_TIME },
});

test('[PM-007] legacy-run migrate pela CLI devolve JSON com status e não duplica linhas na reexecução', () => {
  const root = legacyRepo();
  const first = runLegacy(root, ['migrate']);
  assert.equal(first.status, 0, first.stderr);
  const firstJson = JSON.parse(first.stdout);
  assert.equal(firstJson.status, 'migrated');
  const second = runLegacy(root, ['migrate']);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(JSON.parse(second.stdout).history_count, firstJson.history_count);
});

test('[PM-007] legacy-run sem subcomando conhecido sai com código 3 e uso', () => {
  const root = legacyRepo();
  const result = runLegacy(root, ['inexistente']);
  assert.equal(result.status, 3);
  assert.match(result.stdout + result.stderr, /uso: legacy-run\.mjs migrate/);
});
