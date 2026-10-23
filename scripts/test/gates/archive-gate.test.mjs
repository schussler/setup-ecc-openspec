import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scoreArchive, normalizeName } from '../../gates/archive-gate.mjs';
import { makeTempDir, writeTree } from '../helpers.mjs';

const SPEC = `## ADDED Requirements

### Requirement: Soma
O sistema SHALL somar.

#### Scenario: soma dois números
- **WHEN** a e b
- **THEN** a + b

#### Scenario: rejeita texto
- **WHEN** texto
- **THEN** erro
`;
const PASSING = "import { test } from 'node:test';\ntest('Soma dois numeros', () => {});\n";

function project({ implementVerdict = 'pass', test = 'node --test', files = {} } = {}) {
  const gates = implementVerdict ? { implement: { baseline: { test_files: [] }, attempts: [{ verdict: implementVerdict }] } } : {};
  return writeTree(makeTempDir(), {
    'template.json': { checks: { test, lint: 'true', typecheck: 'true' } },
    'openspec/changes/c/specs/soma/spec.md': SPEC,
    'openspec/changes/c/gates.json': gates,
    ...files,
  });
}

test('normalizeName ignora acentos, caixa e pontuacao', () => {
  assert.equal(normalizeName('Soma dois números!'), 'soma dois numeros');
  assert.equal(normalizeName('  rejeita_texto  '), 'rejeita texto');
});

test('gate de arquivamento exige teste por cenario', async () => {
  const root = project({ files: { 'test/soma.test.mjs': PASSING } });
  const result = await scoreArchive({ root, change: 'c' });
  assert.notEqual(result.verdict, 'pass');
  assert.equal(result.scenarios.total, 2);
  assert.equal(result.scenarios.pct, 50);
  assert.deepEqual(result.scenarios.missing, ['rejeita texto']);
});

test('gate de arquivamento aprova com todos os cenarios cobertos', async () => {
  const root = project({
    files: { 'test/soma.test.mjs': `${PASSING}test('rejeita texto', () => {});\n` },
  });
  const result = await scoreArchive({ root, change: 'c' });
  assert.equal(result.verdict, 'pass');
  assert.equal(result.scenarios.pct, 100);
  const gates = JSON.parse(readFileSync(join(root, 'openspec/changes/c/gates.json'), 'utf8'));
  assert.equal(gates.archive.attempts.length, 1);
});

test('gate de arquivamento exige gate de implementacao aprovado', async () => {
  const root = project({ implementVerdict: 'retry', files: { 'test/soma.test.mjs': PASSING } });
  const result = await scoreArchive({ root, change: 'c' });
  assert.equal(result.verdict, 'stop');
  assert.equal(result.scenarios, null);
  assert.match(result.reason, /implementa/);
});

test('gate de arquivamento reprova com suite falhando', async () => {
  const root = project({
    test: 'exit 1',
    files: { 'test/soma.test.mjs': `${PASSING}test('rejeita texto', () => {});\n` },
  });
  const result = await scoreArchive({ root, change: 'c' });
  assert.notEqual(result.verdict, 'pass');
  assert.equal(result.suite_passed, false);
});
