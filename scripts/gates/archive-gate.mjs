#!/usr/bin/env node
// Archive gate. Requires a passing implementation gate and a green suite, then
// scores the share of the change's spec scenarios that have a test with the
// same (normalized) name.
// Usage: node scripts/gates/archive-gate.mjs --change <name> [--note "<o que mudou>"] [--root <dir>]
// Exit: 0 pass, 1 retry, 2 stop, 3 error.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ChecksError, listTestFiles, loadChecks, runCommand, walkFiles } from './checks.mjs';
import { REQUIRED_PCT, changeDir, decideVerdict, parseArgs, pct, readGates, runCli, writeGates } from './gate-store.mjs';

const SCENARIO = /^####\s+Scenario:\s*(.+?)\s*$/gm;

export function normalizeName(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function listScenarios(root, change) {
  const specsDir = join(changeDir(root, change), 'specs');
  if (!existsSync(specsDir)) return [];
  return walkFiles(specsDir)
    .filter((file) => file.endsWith('spec.md'))
    .flatMap((file) => [...readFileSync(join(specsDir, file), 'utf8').matchAll(SCENARIO)].map((m) => m[1]));
}

function record(root, change, gates, result) {
  const previous = gates.archive?.attempts ?? [];
  const attempt = { attempt: previous.length + 1, at: new Date().toISOString(), ...result };
  writeGates(root, change, { ...gates, archive: { attempts: [...previous, attempt] } });
  return attempt;
}

export async function scoreArchive({ root, change, note = '' }) {
  const checks = loadChecks(root, ['test']);
  const gates = readGates(root, change);
  if (gates.implement?.attempts?.at(-1)?.verdict !== 'pass') {
    return record(root, change, gates, {
      note,
      verdict: 'stop',
      reason: 'o gate de implementação não está em pass; rode spec-implement antes de arquivar',
      scenarios: null,
    });
  }

  const suite = await runCommand(checks.test, { cwd: root });
  const testText = listTestFiles(root).map((file) => normalizeName(readFileSync(join(root, file), 'utf8'))).join('\n');
  const scenarios = listScenarios(root, change);
  const missing = scenarios.filter((name) => !testText.includes(normalizeName(name)));
  const coverage = pct(scenarios.length - missing.length, scenarios.length);
  const suitePassed = suite.code === 0;
  const passed = suitePassed && (coverage === null || coverage >= REQUIRED_PCT);
  const failures = missing.length + (suitePassed ? 0 : 1);
  const previous = gates.archive?.attempts ?? [];

  return record(root, change, gates, {
    note,
    suite_passed: suitePassed,
    scenarios: { total: scenarios.length, covered: scenarios.length - missing.length, pct: coverage, missing },
    failures,
    verdict: decideVerdict({ passed, failures }, previous),
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { options } = parseArgs(['score', ...process.argv.slice(2)]);
  runCli(async () => {
    if (!options.change) throw new ChecksError('uso: archive-gate.mjs --change <nome> [--note <texto>] [--root <dir>]');
    return scoreArchive({ root: options.root ?? process.cwd(), change: options.change, note: options.note ?? '' });
  });
}
