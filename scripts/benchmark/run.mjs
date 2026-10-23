#!/usr/bin/env node
// Benchmark runner for the spec pipeline. Runs each scenario N times through
// `claude -p`, re-checks every gate in the run directory, and writes
// report.json and report.md per scenario.
// Usage:
//   node scripts/benchmark/run.mjs [--scenario greenfield|legacy|all] [--n 5]
//     [--max-invocations 60] [--timeout-min 25] [--concurrency 2] [--model <m>]
//     [--work-dir <dir>] [--out <dir>] [--template-source <repo>] [--template-branch <branch>]
//     [--claude-bin "<cmd>"]
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../gates/gate-store.mjs';
import { createBudget } from './lib/budget.mjs';
import { DEFAULT_TIMEOUT_MS } from './lib/claude.mjs';
import { runGreenfield } from './lib/greenfield.mjs';
import { runLegacy } from './lib/legacy.mjs';
import { buildReport, renderMarkdown, scrubPaths } from './lib/report.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCENARIOS = {
  greenfield: { task: 'greenfield-duration', run: runGreenfield },
  legacy: { task: 'legacy-pricing', run: runLegacy },
};

export function parseOptions(argv) {
  const value = (flag, fallback) => {
    const index = argv.indexOf(flag);
    return index === -1 ? fallback : argv[index + 1];
  };
  const scenario = value('--scenario', 'all');
  if (scenario !== 'all' && !SCENARIOS[scenario]) throw new Error(`cenário desconhecido: ${scenario}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    scenario,
    n: Number(value('--n', 5)),
    maxInvocations: Number(value('--max-invocations', 60)),
    timeoutMin: Number(value('--timeout-min', DEFAULT_TIMEOUT_MS / 60000)),
    concurrency: Number(value('--concurrency', 2)),
    model: value('--model', undefined),
    workDir: value('--work-dir', join(tmpdir(), `claude-bench-${stamp}`)),
    out: value('--out', join(ROOT, 'scripts', 'benchmark', 'reports', stamp.slice(0, 10))),
    templateSource: value('--template-source', ROOT),
    templateBranch: value('--template-branch', execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()),
    claudeBin: value('--claude-bin', 'claude').split(' '),
  };
}

// Reports are committed, so machine-specific paths (the scratch work dir and
// the home directory, which claude's stderr mentions) are replaced by
// placeholders; template-check fails on either.
function writeReport(dir, report, workDir) {
  const scrub = (text) => scrubPaths(text, { workDir, home: homedir() });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'report.json'), scrub(`${JSON.stringify(report, null, 2)}\n`));
  writeFileSync(join(dir, 'report.md'), scrub(`${renderMarkdown(report)}\n`));
}

export async function main(argv) {
  const options = parseOptions(argv);
  const budget = createBudget(options.maxInvocations);
  const claude = { bin: options.claudeBin, model: options.model, timeoutMs: options.timeoutMin * 60000, env: {} };
  const names = options.scenario === 'all' ? Object.keys(SCENARIOS) : [options.scenario];
  const reports = {};
  for (const name of names) {
    const startedAt = new Date().toISOString();
    const workRoot = join(options.workDir, name);
    mkdirSync(workRoot, { recursive: true });
    const result = await SCENARIOS[name].run({
      taskDir: join(ROOT, 'scripts', 'benchmark', 'tasks', SCENARIOS[name].task),
      n: options.n, budget, workRoot, claude, concurrency: options.concurrency,
      templateSource: options.templateSource, templateBranch: options.templateBranch,
    });
    const groups = result.groups ?? { default: result.runs };
    reports[name] = buildReport({
      scenario: name, task: result.task, n: options.n, budget, groups, startedAt,
      finishedAt: new Date().toISOString(),
      notes: [`work dir: ${workRoot}`, `modelo: ${options.model ?? 'padrão do usuário'}`, `timeout por invocação: ${options.timeoutMin} min`],
    });
    writeReport(join(options.out, name), reports[name], options.workDir);
    console.log(`${name}: ${reports[name].status}, sucesso ${reports[name].groups.default?.summary.success_rate ?? 'ver grupos'}%, ${reports[name].invocations} invocações, US$ ${reports[name].cost_usd}`);
  }
  return reports;
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
