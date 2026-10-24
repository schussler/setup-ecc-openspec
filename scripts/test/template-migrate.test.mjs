import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  plan, apply, detectChecks, isPreservedText, isPreservedJson,
} from '../../.claude/skills/template-migrate/migrate.mjs';
import { makeTempDir, writeTree, readRepoFile, REPO_ROOT } from './helpers.mjs';

const TEMPLATE = REPO_ROOT;
// A real derived project: MIGRATE_PILOT_PROJECT, or the template as it was at
// 822f1cf (the version MN_Academy was created from), exported with git archive.
const PILOT = process.env.MIGRATE_PILOT_PROJECT;
const PILOT_COMMIT = '822f1cf';
const hasPilotCommit = spawnSync('git', ['cat-file', '-e', `${PILOT_COMMIT}^{commit}`], { cwd: REPO_ROOT }).status === 0;
const pilotAvailable = Boolean(PILOT) || hasPilotCommit;
const OLD_MANIFEST = {
  template: { repo: 'https://github.com/schussler/specloop.git', branch: 'main' },
  upstreams: { ecc: '2.2.3', openspec: '1.14.3' },
  managed: ['.claude/rules/common', '.claude/skills'],
  owned: ['CLAUDE.md', 'README.md'],
};

function oldProject(files = {}) {
  return writeTree(makeTempDir('migrate-'), {
    'template.json': OLD_MANIFEST,
    'CLAUDE.md': '# Meu Projeto\n\nRegra local: nunca use ORM.\n',
    ...files,
  });
}

function snapshot(root) {
  const out = {};
  const walk = (dir) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.name === '.git') continue;
      if (entry.isDirectory()) walk(rel);
      else out[rel] = readFileSync(join(root, rel), 'utf8');
    }
  };
  walk('');
  return out;
}

const ALL = ['managed', 'docs-agents', 'checks', 'settings', 'claude-md'];
const NODE_CHECKS = {
  test: 'node --test "test/**/*.test.mjs"',
  test_file: 'node --test {file}',
  lint: 'node scripts/gates/lint.mjs',
  typecheck: 'node scripts/gates/syntax-check.mjs src test',
};

test('plano de migracao nao escreve nada', () => {
  const project = oldProject();
  const before = snapshot(project);
  const result = plan({ template: TEMPLATE, project });
  assert.deepEqual(result.items.map((item) => item.id), ALL);
  assert.ok(result.items.every((item) => item.status === 'needed'), JSON.stringify(result.items.map((i) => [i.id, i.status])));
  assert.deepEqual(snapshot(project), before);
});

test('migracao sem itens confirmados nao altera arquivos', () => {
  const project = oldProject();
  const before = snapshot(project);
  const result = apply({ template: TEMPLATE, project, items: [] });
  assert.deepEqual(result.changed_files, []);
  assert.deepEqual(snapshot(project), before);
});

test('docs agents so e copiado quando nao existe', () => {
  const project = oldProject({ 'docs/agents/domain.md': '# meu domínio\n' });
  assert.equal(plan({ template: TEMPLATE, project }).items.find((i) => i.id === 'docs-agents').status, 'done');
  apply({ template: TEMPLATE, project, items: ['docs-agents'] });
  assert.equal(readFileSync(join(project, 'docs/agents/domain.md'), 'utf8'), '# meu domínio\n');
  assert.ok(!existsSync(join(project, 'docs/agents/architecture.md')));

  const fresh = oldProject();
  apply({ template: TEMPLATE, project: fresh, items: ['docs-agents'] });
  for (const file of ['architecture.md', 'domain.md', 'issue-tracker.md']) {
    assert.match(readFileSync(join(fresh, 'docs/agents', file), 'utf8'), /TBD/);
  }
});

test('checks confirmados sao gravados e o resto fica vazio', () => {
  const project = oldProject();
  apply({ template: TEMPLATE, project, items: ['checks'], checks: { test: 'npm test' } });
  const { checks } = JSON.parse(readFileSync(join(project, 'template.json'), 'utf8'));
  assert.equal(checks.test, 'npm test');
  assert.equal(checks.lint, '');
  assert.equal(checks.typecheck, '');
});

