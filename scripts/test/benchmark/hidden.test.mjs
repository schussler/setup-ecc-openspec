import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runHiddenTests } from '../../benchmark/lib/hidden.mjs';
import { createBudget } from '../../benchmark/lib/budget.mjs';
import { runLegacy } from '../../benchmark/lib/legacy.mjs';
import { finish, loadTask, newRun } from '../../benchmark/lib/pipeline.mjs';
import { buildReport, renderMarkdown } from '../../benchmark/lib/report.mjs';
import { makeTempDir, REPO_ROOT, snapshotRepo } from '../helpers.mjs';

const FIXTURES = join(REPO_ROOT, 'scripts/benchmark/fixtures');
const HIDDEN = join(FIXTURES, 'legacy-billing.hidden');
const FAKE = [process.execPath, join(REPO_ROOT, 'scripts/test/benchmark/fake-claude.mjs')];

function withSolution(name) {
  const dir = makeTempDir(`billing-${name}-`);
  cpSync(join(FIXTURES, 'legacy-billing'), dir, { recursive: true });
  cpSync(join(FIXTURES, 'legacy-billing.solutions', name), dir, { recursive: true });
  return dir;
}

const suite = (cwd) => spawnSync(process.execPath, ['--test', 'test/'], { cwd, encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: '' } });

test('fixture legacy-billing nao tem openspec nem claude md', () => {
  const fixture = join(FIXTURES, 'legacy-billing');
  for (const path of ['openspec', 'CLAUDE.md', 'docs']) assert.ok(!existsSync(join(fixture, path)), path);
  assert.equal(suite(fixture).status, 0);
});

test('solucao de referencia passa nos testes ocultos', async () => {
  const dir = withSolution('reference');
  const result = await runHiddenTests({ dir, hiddenDir: HIDDEN });
  assert.deepEqual(result.rules, { 'rule-architecture': true, 'rule-exemption': true, 'rule-rounding': true });
  assert.equal(result.passed, true);
  assert.equal(suite(dir).status, 0, suite(dir).stdout);
});

test('solucao ingenua falha em pelo menos duas regras', async () => {
  const result = await runHiddenTests({ dir: withSolution('naive'), hiddenDir: HIDDEN });
  const failed = Object.values(result.rules).filter((ok) => !ok).length;
  assert.ok(failed >= 2, JSON.stringify(result.rules));
  assert.equal(result.passed, false);
});

test('fixture sem alteracao falha nas regras de taxa', async () => {
  const dir = makeTempDir('billing-raw-');
  cpSync(join(FIXTURES, 'legacy-billing'), dir, { recursive: true });
  const result = await runHiddenTests({ dir, hiddenDir: HIDDEN });
  assert.equal(result.rules['rule-exemption'], false);
  assert.equal(result.rules['rule-rounding'], false);
});

test('[PB-004] regra de dominio obrigatoria reprovada reprova a aceitacao com gates aprovados', () => {
  const run = newRun(1);
  run.gates = { bootstrap: { passed: true }, scope: { passed: true }, hidden: { passed: false, rules: { 'rule-rounding': false } } };
  finish(run, Date.now());
  assert.equal(run.levels.gates, 'approved');
  assert.equal(run.levels.acceptance, 'rejected');
  assert.equal(run.status, 'failed');
});

