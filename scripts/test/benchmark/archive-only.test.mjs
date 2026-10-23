import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync as spawn } from 'node:child_process';
import { join } from 'node:path';
import { createBudget } from '../../benchmark/lib/budget.mjs';
import { runArchiveOnly } from '../../benchmark/lib/archive-only.mjs';
import { makeTempDir, REPO_ROOT, snapshotRepo } from '../helpers.mjs';

const TASK_DIR = join(REPO_ROOT, 'scripts/benchmark/tasks/legacy-pricing-archive');
const FAKE = [process.execPath, join(REPO_ROOT, 'scripts/test/benchmark/fake-claude.mjs')];

function run({ n = 2, env = {} } = {}) {
  const work = makeTempDir('bench-archive-');
  const log = join(work, 'calls.jsonl');
  const result = runArchiveOnly({
    taskDir: TASK_DIR, n, budget: createBudget(60), workRoot: work,
    templateSource: snapshotRepo().source, templateBranch: snapshotRepo().branch,
    claude: { bin: FAKE, env: { FAKE_CLAUDE_LOG: log, FAKE_CLAUDE_HOOK: join(REPO_ROOT, 'scripts/test/benchmark/fake-agent.mjs'), ...env } },
  });
  return { result, log };
}

test('fixture pre-archive tem a implementacao aprovada e a suite passa', () => {
  const fixture = join(REPO_ROOT, 'scripts/benchmark/fixtures/legacy-pricing.pre-archive');
  const gates = JSON.parse(readFileSync(join(fixture, 'openspec/changes/refactor-discount-rules/gates.json'), 'utf8'));
  assert.equal(gates.implement.attempts.at(-1).verdict, 'pass');
  const suite = spawn(process.execPath, ['--test', 'test/'], { cwd: fixture, encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: '' } });
  assert.equal(suite.status, 0, suite.stdout);
});

test('archive-only roda so o spec-archive', async () => {
  const { result, log } = run();
  const { runs } = await result;
  const calls = readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(calls.map((call) => call.args[1].split(' ')[0]), ['/spec-archive', '/spec-archive']);
  for (const one of runs) {
    assert.equal(one.status, 'passed', JSON.stringify(one.gates));
    assert.equal(one.invocations, 1);
    const installed = readFileSync(join(one.dir, '.claude/skills/spec-archive/SKILL.md'), 'utf8');
    assert.equal(installed, readFileSync(join(REPO_ROOT, '.claude/skills/spec-archive/SKILL.md'), 'utf8'));
  }
});

test('execucao que para apos negacao e marcada', async () => {
  const { result } = run({ n: 1, env: { FAKE_AGENT_BREAK: 'spec-archive', FAKE_CLAUDE_DENIALS: JSON.stringify(['node x; echo $?']) } });
  const { runs } = await result;
  assert.equal(runs[0].status, 'failed');
  assert.equal(runs[0].stopped_after_denial, true);
  assert.equal(runs[0].steps[0].compound_denials, 1);
});
