// Tracker fora da impressão (C.1, D14, D31): docs/agents/issue-tracker.md é narrativa; editar o tracker
// não muda a impressão da evidência, e editar o contrato (design.md) muda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fingerprint } from '../../harness/evidence.mjs';
import { REPO_ROOT } from './fixture.mjs';
import { CHANGE, CHANGE_DIR, RUNTIME, setupRepo } from './a-support.mjs';

const TRACKER = 'docs/agents/issue-tracker.md';
const fp = (root) => fingerprint({ root, change: CHANGE, runtime: RUNTIME }).fingerprint;

function withTracker(root) {
  mkdirSync(join(root, 'docs', 'agents'), { recursive: true });
  writeFileSync(join(root, TRACKER), '# Issue tracker\n\n## Ponto de restauração\n\n- início\n');
}

test('[EV-016] a política exclui docs/agents/issue-tracker.md da impressão', () => {
  const policy = JSON.parse(readFileSync(join(REPO_ROOT, '.claude', 'harness', 'policy.json'), 'utf8'));
  assert.ok(policy.excluded_paths.includes(TRACKER), 'excluded_paths precisa listar o tracker');
});

test('[EV-016] editar o issue-tracker não muda a impressão da evidência', () => {
  const root = setupRepo();
  withTracker(root);
  const before = fp(root);
  appendFileSync(join(root, TRACKER), '- narrativa nova da sessão\n');
  assert.equal(fp(root), before);
});

test('[EV-016] editar design.md muda a impressão da evidência', () => {
  const root = setupRepo();
  withTracker(root);
  const before = fp(root);
  appendFileSync(join(root, CHANGE_DIR, 'design.md'), '\nRequisito que afeta a execução.\n');
  assert.notEqual(fp(root), before);
});

test('[EV-016] outro arquivo com o mesmo nome fora de docs/agents continua na impressão', () => {
  const root = setupRepo();
  withTracker(root);
  const before = fp(root);
  writeFileSync(join(root, 'issue-tracker.md'), '# outro arquivo\n');
  assert.notEqual(fp(root), before);
});
