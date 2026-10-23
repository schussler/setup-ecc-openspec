// Archive-only scenario: starts from a real snapshot where the implementation
// gate already passed, installs the current toolset, and runs only
// spec-archive. One invocation per run, to measure the archive step itself.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildStepPrompt, readAllowedTools } from './claude.mjs';
import { installToolset } from './legacy.mjs';
import { finish, git, loadTask, newRun, pool, runStep, verifyArchive, verifyImplementation, verifyScope } from './pipeline.mjs';

async function archiveRun(run, { task, templateDir, workRoot, budget, claude }) {
  const started = Date.now();
  const target = join(workRoot, `archive-${run.run}`);
  run.dir = target;
  installToolset({ templateDir, target, task, withDocs: false });
  run.gates.implement = await verifyImplementation({ dir: target, baselineFiles: task.baseline_tests });
  if (!run.gates.implement.passed) return finish(run, started);
  const base = git(target, ['rev-parse', 'HEAD']);
  const step = await runStep(run, {
    name: 'spec-archive',
    prompt: buildStepPrompt('spec-archive', `--headless ${task.change}`),
    cwd: target, allowedTools: readAllowedTools(target), budget, claude,
  });
  if (step.status === 'budget_exhausted') return finish(run, started);
  run.gates.archive = verifyArchive({ dir: target, change: task.change });
  run.gates.scope = verifyScope({ dir: target, base, scoped: task.scoped_paths });
  return finish(run, started);
}

export async function runArchiveOnly({ taskDir, n, budget, workRoot, templateSource, templateBranch, claude, concurrency = 1 }) {
  const task = loadTask(taskDir);
  const templateDir = join(workRoot, 'template');
  mkdirSync(workRoot, { recursive: true });
  git(workRoot, ['clone', '-q', '--depth', '1', '--branch', templateBranch, `file://${templateSource}`, templateDir]);
  const runs = Array.from({ length: n }, (_, i) => newRun(i + 1));
  await pool(runs, concurrency, async (run) => {
    if (budget.exhausted) return;
    try {
      await archiveRun(run, { task, templateDir, workRoot, budget, claude });
    } catch (err) {
      run.status = 'failed';
      run.failure = `erro do runner: ${err.message}`;
    }
  });
  return { task, runs, budget };
}
