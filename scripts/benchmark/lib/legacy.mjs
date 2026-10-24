// Legacy-migration scenario: a fixture with its own test suite and no OpenSpec
// or CLAUDE.md gets the toolset installed deterministically, then the agent
// runs spec-create --headless → spec-implement → spec-archive on a refactor.
// Two variants run interleaved, with and without docs/agents/, so a budget cut
// hits both alike.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listTestFiles, runCommand } from '../../gates/checks.mjs';
import { buildStepPrompt, readAllowedTools } from './claude.mjs';
import { runHiddenTests } from './hidden.mjs';
import {
  finish, git, loadTask, measureCoverage, newRun, pool, runStep,
  verifyArchive, verifyImplementation, verifyScope, verifySpec,
} from './pipeline.mjs';

export const VARIANTS = Object.freeze(['with_docs', 'without_docs']);
// Only what the pipeline uses. The full .claude/ (~300 skills, ~90 agents)
// is loaded into every turn of every `claude -p` call and multiplies the cost
// without changing what the legacy scenarios measure.
export const LEAN_TOOLSET = Object.freeze({
  skills: Object.freeze([
    'spec-create', 'spec-implement', 'spec-archive', 'handoff',
    'openspec-propose', 'openspec-apply-change', 'openspec-archive-change', 'openspec-sync-specs', 'openspec-explore',
  ]),
  paths: Object.freeze([
    '.claude/settings.json', '.claude/commands/opsx', '.claude/rules/common', '.claude/rules/openspec.md',
    '.claude/rules/README.md', 'scripts/gates', 'scripts/harness', 'openspec/config.yaml',
  ]),
});
const GIT_USER = ['-c', 'user.email=benchmark@local', '-c', 'user.name=benchmark'];

export function installToolset({ templateDir, target, task, withDocs }) {
  cpSync(join(templateDir, 'scripts', 'benchmark', 'fixtures', task.fixture), target, { recursive: true });
  for (const path of LEAN_TOOLSET.paths) cpSync(join(templateDir, path), join(target, path), { recursive: true });
  for (const skill of LEAN_TOOLSET.skills) {
    cpSync(join(templateDir, '.claude', 'skills', skill), join(target, '.claude', 'skills', skill), { recursive: true });
  }
  for (const dir of ['openspec/specs', 'openspec/changes']) mkdirSync(join(target, dir), { recursive: true });
  const manifest = JSON.parse(readFileSync(join(templateDir, 'template.json'), 'utf8'));
  const { template, upstreams, managed, owned } = manifest;
  writeFileSync(join(target, 'template.json'), `${JSON.stringify({ template, upstreams, managed, owned, project: { name: task.fixture }, checks: task.checks }, null, 2)}\n`);
  if (withDocs) {
    cpSync(join(templateDir, 'scripts', 'benchmark', 'fixtures', task.agents_docs), join(target, 'docs', 'agents'), { recursive: true });
  }
  git(target, ['init', '-q', '-b', 'main']);
  git(target, ['add', '-A']);
  git(target, [...GIT_USER, 'commit', '-q', '-m', 'chore: instala toolset do pipeline no legado']);
}

async function legacyRun(run, { task, templateDir, workRoot, budget, claude }) {
  const started = Date.now();
  const target = join(workRoot, `${run.variant}-${run.run}`);
  run.dir = target;
  installToolset({ templateDir, target, task, withDocs: run.variant === 'with_docs' });
  const suite = await runCommand(task.checks.test, { cwd: target });
  const docsOk = existsSync(join(target, 'docs', 'agents')) === (run.variant === 'with_docs');
  run.gates.bootstrap = { passed: suite.code === 0 && docsOk && !existsSync(join(target, 'CLAUDE.md')), suite_passed: suite.code === 0 };
  if (!run.gates.bootstrap.passed) return finish(run, started);

  run.coverage.before = await measureCoverage(target);
  const base = git(target, ['rev-parse', 'HEAD']);
  const baselineFiles = listTestFiles(target);
  const allowedTools = readAllowedTools(target);
  const step = (name, argument) => runStep(run, {
    name, prompt: buildStepPrompt(name, argument), cwd: target, allowedTools, budget, claude,
  });

  if ((await step('spec-create', `--headless ${task.change}: ${task.brief}`)).status === 'budget_exhausted') return finish(run, started);
  run.gates.spec = verifySpec({ dir: target, change: task.change });
  if (run.gates.spec.passed) {
    if ((await step('spec-implement', `--headless ${task.change}`)).status === 'budget_exhausted') return finish(run, started);
    run.gates.implement = await verifyImplementation({ dir: target, baselineFiles });
    if (run.gates.implement.passed) {
      if ((await step('spec-archive', `--headless ${task.change}`)).status === 'budget_exhausted') return finish(run, started);
      run.gates.archive = await verifyArchive({ dir: target, change: task.change });
    }
  }
  run.gates.scope = verifyScope({ dir: target, base, scoped: task.scoped_paths });
  run.coverage.after = await measureCoverage(target);
  if (task.hidden_tests) {
    // After the scope check, so the copied hidden tests never count as agent edits.
    run.gates.hidden = await runHiddenTests({
      dir: target,
      hiddenDir: join(templateDir, 'scripts', 'benchmark', 'fixtures', task.hidden_tests),
      classification: task.hidden_rules ?? {},
    });
  }
  return finish(run, started);
}

export async function runLegacy({ taskDir, n, budget, workRoot, templateSource, templateBranch, claude, concurrency = 1 }) {
  const task = loadTask(taskDir);
  const templateDir = join(workRoot, 'template');
  mkdirSync(workRoot, { recursive: true });
  git(workRoot, ['clone', '-q', '--depth', '1', '--branch', templateBranch, `file://${templateSource}`, templateDir]);
  const groups = Object.fromEntries(VARIANTS.map((variant) => [variant, []]));
  const queue = [];
  for (let i = 1; i <= n; i += 1) {
    for (const variant of VARIANTS) {
      const run = newRun(i, { variant });
      groups[variant].push(run);
      queue.push(run);
    }
  }
  await pool(queue, concurrency, async (run) => {
    if (budget.exhausted) return;
    try {
      await legacyRun(run, { task, templateDir, workRoot, budget, claude });
    } catch (err) {
      run.status = 'failed';
      run.failure = `erro do runner: ${err.message}`;
    }
  });
  return { task, groups, budget };
}
