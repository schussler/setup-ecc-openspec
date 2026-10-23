#!/usr/bin/env node
// PR gate: no active OpenSpec change, a clean working tree, and a green suite.
// Usage: node scripts/gates/pr-gate.mjs [--root <dir>]
// Exit: 0 pass, 1 fail, 3 error.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadChecks, runCommand } from './checks.mjs';
import { parseArgs, runCli } from './gate-store.mjs';

export function activeChanges(root) {
  const dir = join(root, 'openspec', 'changes');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'archive')
    .map((entry) => entry.name)
    .sort();
}

export function dirtyFiles(root) {
  const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
  return status.split('\n').filter(Boolean).map((line) => line.slice(3)).sort();
}

export async function checkPr({ root }) {
  const checks = loadChecks(root, ['test']);
  const changes = activeChanges(root);
  const dirty = dirtyFiles(root);
  const tests = await runCommand(checks.test, { cwd: root });
  const testsPassed = tests.code === 0;
  return {
    active_changes: changes,
    dirty_files: dirty,
    tests_passed: testsPassed,
    verdict: changes.length === 0 && dirty.length === 0 && testsPassed ? 'pass' : 'fail',
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { options } = parseArgs(['check', ...process.argv.slice(2)]);
  runCli(() => checkPr({ root: options.root ?? process.cwd() }));
}
