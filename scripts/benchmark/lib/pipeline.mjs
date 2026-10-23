// Pieces shared by the benchmark scenarios: running one headless step under the
// budget, and re-checking every gate in the run directory. The runner never
// trusts what the agent reported; it measures the directory itself.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadChecks, runCommand } from '../../gates/checks.mjs';
import { measureImplementation } from '../../gates/implement-gate.mjs';
import { scenarioCoverage, scenariosIn } from '../../gates/archive-gate.mjs';
import { checkScope } from '../../gates/scope-check.mjs';
import { invokeClaude } from './claude.mjs';
import { countCompoundDenials, parseCoverage } from './report.mjs';

export function loadTask(taskDir) {
  const task = JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8'));
  for (const key of ['id', 'change', 'checks', 'scoped_paths']) {
    if (!task[key]) throw new Error(`${taskDir}/task.json sem o campo ${key}`);
  }
  return { ...task, brief: readFileSync(join(taskDir, 'brief.md'), 'utf8').trim() };
}

export function newRun(number, extra = {}) {
  return {
    run: number, status: 'not_run', steps: [], gates: {}, invocations: 0, cost_usd: 0,
    duration_ms: 0, coverage: { before: null, after: null }, failure: null, ...extra,
  };
}

export async function runStep(run, { name, prompt, cwd, allowedTools, addDirs, budget, claude }) {
  if (!budget.tryConsume()) {
    const step = { name, status: 'budget_exhausted' };
    run.steps.push(step);
    return step;
  }
  const result = await invokeClaude({
    bin: claude.bin, env: claude.env, model: claude.model, timeoutMs: claude.timeoutMs,
    cwd, prompt, allowedTools, addDirs,
  });
  const step = { name, ...result, compound_denials: countCompoundDenials(result.permission_denials) };
  run.steps.push(step);
  run.invocations += 1;
  run.cost_usd += result.cost_usd ?? 0;
  return step;
}

export const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

export function verifySpec({ dir, change }) {
  const proposal = join(dir, 'openspec', 'changes', change, 'proposal.md');
  const validate = spawnSync('openspec', ['validate', change, '--strict', '--no-interactive'], { cwd: dir, encoding: 'utf8' });
  const valid = validate.status === 0;
  const premises = existsSync(proposal) && /^## Premissas/m.test(readFileSync(proposal, 'utf8'));
  return { passed: valid && premises, valid, premises };
}

export async function verifyImplementation({ dir, baselineFiles }) {
  try {
    const m = await measureImplementation({ root: dir, baselineFiles });
    return {
      passed: m.passed,
      old_pct: m.old.pct,
      new_pct: m.new.pct,
      new_tests: m.new.pass + m.new.fail,
      failing: [...m.old.failing, ...m.new.failing],
      removed_tests: m.removed_tests,
      lint_errors: m.lint_errors,
      type_errors: m.type_errors,
    };
  } catch (err) {
    return { passed: false, error: err.message };
  }
}

export function verifyArchive({ dir, change }) {
  const changes = join(dir, 'openspec', 'changes');
  const active = existsSync(join(changes, change));
  const archiveRoot = join(changes, 'archive');
  const archived = existsSync(archiveRoot) ? readdirSync(archiveRoot).find((entry) => entry.endsWith(`-${change}`)) : undefined;
  if (!archived) return { passed: false, archived: false, active };
  const specsDir = join(archiveRoot, archived, 'specs');
  const coverage = scenarioCoverage({ root: dir, scenarios: scenariosIn(specsDir) });
  const capabilities = existsSync(specsDir) ? readdirSync(specsDir) : [];
  const unsynced = capabilities.filter((capability) => !existsSync(join(dir, 'openspec', 'specs', capability, 'spec.md')));
  return {
    passed: !active && coverage.total > 0 && coverage.pct === 100 && unsynced.length === 0,
    archived: true,
    active,
    path: `openspec/changes/archive/${archived}`,
    scenarios_pct: coverage.pct,
    scenarios_missing: coverage.missing,
    unsynced_specs: unsynced,
  };
}

export function verifyScope({ dir, base, scoped }) {
  try {
    const result = checkScope({ root: dir, base, scoped });
    return { passed: result.verdict === 'pass', out_of_scope: result.out_of_scope, changed: result.changed };
  } catch (err) {
    return { passed: false, out_of_scope: [], error: err.message };
  }
}

export async function measureCoverage(dir) {
  let command;
  try {
    command = loadChecks(dir, []).coverage;
  } catch {
    return null;
  }
  if (!command) return null;
  const result = await runCommand(command, { cwd: dir });
  return parseCoverage(result.output);
}

// Runs `worker` over `items` with at most `limit` in flight.
export async function pool(items, limit, worker) {
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, limit) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await worker(item);
    }
  });
  await Promise.all(lanes);
}

// Gates reported but left out of a run's pass/fail (the hidden acceptance
// tests measure the context, not the pipeline).
export const INFORMATIONAL_GATES = new Set(['hidden']);

export function finish(run, started) {
  run.duration_ms = Date.now() - started;
  run.cost_usd = Math.round(run.cost_usd * 10000) / 10000;
  if (run.steps.some((step) => step.status === 'budget_exhausted')) {
    run.status = 'budget_exhausted';
    return run;
  }
  const failed = Object.entries(run.gates).find(([name, gate]) => !gate.passed && !INFORMATIONAL_GATES.has(name));
  run.status = failed ? 'failed' : 'passed';
  run.stopped_after_denial = Boolean(failed) && run.steps.some((step) => (step.permission_denials ?? []).length > 0);
  if (failed && !run.failure) run.failure = `gate ${failed[0]} reprovado`;
  return run;
}
