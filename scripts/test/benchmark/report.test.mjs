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

test('relatorio compara variantes com e sem docs', () => {
  const report = buildReport({
    scenario: 'legacy',
    task: { id: 'legacy-pricing', scoped_paths: ['src/'] },
    n: 2,
    budget: { max: 60, used: 12, exhausted: false },
    groups: { with_docs: [run('passed'), run('passed')], without_docs: [run('passed'), run('failed')] },
    startedAt: 'a',
    finishedAt: 'b',
  });
  assert.equal(report.comparison.with_docs_success_rate, 100);
  assert.equal(report.comparison.without_docs_success_rate, 50);
  assert.equal(report.comparison.difference_pp, 50);
  assert.match(renderMarkdown(report), /com − sem/);
});

test('scrubPaths remove caminhos da maquina mesmo truncados', async () => {
  const { scrubPaths } = await import('../../benchmark/lib/report.mjs');
  const text = 'em /private/tmp/claude-501/-Users-x-y/abc/project e "/private/tmp/claude-501/-Users-schussler-orca-wor" e /home/u/.claude.json';
  const out = scrubPaths(text, { workDir: '/private/tmp/claude-501/-Users-x-y/abc', home: '/home/u' });
  assert.ok(!out.includes('/private/tmp/claude-'), out);
  assert.ok(!out.includes('/home/u'), out);
  assert.match(out, /<work-dir>\/project/);
});

test('negacoes de comando composto sao contadas', async () => {
  const { countCompoundDenials } = await import('../../benchmark/lib/report.mjs');
  const denials = ['node a; echo $?', 'cd x && ls', 'touch y'].map((command) => ({ tool_name: 'Bash', tool_input: { command } }));
  assert.equal(countCompoundDenials(denials), 2);
  assert.equal(countCompoundDenials([{ tool_name: 'Write', tool_input: { file_path: 'a;b' } }]), 0);
});

test('relatorio avalia os criterios de aceite', () => {
  const runs = Array.from({ length: 10 }, (_, i) => run(i < 9 ? 'passed' : 'failed', { stopped_after_denial: i === 9 }));
  const report = buildReport({
    scenario: 'archive-only',
    task: {
      id: 't', scoped_paths: [],
      acceptance: { gate_pass_count: { archive: 10 }, max_stopped_after_denial: 0, max_compound_denials_mean: 1, max_out_of_scope: 0 },
    },
    n: 10, budget: { max: 10, used: 10, exhausted: true }, groups: { default: runs }, startedAt: 'a', finishedAt: 'b',
  });
  const byName = Object.fromEntries(report.acceptance.criteria.map((c) => [c.name, c]));
  assert.equal(byName['gate_pass_count.archive'].value, 9);
  assert.equal(byName['gate_pass_count.archive'].passed, false);
  assert.equal(byName.max_stopped_after_denial.value, 1);
  assert.equal(byName.max_out_of_scope.passed, true);
  assert.equal(report.acceptance.accepted, false);
  assert.equal(report.status, 'complete');
  assert.match(renderMarkdown(report), /Critérios de aceite/);
});

test('relatorio lista os modelos efetivos usados', () => {
  const runs = [run('passed', { steps: [{ name: 'a', status: 'ok', duration_ms: 1, cost_usd: 0, models: ['claude-haiku-5-5'] }] }),
    run('passed', { steps: [{ name: 'a', status: 'ok', duration_ms: 1, cost_usd: 0, models: ['claude-opus-5-5', 'claude-haiku-5-5'] }] })];
  const report = buildReport({ scenario: 's', task: { id: 't', scoped_paths: [] }, n: 2, budget: { max: 2, used: 2, exhausted: false }, groups: { default: runs }, startedAt: 'a', finishedAt: 'b' });
  assert.deepEqual(report.models, ['claude-haiku-5-5', 'claude-opus-5-5']);
  assert.match(renderMarkdown(report), /Modelos efetivos:.*claude-haiku-5-5/);
});
