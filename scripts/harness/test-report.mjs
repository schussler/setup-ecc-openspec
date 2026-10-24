// Relatório da suíte obrigatória (F7, D12, D21, D27, AC-011 a AC-017, AC-028). O runner executa
// checks.test_report.command (autoridade do código de saída e das contagens) e, quando o projeto declara
// file_command, uma execução por arquivo de teste para a identidade dos casos. Captura a saída e o código
// de saída, e guarda a saída em .harness-local/<change>/evidence/<execution_id>/. Só TAP na v1.
import { join, relative, sep } from 'node:path';
import { expandTestFiles, fileCommandFor, parseTestCases, runCommand } from '../gates/checks.mjs';
import { sha256 } from './evidence.mjs';
import { localDir } from './identity.mjs';
import { ConfigError } from './policy.mjs';
import { writeFileAtomic } from './state.mjs';

export const SUPPORTED_FORMATS = Object.freeze(['tap']);
export const CAPTURED_OUTPUT_FILE = 'test-report.tap';
export const FILES_OUTPUT_FILE = 'test-report-files.tap';
const TAP_CASE = /^\s*(not ok|ok)\s+\d+\s+-\s+(.*?)\s*$/;
// Node 22+ escreve "# SKIP motivo" e "# TODO motivo" ao fim do nome; o nome pode trazer "\#".
const DIRECTIVE = /\s+#\s*(SKIP|TODO)\b.*$/i;
const SUBTEST = /^(\s*)# Subtest: (.*?)\s*$/;
// Contagem independente do parser: toda linha "ok"/"not ok", com ou sem descrição (EV-012).
const TAP_RESULT_LINE = /^\s*(not ok|ok)(\s|$)/;
// O reporter TAP do Node indenta cada nível de subteste com 4 espaços.
const TAP_INDENT = 4;
const SCENARIO_TAGS = /\[([A-Z]+-\d+)\]/g;
const STATUS_PRIORITY = ['fail', 'pass', 'skip'];

// Todos os cenários citados no nome do caso, sem repetição, na ordem em que aparecem (A.3, item B).
export function scenarioTagsOf(name) {
  return [...new Set([...name.matchAll(SCENARIO_TAGS)].map((match) => match[1]))];
}

// Casos executados na saída TAP: pass (ok), fail (not ok) ou skip (# SKIP e # TODO, que nunca aprovam).
// directive guarda a diretiva (skip, todo ou null) para o inventário; o status de aprovação não muda.
// path lista os nomes dos subtestes ancestrais ("# Subtest:" de nível menor), do mais externo ao mais interno.
// scenarios lista todas as tags [ID] do nome; scenario é a primeira, por compatibilidade.
export function parseTapCases(output) {
  const ancestors = [];
  return output.split('\n').flatMap((line) => {
    const subtest = line.match(SUBTEST);
    if (subtest) {
      const level = Math.floor(subtest[1].length / TAP_INDENT);
      ancestors.length = level;
      ancestors[level] = subtest[2];
      return [];
    }
    const match = line.match(TAP_CASE);
    if (!match) return [];
    const level = Math.floor(match[0].search(/\S/) / TAP_INDENT);
    const directive = match[2].match(DIRECTIVE)?.[1].toLowerCase() ?? null;
    const name = match[2].replace(DIRECTIVE, '').trim();
    const status = directive ? 'skip' : (match[1] === 'ok' ? 'pass' : 'fail');
    const scenarios = scenarioTagsOf(name);
    const path = ancestors.slice(0, level).filter((item) => item !== undefined);
    return [{ name, status, source: 'tap', scenario: scenarios[0] ?? null, scenarios, directive, path }];
  });
}

// Número de casos na saída TAP, contado sem o parser: base da conferência do inventário (EV-012).
export function countTapCases(output) {
  return output.split('\n').filter((line) => TAP_RESULT_LINE.test(line)).length;
}

const PARSERS = Object.freeze({ tap: parseTapCases });

