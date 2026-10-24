// specloop adopt (framework-cli): projeto existente, plano e confirmação por item.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPO_ROOT } from '../helpers.mjs';
import { plan } from '../../../.claude/skills/template-migrate/migrate.mjs';
import { contents, gitRepo, runCli, snapshot } from './support.mjs';

const EXISTING = {
  'package.json': { name: 'app', scripts: { test: 'node --test', lint: 'eslint .', typecheck: 'tsc --noEmit' } },
  'src/app.js': 'export const app = 1;\n',
  'README.md': '# App existente\n',
};

test('[SL-012] adopt sem confirmacao nao escreve', () => {
  const project = gitRepo(EXISTING);
  const before = snapshot(project);

  const result = runCli(['adopt'], { cwd: project, input: 'n\nn\nn\nn\nn\n' });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /managed/);
  assert.match(result.stdout, /docs-agents/);
  assert.deepEqual(snapshot(project), before);
});

test('[SL-013] adopt aplica itens confirmados', () => {
  const project = gitRepo(EXISTING);
  const before = contents(snapshot(project));

  const result = runCli(['adopt', '--yes'], { cwd: project });

  assert.equal(result.code, 0, result.stderr);
  const statuses = plan({ template: REPO_ROOT, project }).items.map(({ id, status }) => [id, status]);
  assert.deepEqual(statuses, statuses.map(([id]) => [id, 'done']));
  const after = contents(snapshot(project));
  for (const [file, hash] of Object.entries(before)) assert.equal(after[file], hash, file);
});

test('adopt com --items aplica so os itens listados', () => {
  const project = gitRepo(EXISTING);

  const result = runCli(['adopt', '--items', 'managed,settings'], { cwd: project });

  assert.equal(result.code, 0, result.stderr);
  const statuses = Object.fromEntries(plan({ template: REPO_ROOT, project }).items.map(({ id, status }) => [id, status]));
  assert.equal(statuses.managed, 'done');
  assert.equal(statuses.settings, 'done');
  assert.equal(statuses['docs-agents'], 'needed');
  assert.equal(statuses['claude-md'], 'needed');
});
