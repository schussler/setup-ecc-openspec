#!/usr/bin/env node
// Gate de implementação. Mede os casos antigos (do baseline) por caso executado:
// aprova só com 100% deles, sem erro de lint ou de tipo e sem código de saída
// diferente de zero. Casos novos entram em new_pct como informação e não são exigidos.
// Limiares são constantes: nenhuma flag os altera.
// Usage:
//   node scripts/gates/implement-gate.mjs baseline --change <name> [--legacy-write] [--root <dir>]
//   node scripts/gates/implement-gate.mjs score --change <name> [--note "<o que mudou>"] [--legacy-write] [--root <dir>]
// Sem --legacy-write a CLI só imprime. A escrita só ocorre em execução legacy.
// Exit: 0 pass, 1 retry, 2 stop, 3 error.
import {
  ChecksError, countErrors, expandTestFiles, fileCommandFor, gateTimeoutMs, listTestFiles, loadChecks, readManifest, runCommand,
  runSuite, validateChecksSchema,
} from './checks.mjs';
import { parseTapCases } from '../harness/test-report.mjs';
import { DEFAULT_KILL_GRACE_MS } from '../harness/process-group.mjs';
import {
  MAX_CORRECTIONS, MAX_ERRORS, REQUIRED_PCT, assertLegacyWrite, decideVerdict, gateResult,
  isMain, parseArgs, pct, readGates, runCli, writeGates,
} from './gate-store.mjs';

export { MAX_CORRECTIONS, REQUIRED_PCT, MAX_ERRORS, decideVerdict };

const shellQuote = (value) => `'${value.replace(/'/g, "'\\''")}'`;
const SEVERITY = { pass: 1, skip: 2, fail: 3 };
const worst = (a, b) => (SEVERITY[a] >= SEVERITY[b] ? a : b);
const meets = (value) => value === null || value >= REQUIRED_PCT;
const countPass = (cases) => cases.filter((c) => c.status === 'pass').length;
const pctOf = (cases) => pct(countPass(cases), cases.length);

// Modo estruturado (checks.test_report declarado, D27): os casos vêm só da saída TAP do comando do
// projeto, uma execução por arquivo com file_command, ou a suíte com command. checks.test_file, de saída
// legível, não é usado nesse modo. Formato incompatível já é recusado por validateChecksSchema (AC-016).
function structuredChecks(root) {
  const schema = validateChecksSchema(readManifest(root).checks ?? {});
  return schema.mode === 'suite' ? schema : null;
}

// Arquivos avaliados: os declarados em checks.test_report.files quando há file_command; senão, a descoberta.
function testFilesOf(root) {
  const structured = structuredChecks(root);
  return structured?.fileCommand ? expandTestFiles(root, structured.files) : listTestFiles(root);
}

async function runTap(root, command, runOptions) {
  const result = await runCommand(command, { cwd: root, ...runOptions });
  const cases = parseTapCases(result.output).map(({ name, status, source }) => ({ name, status, source }));
  return { code: result.code, output: result.output, cases, timedOut: result.timedOut, termination_confirmed: result.termination_confirmed };
}

async function runStructured(root, structured, files, runOptions) {
  if (!structured.fileCommand) return [{ file: null, ...(await runTap(root, structured.reportCommand, runOptions)) }];
  const runs = [];
  for (const file of files) runs.push({ file, ...(await runTap(root, fileCommandFor(structured.fileCommand, file), runOptions)) });
  return runs;
}

// Sem test_report (modo legado compatível, AC-023): com test_file há uma execução por arquivo; sem ele,
// uma execução da suíte inteira.
async function runTests(root, checks, files, runOptions = {}) {
  const structured = structuredChecks(root);
  if (structured) return runStructured(root, structured, files, runOptions);
  if (checks.test_file) {
    const runs = [];
    for (const file of files) {
      const run = await runSuite(root, checks.test_file.replaceAll('{file}', shellQuote(file)), runOptions);
      runs.push({ file, ...run });
    }
    return runs;
  }
  return [{ file: null, ...(await runSuite(root, checks.test, runOptions)) }];
}

