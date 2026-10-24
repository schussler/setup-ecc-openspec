import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scoreArchive } from '../../gates/archive-gate.mjs';
import { makeTempDir, writeTree } from '../helpers.mjs';

const SPEC = `## ADDED Requirements

### Requirement: Soma
O sistema SHALL somar.

#### Scenario: soma dois números
- **ID:** SOMA-1
- **WHEN** a e b
- **THEN** a + b

#### Scenario: rejeita texto
- **ID:** SOMA-2
- **WHEN** texto
- **THEN** erro
`;
const PASSING = "import { test } from 'node:test';\ntest('[SOMA-1] soma dois numeros', () => {});\n";

function project({ implementVerdict = 'pass', test: suite = 'node --test', files = {} } = {}) {
  const gates = implementVerdict ? { implement: { baseline: { test_files: [] }, attempts: [{ verdict: implementVerdict }] } } : {};
  return writeTree(makeTempDir(), {
    'template.json': { checks: { test: suite, lint: 'true', typecheck: 'true' } },
    'openspec/changes/c/specs/soma/spec.md': SPEC,
    'openspec/changes/c/gates.json': gates,
    ...files,
  });
}

test('gate de arquivamento exige teste por cenario', async () => {
  const root = project({ files: { 'test/soma.test.mjs': PASSING } });
  const result = await scoreArchive({ root, change: 'c' });
  assert.notEqual(result.verdict, 'pass');
  assert.equal(result.passed, false);
  assert.equal(result.evidence.scenarios.total, 2);
  assert.equal(result.evidence.scenarios.pct, 50);
  assert.deepEqual(result.evidence.missing, ['SOMA-2']);
});

test('gate de arquivamento aprova com todos os cenarios cobertos', async () => {
  const root = project({
    files: { 'test/soma.test.mjs': `${PASSING}test('[SOMA-2] rejeita texto', () => {});\n` },
  });
  const result = await scoreArchive({ root, change: 'c', legacyWrite: true });
  assert.equal(result.verdict, 'pass');
  assert.equal(result.passed, true);
  assert.equal(result.evidence.scenarios.pct, 100);
  const gates = JSON.parse(readFileSync(join(root, 'openspec/changes/c/gates.json'), 'utf8'));
  assert.equal(gates.archive.attempts.length, 1);
});

test('gate de arquivamento exige gate de implementacao aprovado', async () => {
  const root = project({ implementVerdict: 'retry', files: { 'test/soma.test.mjs': PASSING } });
  const result = await scoreArchive({ root, change: 'c' });
  assert.equal(result.verdict, 'stop');
  assert.equal(result.cases.length, 0);
  assert.match(result.evidence.reason, /implementa/);
});

test('gate de arquivamento reprova com suite falhando', async () => {
  const root = project({
    test: 'exit 1',
    files: { 'test/soma.test.mjs': `${PASSING}test('[SOMA-2] rejeita texto', () => {});\n` },
  });
  const result = await scoreArchive({ root, change: 'c' });
  assert.notEqual(result.verdict, 'pass');
  assert.equal(result.evidence.suite_passed, false);
});
