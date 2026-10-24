// Greenfield scenario: empty directory → /new-project (non-interactive) →
// spec-create --headless → spec-implement → spec-archive. No `pr`.
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { listTestFiles, walkFiles } from '../../gates/checks.mjs';
import { buildStepPrompt, readAllowedTools } from './claude.mjs';
import {
  finish, git, loadTask, measureCoverage, newRun, pool, runStep,
  verifyArchive, verifyImplementation, verifyScope, verifySpec,
} from './pipeline.mjs';

const CONTEXT_FILES = ['architecture.md', 'domain.md', 'issue-tracker.md'];

function newProjectArgs(task, target, templateDir, templateBranch) {
  const quote = (value) => JSON.stringify(value);
  const { checks, project } = task;
  return [
    '--non-interactive',
    `--target ${target}`,
    `--name ${project.name}`,
    `--description ${quote(project.description)}`,
    `--languages ${quote(project.languages ?? '')}`,
    `--checks-test ${quote(checks.test)}`,
    `--checks-lint ${quote(checks.lint)}`,
    `--checks-typecheck ${quote(checks.typecheck)}`,
    checks.test_file ? `--checks-test-file ${quote(checks.test_file)}` : '',
    checks.coverage ? `--checks-coverage ${quote(checks.coverage)}` : '',
    `--template-source ${templateDir}`,
    `--template-branch ${templateBranch}`,
  ].filter(Boolean).join(' ');
}

// Extra rules for the new-project step only, scoped to this run. The skill
// builds the project with git (init, fetch, checkout, rm), because Claude Code
// protects `.git` from `rm` (verified in Fatia 6). The template clone's remote
// is the developer's repo, so it gets read-only git commands, never a
// `git -C <template>:*` rule that would allow a push.
export function newProjectTools(templateDir, target) {
  return [
    `Bash(git init -q -b main ${target})`,
    `Bash(git -C ${target}:*)`,
    `Bash(cd ${target}:*)`,
    `Bash(git -C ${templateDir} ls-tree:*)`,
    `Bash(git -C ${templateDir} branch:*)`,
    `Bash(git -C ${templateDir} rev-parse:*)`,
  ];
}

export function verifyBootstrap({ target, task }) {
  const problems = [];
  const has = (rel) => existsSync(join(target, rel));
  // `git rm`/`git mv` leave empty directories behind; only files count.
  const hasFiles = (rel) => walkFiles(target, join(target, rel)).some((file) => !file.endsWith('.gitkeep'));
  if (!has('.git')) problems.push('sem repositório git');
  else {
    try { git(target, ['rev-parse', 'HEAD']); } catch { problems.push('sem commit inicial'); }
  }
  for (const file of CONTEXT_FILES) if (!has(`docs/agents/${file}`)) problems.push(`docs/agents/${file} ausente`);
  for (const path of ['templates', 'scripts/benchmark', 'scripts/test']) if (hasFiles(path)) problems.push(`${path} não foi removido`);
  if (!has('.claude/settings.json')) problems.push('.claude/settings.json ausente');
  const entries = (rel) => (has(rel) ? readdirSync(join(target, rel)).filter((name) => hasFiles(`${rel}/${name}`)) : []);
  for (const name of entries('openspec/changes')) problems.push(`openspec/changes/${name} herdado do template`);
  for (const name of entries('openspec/specs')) problems.push(`openspec/specs/${name} herdado do template`);
  if (!has('scripts/gates/implement-gate.mjs')) problems.push('scripts/gates ausente');
  if (!has('scripts/harness/process-group.mjs')) problems.push('scripts/harness ausente (os gates importam dele)');
  if (has('template.json')) {
    const checks = JSON.parse(readFileSync(join(target, 'template.json'), 'utf8')).checks ?? {};
    for (const key of ['test', 'lint', 'typecheck']) if (checks[key] !== task.checks[key]) problems.push(`checks.${key} difere da tarefa`);
  } else problems.push('template.json ausente');
  return { passed: problems.length === 0, problems };
}

async function greenfieldRun(run, { task, workRoot, templateSource, templateBranch, budget, claude }) {
  const started = Date.now();
  const runDir = join(workRoot, `greenfield-${run.run}`);
  const templateDir = join(runDir, 'template');
  const target = join(runDir, 'project');
  mkdirSync(runDir, { recursive: true });
  git(runDir, ['clone', '-q', '--depth', '1', '--branch', templateBranch, `file://${templateSource}`, templateDir]);
  run.dir = target;

  const created = await runStep(run, {
    name: 'new-project',
    prompt: buildStepPrompt('new-project', newProjectArgs(task, target, templateDir, templateBranch)),
    cwd: templateDir,
    allowedTools: [...readAllowedTools(templateDir), ...newProjectTools(templateDir, target)],
    addDirs: [runDir],
    budget,
    claude,
  });
  if (created.status === 'budget_exhausted') return finish(run, started);
  run.gates.bootstrap = verifyBootstrap({ target, task });
  if (!run.gates.bootstrap.passed) return finish(run, started);

  const base = git(target, ['rev-parse', 'HEAD']);
  const allowedTools = readAllowedTools(target);
  const step = (name, argument) => runStep(run, {
    name, prompt: buildStepPrompt(name, argument), cwd: target, allowedTools, budget, claude,
  });

  if ((await step('spec-create', `--headless ${task.change}: ${task.brief}`)).status === 'budget_exhausted') return finish(run, started);
  run.gates.spec = verifySpec({ dir: target, change: task.change });
  if (run.gates.spec.passed) {
    const baselineFiles = listTestFiles(target);
    if ((await step('spec-implement', `--headless ${task.change}`)).status === 'budget_exhausted') return finish(run, started);
    run.gates.implement = await verifyImplementation({ dir: target, baselineFiles });
    if (run.gates.implement.passed) {
      if ((await step('spec-archive', `--headless ${task.change}`)).status === 'budget_exhausted') return finish(run, started);
      run.gates.archive = await verifyArchive({ dir: target, change: task.change });
    }
  }
  run.gates.scope = verifyScope({ dir: target, base, scoped: task.scoped_paths });
  run.coverage.after = await measureCoverage(target);
  return finish(run, started);
}

export async function runGreenfield({ taskDir, n, budget, workRoot, templateSource, templateBranch, claude, concurrency = 1 }) {
  const task = loadTask(taskDir);
  const runs = Array.from({ length: n }, (_, i) => newRun(i + 1));
  await pool(runs, concurrency, async (run) => {
    if (budget.exhausted) return;
    try {
      await greenfieldRun(run, { task, workRoot, templateSource, templateBranch, budget, claude });
    } catch (err) {
      run.status = 'failed';
      run.failure = `erro do runner: ${err.message}`;
    }
  });
  return { task, runs, budget };
}
