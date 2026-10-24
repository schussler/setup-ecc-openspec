// Shared helpers for the gates: reads `checks` from template.json, runs
// commands and turns their output into counts the gates can score.
import { existsSync, globSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { DEFAULT_KILL_GRACE_MS, spawnInGroup, terminateGroup } from '../harness/process-group.mjs';

const POLICY_PATH = '.claude/harness/policy.json';
const MS_PER_SECOND = 1000;

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
  const { command } = validateChecksSchema(checks);
  const normalized = { ...checks };
  if (command !== undefined) normalized.test = command;
  for (const key of required) {
    const value = normalized[key];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ChecksError(
        `checks.${key} não definido em template.json. Preencha com o comando do projeto (por /new-project ou editando template.json) antes de rodar o gate.`,
      );
    }
  }
  return normalized;
}

export const SUPPORTED_REPORT_FORMATS = Object.freeze(['tap']);
const FORMAT_EXAMPLE = '"format": "tap"';
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new ChecksError(`${label} ausente ou vazio em template.json`);
}

function checkReportFormat(report) {
  if (SUPPORTED_REPORT_FORMATS.includes(report.format)) return;
  throw new ChecksError(
    `checks.test_report.format "${report.format}" não é suportado. Formatos suportados na v1: ${SUPPORTED_REPORT_FORMATS.join(', ')}. `
    + `Exemplo: ${FORMAT_EXAMPLE} (com "command" e "suite" do projeto).`,
  );
}

// Esquema de checks.test e checks.test_report (D27, AC-014, AC-016, AC-022, AC-023).
// checks.test: string (modo legado, sem identidade de suíte) ou {command, suite}.
// Com checks.test_report, checks.test precisa ser objeto com a mesma suite. Devolve o comando
// de checks.test para os gates legados (command) e, quando há test_report, o comando da suíte
// obrigatória (reportCommand) e a suite comum.
export function validateChecksSchema(checks = {}) {
  const { test, test_report: report } = checks;
  if (report !== undefined) return validateSuiteMode(test, report);
  if (typeof test === 'string' || test === undefined) return { mode: 'legacy', command: test, suite: null, report: null };
  if (!isObject(test)) throw new ChecksError('checks.test deve ser string (legado) ou objeto {"command": "...", "suite": "..."}');
  requireText(test.command, 'checks.test.command');
  requireText(test.suite, 'checks.test.suite');
  return { mode: 'legacy', command: test.command, suite: test.suite, report: null };
}

function validateSuiteMode(test, report) {
  if (!isObject(report)) throw new ChecksError('checks.test_report deve ser objeto {"command", "suite", "format"}');
  if (report.format === undefined) throw new ChecksError(`checks.test_report.format ausente. Formatos suportados na v1: ${SUPPORTED_REPORT_FORMATS.join(', ')}. Exemplo: ${FORMAT_EXAMPLE}`);
  checkReportFormat(report);
  requireText(report.command, 'checks.test_report.command');
  requireText(report.suite, 'checks.test_report.suite');
  if (test === undefined || typeof test === 'string') {
    throw new ChecksError(`checks.test deve ser objeto {"command": "...", "suite": "${report.suite}"} quando checks.test_report existe (AC-022)`);
  }
  if (!isObject(test)) throw new ChecksError('checks.test deve ser objeto {"command": "...", "suite": "..."} quando checks.test_report existe');
  requireText(test.command, 'checks.test.command');
  requireText(test.suite, 'checks.test.suite');
  if (test.suite !== report.suite) {
    throw new ChecksError(`suite divergente: checks.test.suite "${test.suite}" != checks.test_report.suite "${report.suite}" (AC-014)`);
  }
  checkFileCommand(report.file_command);
  const files = checkReportFiles(report.files, report.file_command);
  return {
    mode: 'suite', command: test.command, suite: report.suite, format: report.format, reportCommand: report.command,
    fileCommand: report.file_command ?? null, files, report,
  };
}

// checks.test_report.file_command (opcional, D27): comando por arquivo de teste, declarado pelo projeto,
// com o marcador {file}. O runner só substitui o marcador; não acrescenta flags.
export const FILE_MARKER = '{file}';

function checkFileCommand(fileCommand) {
  if (fileCommand === undefined) return;
  requireText(fileCommand, 'checks.test_report.file_command');
  if (!fileCommand.includes(FILE_MARKER)) {
    throw new ChecksError(`checks.test_report.file_command precisa do marcador ${FILE_MARKER}. Exemplo: "file_command": "node --test --test-reporter=tap ${FILE_MARKER}"`);
  }
}

// checks.test_report.files (D27): glob, ou lista de globs, declarado pelo projeto com os arquivos que
// file_command executa. Obrigatório com file_command; o runner não deduz a lista. Devolve a lista de globs.
const FILES_EXAMPLE = '"files": "scripts/test/**/*.test.mjs"';

function checkReportFiles(files, fileCommand) {
  if (files === undefined) {
    if (fileCommand === undefined) return null;
    throw new ChecksError(`checks.test_report.files ausente: obrigatório com file_command, com os mesmos arquivos da suíte. Exemplo: ${FILES_EXAMPLE}`);
  }
  const globs = Array.isArray(files) ? files : [files];
  if (globs.length === 0 || globs.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new ChecksError(`checks.test_report.files deve ser glob ou lista de globs não vazios. Exemplo: ${FILES_EXAMPLE}`);
  }
  return Object.freeze([...globs]);
}

