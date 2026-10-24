// F11 (tarefas 11.1 a 11.4): benchmark em três níveis, configuração e declarações
// no relatório, não determinismo registrado e plano de calibração. Todos os testes
// usam runs montados à mão ou o simulador; nenhum chama o modelo real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { newRun, finish } from '../../benchmark/lib/pipeline.mjs';
import { buildReport, renderMarkdown } from '../../benchmark/lib/report.mjs';
import { REPO_ROOT } from '../helpers.mjs';

const ok = (name, extra = {}) => ({ name, status: 'ok', duration_ms: 1000, cost_usd: 0.2, permission_denials: [], ...extra });
const BUDGET = { max: 60, used: 6, exhausted: false };

// Run terminado por `finish`, como o pipeline o entrega ao relatório.
function finished(number, { steps = [ok('spec-create'), ok('spec-implement'), ok('spec-archive')], gates = {}, failure = null } = {}) {
  const run = newRun(number, { failure });
  run.steps.push(...steps);
  run.gates = gates;
  return finish(run, Date.now());
}

const ALL_PASS = {
  bootstrap: { passed: true }, spec: { passed: true }, implement: { passed: true }, archive: { passed: true }, scope: { passed: true, out_of_scope: [] },
};

function reportOf(runs, extra = {}) {
  return buildReport({
    scenario: 'legacy-billing', task: { id: 'legacy-billing', scoped_paths: ['src/'] }, n: runs.length,
    budget: BUDGET, groups: { default: runs }, startedAt: 'a', finishedAt: 'b', ...extra,
  });
}

test('[PB-001] erro do runner antes da implementação é falha do runner, não falha funcional', () => {
  const run = finished(1, {
    steps: [ok('spec-create', { status: 'error', reason: 'spawn: ENOENT', cost_usd: null })],
    gates: { bootstrap: { passed: true } },
  });
  assert.equal(run.levels.execution, 'runner_failed');
  assert.equal(run.levels.acceptance, 'not_evaluated');
  assert.equal(run.status, 'runner_failed');
  assert.match(run.failure, /runner/);
  const summary = reportOf([run]).groups.default.summary;
  assert.equal(summary.runner_failed, 1);
  assert.equal(summary.functional_failed, 0);
  assert.equal(summary.executed, 0, 'falha do runner não entra na taxa de sucesso');
  assert.equal(summary.success_rate, null);
});

test('[PB-001] erro do runner não é reclassificado como falha de gate', () => {
  const run = finished(1, {
    steps: [ok('spec-create', { status: 'timeout', cost_usd: null })],
    gates: {},
  });
  assert.equal(run.status, 'runner_failed');
  assert.equal(run.levels.gates, 'not_evaluated');
});

test('[PB-002] execução concluída com gate de arquivamento reprovado aparece em níveis distintos', () => {
  const run = finished(1, { gates: { ...ALL_PASS, archive: { passed: false, scenarios_pct: 80 } } });
  assert.equal(run.levels.execution, 'completed');
  assert.equal(run.levels.gates, 'rejected');
  assert.equal(run.levels.acceptance, 'rejected');
  assert.equal(run.status, 'failed');
  const summary = reportOf([run]).groups.default.summary;
  assert.equal(summary.runner_failed, 0);
  assert.equal(summary.gates_rejected, 1);
  const md = renderMarkdown(reportOf([run]));
  assert.match(md, /Execução concluída/);
  assert.match(md, /Gates reprovados/);
  assert.match(md, /Falhas do runner/);
});

test('[PB-004] regra de domínio obrigatória reprova a aceitação mesmo com gates aprovados', () => {
  const run = finished(1, {
    gates: { ...ALL_PASS, hidden: { passed: false, rules: { rounding: false, exemption: true } } },
  });
  assert.equal(run.levels.gates, 'approved');
  assert.equal(run.levels.acceptance, 'rejected');
  assert.deepEqual(run.levels.failed_rules, ['rounding']);
  assert.equal(run.status, 'failed');
  assert.match(run.failure, /rounding/);
  const md = renderMarkdown(reportOf([run]));
  assert.match(md, /regra obrigatória.*rounding|rounding.*regra obrigatória/);
});

test('[PB-004] gates aprovados e regras de domínio cumpridas são aceitação funcional', () => {
  const run = finished(1, { gates: { ...ALL_PASS, hidden: { passed: true, rules: { rounding: true } } } });
  assert.equal(run.levels.acceptance, 'accepted');
  assert.equal(run.status, 'passed');
});