test('[PB-010] gate hidden roda os testes ocultos depois do pipeline', async () => {
  const work = makeTempDir('bench-hidden-');
  const { groups } = await runLegacy({
    taskDir: join(REPO_ROOT, 'scripts/benchmark/tasks/legacy-billing'),
    n: 1, budget: createBudget(60), workRoot: work,
    templateSource: snapshotRepo().source, templateBranch: snapshotRepo().branch,
    claude: { bin: FAKE, env: { FAKE_CLAUDE_HOOK: join(REPO_ROOT, 'scripts/test/benchmark/fake-agent.mjs') } },
  });
  for (const runs of Object.values(groups)) {
    const [run] = runs;
    assert.deepEqual(Object.keys(run.gates.hidden.rules).sort(), ['rule-architecture', 'rule-exemption', 'rule-rounding']);
    // PB-010: cada regra traz a classificação declarada na tarefa (task.json, hidden_rules).
    assert.deepEqual(
      run.gates.hidden.results.map(({ rule, classification }) => [rule, classification]),
      [['rule-architecture', 'obrigatória'], ['rule-exemption', 'obrigatória'], ['rule-rounding', 'obrigatória']],
    );
    assert.ok(!run.gates.scope.out_of_scope.some((file) => file.includes('hidden')));
    // PB-004: o agente fake não implementa as regras ocultas; gates aprovados não bastam para aceitar.
    assert.equal(run.levels.gates, 'approved', JSON.stringify(run.gates));
    assert.equal(run.levels.acceptance, 'rejected', JSON.stringify(run.gates));
    assert.equal(run.status, 'failed', JSON.stringify(run.gates));
  }
});

const runWith = (status, hiddenPassed) => ({
  run: 1, status, invocations: 3, cost_usd: 1, duration_ms: 1, steps: [],
  gates: { bootstrap: { passed: true }, scope: { passed: true, out_of_scope: [] }, hidden: { passed: hiddenPassed } },
  coverage: { before: null, after: null },
});

test('relatorio compara o gate hidden entre as variantes', () => {
  const report = buildReport({
    scenario: 'legacy', task: { id: 'legacy-billing', scoped_paths: [], conclusive_min_pp: 25 }, n: 8,
    budget: { max: 48, used: 48, exhausted: true },
    groups: {
      with_docs: Array.from({ length: 8 }, (_, i) => runWith('passed', i < 6)),
      without_docs: Array.from({ length: 8 }, (_, i) => runWith('passed', i < 1)),
    },
    startedAt: 'a', finishedAt: 'b',
  });
  assert.equal(report.comparison.with_docs_hidden_rate, 75);
  assert.equal(report.comparison.without_docs_hidden_rate, 12.5);
  assert.equal(report.comparison.hidden_difference_pp, 62.5);
  assert.equal(report.comparison.conclusive, true);
});

test('acceptance avalia a melhor taxa de sucesso entre grupos', () => {
  const report = buildReport({
    scenario: 'legacy', task: { id: 't', scoped_paths: [], acceptance: { min_best_group_success_rate: 75 } }, n: 4,
    budget: { max: 24, used: 24, exhausted: true },
    groups: {
      with_docs: ['passed', 'passed', 'passed', 'failed'].map((s) => runWith(s, true)),
      without_docs: ['passed', 'passed', 'failed', 'failed'].map((s) => runWith(s, false)),
    },
    startedAt: 'a', finishedAt: 'b',
  });
  const criterion = report.acceptance.criteria.find((c) => c.name === 'min_best_group_success_rate');
  assert.equal(criterion.value, 75);
  assert.equal(criterion.passed, true);
  assert.equal(report.acceptance.accepted, true);
});

// B.6 (requisito "Testes ocultos" MODIFIED): classificação obrigatória ou informativa
// declarada por regra na tarefa; regra sem classificação é obrigatória.
const PIPELINE_PASS = { bootstrap: { passed: true }, spec: { passed: true }, implement: { passed: true }, archive: { passed: true }, scope: { passed: true, out_of_scope: [] } };

function rawFixture() {
  const dir = makeTempDir('billing-raw-class-');
  cpSync(join(FIXTURES, 'legacy-billing'), dir, { recursive: true });
  return dir;
}

function closedRun(hidden) {
  const run = newRun(1);
  run.gates = { ...PIPELINE_PASS, hidden };
  return finish(run, Date.now());
}

