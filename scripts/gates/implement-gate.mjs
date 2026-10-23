#!/usr/bin/env node
// Implementation gate. Scores new tests, old tests, lint and typecheck, and
// enforces the self-correction cycle. Thresholds are constants on purpose:
// no flag can lower them.
// Usage:
//   node scripts/gates/implement-gate.mjs baseline --change <name> [--root <dir>]
//   node scripts/gates/implement-gate.mjs score --change <name> [--note "<o que mudou>"] [--root <dir>]
// Exit: 0 pass, 1 retry, 2 stop, 3 error.
import { pathToFileURL } from 'node:url';
import { ChecksError, countErrors, listTestFiles, loadChecks, parseTestCounts, runCommand } from './checks.mjs';
import { parseArgs, readGates, runCli, writeGates } from './gate-store.mjs';

export const MAX_CORRECTIONS = 3;
export const REQUIRED_PCT = 100;
export const MAX_ERRORS = 0;

export function recordBaseline({ root, change }) {
  const gates = readGates(root, change);
  const baseline = { created_at: new Date().toISOString(), test_files: listTestFiles(root) };
  // A new baseline starts a new gate session; earlier sessions stay auditable.
  const previous = gates.implement;
  const history = previous ? [...(previous.history ?? []), { baseline: previous.baseline, attempts: previous.attempts }] : [];
  writeGates(root, change, { ...gates, implement: { baseline, attempts: [], history } });
  return baseline;
}

const shellQuote = (value) => `'${value.replace(/'/g, "'\\''")}'`;
const pct = (pass, total) => (total === 0 ? null : Math.round((pass / total) * 10000) / 100);

async function runTestFile(root, command, file) {
  const result = await runCommand(command.replaceAll('{file}', shellQuote(file)), { cwd: root });
  const counts = parseTestCounts(result.output);
  if (counts && counts.pass + counts.fail > 0) return counts;
  return result.code === 0 ? { pass: 1, fail: 0 } : { pass: 0, fail: 1 };
}

async function scoreGroup(root, command, files) {
  let pass = 0;
  let fail = 0;
  const failing = [];
  for (const file of files) {
    const counts = await runTestFile(root, command, file);
    pass += counts.pass;
    fail += counts.fail;
    if (counts.fail > 0) failing.push(file);
  }
  return { files, pass, fail, pct: pct(pass, pass + fail), failing };
}

async function scoreWholeSuite(root, command, oldFiles, newFiles) {
  const result = await runCommand(command, { cwd: root });
  const counts = parseTestCounts(result.output) ?? (result.code === 0 ? { pass: 1, fail: 0 } : { pass: 0, fail: 1 });
  const whole = { pass: counts.pass, fail: counts.fail, pct: pct(counts.pass, counts.pass + counts.fail), failing: [] };
  return {
    old: { ...whole, files: oldFiles },
    new: { ...whole, files: newFiles, fail: 0 },
  };
}

export function decideVerdict({ passed, failures }, previous) {
  if (passed) return 'pass';
  if (previous.length >= MAX_CORRECTIONS) return 'stop';
  const last = previous.at(-1);
  if (last && failures >= last.failures) return 'stop';
  return 'retry';
}

const meets = (value) => value === null || value >= REQUIRED_PCT;

export async function scoreImplementation({ root, change, note = '' }) {
  const checks = loadChecks(root);
  const gates = readGates(root, change);
  const baseline = gates.implement?.baseline;
  if (!baseline) {
    throw new ChecksError(`sem baseline para "${change}". Rode: node scripts/gates/implement-gate.mjs baseline --change ${change}`);
  }
  const current = listTestFiles(root);
  const baselineSet = new Set(baseline.test_files);
  const oldFiles = current.filter((file) => baselineSet.has(file));
  const newFiles = current.filter((file) => !baselineSet.has(file));
  const removed = baseline.test_files.filter((file) => !current.includes(file));

  const split = Boolean(checks.test_file);
  const tests = split
    ? { old: await scoreGroup(root, checks.test_file, oldFiles), new: await scoreGroup(root, checks.test_file, newFiles) }
    : await scoreWholeSuite(root, checks.test, oldFiles, newFiles);
  const lint = await runCommand(checks.lint, { cwd: root });
  const typecheck = await runCommand(checks.typecheck, { cwd: root });

  const lintErrors = countErrors(lint);
  const typeErrors = countErrors(typecheck);
  // A baseline test file that disappeared counts as a failing old test.
  const oldFail = tests.old.fail + removed.length;
  const oldScore = { ...tests.old, fail: oldFail, pct: pct(tests.old.pass, tests.old.pass + oldFail) };
  const failures = oldFail + tests.new.fail + lintErrors + typeErrors;
  const passed = meets(oldScore.pct) && meets(tests.new.pct) && lintErrors <= MAX_ERRORS && typeErrors <= MAX_ERRORS;

  const previous = gates.implement.attempts;
  const attempt = {
    attempt: previous.length + 1,
    at: new Date().toISOString(),
    note,
    split,
    old: oldScore,
    new: tests.new,
    removed_tests: removed,
    lint_errors: lintErrors,
    type_errors: typeErrors,
    failures,
    verdict: decideVerdict({ passed, failures }, previous),
  };
  writeGates(root, change, { ...gates, implement: { ...gates.implement, attempts: [...previous, attempt] } });
  return attempt;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { command, options } = parseArgs(process.argv.slice(2));
  const root = options.root ?? process.cwd();
  runCli(async () => {
    if (command === 'baseline') return { verdict: 'pass', ...recordBaseline({ root, change: options.change }) };
    if (command === 'score') return scoreImplementation({ root, change: options.change, note: options.note ?? '' });
    throw new ChecksError('uso: implement-gate.mjs <baseline|score> --change <nome> [--note <texto>] [--root <dir>]');
  });
}
