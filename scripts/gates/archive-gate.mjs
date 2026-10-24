#!/usr/bin/env node
// Gate de arquivamento. Exige aprovação válida da implementação e a suíte com código
// zero. Cada cenário com forma `teste` precisa de um caso executado com o seu ID entre
// colchetes no nome (AC-003), com resultado pass. Forma `check:<nome>` é satisfeita pelo
// check declarado em `checks`. Change com comportamento novo (requisitos no delta de specs)
// e sem cenário reprova com no_scenarios. Change sem comportamento novo exige a suíte e os
// checks lint e typecheck.
// Avaliador legado (3.9, PB-007/PB-008): change sem nenhum **ID:** e sem run-state de modo
// runner compara o nome normalizado do cenário com o texto dos testes. O avaliador usado vai
// no campo `evaluator`, com as limitações em `evaluator_limits`.
// Usage: node scripts/gates/archive-gate.mjs --change <name> [--note "<o que mudou>"] [--legacy-write] [--root <dir>]
// Sem --legacy-write a CLI só imprime. Exit: 0 pass, 1 retry, 2 stop, 3 error.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { localDir } from '../harness/identity.mjs';
import { readSupervisedCompletion } from '../harness/supervised-completion.mjs';
import { ChecksError, listTestFiles, loadChecks, runCommand, runSuite, walkFiles } from './checks.mjs';
import {
  assertLegacyWrite, changeDir, decideVerdict, gateResult, isMain, parseArgs, pct, readGates, runCli, writeGates,
} from './gate-store.mjs';

const SCENARIO_HEADER = /^####\s+Scenario:\s*(.+?)\s*$/;
const ANY_HEADING = /^#{1,6}\s/;
const ID_FIELD = /^- \*\*ID:\*\*\s*(\S+)\s*$/;
const FORM_FIELD = /^- \*\*Verificação:\*\*\s*(check:\S+|teste)\s*$/;
const REQUIREMENT = /^###\s+Requirement:/m;
const DEFAULT_FORM = 'teste';
const CHECK_PREFIX = 'check:';
const STATUS_ORDER = ['fail', 'pass', 'skip'];
const RUN_STATE_FILES = ['run-state.json', 'run-state.json.prev'];
export const EVALUATOR = Object.freeze({ id: 'id', legacy: 'legacy-name' });
export const LEGACY_LIMITS = Object.freeze([
  'comparação por nome de cenário normalizado (minúsculas, sem acentos e pontuação) com o texto dos testes; o ID não é usado',
  'a comparação é por substring: um nome em comentário ou em outro arquivo de teste conta como cobertura (SG-012 não se aplica)',
  'aprovação legada não equivale à aceitação do novo harness, que exige [ID] no nome de cada caso de teste',
]);

// Lê os cenários de um texto de spec: título, ID e forma de verificação.
export function parseScenarios(text) {
  const scenarios = [];
  let current = null;
  for (const line of text.split('\n')) {
    const header = line.match(SCENARIO_HEADER);
    if (header) {
      current = { title: header[1], id: null, form: DEFAULT_FORM };
      scenarios.push(current);
    } else if (ANY_HEADING.test(line)) {
      current = null;
    } else if (current) {
      const id = line.match(ID_FIELD);
      const form = line.match(FORM_FIELD);
      if (id) current.id = id[1];
      if (form) current.form = form[1];
    }
  }
  return scenarios;
}

function specFiles(specsDir) {
  if (!existsSync(specsDir)) return [];
  return walkFiles(specsDir)
    .filter((file) => file.endsWith('spec.md'))
    .map((file) => readFileSync(join(specsDir, file), 'utf8'));
}

export function scenariosIn(specsDir) {
  return specFiles(specsDir).flatMap(parseScenarios);
}

// Comportamento novo = o delta de specs declara ao menos um requisito.
export function hasNewBehavior(specsDir) {
  return specFiles(specsDir).some((text) => REQUIREMENT.test(text));
}

// Resultado do caso cujo nome contém [ID]. Falha vence; depois pass; depois skip.
export function statusForId(cases, id) {
  const hits = cases.filter((found) => found.name.includes(`[${id}]`));
  const status = STATUS_ORDER.find((candidate) => hits.some((found) => found.status === candidate));
  if (!status) return { status: 'missing', source: 'none' };
  return { status, source: hits.find((found) => found.status === status).source };
}

