// Shared helpers for the gates: reads `checks` from template.json, runs
// commands and turns their output into counts the gates can score.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const REQUIRED_CHECKS = Object.freeze(['test', 'lint', 'typecheck']);

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.venv', 'venv', '__pycache__']);
const TEST_FILE = /(\.(test|spec)\.[cm]?[jt]sx?$)|((^|\/)test_[^/]+\.py$)|(_test\.(py|go)$)/;

export class ChecksError extends Error {}

export function readManifest(root) {
  const path = join(root, 'template.json');
  if (!existsSync(path)) {
    throw new ChecksError(`template.json não encontrado em ${root}. Os gates leem os comandos de template.json → checks.`);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new ChecksError(`template.json inválido: ${err.message}`);
  }
}

export function loadChecks(root, required = REQUIRED_CHECKS) {
  const checks = readManifest(root).checks ?? {};
  for (const key of required) {
    const value = checks[key];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ChecksError(
        `checks.${key} não definido em template.json. Preencha com o comando do projeto (por /new-project ou editando template.json) antes de rodar o gate.`,
      );
    }
  }
  return { ...checks };
}

export function runCommand(command, { cwd, timeoutMs = 0, env = process.env } = {}) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', command], { cwd, env });
    const chunks = [];
    let timedOut = false;
    const timer = timeoutMs > 0
      ? setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs)
      : null;
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({
        code: timedOut ? 124 : code ?? 1,
        output: Buffer.concat(chunks).toString('utf8'),
        durationMs: Date.now() - started,
        timedOut,
      });
    });
  });
}

const COUNT_PATTERNS = [
  // node --test, spec and tap reporters
  (out) => {
    const pass = out.match(/^[#ℹ]\s*pass\s+(\d+)/m);
    const fail = out.match(/^[#ℹ]\s*fail\s+(\d+)/m);
    return pass && fail ? { pass: Number(pass[1]), fail: Number(fail[1]) } : null;
  },
  // jest: "Tests: 1 failed, 4 passed, 5 total"; vitest: "Tests  4 passed | 1 failed (5)"
  (out) => {
    const line = out.match(/^\s*Tests:?\s+(.*)$/m);
    if (!line) return null;
    return countWords(line[1]);
  },
  // pytest: "==== 4 passed, 1 failed in 0.12s ===="
  (out) => {
    const line = out.match(/^=+ (.*\b(passed|failed)\b.*) in [\d.]+s/m);
    return line ? countWords(line[1]) : null;
  },
];

function countWords(text) {
  const pass = text.match(/(\d+) passed/);
  const fail = text.match(/(\d+) failed/);
  if (!pass && !fail) return null;
  return { pass: pass ? Number(pass[1]) : 0, fail: fail ? Number(fail[1]) : 0 };
}

export function parseTestCounts(output) {
  for (const pattern of COUNT_PATTERNS) {
    const counts = pattern(output);
    if (counts) return counts;
  }
  return null;
}

export function countErrors({ code, output }) {
  if (code === 0) return 0;
  const lines = output.split('\n').filter((line) => /\berror\b/i.test(line));
  return Math.max(1, lines.length);
}

export function isTestFile(path) {
  return TEST_FILE.test(path.split(sep).join('/'));
}

export function walkFiles(root, dir = root) {
  if (!existsSync(dir)) return [];
  if (relative(root, dir).split(sep).some((segment) => IGNORED_DIRS.has(segment))) return [];
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) files.push(...walkFiles(root, join(dir, entry.name)));
    } else if (entry.isFile()) {
      files.push(relative(root, join(dir, entry.name)).split(sep).join('/'));
    }
  }
  return files.sort();
}

export function listTestFiles(root) {
  return walkFiles(root).filter(isTestFile);
}