// Arquivos de checks.test_report.files, relativos à raiz, em "/" e ordenados, sem repetição. Usa o glob
// de node:fs, o mesmo do runner de testes do Node ("**" atravessa diretórios), que também ignora node_modules.
export function expandTestFiles(root, globs) {
  const matches = globSync(globs, { cwd: root, exclude: (name) => name === 'node_modules' });
  const files = matches.filter((file) => statSync(join(root, file)).isFile()).map((file) => file.split(sep).join('/'));
  return [...new Set(files)].sort();
}

// Comando por arquivo com o caminho entre aspas simples no lugar de {file}.
export function fileCommandFor(fileCommand, file) {
  return fileCommand.replaceAll(FILE_MARKER, `'${file.replace(/'/g, "'\\''")}'`);
}

// A nested `node --test` that inherits NODE_TEST_CONTEXT reports to the parent
// runner instead of printing its summary, so the gates drop it.
function isolatedEnv() {
  const { NODE_TEST_CONTEXT: _ignored, ...env } = process.env;
  return env;
}

// Tempo máximo de um gate: max_seconds_per_gate da política (D23, RC-042). Sem política
// no projeto, não há teto (o template sempre traz a política).
export function gateTimeoutMs(root) {
  const path = join(root, POLICY_PATH);
  if (!existsSync(path)) return 0;
  const seconds = JSON.parse(readFileSync(path, 'utf8')).max_seconds_per_gate;
  return typeof seconds === 'number' ? seconds * MS_PER_SECOND : 0;
}

// Roda um comando em grupo de processos próprio. No timeout, o grupo inteiro é encerrado
// (D25): code 124, timedOut true e termination_confirmed indica se o encerramento foi confirmado.
// onSpawn recebe o pid do líder do grupo: o guarda do gate encerra a árvore no timeout ou no sinal (D8).
export function runCommand(command, {
  cwd, timeoutMs = 0, killGraceMs = DEFAULT_KILL_GRACE_MS, env = isolatedEnv(), terminate = terminateGroup, onSpawn = null,
} = {}) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawnInGroup('sh', ['-c', command], { cwd, env });
    if (onSpawn && child.pid) onSpawn(child.pid);
    const chunks = [];
    let settled = false;
    let timedOut = false;
    let timer = null;
    const finish = (fields) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...fields, output: Buffer.concat(chunks).toString('utf8'), durationMs: Date.now() - started });
    };
    if (timeoutMs > 0) {
      timer = setTimeout(async () => {
        timedOut = true;
        const termination = await terminate(child.pid, { graceMs: killGraceMs });
        finish({ code: 124, timedOut: true, termination_confirmed: termination.confirmed });
      }, timeoutMs);
    }
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    // Com timeout, o desfecho é o do encerramento (RC-042): o close que chega antes não decide.
    child.on('close', (code) => {
      if (!timedOut) finish({ code: code ?? 1, timedOut: false, termination_confirmed: null });
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
  if (statSync(dir).isFile()) return [relative(root, dir).split(sep).join('/')];
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

// The vendored toolset ships its own example tests; they are not project tests.
const TOOLSET_DIRS = ['.claude/', 'openspec/'];

export function listTestFiles(root) {
  return walkFiles(root)
    .filter((file) => !TOOLSET_DIRS.some((dir) => file.startsWith(dir)))
    .filter(isTestFile);
}

// Casos executados, lidos da saída do runner. TAP (`ok N - nome`, `not ok N - nome`)
// e o reporter spec (`✔ nome`, `✖ nome`, `﹣ nome`, `⚠ nome`) são reconhecidos.
// `# SKIP` e `# TODO` viram `skip`, que nunca aprova.
const TAP_CASE = /^\s*(not ok|ok)\s+\d+\s+-\s+(.*?)\s*$/;
const SPEC_CASE = /^\s*([✔✖﹣⚠])\s+(.*?)\s*$/;
const DIRECTIVE = /\s+#\s*(SKIP|TODO)\b.*$/i;
const DURATION = /\s+\([\d.]+ms\)$/;
const SPEC_STATUS = { '✔': 'pass', '✖': 'fail', '﹣': 'skip', '⚠': 'skip' };

function caseFromText(text, status, source) {
  const directive = DIRECTIVE.test(text);
  const name = text.replace(DIRECTIVE, '').replace(DURATION, '').trim();
  return { name, status: directive ? 'skip' : status, source };
}

export function parseTestCases(output) {
  const cases = [];
  for (const line of output.split('\n')) {
    const tap = line.match(TAP_CASE);
    if (tap) {
      cases.push(caseFromText(tap[2], tap[1] === 'ok' ? 'pass' : 'fail', 'tap'));
      continue;
    }
    const spec = line.match(SPEC_CASE);
    // "✖ failing tests:" é cabeçalho do resumo de falhas do reporter, não um caso.
    if (spec && spec[2] !== 'failing tests:') cases.push(caseFromText(spec[2], SPEC_STATUS[spec[1]], 'spec'));
  }
  return cases;
}

// Roda um comando de suíte e devolve código de saída, saída e casos executados.
export async function runSuite(root, command, options = {}) {
  const result = await runCommand(command, { cwd: root, ...options });
  return {
    code: result.code, output: result.output, cases: parseTestCases(result.output),
    timedOut: result.timedOut, termination_confirmed: result.termination_confirmed,
  };
}