test('checks existentes nao sao sobrescritos', () => {
  const project = oldProject({ 'template.json': { ...OLD_MANIFEST, checks: { test: 'make test' } } });
  apply({ template: TEMPLATE, project, items: ['checks'], checks: { test: 'npm test', lint: 'npm run lint' } });
  const { checks } = JSON.parse(readFileSync(join(project, 'template.json'), 'utf8'));
  assert.equal(checks.test, 'make test');
  assert.equal(checks.lint, 'npm run lint');
});

test('checks detectados a partir do package json', () => {
  const project = oldProject({ 'package.json': { scripts: { test: 'vitest', lint: 'eslint .', typecheck: 'tsc --noEmit' } } });
  const detected = detectChecks(project);
  assert.equal(detected.test, 'npm test');
  assert.equal(detected.lint, 'npm run lint');
  assert.equal(detected.typecheck, 'npm run typecheck');
});

test('checks detectados para python e go', () => {
  const py = oldProject({ 'pyproject.toml': '[project]\nname = "x"\n\n[tool.ruff]\n\n[tool.mypy]\n' });
  assert.deepEqual(detectChecks(py), { test: 'pytest', test_file: 'pytest {file}', lint: 'ruff check .', typecheck: 'mypy .' });
  const go = oldProject({ 'go.mod': 'module x\n' });
  assert.equal(detectChecks(go).test, 'go test ./...');
  assert.equal(detectChecks(oldProject()).test, undefined);
});

test('settings recebe so adicoes', () => {
  const project = oldProject({ '.claude/settings.json': { permissions: { allow: ['Bash(make:*)', 'Read'] }, model: 'x' } });
  apply({ template: TEMPLATE, project, items: ['settings'] });
  const settings = JSON.parse(readFileSync(join(project, '.claude/settings.json'), 'utf8'));
  assert.deepEqual(settings.permissions.allow.slice(0, 2), ['Bash(make:*)', 'Read']);
  assert.ok(settings.permissions.allow.includes('Bash(openspec:*)'));
  assert.equal(settings.permissions.allow.filter((rule) => rule === 'Read').length, 1);
  assert.equal(settings.model, 'x');
});

test('CLAUDE.md recebe blocos marcados preservando o resto', () => {
  const project = oldProject();
  const original = readFileSync(join(project, 'CLAUDE.md'), 'utf8');
  apply({ template: TEMPLATE, project, items: ['claude-md'] });
  const result = readFileSync(join(project, 'CLAUDE.md'), 'utf8');
  assert.match(result, /<!-- template:agents-context:start -->[\s\S]*docs\/agents\/issue-tracker\.md[\s\S]*<!-- template:agents-context:end -->/);
  assert.match(result, /<!-- template:pipeline:start -->[\s\S]*spec-implement[\s\S]*<!-- template:pipeline:end -->/);
  assert.ok(result.startsWith('# Meu Projeto\n'));
  assert.ok(isPreservedText(original, result));
});

test('template CLAUDE.md marca os blocos agents-context e pipeline', () => {
  const text = readRepoFile('CLAUDE.md');
  for (const id of ['agents-context', 'pipeline']) {
    assert.match(text, new RegExp(`<!-- template:${id}:start -->[\\s\\S]+<!-- template:${id}:end -->`), id);
  }
});

test('managed novos do template sao adicionados ao manifesto', () => {
  const project = oldProject();
  apply({ template: TEMPLATE, project, items: ['managed'] });
  const manifest = JSON.parse(readFileSync(join(project, 'template.json'), 'utf8'));
  assert.ok(manifest.managed.includes('scripts/gates'));
  assert.ok(manifest.owned.includes('docs/agents'));
  assert.ok(existsSync(join(project, 'scripts/gates/implement-gate.mjs')));
  assert.ok(isPreservedJson(OLD_MANIFEST, manifest));
});

test('managed existente no projeto vira conflito e nao e sobrescrito', () => {
  const project = oldProject({ 'scripts/gates/checks.mjs': '// local\n' });
  const item = plan({ template: TEMPLATE, project }).items.find((i) => i.id === 'managed');
  assert.ok(item.details.conflicts.includes('scripts/gates'));
  apply({ template: TEMPLATE, project, items: ['managed'] });
  assert.equal(readFileSync(join(project, 'scripts/gates/checks.mjs'), 'utf8'), '// local\n');
});