test('[PB-003] relatório traz configuração efetiva com marcador de candidato, autorizações, contrato e ambiente', () => {
  const run = finished(1, { gates: ALL_PASS });
  const config = {
    model_requested: 'padrão do usuário',
    n: 1,
    concurrency: 2,
    max_invocations: { value: 60, candidate: true, policy_key: 'max_invocations_per_change' },
    timeout_min: { value: 25, candidate: true, policy_key: 'max_seconds_per_call' },
    authorizations: [{ kind: 'invocation_budget', max: 60, used: 6 }],
    contract: { task: 'legacy-billing', change: 'add-service-fee', checks_sha256: 'abc' },
    environment: { node: process.version, platform: process.platform },
    harness_policy_version: '1.0.0',
  };
  const report = reportOf([run], { config });
  assert.deepEqual(report.config, config);
  assert.equal(report.calibration.source, '.claude/harness/policy.md');
  const md = renderMarkdown(report);
  assert.match(md, /candidato/);
  assert.match(md, /invocation_budget/);
  assert.match(md, /Plano de calibração/);
  assert.match(md, /add-service-fee/);
});

test('[PB-005] máximo observado tem origem e declaração de que não é garantia', () => {
  const runs = [
    finished(1, { gates: ALL_PASS, steps: [ok('spec-create', { cost_usd: 0.4 }), ok('spec-implement', { cost_usd: 1.05 })] }),
    finished(2, { gates: ALL_PASS, steps: [ok('spec-create', { cost_usd: 0.6 })] }),
  ];
  const report = reportOf(runs);
  assert.equal(report.max_cost_per_call.usd, 1.05);
  assert.match(report.max_cost_per_call.origin, /total_cost_usd/);
  assert.equal(report.max_cost_per_call.origin_invocations, 3);
  assert.match(report.max_cost_per_call.declaration, /não é garantia de máximo futuro/);
  assert.match(renderMarkdown(report), /não é garantia de máximo futuro/);
});

test('[PB-009] não determinismo do PB-008 aparece como ocorrência aberta com 18 reexecuções', () => {
  const report = reportOf([finished(1, { gates: ALL_PASS })]);
  const [occurrence] = report.nondeterminism.filter((item) => item.ref === 'PB-009');
  assert.ok(occurrence, 'ocorrência ausente');
  assert.equal(occurrence.status, 'aberto');
  assert.equal(occurrence.resolved, false);
  assert.match(occurrence.evidence, /18 reexecuções/);
  assert.match(occurrence.cause, /não identificada/);
  const md = renderMarkdown(report);
  assert.match(md, /Não determinismo/);
  assert.match(md, /aberto/);
  assert.match(md, /18 reexecuções/);
});

test('[PB-009] passagens posteriores não encerram a ocorrência', () => {
  const passing = Array.from({ length: 18 }, (_, i) => finished(i + 1, { gates: ALL_PASS }));
  const report = reportOf(passing);
  const occurrence = report.nondeterminism.find((item) => item.ref === 'PB-009');
  assert.equal(occurrence.status, 'aberto');
  assert.equal(occurrence.resolved, false);
});

test('[11.3] plano de calibração em policy.md usa os candidatos e não autoriza gasto', () => {
  const policy = readFileSync(join(REPO_ROOT, '.claude/harness/policy.md'), 'utf8');
  const plan = policy.slice(policy.indexOf('## Plano de calibração'));
  assert.ok(policy.includes('## Plano de calibração'));
  assert.match(plan, /p95/);
  assert.match(plan, /paradas por tipo|stops by type/i);
  assert.match(plan, /budget_exhausted/);
  assert.match(plan, /revisão versionada/);
  assert.match(plan, /nenhum benchmark pago/i);
});

test('[PO-012] testes do benchmark não invocam o binário real do modelo', () => {
  const dir = join(REPO_ROOT, 'scripts/test/benchmark');
  const offenders = [];
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.mjs'))) {
    readFileSync(join(dir, name), 'utf8').split('\n').forEach((line, index) => {
      const trimmed = line.trim();
      const isComment = /^(\/\/|\/\*|\*|#)/.test(trimmed);
      // Título de teste ("... via claude -p") descreve, não invoca.
      const isTitle = /^test\(/.test(trimmed);
      if (!isComment && !isTitle && !/simulador|fake/i.test(line) && /claude\s+-p\b/.test(line)) offenders.push(`${name}:${index + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test('buildConfig marca os limites candidatos com a chave de política de origem', async () => {
  const { buildConfig, parseOptions } = await import('../../benchmark/run.mjs');
  const config = buildConfig(parseOptions([]), { root: REPO_ROOT });
  assert.deepEqual(config.max_invocations, { value: 60, candidate: true, policy_key: 'max_invocations_per_change' });
  assert.deepEqual(config.timeout_min, { value: 25, candidate: true, policy_key: 'max_seconds_per_call' });
  assert.equal(config.harness_policy_version, '1.0.0');
  assert.deepEqual(config.authorizations.map((item) => item.kind), ['invocation_budget']);
});