export function assertSupportedFormat(format) {
  if (SUPPORTED_FORMATS.includes(format)) return format;
  throw new ConfigError(
    `checks.test_report.format "${format}" não é suportado. Formatos suportados na v1: ${SUPPORTED_FORMATS.join(', ')}. `
    + 'Exemplo: "test_report": {"command": "node --test --test-reporter=tap", "format": "tap", "suite": "<nome-da-suite>"}',
  );
}

// format null: modo legado (AC-023), sem identidade de suíte; reconhece TAP e o reporter spec.
export function parseCases(format, output) {
  if (format === null) return parseTestCases(output);
  return PARSERS[assertSupportedFormat(format)](output);
}

// Estado de um id de cenário pelos casos cujo nome contém [ID] exato (AC-003, AC-015).
// Falha vence; depois pass; depois skip. Sem caso: missing.
export function statusForId(cases, id) {
  const hits = cases.filter((item) => item.name.includes(`[${id}]`));
  const status = STATUS_PRIORITY.find((candidate) => hits.some((item) => item.status === candidate));
  if (!status) return { status: 'missing', source: 'none' };
  return { status, source: hits.find((item) => item.status === status).source };
}

// Executa file_command por arquivo de teste (D27, D28): cada caso ganha o arquivo de origem. A saída
// de todos os arquivos fica num arquivo próprio da execução, ao lado da saída da suíte.
async function runPerFile({ root, fileCommand, files, format, timeoutMs, killGraceMs, onSpawn }) {
  const runs = [];
  for (const file of files) {
    const run = await runCommand(fileCommandFor(fileCommand, file), { cwd: root, timeoutMs, killGraceMs, onSpawn });
    runs.push({ file, run, cases: parseCases(format, run.output).map((item) => ({ ...item, file })) });
  }
  return {
    cases: runs.flatMap((item) => item.cases),
    output: runs.map((item) => `# file: ${item.file}\n${item.run.output}`).join('\n'),
    timed_out: runs.filter((item) => item.run.timedOut).map((item) => item.file),
    termination_confirmed: runs.every((item) => item.run.termination_confirmed !== false),
  };
}

// Executa checks.test_report.command, guarda a saída capturada e devolve o resultado. Com fileCommand, a
// suíte continua como autoridade do código de saída e das contagens (suite_cases, reported_total), e os
// casos (cases) vêm da execução por arquivo, com a identidade "<arquivo>::<nome completo>". files é a lista
// de globs de checks.test_report.files (obrigatória com fileCommand): o runner não deduz os arquivos.
export async function runTestReport({
  root, change, command, executionId, format = 'tap', timeoutMs = 0, killGraceMs, fileCommand = null, files = null, onSpawn = null,
}) {
  if (fileCommand && !files) throw new ConfigError('checks.test_report.files ausente: obrigatório com file_command');
  const run = await runCommand(command, { cwd: root, timeoutMs, killGraceMs, onSpawn });
  const suiteCases = parseCases(format, run.output);
  const dir = join(localDir(root, change), 'evidence', executionId);
  const path = join(dir, CAPTURED_OUTPUT_FILE);
  writeFileAtomic(path, run.output);
  const perFile = fileCommand
    ? await runPerFile({ root, fileCommand, files: expandTestFiles(root, files), format, timeoutMs, killGraceMs, onSpawn })
    : null;
  if (perFile) writeFileAtomic(join(dir, FILES_OUTPUT_FILE), perFile.output);
  return {
    code: run.code,
    timedOut: run.timedOut,
    termination_confirmed: perFile?.termination_confirmed === false ? false : run.termination_confirmed,
    mode: perFile ? 'file' : 'suite',
    cases: perFile ? perFile.cases : suiteCases,
    suite_cases: suiteCases,
    files_timed_out: perFile?.timed_out ?? [],
    // Só o formato TAP tem contagem conferível; no modo legado (format null) fica null.
    reported_total: format === 'tap' ? countTapCases(run.output) : null,
    output_path: toPosix(relative(root, path)),
    output_sha256: sha256(run.output),
    command_sha256: sha256(command),
    file_command_sha256: fileCommand ? sha256(fileCommand) : null,
  };
}

const toPosix = (path) => path.split(sep).join('/');
