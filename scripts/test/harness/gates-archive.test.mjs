import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTempDir, writeTree } from '../helpers.mjs';
import { scoreArchive } from '../../gates/archive-gate.mjs';

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
const SEM_COMPORTAMENTO = '## Notas\n\nSem requisitos nesta mudança.\n';
const SOMA_1 = "import { test } from 'node:test';\ntest('[SOMA-1] soma dois numeros', () => {});\n";
const SOMA_2 = "import { test } from 'node:test';\ntest('[SOMA-2] rejeita texto', () => {});\n";
const TUDO = "import { test } from 'node:test';\ntest('[SOMA-1] soma dois numeros', () => {});\ntest('[SOMA-2] rejeita texto', () => {});\n";

function project({ implementVerdict = 'pass', test: suite = 'node --test', lint = 'true', typecheck = 'true', spec = SPEC, files = {}, runState } = {}) {
  const gates = implementVerdict ? { implement: { baseline: { test_files: [] }, attempts: [{ verdict: implementVerdict }] } } : {};
  const trees = {
    'template.json': { checks: { test: suite, lint, typecheck } },
    'openspec/changes/c/specs/soma/spec.md': spec,
    'openspec/changes/c/gates.json': gates,
    ...files,
  };
  if (runState) trees['.harness-local/c/run-state.json'] = runState;
  return writeTree(makeTempDir(), trees);
}

const caseOf = (result, id) => result.cases.find((c) => c.id === id);

test('[SG-009] cenario sem caso com o seu ID fica missing', async () => {
  const root = project({ files: { 'test/soma.test.mjs': SOMA_1 } });
  const result = await scoreArchive({ root, change: 'c', legacyWrite: true });
  assert.equal(result.passed, false);
  assert.deepEqual(result.evidence.missing, ['SOMA-2']);
});

test('[AC-003] caso com o ID entre colchetes satisfaz o cenario', async () => {
  const root = project({ files: { 'test/soma.test.mjs': TUDO } });
  const result = await scoreArchive({ root, change: 'c' });
  assert.equal(result.passed, true);
  assert.deepEqual(result.evidence.missing, []);
  assert.equal(caseOf(result, 'SOMA-2').status, 'pass');
});

test('[SG-012] titulo do cenario em comentario nao conta como cobertura', async () => {
  const root = project({
    files: { 'test/soma.test.mjs': `// SOMA-2 rejeita texto\n${SOMA_1}` },
  });
  const result = await scoreArchive({ root, change: 'c' });
  assert.equal(result.passed, false);
  assert.deepEqual(result.evidence.missing, ['SOMA-2']);
});

test('[AC-003] nome com o titulo do cenario mas sem o ID nao satisfaz', async () => {
  const root = project({
    files: { 'test/soma.test.mjs': `${SOMA_1}test('rejeita texto', () => {});\n` },
  });
  const result = await scoreArchive({ root, change: 'c' });
  assert.equal(result.passed, false);
  assert.deepEqual(result.evidence.missing, ['SOMA-2']);
});

test('[SG-011] mudanca com comportamento novo e sem cenario reprova com no_scenarios', async () => {
  const spec = '## ADDED Requirements\n\n### Requirement: Soma\nO sistema SHALL somar.\n';
  const root = project({ spec, files: { 'test/soma.test.mjs': SOMA_1 } });
  const result = await scoreArchive({ root, change: 'c' });
  assert.equal(result.passed, false);
  assert.ok(result.evidence.reasons.includes('no_scenarios'));
});

test('[SG-020] mudanca sem comportamento novo passa com a suite e os checks', async () => {
  const root = project({ spec: SEM_COMPORTAMENTO, files: { 'test/soma.test.mjs': SOMA_1 } });
  const result = await scoreArchive({ root, change: 'c' });
  assert.equal(result.verdict, 'pass');
  assert.equal(result.passed, true);
});

test('[SG-020] mudanca sem comportamento novo reprova quando lint falha', async () => {
  const root = project({ spec: SEM_COMPORTAMENTO, lint: 'exit 1', files: { 'test/soma.test.mjs': SOMA_1 } });
  const result = await scoreArchive({ root, change: 'c' });
  assert.equal(result.passed, false);
});

test('[SG-010] aprovacao de implementacao invalida reprova sem avaliar cenarios', async () => {
  const root = project({ implementVerdict: 'retry', files: { 'test/soma.test.mjs': TUDO } });
  const result = await scoreArchive({ root, change: 'c' });
  assert.equal(result.passed, false);
  assert.equal(result.cases.length, 0);
  assert.match(result.evidence.reason, /implementa/);
});

test('[SG-013] gate de arquivamento declara paid falso', async () => {
  const root = project({ files: { 'test/soma.test.mjs': TUDO } });
  const result = await scoreArchive({ root, change: 'c' });
  assert.equal(result.gate, 'archive');
  assert.equal(result.paid, false);
  assert.equal(result.cost_source, null);
});

test('[SG-005] suite com saida 1 reprova mesmo com # pass 3 e # fail 0', async () => {
  const root = project({
    test: 'echo "# pass 3"; echo "# fail 0"; exit 1',
    files: { 'test/soma.test.mjs': TUDO },
  });
  const result = await scoreArchive({ root, change: 'c' });
  assert.equal(result.passed, false);
});

test('[SG-006] cenario com caso skip nao satisfaz o arquivamento', async () => {
  const skipped = "import { test } from 'node:test';\ntest('[SOMA-1] soma', () => {});\ntest('[SOMA-2] rejeita', { skip: true }, () => {});\n";
  const root = project({ files: { 'test/soma.test.mjs': skipped } });
  const result = await scoreArchive({ root, change: 'c' });
  assert.equal(result.passed, false);
  assert.equal(caseOf(result, 'SOMA-2').status, 'skip');
});

test('[SG-008] CLI do arquivamento sem --legacy-write nao grava gates.json', async () => {
  const root = project({ files: { 'test/soma.test.mjs': TUDO } });
  await scoreArchive({ root, change: 'c' });
  const gates = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(`${root}/openspec/changes/c/gates.json`, 'utf8')));
  assert.equal(gates.archive, undefined);
});

test('[SG-019] --legacy-write do arquivamento e recusado em execucao runner', async () => {
  const root = project({ files: { 'test/soma.test.mjs': TUDO }, runState: { mode: 'runner' } });
  await assert.rejects(scoreArchive({ root, change: 'c', legacyWrite: true }), /runner/);
});

test('[SG-004] check declarado no cenario e satisfeito pelo resultado do check', async () => {
  const spec = SPEC.replace('- **ID:** SOMA-2\n', '- **ID:** SOMA-2\n- **Verificação:** check:lint\n');
  const root = project({ spec, files: { 'test/soma.test.mjs': SOMA_1 } });
  const result = await scoreArchive({ root, change: 'c' });
  assert.equal(caseOf(result, 'SOMA-2').status, 'pass');
  assert.equal(caseOf(result, 'SOMA-2').source, 'check:lint');
  assert.equal(result.passed, true);
});

test('[AC-018] check declarado que falha reprova o cenario', async () => {
  const spec = SPEC.replace('- **ID:** SOMA-2\n', '- **ID:** SOMA-2\n- **Verificação:** check:lint\n');
  const root = project({ spec, lint: 'exit 1', files: { 'test/soma.test.mjs': SOMA_1 } });
  const result = await scoreArchive({ root, change: 'c' });
  assert.equal(caseOf(result, 'SOMA-2').status, 'fail');
  assert.equal(result.passed, false);
});