// Chave do caso: arquivo > nome quando a execução é por arquivo; só o nome na suíte inteira.
const caseKey = (file, name) => (file ? `${file} > ${name}` : name);

// Status por chave de caso. A mesma chave repetida pesa o pior resultado.
function caseStatuses(runs) {
  const map = new Map();
  for (const run of runs) {
    for (const found of run.cases) {
      const key = caseKey(run.file, found.name);
      const current = map.get(key);
      map.set(key, current
        ? { status: worst(current.status, found.status), source: current.source }
        : { status: found.status, source: found.source });
    }
  }
  return map;
}

// Baseline antigo (só lista de arquivos): o arquivo passa se a execução dele sai com zero
// e nenhum caso dela é fail ou skip.
function legacyFileStatus(run) {
  if (run.code !== 0) return 'fail';
  return run.cases.reduce((status, found) => worst(status, found.status), 'pass');
}

function oldCasesFromIds(ids, statuses) {
  return ids.map((id) => {
    const found = statuses.get(id);
    return found
      ? { id, status: found.status, source: found.source, group: 'old' }
      : { id, status: 'missing', source: 'baseline', group: 'old' };
  });
}

function newCasesFromIds(ids, statuses) {
  const known = new Set(ids);
  return [...statuses]
    .filter(([key]) => !known.has(key))
    .map(([key, found]) => ({ id: key, status: found.status, source: found.source, group: 'new' }));
}

function legacyOldCases(baselineFiles, current, runs, split) {
  return baselineFiles.map((file) => {
    if (!current.includes(file)) return { id: file, status: 'missing', source: 'baseline', group: 'old' };
    const run = split ? runs.find((found) => found.file === file) : runs[0];
    return { id: file, status: legacyFileStatus(run), source: 'file', group: 'old' };
  });
}

function legacyNewCases(baselineFiles, runs, split) {
  if (!split) return [];
  return runs
    .filter((run) => !baselineFiles.includes(run.file))
    .flatMap((run) => run.cases.map((found) => ({ id: caseKey(run.file, found.name), status: found.status, source: found.source, group: 'new' })));
}

// Mede a implementação sem gravar nada. O baseline vem do chamador.
// onSpawn recebe o pid de cada comando: o guarda do runner encerra a árvore no prazo ou no sinal (D8).
export async function evaluateImplementation({ root, baseline, timeoutMs = gateTimeoutMs(root), killGraceMs = DEFAULT_KILL_GRACE_MS, onSpawn = null }) {
  const checks = loadChecks(root);
  const current = testFilesOf(root);
  const structured = structuredChecks(root);
  const split = structured ? Boolean(structured.fileCommand) : Boolean(checks.test_file);
  const runOptions = { timeoutMs, killGraceMs, onSpawn };
  const runs = await runTests(root, checks, current, runOptions);
  const statuses = caseStatuses(runs);
  const baselineFiles = baseline.test_files ?? [];
  const hasIds = Array.isArray(baseline.case_ids);

  const oldCases = hasIds
    ? oldCasesFromIds(baseline.case_ids, statuses)
    : legacyOldCases(baselineFiles, current, runs, split);
  const newCases = hasIds
    ? newCasesFromIds(baseline.case_ids, statuses)
    : legacyNewCases(baselineFiles, runs, split);
  // Falha de tempo (RC-042) é marcada como tal; a execução que estoura conta como falha do gate.
  const exitCases = runs
    .filter((run) => run.code !== 0)
    .map((run) => ({ id: run.file ?? '<suite>', status: 'fail', source: run.timedOut ? 'timeout' : 'exit', group: 'exit' }));

  const lintRun = await runCommand(checks.lint, { cwd: root, ...runOptions });
  const typeRun = await runCommand(checks.typecheck, { cwd: root, ...runOptions });
  const lintErrors = countErrors(lintRun);
  const typeErrors = countErrors(typeRun);
  const timedOut = [
    ...runs.filter((run) => run.timedOut).map((run) => run.file ?? '<suite>'),
    ...(lintRun.timedOut ? ['<lint>'] : []),
    ...(typeRun.timedOut ? ['<typecheck>'] : []),
  ];
  const toolFailures = [lintErrors, typeErrors].reduce((sum, errors) => sum + (errors > MAX_ERRORS ? errors : 0), 0);

  const oldPct = pctOf(oldCases);
  const failures = oldCases.filter((c) => c.status !== 'pass').length + exitCases.length + toolFailures;
  return gateResult({
    gate: 'implement',
    passed: meets(oldPct) && failures === 0,
    failures,
    cases: [...oldCases, ...newCases, ...exitCases],
    evidence: {
      split,
      old_pct: oldPct,
      new_pct: pctOf(newCases),
      removed_tests: baselineFiles.filter((file) => !current.includes(file)),
      lint_errors: lintErrors,
      type_errors: typeErrors,
      exit_failures: exitCases.length,
      timed_out: timedOut,
    },
  });
}