test('[PB-010] resultado por regra traz a classificação declarada e regra sem classificação é obrigatória', async () => {
  const result = await runHiddenTests({ dir: rawFixture(), hiddenDir: HIDDEN, classification: { 'rule-exemption': 'informativa' } });
  assert.deepEqual(result.results, [
    { rule: 'rule-architecture', passed: true, classification: 'obrigatória' },
    { rule: 'rule-exemption', passed: false, classification: 'informativa' },
    { rule: 'rule-rounding', passed: false, classification: 'obrigatória' },
  ]);
  assert.equal(result.passed, false);
  assert.deepEqual(result.failed_mandatory, ['rule-rounding']);
  assert.deepEqual(result.failed_informative, ['rule-exemption']);
});

test('[PB-010] tarefa legacy-billing declara a classificação de cada regra oculta', () => {
  const task = loadTask(join(REPO_ROOT, 'scripts/benchmark/tasks/legacy-billing'));
  assert.deepEqual(task.hidden_rules, { 'rule-architecture': 'obrigatória', 'rule-exemption': 'obrigatória', 'rule-rounding': 'obrigatória' });
});

test('[PB-010] classificação fora de obrigatória ou informativa é recusada', async () => {
  await assert.rejects(
    runHiddenTests({ dir: rawFixture(), hiddenDir: HIDDEN, classification: { 'rule-rounding': 'opcional' } }),
    /classificação inválida.*rule-rounding/,
  );
  await assert.rejects(
    runHiddenTests({ dir: rawFixture(), hiddenDir: HIDDEN, classification: { 'rule-inexistente': 'informativa' } }),
    /regra.*rule-inexistente.*não existe/,
  );
});

test('[PB-011] gate hidden reprovado só por diagnóstico informativo mantém o status passed', async () => {
  const hidden = await runHiddenTests({
    dir: rawFixture(), hiddenDir: HIDDEN,
    classification: { 'rule-architecture': 'obrigatória', 'rule-exemption': 'informativa', 'rule-rounding': 'informativa' },
  });
  assert.equal(hidden.passed, false);
  const run = closedRun(hidden);
  assert.equal(run.levels.gates, 'approved');
  assert.equal(run.levels.acceptance, 'accepted');
  assert.deepEqual(run.levels.failed_rules, []);
  assert.deepEqual(run.levels.failed_informative, ['rule-exemption', 'rule-rounding']);
  assert.equal(run.status, 'passed');
});

test('[PB-011] gate hidden reprovado por regra obrigatória reprova a aceitação funcional', async () => {
  const hidden = await runHiddenTests({ dir: rawFixture(), hiddenDir: HIDDEN, classification: { 'rule-exemption': 'informativa' } });
  const run = closedRun(hidden);
  assert.equal(run.levels.acceptance, 'rejected');
  assert.deepEqual(run.levels.failed_rules, ['rule-rounding']);
  assert.equal(run.status, 'failed');
});

test('[PB-012] regra obrigatória reprovada no gate hidden reprova a aceitação e o relatório cita a regra', async () => {
  const hidden = await runHiddenTests({
    dir: rawFixture(), hiddenDir: HIDDEN,
    classification: { 'rule-architecture': 'informativa', 'rule-exemption': 'informativa', 'rule-rounding': 'obrigatória' },
  });
  const run = closedRun(hidden);
  assert.equal(run.levels.gates, 'approved');
  assert.equal(run.levels.acceptance, 'rejected');
  assert.notEqual(run.status, 'passed');
  assert.deepEqual(run.levels.failed_rules, ['rule-rounding']);
  const report = buildReport({
    scenario: 'legacy', task: { id: 'legacy-billing', scoped_paths: [] }, n: 1,
    budget: { max: 6, used: 3, exhausted: false }, groups: { default: [run] }, startedAt: 'a', finishedAt: 'b',
  });
  const md = renderMarkdown(report);
  assert.match(md, /regra obrigatória reprovada: rule-rounding/);
  assert.doesNotMatch(md, /regra obrigatória reprovada:[^\n]*rule-exemption/);
});