test('isPreserved detecta conteudo perdido', () => {
  assert.equal(isPreservedText('a\nb\nc\n', 'a\nx\nb\nc\ny\n'), true);
  assert.equal(isPreservedText('a\nb\n', 'b\na\n'), false);
  assert.equal(isPreservedJson({ a: [1, 2], b: { c: 1 } }, { a: [1, 2, 3], b: { c: 1, d: 2 }, e: 0 }), true);
  assert.equal(isPreservedJson({ a: [1, 2] }, { a: [2] }), false);
  assert.equal(isPreservedJson({ b: { c: 1 } }, { b: { c: 2 } }), false);
});

function pilotCopy() {
  const root = makeTempDir('pilot-');
  if (PILOT) {
    const files = execFileSync('git', ['ls-files', '-z'], { cwd: PILOT, encoding: 'utf8' }).split('\0').filter(Boolean);
    for (const file of files) cpSync(join(PILOT, file), join(root, file));
    return root;
  }
  const tar = join(makeTempDir('pilot-tar-'), 'pilot.tar');
  execFileSync('git', ['archive', '--format=tar', '-o', tar, PILOT_COMMIT], { cwd: REPO_ROOT });
  execFileSync('tar', ['-xf', tar, '-C', root]);
  return root;
}

test('migracao e idempotente', { skip: !pilotAvailable && 'projeto piloto ausente' }, () => {
  const project = pilotCopy();
  apply({ template: TEMPLATE, project, items: ALL, checks: NODE_CHECKS });
  const first = snapshot(project);
  const second = apply({ template: TEMPLATE, project, items: ALL, checks: NODE_CHECKS });
  assert.deepEqual(second.changed_files, []);
  assert.deepEqual(snapshot(project), first);
  assert.ok(plan({ template: TEMPLATE, project }).items.every((item) => item.status === 'done'));
});

test('nada do projeto e perdido na migracao', { skip: !pilotAvailable && 'projeto piloto ausente' }, () => {
  const project = pilotCopy();
  const before = snapshot(project);
  apply({ template: TEMPLATE, project, items: ALL, checks: NODE_CHECKS });
  const after = snapshot(project);
  for (const [file, content] of Object.entries(before)) {
    assert.ok(file in after, `${file} removido`);
    const kept = file.endsWith('.json')
      ? isPreservedJson(JSON.parse(content), JSON.parse(after[file]))
      : isPreservedText(content, after[file]);
    assert.ok(kept, `${file} perdeu conteúdo`);
  }
});

test('projeto migrado roda os gates sem erro de configuracao', { skip: !pilotAvailable && 'projeto piloto ausente' }, () => {
  const project = pilotCopy();
  apply({ template: TEMPLATE, project, items: ALL, checks: NODE_CHECKS });
  writeTree(project, { 'test/ok.test.mjs': "import { test } from 'node:test';\ntest('ok', () => {});\n" });
  mkdirSync(join(project, 'openspec/changes/piloto'), { recursive: true });
  const gate = (...args) => spawnSync(process.execPath, ['scripts/gates/implement-gate.mjs', ...args, '--change', 'piloto'], {
    cwd: project, encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: '' },
  });
  // SG-008: a CLI só grava gates.json com --legacy-write (repositório em modo legacy).
  assert.equal(gate('baseline', '--legacy-write').status, 0);
  const score = gate('score', '--legacy-write');
  assert.notEqual(JSON.parse(score.stdout).verdict, 'error', score.stdout);
});

test('template-migrate pede confirmacao por item', () => {
  const text = readRepoFile('.claude/skills/template-migrate/SKILL.md');
  const steps = text.slice(text.indexOf('## Steps'));
  assert.match(steps, /migrate\.mjs plan/);
  assert.match(steps, /confirm/i);
  assert.ok(steps.search(/confirm/i) < steps.indexOf('migrate.mjs apply'));
  assert.match(steps, /--items/);
  assert.match(text, /\.claude\/skills\/template-migrate\/migrate\.mjs/);
  assert.match(text, /[Nn]ever run .*script.* from the template clone/);
});
