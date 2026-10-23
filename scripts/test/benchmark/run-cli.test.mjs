import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { main, parseOptions } from '../../benchmark/run.mjs';
import { makeTempDir, REPO_ROOT } from '../helpers.mjs';

const BRANCH = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();

test('parseOptions aplica os padroes do orcamento', () => {
  const options = parseOptions([]);
  assert.equal(options.n, 5);
  assert.equal(options.maxInvocations, 60);
  assert.equal(options.timeoutMin, 25);
  assert.equal(options.scenario, 'all');
});

test('parseOptions rejeita cenario desconhecido', () => {
  assert.throws(() => parseOptions(['--scenario', 'outro']), /cenário/);
});

test('runner grava report json e md', async () => {
  const work = makeTempDir('bench-cli-');
  const out = join(work, 'out');
  process.env.FAKE_CLAUDE_HOOK = join(REPO_ROOT, 'scripts/test/benchmark/fake-agent.mjs');
  process.env.FAKE_AGENT_TASK = join(REPO_ROOT, 'scripts/benchmark/tasks/greenfield-duration/task.json');
  try {
    await main([
      '--scenario', 'greenfield', '--n', '1', '--work-dir', work, '--out', out,
      '--template-branch', BRANCH, '--claude-bin', `${process.execPath} ${join(REPO_ROOT, 'scripts/test/benchmark/fake-claude.mjs')}`,
    ]);
  } finally {
    delete process.env.FAKE_CLAUDE_HOOK;
    delete process.env.FAKE_AGENT_TASK;
  }
  const report = JSON.parse(readFileSync(join(out, 'greenfield', 'report.json'), 'utf8'));
  assert.equal(report.status, 'complete');
  assert.equal(report.groups.default.summary.success_rate, 100);
  assert.ok(existsSync(join(out, 'greenfield', 'report.md')));
  for (const file of ['report.json', 'report.md']) {
    const text = readFileSync(join(out, 'greenfield', file), 'utf8');
    assert.ok(!text.includes(work), `${file} expõe o caminho do work dir`);
    assert.match(text, /<work-dir>/);
  }
});
