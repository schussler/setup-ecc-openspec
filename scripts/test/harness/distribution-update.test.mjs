// template-update recusa destino sem os módulos dos gates (distribuicao).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkUpdate } from '../../../.claude/skills/template-migrate/migrate.mjs';
import { makeTempDir, writeTree } from '../helpers.mjs';

const GATE = "import { x } from '../harness/process-group.mjs';\nexport const gate = x;\n";
const HARNESS = 'export const x = 1;\n';
const POLICY = '{}\n';
const ALL_MANAGED = ['scripts/gates', 'scripts/harness', '.claude/harness'];

function manifest(managed) {
  return { template: { repo: 'https://example.invalid/t.git', branch: 'main' }, upstreams: { ecc: '1', openspec: '1' }, managed, owned: ['CLAUDE.md'] };
}

// Template de fixture: traz os arquivos de todos os caminhos; `managed` define o que é distribuído.
function template(managed) {
  return writeTree(makeTempDir('distribution-template-'), {
    'template.json': manifest(managed),
    'CLAUDE.md': '# Template\n',
    'scripts/gates/checks.mjs': GATE,
    'scripts/harness/process-group.mjs': HARNESS,
    '.claude/harness/policy.json': POLICY,
  });
}

// Projeto derivado com scripts/gates e sem scripts/harness (o estado que o problema descreve).
function projectWithGatesOnly(managed = ['scripts/gates']) {
  return writeTree(makeTempDir('distribution-project-'), {
    'template.json': manifest(managed),
    'CLAUDE.md': '# Projeto\n',
    'scripts/gates/checks.mjs': GATE,
  });
}

test('distribuicao: template-update recusa destino com scripts/gates sem scripts/harness', () => {
  const project = projectWithGatesOnly();
  assert.throws(() => checkUpdate({ template: template(ALL_MANAGED), project }), (err) => {
    assert.match(err.message, /scripts\/harness/);
    assert.match(err.message, /template-migrate|--items managed/);
    return true;
  });
});

test('distribuicao: template-update aceita destino com os dois caminhos managed', () => {
  const project = writeTree(makeTempDir('distribution-project-'), {
    'template.json': manifest(ALL_MANAGED),
    'CLAUDE.md': '# Projeto\n',
    'scripts/gates/checks.mjs': GATE,
    'scripts/harness/process-group.mjs': HARNESS,
    '.claude/harness/policy.json': POLICY,
  });
  assert.doesNotThrow(() => checkUpdate({ template: template(ALL_MANAGED), project }));
});

