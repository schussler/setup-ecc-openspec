// Benchmark report: aggregates runs into report.json and renders report.md.
export const GATES = Object.freeze(['bootstrap', 'spec', 'implement', 'archive', 'scope', 'hidden']);
const EXECUTED = new Set(['passed', 'failed']);

// Reports are committed: drop machine-specific paths, including ones cut
// short inside truncated agent output.
const SCRATCH_PATH = /\/private\/tmp\/claude-\d+[^\s"'`)]*/g;

export function scrubPaths(text, { workDir, home }) {
  return text
    .replaceAll(workDir, '<work-dir>')
    .replace(SCRATCH_PATH, '<tmp>')
    .replaceAll(home, '~');
}

// A denied command that chains or redirects through the shell: permissions match
// commands literally, so these never match an allow rule.
const COMPOUND = /;|&&|\|\||\$\?|\$\(|`|(^|\s)cd\s/;

export function countCompoundDenials(denials = []) {
  return denials.filter((denial) => COMPOUND.test(denial.tool_input?.command ?? '')).length;
}

export function parseCoverage(output) {
  const match = output.match(/all files\s*\|\s*([\d.]+)/);
  return match ? Number(match[1]) : null;
}

const round = (value, digits = 2) => (value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits);
const sum = (values) => values.reduce((total, value) => total + (value ?? 0), 0);

function stats(values) {
  const known = values.filter((value) => typeof value === 'number');
  if (known.length === 0) return null;
  return { min: Math.min(...known), max: Math.max(...known), mean: round(sum(known) / known.length) };
}

function rate(count, total) {
  return total === 0 ? null : round((count / total) * 100);
}

function summarize(runs) {
  const executed = runs.filter((run) => EXECUTED.has(run.status));
  const gates = Object.fromEntries(GATES.map((gate) => {
    const evaluated = executed.filter((run) => run.gates?.[gate] !== undefined);
    const passed = evaluated.filter((run) => run.gates[gate].passed).length;
    return [gate, { evaluated: evaluated.length, passed, pass_rate: rate(passed, evaluated.length) }];
  }));
  const stepNames = [...new Set(runs.flatMap((run) => run.steps.map((step) => step.name)))];
  return {
    runs: runs.length,
    executed: executed.length,
    passed: executed.filter((run) => run.status === 'passed').length,
    budget_exhausted: runs.filter((run) => run.status === 'budget_exhausted').length,
    not_run: runs.filter((run) => run.status === 'not_run').length,
    success_rate: rate(executed.filter((run) => run.status === 'passed').length, executed.length),
    gates,
    out_of_scope_files: sum(executed.map((run) => run.gates?.scope?.out_of_scope?.length ?? 0)),
    coverage_before: stats(executed.map((run) => run.coverage?.before)),
    coverage_after: stats(executed.map((run) => run.coverage?.after)),
    step_duration_ms: Object.fromEntries(stepNames.map((name) => [
      name,
      stats(runs.flatMap((run) => run.steps.filter((step) => step.name === name).map((step) => step.duration_ms))),
    ])),
    cost_usd: round(sum(runs.map((run) => run.cost_usd)), 4),
    invocations: sum(runs.map((run) => run.invocations)),
    compound_denials_mean: stats(executed.map((run) => sum(run.steps.map((step) => step.compound_denials ?? 0))))?.mean ?? null,
    stopped_after_denial: executed.filter((run) => run.stopped_after_denial).length,
  };
}

const diff = (a, b) => (a === null || b === null ? null : round(a - b));

function compareVariants(withDocs, withoutDocs, conclusiveMinPp) {
  const hiddenWith = withDocs.gates.hidden.pass_rate;
  const hiddenWithout = withoutDocs.gates.hidden.pass_rate;
  const hiddenDifference = diff(hiddenWith, hiddenWithout);
  return {
    with_docs_success_rate: withDocs.success_rate,
    without_docs_success_rate: withoutDocs.success_rate,
    difference_pp: diff(withDocs.success_rate, withoutDocs.success_rate),
    with_docs_hidden_rate: hiddenWith,
    without_docs_hidden_rate: hiddenWithout,
    hidden_difference_pp: hiddenDifference,
    conclusive_min_pp: conclusiveMinPp ?? null,
    conclusive: conclusiveMinPp !== undefined && hiddenDifference !== null ? Math.abs(hiddenDifference) >= conclusiveMinPp : null,
  };
}

function evaluateAcceptance(acceptance, runs, groups) {
  if (!acceptance) return null;
  const executed = runs.filter((run) => EXECUTED.has(run.status));
  const criteria = [];
  for (const [gate, min] of Object.entries(acceptance.gate_pass_count ?? {})) {
    const value = executed.filter((run) => run.gates?.[gate]?.passed).length;
    criteria.push({ name: `gate_pass_count.${gate}`, value, threshold: `>= ${min}`, passed: value >= min });
  }
  const max = (name, value, limit) => criteria.push({ name, value, threshold: `<= ${limit}`, passed: value !== null && value <= limit });
  if ('max_stopped_after_denial' in acceptance) {
    max('max_stopped_after_denial', executed.filter((run) => run.stopped_after_denial).length, acceptance.max_stopped_after_denial);
  }
  if ('max_compound_denials_mean' in acceptance) {
    const mean = stats(executed.map((run) => sum(run.steps.map((step) => step.compound_denials ?? 0))))?.mean ?? null;
    max('max_compound_denials_mean', mean, acceptance.max_compound_denials_mean);
  }
  if ('min_best_group_success_rate' in acceptance) {
    const rates = Object.values(groups).map((runsOfGroup) => summarize(runsOfGroup).success_rate).filter((rate) => rate !== null);
    const best = rates.length ? Math.max(...rates) : null;
    criteria.push({ name: 'min_best_group_success_rate', value: best, threshold: `>= ${acceptance.min_best_group_success_rate}`, passed: best !== null && best >= acceptance.min_best_group_success_rate });
  }
  if ('max_out_of_scope' in acceptance) {
    max('max_out_of_scope', sum(executed.map((run) => run.gates?.scope?.out_of_scope?.length ?? 0)), acceptance.max_out_of_scope);
  }
  return { criteria, accepted: criteria.every((criterion) => criterion.passed) };
}

export function buildReport({ scenario, task, n, budget, groups, startedAt, finishedAt, interrupted = false, notes = [] }) {
  const summarized = Object.fromEntries(Object.entries(groups).map(([name, runs]) => [name, { summary: summarize(runs), runs }]));
  const all = Object.values(groups).flat();
  let status = 'complete';
  if (budget.exhausted && all.some((run) => run.status === 'budget_exhausted' || run.status === 'not_run')) status = 'budget_exhausted';
  else if (interrupted || all.some((run) => run.status === 'not_run')) status = 'partial';
  const comparison = summarized.with_docs && summarized.without_docs
    ? compareVariants(summarized.with_docs.summary, summarized.without_docs.summary, task.conclusive_min_pp)
    : null;
  return {
    scenario,
    task: task.id,
    comparison,
    acceptance: evaluateAcceptance(task.acceptance, all, groups),
    scoped_paths: task.scoped_paths,
    n,
    status,
    started_at: startedAt,
    finished_at: finishedAt,
    budget: { max: budget.max, used: budget.used, exhausted: budget.exhausted },
    invocations: sum(all.map((run) => run.invocations)),
    cost_usd: round(sum(all.map((run) => run.cost_usd)), 4),
    notes,
    groups: summarized,
  };
}

const fmt = (value, suffix = '') => (value === null || value === undefined ? 'n/a' : `${value}${suffix}`);
const fmtStats = (value, suffix = '') => (value ? `${value.mean}${suffix} (min ${value.min}, max ${value.max})` : 'n/a');
const seconds = (ms) => (ms === null || ms === undefined ? 'n/a' : `${round(ms / 1000, 1)} s`);

function renderGroup(name, { summary, runs }) {
  const lines = [
    `## Grupo \`${name}\``,
    '',
    `- **Taxa de sucesso:** ${fmt(summary.success_rate, '%')} (${summary.passed}/${summary.executed} execuções completas; ${summary.budget_exhausted} interrompidas por orçamento; ${summary.not_run} não iniciadas)`,
    `- **Arquivos fora de \`scoped_paths\`:** ${summary.out_of_scope_files}`,
    `- **Cobertura:** antes ${fmtStats(summary.coverage_before, '%')}; depois ${fmtStats(summary.coverage_after, '%')}`,
    `- **Custo:** US$ ${fmt(summary.cost_usd)} em ${summary.invocations} invocações`,
    `- **Negações de comando composto:** média ${fmt(summary.compound_denials_mean)} por execução; ${summary.stopped_after_denial} execuções pararam após negação`,
    '',
    '| Gate | Avaliado | Aprovado | Taxa |',
    '|------|----------|----------|------|',
    ...Object.entries(summary.gates).map(([gate, g]) => `| ${gate} | ${g.evaluated} | ${g.passed} | ${fmt(g.pass_rate, '%')} |`),
    '',
    '**Tempo por etapa (média, min, max):**',
    '',
    ...Object.entries(summary.step_duration_ms).map(([step, s]) => `- ${step}: ${s ? `${seconds(s.mean)} (${seconds(s.min)}–${seconds(s.max)})` : 'n/a'}`),
    '',
    '| Execução | Status | Gates (bootstrap/spec/implement/archive/scope/hidden) | Fora do escopo | Cobertura depois | Invocações | Custo (US$) | Tempo |',
    '|----------|--------|-----------------------------------------------|----------------|------------------|------------|-------------|-------|',
    ...runs.map((run) => {
      const gates = GATES
        .map((gate) => (run.gates?.[gate] === undefined ? '–' : run.gates[gate].passed ? '✓' : '✗'))
        .join(' ');
      return `| ${run.run} | ${run.status} | ${gates} | ${run.gates?.scope?.out_of_scope?.length ?? 'n/a'} | ${fmt(run.coverage?.after, '%')} | ${run.invocations} | ${fmt(round(run.cost_usd ?? 0, 4))} | ${seconds(run.duration_ms)} |`;
    }),
    '',
  ];
  const failures = runs.filter((run) => run.status === 'failed');
  if (failures.length > 0) {
    lines.push('**Falhas:**', '');
    for (const run of failures) lines.push(`- Execução ${run.run}: ${run.failure ?? 'ver report.json'}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function renderMarkdown(report) {
  return [
    `# Benchmark — ${report.scenario} (\`${report.task}\`)`,
    '',
    `- **Status:** ${report.status}`,
    `- **N:** ${report.n} por grupo`,
    `- **Invocações de \`claude -p\`:** ${report.invocations} (orçamento ${report.budget.used}/${report.budget.max})`,
    `- **Custo total:** US$ ${fmt(report.cost_usd)}`,
    `- **\`scoped_paths\`:** ${report.scoped_paths.map((path) => `\`${path}\``).join(', ') || 'n/a'}`,
    `- **Início / fim:** ${report.started_at} / ${report.finished_at}`,
    ...report.notes.map((note) => `- ${note}`),
    ...(report.comparison
      ? [
        `- **Com vs. sem \`docs/agents/\`:** sucesso ${fmt(report.comparison.with_docs_success_rate, '%')} vs. ${fmt(report.comparison.without_docs_success_rate, '%')} (com − sem: ${fmt(report.comparison.difference_pp, ' p.p.')})`,
        `- **Gate hidden (regras só nos docs):** ${fmt(report.comparison.with_docs_hidden_rate, '%')} vs. ${fmt(report.comparison.without_docs_hidden_rate, '%')} (com − sem: ${fmt(report.comparison.hidden_difference_pp, ' p.p.')}; conclusivo: ${report.comparison.conclusive === null ? 'n/a' : report.comparison.conclusive ? 'sim' : 'não, sem evidência'})`,
      ]
      : []),
    '',
    ...(report.acceptance
      ? [
        `## Critérios de aceite: ${report.acceptance.accepted ? 'aprovado' : 'reprovado'}`,
        '',
        '| Critério | Valor | Limiar | Resultado |',
        '|----------|-------|--------|-----------|',
        ...report.acceptance.criteria.map((c) => `| ${c.name} | ${fmt(c.value)} | ${c.threshold} | ${c.passed ? '✓' : '✗'} |`),
        '',
      ]
      : []),
    ...Object.entries(report.groups).map(([name, group]) => renderGroup(name, group)),
  ].join('\n');
}
