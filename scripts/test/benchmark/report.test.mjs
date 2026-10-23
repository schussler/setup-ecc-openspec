import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, renderMarkdown, parseCoverage } from '../../benchmark/lib/report.mjs';

const run = (status, extra = {}) => ({
  run: 1,
  status,
  invocations: 4,
  cost_usd: 0.4,
  duration_ms: 1000,
  steps: [{ name: 'spec-create', status: 'ok', duration_ms: 400, cost_usd: 0.1, num_turns: 3, permission_denials: [] }],
  gates: {
    bootstrap: { passed: true },
    spec: { passed: true },
    implement: { passed: status === 'passed', old_pct: 100, new_pct: 100, lint_errors: 0, type_errors: 0 },
    archive: { passed: status === 'passed', scenarios_pct: 100 },
    scope: { passed: true, out_of_scope: [] },
  },
  coverage: { before: null, after: 92.5 },
  ...extra,
});

test('parseCoverage le a linha all files do node', () => {
  assert.equal(parseCoverage('ℹ all files       |  92.50 |    80.00 |  100.00 |'), 92.5);
  assert.equal(parseCoverage('# all files | 70.1 | 1 | 1 |'), 70.1);
  assert.equal(parseCoverage('nada'), null);
});

test('relatorio contem gates tempos custo e status', () => {
  const report = buildReport({
    scenario: 'greenfield',
    task: { id: 'greenfield-duration', scoped_paths: ['src/'] },
    n: 2,
    budget: { max: 60, used: 8, exhausted: false },
    groups: { default: [run('passed'), run('failed')] },
    startedAt: '2026-10-23T00:00:00.000Z',
    finishedAt: '2026-10-23T00:10:00.000Z',
  });
  assert.equal(report.status, 'complete');
  assert.equal(report.invocations, 8);
  assert.equal(report.cost_usd, 0.8);
  const summary = report.groups.default.summary;
  assert.equal(summary.success_rate, 50);
  assert.equal(summary.gates.implement.pass_rate, 50);
  assert.equal(summary.out_of_scope_files, 0);
  assert.deepEqual(summary.coverage_after, { min: 92.5, max: 92.5, mean: 92.5 });
  assert.equal(typeof summary.step_duration_ms['spec-create'].mean, 'number');
  const md = renderMarkdown(report);
  for (const text of ['Status', 'complete', 'Custo', 'Invocações', 'Tempo por etapa', 'Cobertura', 'scoped_paths', 'Taxa de sucesso']) {
    assert.ok(md.includes(text), text);
  }
});

test('status do relatorio reflete orcamento esgotado sem contar falha de gate', () => {
  const report = buildReport({
    scenario: 'greenfield',
    task: { id: 't', scoped_paths: [] },
    n: 2,
    budget: { max: 4, used: 4, exhausted: true },
    groups: { default: [run('passed'), run('budget_exhausted', { gates: {} })] },
    startedAt: 'a',
    finishedAt: 'b',
  });
  assert.equal(report.status, 'budget_exhausted');
  const summary = report.groups.default.summary;
  assert.equal(summary.executed, 1);
  assert.equal(summary.success_rate, 100);
  assert.equal(summary.budget_exhausted, 1);
});
