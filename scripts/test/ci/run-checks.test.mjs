// Checks da CI (release-ci): run-checks executa test, lint e typecheck de template.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { REPO_ROOT, makeTempDir, writeTree } from '../helpers.mjs';

const RUN_CHECKS = join(REPO_ROOT, 'scripts/ci/run-checks.mjs');

function projectWith(checks) {
  return writeTree(makeTempDir('ci-checks-'), { 'template.json': { checks } });
}

const runChecks = (root) => spawnSync(process.execPath, [RUN_CHECKS, '--root', root], { encoding: 'utf8' });

test('[CI-001] run-checks passa quando todos os checks passam', () => {
  const root = projectWith({ test: 'exit 0', lint: 'exit 0', typecheck: 'exit 0' });

  const result = runChecks(root);

  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('[CI-002] run-checks falha quando um check falha', () => {
  const root = projectWith({ test: 'exit 0', lint: 'exit 1', typecheck: 'exit 0' });

  const result = runChecks(root);

  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /lint/);
});
