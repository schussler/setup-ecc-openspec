import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createBudget } from '../../benchmark/lib/budget.mjs';
import { runGreenfield } from '../../benchmark/lib/greenfield.mjs';
import { makeTempDir, REPO_ROOT, snapshotRepo } from '../helpers.mjs';

const TASK_DIR = join(REPO_ROOT, 'scripts/benchmark/tasks/greenfield-duration');
const FAKE = [process.execPath, join(REPO_ROOT, 'scripts/test/benchmark/fake-claude.mjs')];

function setup({ n = 1, max = 60, env = {} } = {}) {
  const work = makeTempDir('bench-');
  const log = join(work, 'calls.jsonl');
  const run = () => runGreenfield({
    taskDir: TASK_DIR,
    n,
    budget: createBudget(max),
    workRoot: work,
    templateSource: snapshotRepo().source,
    templateBranch: snapshotRepo().branch,
    claude: {
      bin: FAKE,
      env: {
        FAKE_CLAUDE_LOG: log,
        FAKE_CLAUDE_HOOK: join(REPO_ROOT, 'scripts/test/benchmark/fake-agent.mjs'),
        FAKE_AGENT_TASK: join(TASK_DIR, 'task.json'),
        ...env,
      },
    },
  });
  const skills = () => readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line).args[1].split(' ')[0]);
  return { run, skills };
}

test('createBudget recusa alem do limite', () => {
  const budget = createBudget(2);
  assert.deepEqual([budget.tryConsume(), budget.tryConsume(), budget.tryConsume()], [true, true, false]);
  assert.equal(budget.used, 2);
  assert.equal(budget.exhausted, true);
});

test('greenfield executa create implement archive sem pr', async () => {
  const { run, skills } = setup();
  const { runs } = await run();
  assert.deepEqual(skills(), ['/new-project', '/spec-create', '/spec-implement', '/spec-archive']);
  const [first] = runs;
  assert.equal(first.status, 'passed', JSON.stringify(first.gates));
  assert.equal(first.gates.bootstrap.passed, true);
  assert.equal(first.gates.spec.passed, true);
  assert.equal(first.gates.implement.passed, true);
  assert.equal(first.gates.archive.passed, true);
  assert.deepEqual(first.gates.scope.out_of_scope, []);
  assert.equal(first.invocations, 4);
  assert.equal(typeof first.coverage.after, 'number');
});

test('verificacao independente dos gates', async () => {
  const { run, skills } = setup({ env: { FAKE_AGENT_BREAK: 'spec-implement' } });
  const { runs } = await run();
  assert.equal(runs[0].steps.find((step) => step.name === 'spec-implement').status, 'ok');
  assert.equal(runs[0].gates.implement.passed, false);
  assert.equal(runs[0].status, 'failed');
  assert.ok(!skills().includes('/spec-archive'), 'archive não deve rodar após gate reprovado');
});

test('orcamento esgotado gera relatorio parcial', async () => {
  const { run } = setup({ n: 3, max: 6 });
  const { runs, budget } = await run();
  assert.equal(runs[0].status, 'passed');
  assert.equal(runs[1].status, 'budget_exhausted');
  assert.equal(runs[2].status, 'not_run');
  assert.equal(budget.used, 6);
  assert.equal(runs[1].gates.implement?.passed, undefined);
});

test('bootstrap reprova projeto que herdou change ou spec do template', async () => {
  const { verifyBootstrap } = await import('../../benchmark/lib/greenfield.mjs');
  const { writeTree } = await import('../helpers.mjs');
  const task = JSON.parse(readFileSync(join(TASK_DIR, 'task.json'), 'utf8'));
  const target = writeTree(makeTempDir(), {
    'template.json': { checks: task.checks },
    'docs/agents/architecture.md': '', 'docs/agents/domain.md': '', 'docs/agents/issue-tracker.md': '',
    '.claude/settings.json': '{}', 'scripts/gates/implement-gate.mjs': '', 'scripts/harness/process-group.mjs': '',
    'openspec/changes/add-matt-skills-and-benchmark/proposal.md': 'x',
    'openspec/specs/agent-context/spec.md': 'x',
  });
  execFileSync('git', ['init', '-q'], { cwd: target });
  const result = verifyBootstrap({ target, task });
  assert.equal(result.passed, false);
  assert.ok(result.problems.some((p) => p.includes('add-matt-skills-and-benchmark')), result.problems.join('; '));
  assert.ok(result.problems.some((p) => p.includes('agent-context')), result.problems.join('; '));
});

test('regras extras do new-project ficam no destino e nao liberam push nem rm', async () => {
  const { newProjectTools } = await import('../../benchmark/lib/greenfield.mjs');
  const tools = newProjectTools('/w/template', '/w/project');
  assert.ok(tools.includes('Bash(git init -q -b main /w/project)'));
  assert.ok(tools.includes('Bash(git -C /w/project:*)'));
  assert.ok(tools.includes('Bash(git -C /w/template ls-tree:*)'));
  assert.ok(!tools.some((rule) => rule.startsWith('Bash(git -C /w/template:')), 'git -C no template permitiria push');
  assert.ok(!tools.some((rule) => rule.startsWith('Bash(rm')), 'rm não é necessário: o new-project remove com git rm');
});

test('new-project cria o repositorio sem rm do historico', () => {
  const text = readFileSync(join(REPO_ROOT, '.claude/skills/new-project/SKILL.md'), 'utf8');
  // rename-to-specloop-npx (SL-017): o projeto nasce pelo CLI, sem git fetch do template.
  assert.match(text, /specloop(@\S+)? init/);
  assert.match(text, /node <path>\/bin\/specloop\.mjs init/);
  assert.doesNotMatch(text, /rm -rf <target>\/\.git/);
});

test('bootstrap ignora diretorios vazios deixados pelo git mv', async () => {
  const { verifyBootstrap } = await import('../../benchmark/lib/greenfield.mjs');
  const { writeTree } = await import('../helpers.mjs');
  const { mkdirSync } = await import('node:fs');
  const task = JSON.parse(readFileSync(join(TASK_DIR, 'task.json'), 'utf8'));
  const target = writeTree(makeTempDir(), {
    'template.json': { checks: task.checks },
    'docs/agents/architecture.md': '', 'docs/agents/domain.md': '', 'docs/agents/issue-tracker.md': '',
    '.claude/settings.json': '{}', 'scripts/gates/implement-gate.mjs': '', 'scripts/harness/process-group.mjs': '',
    'openspec/changes/archive/.gitkeep': '',
  });
  mkdirSync(join(target, 'templates/docs'), { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: target });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: target });
  const result = verifyBootstrap({ target, task });
  assert.deepEqual(result.problems, []);
});

test('limite de uso interrompe a rodada sem contar falha de gate', async () => {
  const { run } = setup({ n: 2, env: { FAKE_CLAUDE_MODE: 'error', FAKE_CLAUDE_RESULT: "You've hit your usage limit" } });
  const { runs, budget } = await run();
  assert.equal(runs[0].status, 'budget_exhausted');
  assert.equal(runs[0].gates.bootstrap, undefined);
  assert.equal(runs[1].status, 'not_run');
  assert.equal(budget.exhausted, true);
});
