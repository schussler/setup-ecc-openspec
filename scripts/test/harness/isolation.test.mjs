import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CHANGE, DERIVED_PROJECT_ID, PROJECT_ID, REPO_ROOT, addWorktree, cloneRepo, makeRepo, writeProjectFile } from './fixture.mjs';
import { acquireLock } from '../../harness/lock.mjs';
import { localId, projectId } from '../../harness/identity.mjs';
import { ConfigError } from '../../harness/policy.mjs';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const GATES_DIR = join(REPO_ROOT, 'scripts', 'gates');
const STATE_MODULE = join(REPO_ROOT, 'scripts', 'harness', 'state.mjs');
const IMPORT_SPECIFIER = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;

test('[RS-002] nenhum modulo de scripts/gates importa o escritor de estado', () => {
  const files = readdirSync(GATES_DIR).filter((name) => name.endsWith('.mjs'));
  assert.ok(files.length > 0, 'scripts/gates deve conter módulos para verificar');

  const offenders = [];
  for (const name of files) {
    const file = join(GATES_DIR, name);
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT_SPECIFIER)) {
      const specifier = match[1];
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) continue;
      if (resolve(dirname(file), specifier) === STATE_MODULE) offenders.push(`${name} -> ${specifier}`);
    }
  }

  assert.deepEqual(offenders, []);
});

test('[RS-018] clone com o mesmo .harness-project.json mantém o project_id e recebe local_id próprio', () => {
  const origin = makeRepo();
  const clone = cloneRepo(origin, 'clone-identidade');

  assert.equal(projectId(clone), PROJECT_ID);
  assert.equal(projectId(clone), projectId(origin));
  assert.notEqual(localId(clone), localId(origin), 'local_id é por clone, não é versionado');
});

test('[RS-018] worktrees do mesmo clone compartilham project_id e local_id', () => {
  const origin = makeRepo();
  const worktree = addWorktree(origin, 'wt-identidade');

  assert.equal(projectId(worktree), projectId(origin));
  assert.equal(localId(worktree), localId(origin));
});

test('[RS-018] local_id é criado uma vez em git-common-dir/harness/local-id e reutilizado', () => {
  const root = makeRepo();
  const first = localId(root);
  const file = join(realpathSync(join(root, '.git')), 'harness', 'local-id');

  assert.match(first, UUID_V4);
  assert.equal(readFileSync(file, 'utf8').trim(), first);
  assert.equal(localId(root), first, 'a segunda leitura não cria outro id');
});

test('[RS-019] projeto derivado com project_id novo não herda o id do template', () => {
  const template = makeRepo();
  const derived = cloneRepo(template, 'projeto-derivado');
  writeProjectFile(derived, DERIVED_PROJECT_ID);

  assert.equal(projectId(derived), DERIVED_PROJECT_ID);
  assert.notEqual(projectId(derived), projectId(template));
});

test('[RS-008] ausência de .harness-project.json para com config_error', () => {
  const root = makeRepo();
  unlinkSync(join(root, '.harness-project.json'));

  assert.throws(() => projectId(root), (err) => err instanceof ConfigError && err.stopReason === 'config_error');
});

test('[RS-008] .harness-project.json sem project_id válido para com config_error', () => {
  const root = makeRepo();
  writeFileSync(join(root, '.harness-project.json'), '{"project_id": ""}');

  assert.throws(() => projectId(root), (err) => err instanceof ConfigError && err.stopReason === 'config_error');
});

test('[RS-016] lock de outra change em outro worktree não bloqueia esta change', () => {
  const root = makeRepo();
  const worktree = addWorktree(root, 'wt-outra-change');
  const other = acquireLock(root, 'outra-change', { executionId: randomUUID(), now: Date.now(), host: 'host-a', pid: 1 });
  assert.equal(other.acquired, true);

  const result = acquireLock(worktree, CHANGE, { executionId: randomUUID(), now: Date.now(), host: 'host-a', pid: 2 });

  assert.equal(result.acquired, true);
  assert.equal(existsSync(join(worktree, '.harness-local')), false, 'a partida não cria estado extra no worktree');
});
