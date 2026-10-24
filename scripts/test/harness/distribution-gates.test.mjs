// Distribuição dos gates: os módulos que scripts/gates importa têm de estar em caminhos managed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeTree, makeTempDir, REPO_ROOT } from '../helpers.mjs';
import { distributionGaps } from '../../../.claude/skills/template-migrate/distribution.mjs';
import { checkTemplate } from '../../../scripts/harness/template-check.mjs';

const GATE = "import { x } from '../harness/process-group.mjs';\nexport const gate = x;\n";
const HARNESS = 'export const x = 1;\n';

function templateWith(manifest, files = {}) {
  return writeTree(makeTempDir('distribution-tpl-'), {
    'template.json': { template: { repo: 'x', branch: 'main' }, upstreams: {}, managed: [], owned: [], checks: legacyChecks(), ...manifest },
    'CLAUDE.md': '# T\n',
    ...files,
  });
}

function legacyChecks() {
  return { test: 'node --test', lint: 'node lint.mjs', typecheck: 'node tsc.mjs' };
}

test('distribuicao: scripts/gates sem scripts/harness e sem .claude/harness gera lacunas', () => {
  const root = writeTree(makeTempDir('distribution-'), { 'scripts/gates/checks.mjs': GATE });
  const gaps = distributionGaps(root, ['scripts/gates']);
  const missing = gaps.filter((gap) => gap.kind === 'missing').map((gap) => gap.path);
  assert.deepEqual(missing.sort(), ['.claude/harness', 'scripts/harness']);
  assert.ok(gaps.some((gap) => gap.kind === 'missing-import' && gap.path === 'scripts/harness/process-group.mjs'));
});

test('distribuicao: com scripts/harness, .claude/harness e managed cobrindo os dois, não há lacunas', () => {
  const root = writeTree(makeTempDir('distribution-'), {
    'scripts/gates/checks.mjs': GATE,
    'scripts/harness/process-group.mjs': HARNESS,
    '.claude/harness/policy.json': '{}\n',
  });
  assert.deepEqual(distributionGaps(root, ['scripts/gates', 'scripts/harness', '.claude/harness']), []);
});

test('distribuicao: import de gate que aponta para fora de managed e lacuna', () => {
  const root = writeTree(makeTempDir('distribution-'), {
    'scripts/gates/checks.mjs': GATE,
    'scripts/harness/process-group.mjs': HARNESS,
    '.claude/harness/policy.json': '{}\n',
  });
  const gaps = distributionGaps(root, ['scripts/gates', '.claude/harness']);
  assert.ok(gaps.some((gap) => gap.kind === 'unmanaged-import' && gap.path === 'scripts/harness/process-group.mjs'));
});

test('distribuicao: import transitivo fora de managed tambem e lacuna', () => {
  const root = writeTree(makeTempDir('distribution-'), {
    'scripts/gates/checks.mjs': GATE,
    'scripts/harness/process-group.mjs': "import { y } from '../extra/util.mjs';\nexport const x = y;\n",
    'scripts/extra/util.mjs': 'export const y = 1;\n',
    '.claude/harness/policy.json': '{}\n',
  });
  const gaps = distributionGaps(root, ['scripts/gates', 'scripts/harness', '.claude/harness']);
  assert.ok(gaps.some((gap) => gap.path === 'scripts/extra/util.mjs' && gap.kind === 'unmanaged-import'));
});

test('distribuicao: projeto sem gates não exige scripts/harness', () => {
  const root = writeTree(makeTempDir('distribution-'), { 'README.md': '# x\n' });
  assert.deepEqual(distributionGaps(root, []), []);
});

test('distribuicao: template-check aceita checks.test em string (legado) sem test_report', () => {
  const root = templateWith({ managed: [] });
  assert.deepEqual(checkTemplate(root).failures, []);
});

test('distribuicao: template-check aceita checks.test objeto com test_report tap da mesma suite', () => {
  const root = templateWith({
    managed: [],
    checks: {
      test: { command: 'node --test', suite: 'unit' },
      test_report: { command: 'node --test --test-reporter=tap', suite: 'unit', format: 'tap' },
      lint: 'l', typecheck: 't',
    },
  });
  assert.deepEqual(checkTemplate(root).failures, []);
});

test('distribuicao: template-check reprova format fora de tap nomeando checks.test_report.format', () => {
  const root = templateWith({
    managed: [],
    checks: {
      test: { command: 'node --test', suite: 'unit' },
      test_report: { command: 'x', suite: 'unit', format: 'junit' },
      lint: 'l', typecheck: 't',
    },
  });
  const failures = checkTemplate(root).failures.join('\n');
  assert.match(failures, /checks\.test_report\.format/);
  assert.match(failures, /tap/);
});

test('distribuicao: template-check reprova checks.test em string quando ha test_report', () => {
  const root = templateWith({
    managed: [],
    checks: { test: 'node --test', test_report: { command: 'x', suite: 'unit', format: 'tap' }, lint: 'l', typecheck: 't' },
  });
  assert.match(checkTemplate(root).failures.join('\n'), /checks\.test/);
});

test('distribuicao: template-check reprova suite divergente entre checks.test e test_report', () => {
  const root = templateWith({
    managed: [],
    checks: {
      test: { command: 'node --test', suite: 'unit' },
      test_report: { command: 'x', suite: 'e2e', format: 'tap' },
      lint: 'l', typecheck: 't',
    },
  });
  assert.match(checkTemplate(root).failures.join('\n'), /suite divergente/);
});

test('distribuicao: template-check reprova caminho managed ausente', () => {
  const root = templateWith({ managed: ['docs/inexistente'] });
  assert.match(checkTemplate(root).failures.join('\n'), /managed ausente: docs\/inexistente/);
});

test('distribuicao: template-check reprova gate com import fora de managed', () => {
  const root = templateWith({ managed: ['scripts/gates', '.claude/harness'] }, {
    'scripts/gates/checks.mjs': GATE,
    'scripts/harness/process-group.mjs': HARNESS,
    '.claude/harness/policy.json': '{}\n',
  });
  assert.match(checkTemplate(root).failures.join('\n'), /scripts\/harness\/process-group\.mjs/);
});

test('distribuicao: o template atual passa na verificacao de distribuicao', () => {
  assert.deepEqual(checkTemplate(REPO_ROOT).failures, []);
});
