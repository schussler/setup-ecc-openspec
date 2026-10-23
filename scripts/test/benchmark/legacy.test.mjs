import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createBudget } from '../../benchmark/lib/budget.mjs';
import { runLegacy } from '../../benchmark/lib/legacy.mjs';
import { makeTempDir, REPO_ROOT, snapshotRepo } from '../helpers.mjs';

const TASK_DIR = join(REPO_ROOT, 'scripts/benchmark/tasks/legacy-pricing');
const FIXTURE = join(REPO_ROOT, 'scripts/benchmark/fixtures/legacy-pricing');
const FAKE = [process.execPath, join(REPO_ROOT, 'scripts/test/benchmark/fake-claude.mjs')];

test('fixture de legado nao tem openspec nem claude md', () => {
  assert.ok(!existsSync(join(FIXTURE, 'openspec')));
  assert.ok(!existsSync(join(FIXTURE, 'CLAUDE.md')));
  assert.ok(!existsSync(join(FIXTURE, 'docs')));
  const suite = spawnSync(process.execPath, ['--test', 'test/'], { cwd: FIXTURE, encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: '' } });
  assert.equal(suite.status, 0, suite.stdout);
});

test('legado compara com e sem docs agents', async () => {
  const work = makeTempDir('bench-legacy-');
  const log = join(work, 'calls.jsonl');
  const { groups } = await runLegacy({
    taskDir: TASK_DIR,
    n: 2,
    budget: createBudget(60),
    workRoot: work,
    templateSource: snapshotRepo().source,
    templateBranch: snapshotRepo().branch,
    claude: {
      bin: FAKE,
      env: { FAKE_CLAUDE_LOG: log, FAKE_CLAUDE_HOOK: join(REPO_ROOT, 'scripts/test/benchmark/fake-agent.mjs') },
    },
  });
  assert.deepEqual(Object.keys(groups).sort(), ['with_docs', 'without_docs']);
  for (const [variant, runs] of Object.entries(groups)) {
    assert.equal(runs.length, 2, variant);
    for (const run of runs) {
      assert.equal(run.status, 'passed', `${variant} ${run.run}: ${JSON.stringify(run.gates)}`);
      assert.equal(run.invocations, 3);
      assert.equal(existsSync(join(run.dir, 'docs/agents/domain.md')), variant === 'with_docs');
      assert.ok(!existsSync(join(run.dir, 'CLAUDE.md')));
      assert.equal(typeof run.coverage.before, 'number');
    }
  }
  const calls = readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line).args[1].split(' ')[0]);
  assert.ok(!calls.includes('/new-project'));
  assert.ok(!calls.includes('/pr'));
  assert.equal(calls.length, 12);
});
