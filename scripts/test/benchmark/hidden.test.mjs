import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runHiddenTests } from '../../benchmark/lib/hidden.mjs';
import { createBudget } from '../../benchmark/lib/budget.mjs';
import { runLegacy } from '../../benchmark/lib/legacy.mjs';
import { finish, newRun } from '../../benchmark/lib/pipeline.mjs';
import { buildReport } from '../../benchmark/lib/report.mjs';
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

test('gate hidden nao muda o status da execucao', () => {
  const run = newRun(1);
  run.gates = { bootstrap: { passed: true }, scope: { passed: true }, hidden: { passed: false } };
  assert.equal(finish(run, Date.now()).status, 'passed');
});

test('gate hidden roda os testes ocultos depois do pipeline', async () => {
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
    assert.ok(!run.gates.scope.out_of_scope.some((file) => file.includes('hidden')));
    assert.equal(run.status, 'passed', JSON.stringify(run.gates));
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