// Baseline: arquivos de teste e IDs dos casos (nomes) executados agora.
export async function buildBaseline({ root }) {
  const checks = loadChecks(root, ['test']);
  const files = testFilesOf(root);
  const runs = await runTests(root, checks, files, { timeoutMs: gateTimeoutMs(root) });
  const caseIds = [...new Set(runs.flatMap((run) => run.cases.map((found) => caseKey(run.file, found.name))))].sort();
  return { created_at: new Date().toISOString(), test_files: files, case_ids: caseIds };
}

function withBaseline(gates, baseline) {
  // Um novo baseline inicia uma sessão; as anteriores ficam no histórico.
  const previous = gates.implement;
  const history = previous ? [...(previous.history ?? []), { baseline: previous.baseline, attempts: previous.attempts }] : [];
  return { ...gates, implement: { baseline, attempts: [], history } };
}

export async function recordBaseline({ root, change, legacyWrite = false }) {
  if (legacyWrite) assertLegacyWrite(root, change);
  const baseline = await buildBaseline({ root });
  if (legacyWrite) writeGates(root, change, withBaseline(readGates(root, change), baseline));
  return { ...baseline, written: legacyWrite };
}

export async function scoreImplementation({ root, change, note = '', legacyWrite = false }) {
  if (legacyWrite) assertLegacyWrite(root, change);
  const gates = readGates(root, change);
  const baseline = gates.implement?.baseline;
  if (!baseline) {
    throw new ChecksError(`sem baseline para "${change}". Rode: node scripts/gates/implement-gate.mjs baseline --change ${change}`);
  }
  const result = await evaluateImplementation({ root, baseline });
  const previous = gates.implement.attempts ?? [];
  const attempt = {
    attempt: previous.length + 1,
    at: new Date().toISOString(),
    note,
    ...result,
    verdict: decideVerdict({ passed: result.passed, failures: result.failures }, previous),
    written: legacyWrite,
  };
  if (legacyWrite) {
    writeGates(root, change, { ...gates, implement: { ...gates.implement, attempts: [...previous, attempt] } });
  }
  return attempt;
}

if (isMain(import.meta.url)) {
  const { command, options } = parseArgs(process.argv.slice(2));
  const root = options.root ?? process.cwd();
  const legacyWrite = options['legacy-write'] === true;
  runCli(async () => {
    if (command === 'baseline') return { verdict: 'pass', ...(await recordBaseline({ root, change: options.change, legacyWrite })) };
    if (command === 'score') return scoreImplementation({ root, change: options.change, note: options.note ?? '', legacyWrite });
    throw new ChecksError('uso: implement-gate.mjs <baseline|score> --change <nome> [--note <texto>] [--legacy-write] [--root <dir>]');
  });
}
