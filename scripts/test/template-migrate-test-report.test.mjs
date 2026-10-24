// F12 (tarefa 12.3, critérios PM-010): migração de checks.test_report em projeto
// existente. Fixtures locais; o template é um clone mínimo montado no teste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempDir, readRepoFile, writeTree } from './helpers.mjs';
import { apply, plan } from '../../.claude/skills/template-migrate/migrate.mjs';

const TEST_CMD = 'node --test "test/**/*.test.js"';
const TAP_CMD = 'node --test --test-reporter=tap "test/**/*.test.js"';

function template() {
  const dir = makeTempDir('pm10-template-');
  writeTree(dir, {
    'template.json': { managed: [], owned: [], checks: {} },
    'CLAUDE.md': '# Template\n',
    '.claude/settings.json': { permissions: { allow: [] } },
  });
  return dir;
}

// Projeto derivado com o `checks` informado; o manifesto é o único arquivo que o item toca.
function project(checks, extra = {}) {
  const dir = makeTempDir('pm10-project-');
  writeTree(dir, {
    'template.json': { template: { repo: 'x', branch: 'main' }, managed: [], owned: [], project: { name: 'p' }, checks, ...extra },
    'CLAUDE.md': '# Projeto\n',
  });
  return dir;
}

const manifestOf = (dir) => JSON.parse(readFileSync(join(dir, 'template.json'), 'utf8'));
const rawManifest = (dir) => readFileSync(join(dir, 'template.json'), 'utf8');

test('[PM-010] (a) checks.test em string vira objeto com suite e test_report é criado com format tap', () => {
  const tpl = template();
  const dir = project({ test: TEST_CMD, lint: 'npm run lint', typecheck: 'npm run typecheck' });
  apply({ template: tpl, project: dir, items: ['checks'], checks: { test_report: TAP_CMD, suite: 'unit' } });
  const checks = manifestOf(dir).checks;
  assert.deepEqual(checks.test, { command: TEST_CMD, suite: 'unit' });
  assert.deepEqual(checks.test_report, { command: TAP_CMD, suite: 'unit', format: 'tap' });
});

test('[PM-010] (b) valores de checks já definidos localmente não são sobrescritos e cada diferença é reportada', () => {
  const tpl = template();
  const dir = project({
    test: { command: TEST_CMD, suite: 'unit' },
    test_report: { command: 'node --test --test-reporter=tap "local/**/*.test.js"', suite: 'unit', format: 'tap', timeout_ms: 90000 },
    lint: 'npm run lint:local',
  });
  const result = apply({ template: tpl, project: dir, items: ['checks'], checks: { test_report: TAP_CMD, suite: 'unit', lint: 'npm run lint' } });
  const checks = manifestOf(dir).checks;
  assert.equal(checks.test_report.command, 'node --test --test-reporter=tap "local/**/*.test.js"');
  assert.equal(checks.test_report.timeout_ms, 90000, 'chave local perdida');
  assert.equal(checks.lint, 'npm run lint:local', 'lint local sobrescrito');
  const keys = result.preserved.map((item) => item.key).sort();
  assert.deepEqual(keys, ['checks.lint', 'checks.test_report.command'].sort());
  assert.equal(result.preserved.find((item) => item.key === 'checks.test_report.command').proposed, TAP_CMD);
});

test('[PM-010] (c) formato incompatível (junit) é recusado com config_error que nomeia checks.test_report.format, sem alterar arquivos', () => {
  const tpl = template();
  const dir = project({ test: { command: TEST_CMD, suite: 'unit' }, test_report: { command: 'node --test --test-reporter=junit', suite: 'unit', format: 'junit' } });
  const before = rawManifest(dir);
  assert.throws(() => apply({ template: tpl, project: dir, items: ['checks'], checks: {} }), (err) => {
    assert.match(err.message, /config_error/);
    assert.match(err.message, /checks\.test_report\.format/);
    assert.match(err.message, /junit/);
    assert.match(err.message, /tap/);
    assert.match(err.message, /"format": "tap"/);
    return true;
  });
  assert.equal(rawManifest(dir), before);
});

test('[PM-010] (c) formato incompatível também é recusado ao aplicar test_report com format junit', () => {
  const tpl = template();
  const dir = project({ test: TEST_CMD, lint: 'npm run lint' });
  const before = rawManifest(dir);
  assert.throws(() => apply({ template: tpl, project: dir, items: ['checks'], checks: { test_report: 'node --test --test-reporter=junit', suite: 'unit', format: 'junit' } }), /checks\.test_report\.format/);
  assert.equal(rawManifest(dir), before);
});

test('[PM-010] (d) checks.test com suite diferente de checks.test_report é recusado sem executar nem gravar', () => {
  const tpl = template();
  const dir = project({ test: { command: TEST_CMD, suite: 'integration' }, lint: 'npm run lint' });
  const before = rawManifest(dir);
  assert.throws(() => apply({ template: tpl, project: dir, items: ['checks'], checks: { test_report: TAP_CMD, suite: 'unit' } }), (err) => {
    assert.match(err.message, /config_error/);
    assert.match(err.message, /integration/);
    assert.match(err.message, /unit/);
    return true;
  });
  assert.equal(rawManifest(dir), before);
});

test('plan mostra o test_report como needed com o comando TAP candidato derivado de node --test', () => {
  const tpl = template();
  const dir = project({ test: TEST_CMD, lint: 'npm run lint', typecheck: 'npm run typecheck' });
  const item = plan({ template: tpl, project: dir }).items.find((entry) => entry.id === 'checks');
  // Comandos obrigatórios preenchidos: o item é done (modo legado, D27), e o test_report fica pendente.
  assert.equal(item.status, 'done');
  assert.equal(item.details.test_report.status, 'needed');
  assert.match(item.details.test_report.candidate, /--test-reporter=tap/);
});

test('new-project declara checks.test_report e .harness-local no .gitignore', () => {
  const text = readRepoFile('.claude/skills/new-project/SKILL.md');
  assert.match(text, /checks\.test_report/);
  assert.match(text, /\.harness-local\//);
  assert.match(text, /"format": "tap"/);
});
