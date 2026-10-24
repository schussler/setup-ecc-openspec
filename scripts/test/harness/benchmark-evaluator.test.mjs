import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateArchive } from '../../gates/archive-gate.mjs';
import { buildReport, renderMarkdown } from '../../benchmark/lib/report.mjs';
import { makeTempDir, REPO_ROOT, writeTree } from '../helpers.mjs';

const CHANGE = 'c';
const TEST_RUNNER = "import { test } from 'node:test';\n";
const SPEC_WITH_IDS = `## ADDED Requirements

### Requirement: Soma
O sistema SHALL somar.

#### Scenario: soma dois numeros
- **ID:** SOMA-1
- **WHEN** a e b
- **THEN** a + b

#### Scenario: rejeita texto
- **ID:** SOMA-2
- **WHEN** texto
- **THEN** erro

#### Scenario: limite zero
- **WHEN** zero
- **THEN** zero
`;
const SPEC_WITHOUT_IDS = `## ADDED Requirements

### Requirement: Conversao
O sistema SHALL converter duracoes.

#### Scenario: converte horas e minutos
- **WHEN** "1h30m"
- **THEN** 5400
`;

// Projeto mínimo com a change em specs/, testes em test/ e run-state opcional.
function project({ specs, tests, runState }) {
  const root = writeTree(makeTempDir('bench-eval-'), {
    'template.json': { checks: { test: 'node --test', lint: 'true', typecheck: 'true' } },
    [`openspec/changes/${CHANGE}/specs/soma/spec.md`]: specs,
    'test/soma.test.mjs': `${TEST_RUNNER}${tests}`,
  });
  if (runState !== undefined) writeTree(root, { [`.harness-local/${CHANGE}/run-state.json`]: runState });
  return root;
}

const specsOf = (root) => join(root, 'openspec/changes', CHANGE, 'specs');

test('[PB-007] change com IDs e caso sem [ID] reprova, sem fallback por nome', async () => {
  const root = project({
    specs: SPEC_WITH_IDS,
    tests: "test('[SOMA-1] soma dois numeros', () => {});\ntest('rejeita texto', () => {});\ntest('limite zero', () => {});\n",
  });
  const result = await evaluateArchive({ root, change: CHANGE, specsDir: specsOf(root), implementationApproved: true });
  assert.equal(result.evaluator, 'id');
  assert.equal(result.passed, false);
  assert.deepEqual(result.evidence.missing, ['SOMA-2', 'sem-id:limite zero']);
  assert.deepEqual(result.evaluator_limits, []);
});

test('[PB-008] snapshot legado usa o avaliador legacy-name e o relatorio declara limites', async () => {
  const root = makeTempDir('bench-legacy-');
  cpSync(join(REPO_ROOT, 'scripts/benchmark/fixtures/legacy-pricing.pre-archive'), root, { recursive: true });
  writeTree(root, { 'template.json': { checks: { test: 'node --test "test/**/*.test.js"', lint: 'true', typecheck: 'true' } } });
  const specsDir = join(root, 'openspec/changes/refactor-discount-rules/specs');
  const result = await evaluateArchive({ root, change: 'refactor-discount-rules', specsDir, implementationApproved: true });
  assert.equal(result.evaluator, 'legacy-name');
  assert.equal(result.passed, true, JSON.stringify(result.evidence));
  assert.ok(result.evaluator_limits.some((limit) => /substring/.test(limit)));

  const report = buildReport({
    scenario: 'archive-only',
    task: { id: 'legacy-pricing-archive', scoped_paths: [] },
    n: 1,
    budget: { max: 1, used: 1, exhausted: false },
    groups: { default: [{ run: 1, status: 'passed', invocations: 1, cost_usd: 0, steps: [], gates: { archive: result } }] },
    startedAt: '2026-10-23T00:00:00.000Z',
    finishedAt: '2026-10-23T00:01:00.000Z',
  });
  assert.equal(report.archive_evaluator, 'legacy-name');
  assert.ok(report.archive_evaluator_limits.some((limit) => /não equivale/.test(limit)));
  const md = renderMarkdown(report);
  assert.ok(md.includes('legacy-name'));
  assert.ok(md.includes('não equivale'));
  assert.ok(!md.includes(root), 'relatório não deve expor o caminho do projeto');
});

test('[PB-008] change legacy com run-state de modo runner nao usa o avaliador legado', async () => {
  const tests = "test('converte horas e minutos', () => {});\n";
  const legacy = project({ specs: SPEC_WITHOUT_IDS, tests });
  const legacyResult = await evaluateArchive({ root: legacy, change: CHANGE, specsDir: specsOf(legacy), implementationApproved: true });
  assert.equal(legacyResult.evaluator, 'legacy-name');
  assert.equal(legacyResult.passed, true);

  const runner = project({ specs: SPEC_WITHOUT_IDS, tests, runState: JSON.stringify({ mode: 'runner' }) });
  const runnerResult = await evaluateArchive({ root: runner, change: CHANGE, specsDir: specsOf(runner), implementationApproved: true });
  assert.equal(runnerResult.evaluator, 'id');
  assert.equal(runnerResult.passed, false);
  assert.deepEqual(runnerResult.evidence.missing, ['sem-id:converte horas e minutos']);
});