export function normalizeName(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Execução de modo runner grava run-state.json (ou .prev). Sem arquivo legível, não é legada.
function isRunnerExecution(root, change) {
  const dir = localDir(root, change);
  return RUN_STATE_FILES.some((file) => {
    const path = join(dir, file);
    if (!existsSync(path)) return false;
    try {
      return JSON.parse(readFileSync(path, 'utf8')).mode !== 'legacy';
    } catch {
      return true;
    }
  });
}

// Escolhe o avaliador sem decisão caso a caso. Sem nenhum **ID:** e sem run-state de modo
// runner, a change é legada. Não há fallback por nome quando faltar ID em change nova.
export function archiveEvaluator({ root, change, specsDir }) {
  const hasIds = specFiles(specsDir).some((text) => text.split('\n').some((line) => ID_FIELD.test(line)));
  return hasIds || isRunnerExecution(root, change) ? EVALUATOR.id : EVALUATOR.legacy;
}

// Avaliador legado: o nome normalizado do cenário aparece como substring no texto dos testes.
function legacyCases(root, scenarios) {
  const testText = listTestFiles(root).map((file) => normalizeName(readFileSync(join(root, file), 'utf8'))).join('\n');
  return scenarios.map((scenario) => ({
    id: scenario.title,
    status: testText.includes(normalizeName(scenario.title)) ? 'pass' : 'missing',
    source: 'nome',
    group: 'scenario',
  }));
}

async function idCases({ root, checks, suite, scenarios }) {
  const checkRuns = new Map();
  const cases = [];
  for (const scenario of scenarios) cases.push(await scenarioCase({ root, checks, suite, scenario, checkRuns }));
  return cases;
}

async function scenarioCase({ root, checks, suite, scenario, checkRuns }) {
  if (!scenario.id) return { id: `sem-id:${scenario.title}`, status: 'missing', source: 'none', group: 'scenario' };
  if (scenario.form === DEFAULT_FORM) {
    return { id: scenario.id, ...statusForId(suite.cases, scenario.id), group: 'scenario' };
  }
  const name = scenario.form.slice(CHECK_PREFIX.length);
  if (!checks[name]) return { id: scenario.id, status: 'missing', source: `${CHECK_PREFIX}${name}`, group: 'scenario' };
  if (!checkRuns.has(name)) checkRuns.set(name, await runCommand(checks[name], { cwd: root }));
  const run = checkRuns.get(name);
  return { id: scenario.id, status: run.code === 0 ? 'pass' : 'fail', source: `${CHECK_PREFIX}${name}`, group: 'scenario' };
}

async function checkCase(root, name, checks) {
  const run = await runCommand(checks[name], { cwd: root });
  return { id: name, status: run.code === 0 ? 'pass' : 'fail', source: `${CHECK_PREFIX}${name}`, group: 'check' };
}

// Avalia o arquivamento sem gravar nada. A aprovação da implementação, o nome da change e o
// diretório de specs vêm do chamador (a change ativa ou a arquivada). O resultado traz
// `evaluator` ('id' ou 'legacy-name') e, no legado, `evaluator_limits`.
export async function evaluateArchive({ root, change, specsDir, implementationApproved }) {
  const evaluator = archiveEvaluator({ root, change, specsDir });
  const withEvaluator = (result) => ({
    ...result,
    evaluator,
    evaluator_limits: evaluator === EVALUATOR.legacy ? [...LEGACY_LIMITS] : [],
  });
  if (!implementationApproved) {
    return withEvaluator(gateResult({
      gate: 'archive',
      passed: false,
      failures: 1,
      evidence: { reason: 'o gate de implementação não está em pass; rode spec-implement antes de arquivar' },
    }));
  }
  const behavior = hasNewBehavior(specsDir);
  const checks = loadChecks(root, behavior ? ['test'] : ['test', 'lint', 'typecheck']);
  const suite = await runSuite(root, checks.test);
  const suitePassed = suite.code === 0;

  const cases = [];
  const reasons = [];
  if (behavior) {
    const scenarios = scenariosIn(specsDir);
    if (scenarios.length === 0) reasons.push('no_scenarios');
    cases.push(...(evaluator === EVALUATOR.legacy
      ? legacyCases(root, scenarios)
      : await idCases({ root, checks, suite, scenarios })));
  } else {
    cases.push(await checkCase(root, 'lint', checks), await checkCase(root, 'typecheck', checks));
  }

  const nonPass = cases.filter((found) => found.status !== 'pass').length;
  const failures = (suitePassed ? 0 : 1) + nonPass + reasons.length;
  const scenarioCases = cases.filter((found) => found.group === 'scenario');
  const covered = scenarioCases.filter((found) => found.status === 'pass').length;
  return withEvaluator(gateResult({
    gate: 'archive',
    passed: suitePassed && failures === 0,
    failures,
    cases,
    evidence: {
      suite_passed: suitePassed,
      behavior,
      reasons,
      scenarios: { total: scenarioCases.length, covered, pct: pct(covered, scenarioCases.length) },
      missing: scenarioCases.filter((found) => found.status === 'missing').map((found) => found.id),
    },
  }));
}

export async function scoreArchive({ root, change, note = '', legacyWrite = false }) {
  if (legacyWrite) assertLegacyWrite(root, change);
  const gates = readGates(root, change);
  const dir = changeDir(root, change);
  // Conclusão supervisionada (simplify-approval-and-execution) substitui o veredito de implementação,
  // sem alterar gates.json. O registro só vale para o hash atual do contrato.
  const approved = gates.implement?.attempts?.at(-1)?.verdict === 'pass' || readSupervisedCompletion(dir).valid;
  const specsDir = join(dir, 'specs');
  const result = await evaluateArchive({ root, change, specsDir, implementationApproved: approved });
  const previous = gates.archive?.attempts ?? [];
  const attempt = {
    attempt: previous.length + 1,
    at: new Date().toISOString(),
    note,
    ...result,
    verdict: approved ? decideVerdict(result, previous) : 'stop',
    written: legacyWrite,
  };
  if (legacyWrite) writeGates(root, change, { ...gates, archive: { attempts: [...previous, attempt] } });
  return attempt;
}

if (isMain(import.meta.url)) {
  const { options } = parseArgs(['score', ...process.argv.slice(2)]);
  const legacyWrite = options['legacy-write'] === true;
  runCli(async () => {
    if (!options.change) throw new ChecksError('uso: archive-gate.mjs --change <nome> [--note <texto>] [--legacy-write] [--root <dir>]');
    return scoreArchive({ root: options.root ?? process.cwd(), change: options.change, note: options.note ?? '', legacyWrite });
  });
}
