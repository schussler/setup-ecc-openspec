#!/usr/bin/env node
// Validação final da change (F7, D12 a D16, D27 a D31, AC-011 a AC-027, EV-005 a EV-014).
// Executa a suíte obrigatória (checks.test_report, ou o modo legado de checks.test), compara a identidade
// dos casos com os cenários e o manifesto de aceitação, verifica checks declarados, reaceitação após
// revisão e não aplicabilidade, e confere a impressão antes e depois. A invalidação de dependentes (A.3)
// marca evidências no resumo, sem aprovar. Aprovação válida grava o resumo durável (evidence-summary.json).
// archiveApproval confere esse resumo antes do arquivamento.
// Uso: node scripts/harness/validate.mjs <change> [--root <dir>] [--archive]
// Exit: 0 pass, 1 fail (reprova, pode corrigir), 2 stop (parada), 3 erro.
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkContract, identifiedAuthorizations, isDraftContract, parseScenarios, specFiles } from './contract.mjs';
import {
  MANIFEST_FILE, entriesOf, fileHash, loadAcceptanceManifest, normalizeName, scenarioBodyHash, scenarioStatus, tagsOf,
} from './acceptance.mjs';
import {
  textChangesWithoutRevision, computeInvalidation, markInvalidated, revisionChanges, scenarioText,
} from './invalidation.mjs';
import {
  authorizationsIntegrity, changedCodePaths, compareProtected, defaultRuntime, fingerprint, headCommit, hasUncommittedChanges,
  protectedSnapshot, readTemplate, sha256, sortKeys,
} from './evidence.mjs';
import { changeDir } from './identity.mjs';
import { ConfigError, loadPolicy } from './policy.mjs';
import { SCHEMA_VERSION, loadState, writeFileAtomic } from './state.mjs';
import { runTestReport, statusForId } from './test-report.mjs';
import { ChecksError, runCommand, validateChecksSchema } from '../gates/checks.mjs';

export const SUMMARY_FILE = 'evidence-summary.json';
export { MANIFEST_FILE };
export const ISOLATION_DECLARATION = 'A v1 detecta alterações sem isolar o executor: a separação de papéis não equivale a isolamento do avaliador, o bloqueio de execução é advisory e um executor com a mesma conta pode alterar arquivos e hashes.';
const TURNS_LIMITATION = 'limite de turnos não garantido: sem probe_result enforced humano (sonda P.2 não autorizada, D6)';
const LEGACY_LIMITATION = 'modo legado compatível: checks.test sem checks.test_report, sem identidade de suíte (AC-023)';
const CHECK_PREFIX = 'check:';
const TEST_FORM = 'teste';
const SUITE_ID = '<suite>';
const REVISION_KIND = 'revision';
const HUMAN = 'human';
const MS_PER_SECOND = 1000;
const EXIT_BY_VERDICT = { pass: 0, fail: 1, stop: 2 };
const SCENARIO_CHANGE = 'scenario_change';
const PURPOSE_ADEQUACY = 'test_adequacy';
const PURPOSE_SUFFICIENCY = 'sufficiency';
const PURPOSE_EXCEPTION = 'exception';
const DESIGN_FILE = 'design.md';
const INVALIDATED_STOP = 'evidence_invalidated';
const STOP_CODE_BY_FAILURE = [
  ['invalid_evidence', 'invalid_evidence'],
  ['sufficiency_missing', 'human_decision_needed'],
  ['adequacy_missing', 'human_decision_needed'],
];
const CONDITIONS = [
  {
    pattern: /quando houver formato (\S+)/i,
    holds: (match, facts) => (typeof facts.format === 'string' ? facts.format.toLowerCase() === match[1].toLowerCase() : null),
  },
  {
    pattern: /quando houver chamada paga/i,
    holds: (_match, facts) => (typeof facts.paid_calls === 'number' ? facts.paid_calls > 0 : null),
  },
];

const scenarioId = (scenario) => scenario.fields.ID ?? null;
const revisionOf = (scenario) => Number(scenario.fields['Revisão']);
const verificationOf = (scenario) => scenario.fields['Verificação'] || TEST_FORM;
const isYes = (value) => /^(sim|yes|true)$/i.test((value ?? '').trim());

// Condição de disparo avaliada pelo runner (AC-021). Verdadeiro/falso, ou null quando não é avaliável.
export function conditionHolds(text, facts) {
  const rule = CONDITIONS.map((item) => ({ item, match: text.match(item.pattern) })).find((entry) => entry.match);
  return rule ? rule.item.holds(rule.match, facts) : null;
}

// Cenário não aplicável só quando a condição é avaliada como falsa. Condição não avaliada é obrigatória
// e gera um aviso explícito (AC-027). notice vem preenchido só nesse caso.
export function evaluateApplicability(scenario, facts) {
  if (!isYes(scenario.fields['Não aplicável'])) return { required: true, reason: 'sem não aplicabilidade declarada', notice: null };
  const text = scenario.fields['Condição de disparo'] ?? '';
  const holds = conditionHolds(text, facts);
  if (holds === false) return { required: false, reason: 'condição de disparo falsa nesta execução', notice: null };
  if (holds === true) return { required: true, reason: 'condição de disparo verdadeira', notice: null };
  return { required: true, reason: 'condição não avaliada: cenário exigido', notice: `condição não avaliada: ${text}` };
}

// Configuração da suíte obrigatória (D12, D27): modo suite com checks.test_report, ou modo legado (AC-023).
export function testReportConfig(checks) {
  let schema;
  try {
    schema = validateChecksSchema(checks);
  } catch (err) {
    if (err instanceof ChecksError) throw new ConfigError(err.message);
    throw err;
  }
  if (schema.mode === 'suite') {
    return {
      mode: 'suite', command: schema.reportCommand, format: schema.format, suite: schema.suite, testCommand: schema.command,
      fileCommand: schema.fileCommand ?? null, files: schema.files ?? null,
    };
  }
  if (typeof schema.command !== 'string' || schema.command.trim() === '') throw new ConfigError('checks.test ausente em template.json');
  return { mode: 'legacy', command: schema.command, format: null, suite: schema.suite, testCommand: schema.command, fileCommand: null, files: null };
}

function readJsonIfExists(path, description) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new ConfigError(`${description} ilegível (${err.message}): ${path}`);
  }
}

export function readSummary(dir) {
  return readJsonIfExists(join(dir, SUMMARY_FILE), 'resumo durável');
}

function loadScenarios(dir) {
  return specFiles(join(dir, 'specs')).flatMap((path) => parseScenarios(readFileSync(path, 'utf8')));
}

function readDesign(dir) {
  const path = join(dir, DESIGN_FILE);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function revokedIds(records) {
  return new Set(records.map((record) => record?.revokes).filter(Boolean));
}

// Autorização revision humana válida (não revogada) com finalidade e escopo (D29, D30).
// A finalidade é comparada sem valor padrão: registro sem purpose não vale para nenhuma alteração (A.3, item E).
export function scopedAuthorization(records, change, id, { purpose, revision = null, cases = null }) {
  const revoked = revokedIds(records);
  return records.some((record) => record?.kind === REVISION_KIND && record.origin === HUMAN && !revoked.has(record.id)
    && record.purpose === purpose
    && record.scope?.change === change && record.scope?.scenario === id
    && (revision === null || record.scope?.revision === revision)
    && (cases === null || cases.every((caseId) => (record.scope?.cases ?? []).includes(caseId))));
}

// Cenários com exceção humana válida (purpose exception, D30, D32): a chave do registro (policy_key) precisa
// estar em allowed_exceptions da política. Sem chave prevista, a exceção não dispensa o cenário (RC-049).
function exceptedIds(records, change, allowedExceptions) {
  const revoked = revokedIds(records);
  return new Set(records
    .filter((record) => record?.kind === REVISION_KIND && record.origin === HUMAN && !revoked.has(record.id)
      && record.purpose === PURPOSE_EXCEPTION && record.scope?.change === change
      && allowedExceptions.includes(record.policy_key))
    .map((record) => record.scope?.scenario));
}

// Casos do manifesto que não valem mais: revisão diferente do cenário, ou arquivo alterado (AC-019, AC-025).
function staleCaseFailures(root, required, manifest) {
  const revisionById = new Map(required.map((item) => [scenarioId(item), revisionOf(item)]));
  return manifest.entries.flatMap((entry) => {
    const bodyChanged = fileHash(root, entry.file, entry.helpers) !== entry.file_hash;
    return entry.scenario_ids.filter((id) => revisionById.has(id)).flatMap((id) => {
      const failures = [];
      if (entry.scenario_revisions[id] !== revisionById.get(id)) {
        failures.push({ id, code: 'invalid_evidence', message: `caso executado na revisão ${entry.scenario_revisions[id]}; o cenário está na ${revisionById.get(id)} (AC-019)` });
      }
      if (bodyChanged) {
        failures.push({ id, code: 'invalid_evidence', message: `file_hash de "${entry.case_id}" diverge do manifesto: arquivo ou helper alterado (AC-025)` });
      }
      return failures;
    });
  });
}

// Tags [ID] do nome de caso que não são cenários declarados na change: vínculo ambíguo (A.3, item B).
function linkFailures(manifest, declaredIds) {
  return manifest.entries.flatMap((entry) => tagsOf(entry.test_name)
    .filter((tag) => !declaredIds.has(tag))
    .map((tag) => ({
      id: tag,
      code: 'ambiguous_link',
      message: `vínculo ambíguo: o caso "${entry.test_name}" cita [${tag}], que não é cenário declarado nesta change`,
    })));
}

// Casos de cenários com verificação teste: identidade pelo manifesto ou pela tag [ID] (AC-003, AC-015, AC-026).
function evaluateTestScenarios(suite, required, manifest) {
  const expected = required.filter((scenario) => verificationOf(scenario) === TEST_FORM);
  const cases = [];
  const failures = [];
  for (const scenario of expected.filter((item) => !scenarioId(item))) {
    failures.push({ id: scenario.name, code: 'sem_id', message: 'cenário sem ID' });
  }
  const ids = [...new Set([...expected.map(scenarioId), ...manifest.entries.flatMap((entry) => entry.scenario_ids)])].filter(Boolean);
  for (const id of ids) {
    const entries = entriesOf(manifest, id);
    const found = entries.length > 0
      ? { status: scenarioStatus(suite.cases, entries), source: 'tap' }
      : statusForId(suite.cases, id);
    cases.push({ id, status: found.status, source: found.source, group: 'scenario' });
    if (found.status !== 'pass') failures.push({ id, code: found.status, message: `caso [${id}] ${found.status}` });
  }
  return { cases, failures };
}

// Reaceitação de cenário invalidado (D29, EV-014): para cada cenário invalidado por revisão ou por dependência,
// (a) adequação dos testes, (b) suficiência quando o file_hash não mudou, e (c) execução pass na revisão atual,
// que está em evaluateTestScenarios. Atualizar o manifesto não basta.
function reacceptanceFailures({ required, invalidated, manifest, previous, records, change }) {
  return required.filter((item) => invalidated.has(scenarioId(item))).flatMap((item) => {
    const id = scenarioId(item);
    const current = revisionOf(item);
    const entries = entriesOf(manifest, id);
    if (entries.length === 0) return [{ id, code: 'invalid_evidence', message: 'invalidado sem caso no manifesto de aceitação (EV-007)' }];
    if (entries.some((entry) => entry.scenario_revisions[id] !== current)) return [];
    const caseIds = entries.map((entry) => entry.case_id);
    const failures = [];
    if (!scopedAuthorization(records, change, id, { purpose: PURPOSE_ADEQUACY, revision: current, cases: caseIds })) {
      failures.push({ id, code: 'adequacy_missing', message: 'invalidado: falta adequação dos testes registrada por humano (autorização revision com purpose test_adequacy, EV-014)' });
    }
    const prior = previous?.scenarios?.[id];
    const bodyUnchanged = prior && prior.file_hash === scenarioBodyHash(entries.map((entry) => entry.file_hash));
    if (bodyUnchanged && !scopedAuthorization(records, change, id, { purpose: PURPOSE_SUFFICIENCY, revision: current, cases: caseIds })) {
      failures.push({ id, code: 'sufficiency_missing', message: 'invalidado com arquivo de teste inalterado: falta justificativa de suficiência aprovada por humano (AC-020, EV-014)' });
    }
    return failures;
  });
}

// Checks declarados por cenário check:<nome>. Cada nome roda uma vez (AC-018).
async function runCheckScenarios(root, checks, scenarios, timeoutMs) {
  const cases = [];
  const failures = [];
  const runs = new Map();
  for (const scenario of scenarios) {
    const id = scenarioId(scenario);
    const name = verificationOf(scenario).slice(CHECK_PREFIX.length);
    const source = `${CHECK_PREFIX}${name}`;
    if (!id) {
      failures.push({ id: scenario.name, code: 'sem_id', message: 'cenário sem ID' });
    } else if (typeof checks[name] !== 'string') {
      cases.push({ id, status: 'missing', source, group: 'scenario' });
      failures.push({ id, code: 'missing', message: `check "${name}" não declarado em checks` });
    } else {
      if (!runs.has(name)) runs.set(name, await runCommand(checks[name], { cwd: root, timeoutMs }));
      const run = runs.get(name);
      const passed = run.code === 0 && !run.timedOut;
      cases.push({ id, status: passed ? 'pass' : 'fail', source, group: 'scenario' });
      if (!passed) failures.push({ id, code: 'check_failed', message: `check "${name}" saiu com código ${run.code}` });
    }
  }
  return { cases, failures };
}

function snapshotState(root, change, runtime, profilePath) {
  const print = fingerprint({ root, change, runtime, profilePath });
  return { protected: protectedSnapshot({ root, change }), fingerprint: print.fingerprint, parts: print.parts };
}

function stopReasonOf(failures) {
  const found = STOP_CODE_BY_FAILURE.find(([code]) => failures.some((failure) => failure.code === code));
  return found ? found[1] : null;
}

function stateOf(verdict, stopReason) {
  if (verdict === 'pass') return 'approved';
  if (verdict === 'fail') return 'awaiting_gate';
  if (stopReason === 'protected_change') return 'forbidden_action_stopped';
  if (stopReason === 'config_error') return 'config_blocked';
  return 'awaiting_decision';
}

function outcome({ change, executionId, verdict, stopReason = null, failures = [], cases = [], message = null, protectedChanges = [], notices = [], extra = {} }) {
  return {
    change,
    execution_id: executionId,
    verdict,
    approved: verdict === 'pass',
    stop_reason: stopReason,
    state: stateOf(verdict, stopReason),
    message,
    failures,
    cases,
    notices,
    protected_changes: protectedChanges,
    declarations: { isolation: ISOLATION_DECLARATION },
    ...extra,
  };
}

function formatContractError(error) {
  return `${error.code} ${error.file}${error.scenario ? ` › ${error.scenario}` : ''}: ${error.message}`;
}

function limitationsOf(records, mode) {
  const turnsEnforced = records.some((record) => record?.kind === 'probe_result' && record.origin === HUMAN && record.result === 'enforced');
  const base = turnsEnforced ? [ISOLATION_DECLARATION] : [ISOLATION_DECLARATION, TURNS_LIMITATION];
  return mode === 'legacy' ? [...base, LEGACY_LIMITATION] : base;
}

function consumptionOf(state) {
  if (!state) return { reported_usd: 0, estimated_usd: 0, unknown_calls: 0, source: 'sem-run-state' };
  return {
    reported_usd: state.consumption.known_usd,
    estimated_usd: state.consumption.estimated_usd,
    unknown_calls: state.consumption.unknown_calls,
    source: 'run-state',
  };
}

const INVENTORY_STATUSES = ['pass', 'fail', 'skip', 'todo'];
const SUBTEST_SEPARATOR = ' > ';

const FILE_SEPARATOR = '::';

// Nome completo do caso: subtestes ancestrais e o próprio caso, normalizados e unidos por " > ".
const fullNameOf = (item) => [...(item.path ?? []), item.name].map(normalizeName).join(SUBTEST_SEPARATOR);

// Entrada do manifesto do caso: pelo arquivo e nome quando o caso traz o arquivo (file_command), senão
// pelo nome normalizado (D28).
function manifestEntryOf(manifest, item) {
  const name = normalizeName(item.name);
  return manifest.entries.find((entry) => normalizeName(entry.test_name) === name
    && (item.file === undefined || entry.file === item.file));
}

// Identidade do caso no inventário (D28, EV-012). Regra:
// 1. execução por arquivo (file_command, AC-028): "<arquivo>::<nome completo>", com o arquivo da execução;
// 2. sem file_command e caso presente no manifesto (mesmo nome normalizado): o case_id do manifesto;
// 3. sem file_command e caso fora do manifesto: a saída TAP do Node não traz o arquivo do caso, então o
//    case_id é o nome completo (subtestes ancestrais e o caso unidos por " > "). Nome repetido nesse modo
//    reprova com inventory_ambiguous (AC-029): a colisão nunca é silenciosa.
function inventoryCaseId(item, entry) {
  if (item.file !== undefined) return `${item.file}${FILE_SEPARATOR}${fullNameOf(item)}`;
  if (entry) return entry.case_id;
  return fullNameOf(item);
}

// Inventário completo da suíte obrigatória (D16, EV-012): um item por caso executado, inclusive regressões
// sem vínculo (scenario_ids vazio). scenario_ids une as tags [ID] do nome e o vínculo do manifesto.
// Sem saída TAP bruta: só identidade, nome, resultado e vínculo.
export function caseInventory(suiteCases, manifest) {
  return suiteCases.map((item) => {
    const entry = manifestEntryOf(manifest, item);
    return {
      case_id: inventoryCaseId(item, entry),
      name: item.name,
      status: item.directive === 'todo' ? 'todo' : item.status,
      scenario_ids: [...new Set([...tagsOf(item.name), ...(entry?.scenario_ids ?? [])])],
    };
  });
}

// Contagens do inventário; tap_total vem da contagem independente da saída capturada (null no modo legado).
export function inventoryCounts(inventory, tapTotal) {
  const linked = inventory.filter((item) => item.scenario_ids.length > 0).length;
  return {
    total: inventory.length,
    tap_total: tapTotal ?? null,
    by_status: Object.fromEntries(INVENTORY_STATUSES.map((status) => [status, inventory.filter((item) => item.status === status).length])),
    linked,
    unlinked: inventory.length - linked,
  };
}

// Inventário que não bate com a TAP capturada não aprova (EV-012). A divergência vai para failures.
function inventoryFailures(counts) {
  if (counts.tap_total === null || counts.total === counts.tap_total) return [];
  return [{
    id: SUITE_ID,
    code: 'inventory_mismatch',
    message: `inventário com ${counts.total} casos; a TAP capturada tem ${counts.tap_total} linhas ok/not ok (EV-012)`,
  }];
}

const statusCounts = (cases) => Object.fromEntries(['pass', 'fail', 'skip']
  .map((status) => [status, cases.filter((item) => item.status === status).length]));

// Execução por arquivo (AC-028): a soma por arquivo precisa bater com a suíte, também por resultado, e
// nenhum arquivo pode exceder o tempo. A suíte é a autoridade; divergência não aprova.
function perFileFailures(suite) {
  if (suite.mode !== 'file') return [];
  const failures = [];
  const bySuite = statusCounts(suite.suite_cases);
  const byFile = statusCounts(suite.cases);
  const diverging = Object.keys(bySuite).filter((status) => bySuite[status] !== byFile[status]);
  if (diverging.length > 0) {
    const detail = diverging.map((status) => `${status}: suíte ${bySuite[status]}, por arquivo ${byFile[status]}`).join('; ');
    failures.push({ id: SUITE_ID, code: 'inventory_mismatch', message: `resultado por arquivo diverge da suíte (${detail}) (AC-028)` });
  }
  if (suite.files_timed_out.length > 0) {
    failures.push({ id: SUITE_ID, code: 'inventory_mismatch', message: `execução por arquivo excedeu o tempo: ${suite.files_timed_out.join(', ')} (AC-028)` });
  }
  return failures;
}

// Sem file_command, nomes completos repetidos não identificam o caso (AC-029): reprova e lista os nomes.
function ambiguityFailures(suite, format) {
  if (suite.mode === 'file' || format === null) return [];
  const seen = new Map();
  for (const item of suite.cases) {
    const name = fullNameOf(item);
    seen.set(name, (seen.get(name) ?? 0) + 1);
  }
  const repeated = [...seen].filter(([, count]) => count > 1).map(([name]) => name).sort();
  if (repeated.length === 0) return [];
  return [{
    id: SUITE_ID,
    code: 'inventory_ambiguous',
    message: `nomes de caso repetidos sem identidade por arquivo: ${repeated.map((name) => `"${name}"`).join(', ')}. `
      + 'Declare checks.test_report.file_command com {file} ou renomeie os casos (AC-029)',
  }];
}

function buildSummary({ root, change, executionId, runtime, policy, checks, testConfig, suite, manifest, required, cases, inventory, records, fp, contractItems }) {
  const state = loadState(root, change);
  const scenarioEntries = Object.fromEntries(required.filter(scenarioId).map((scenario) => {
    const id = scenarioId(scenario);
    const cased = cases.find((item) => item.id === id);
    const entries = entriesOf(manifest, id);
    return [id, {
      verification: verificationOf(scenario),
      revision: revisionOf(scenario),
      status: cased?.status ?? null,
      source: cased?.source ?? null,
      file_hash: entries.length > 0 ? scenarioBodyHash(entries.map((entry) => entry.file_hash)) : null,
      text_sha256: scenarioText(scenario),
    }];
  }));
  return {
    schema_version: SCHEMA_VERSION,
    policy_version: policy.version,
    change,
    verdict: 'pass',
    approved_at: new Date().toISOString(),
    fingerprint: fp.fingerprint,
    execution_id: executionId,
    contract: {
      sha256: fp.parts.contract_sha256,
      revisions: Object.fromEntries(required.filter((item) => scenarioId(item)).map((item) => [scenarioId(item), revisionOf(item)])),
    },
    contract_items: contractItems,
    code: {
      commit_base: headCommit(root),
      tree_sha256: fp.parts.code_tree_sha256,
      changed_paths: changedCodePaths(root, change),
      uncommitted: hasUncommittedChanges(root),
    },
    tests: {
      mode: testConfig.mode,
      suite: testConfig.suite,
      manifest_sha256: manifest.sha256,
      exit_code: suite.code,
      test_command_sha256: sha256(testConfig.testCommand),
      test_report_command_sha256: suite.command_sha256,
      file_command_sha256: suite.file_command_sha256,
      case_identity: suite.mode === 'file' ? 'file' : 'name',
      execution_id: executionId,
      output_path: suite.output_path,
      output_sha256: suite.output_sha256,
    },
    scenarios: scenarioEntries,
    environment: {
      node: runtime.node ?? null,
      claude: runtime.claude ?? null,
      openspec: runtime.openspec ?? null,
      checks_sha256: fp.parts.checks_sha256,
      test_report_sha256: sha256(JSON.stringify(sortKeys(checks.test_report ?? null))),
      profile_path: fp.parts.profile_path,
      profile_sha256: fp.parts.profile_sha256,
      profile_content: fp.parts.profile_content,
      policy_version: policy.version,
      schema_version: SCHEMA_VERSION,
    },
    limitations: limitationsOf(records, testConfig.mode),
    declarations: { isolation: ISOLATION_DECLARATION },
    consumption: consumptionOf(state),
    reservations: {
      pending: state ? state.open_reservations.length : 0,
      reconciliations: records.filter((record) => record?.kind === 'reconciliation' && record.origin === HUMAN)
        .map((record) => record.reconciliation_id ?? record.id),
    },
    authorizations: records.map((record) => record.id),
    // Dois blocos distintos (EV-012): cases é o inventário por caso; scenarios, o resultado por cenário.
    cases: inventory.cases,
    case_counts: inventory.counts,
  };
}

// Revisão e texto de cenário sem autorização para a validação (EV-008). Em rascunho, não se exige (HI-013).
// Não calcula dependentes: isso é a invalidação, feita depois da validação do contrato.
function revisionGate(change, scenarios, previous, records, draft) {
  if (draft) return { stop: null };
  const textOnly = textChangesWithoutRevision(previous, scenarios);
  if (textOnly.length > 0) {
    return { stop: { reason: 'protected_change', ids: textOnly, message: `texto de cenário alterado sem nova revisão: ${textOnly.join(', ')} (EV-008)` } };
  }
  const unauthorized = revisionChanges(previous, scenarios)
    .filter((item) => !scopedAuthorization(records, change, item.id, { purpose: SCENARIO_CHANGE, revision: item.to }));
  if (unauthorized.length > 0) {
    const ids = unauthorized.map((item) => item.id);
    return { stop: { reason: 'protected_change', ids, message: `revisão de cenário sem autorização de revisão: ${ids.join(', ')} (EV-008)` } };
  }
  return { stop: null };
}

async function runValidation({ root, change, executionId, runtime, profilePath, paidCalls }) {
  const dir = changeDir(root, change);
  const policy = loadPolicy(root);
  const checks = readTemplate(root).checks ?? {};
  const testConfig = testReportConfig(checks);
  const timeoutMs = (policy.max_seconds_per_gate ?? 0) * MS_PER_SECOND;
  // Só registros identificados (projeto e change) valem como autorização; os demais são erro (D32, RC-050).
  const { records, errors } = identifiedAuthorizations(dir);
  if (errors.length > 0) throw new ConfigError(`authorizations.json ilegível: ${errors[0].message}`);
  const integrity = authorizationsIntegrity(root, change);
  if (!integrity.ok) {
    return outcome({ change, executionId, verdict: 'stop', stopReason: 'protected_change', protectedChanges: [integrity.path], message: 'authorizations.json alterado fora de authorize record (D31)' });
  }
  const scenarios = loadScenarios(dir);
  const previous = readSummary(dir);
  const gate = revisionGate(change, scenarios, previous, records, isDraftContract(dir));
  if (gate.stop) {
    return outcome({ change, executionId, verdict: 'stop', stopReason: gate.stop.reason, message: gate.stop.message, protectedChanges: gate.stop.ids });
  }
  const contractErrors = checkContract(dir, { checks: Object.keys(checks) });
  if (contractErrors.length > 0) {
    return outcome({ change, executionId, verdict: 'stop', stopReason: 'config_error', message: contractErrors.map(formatContractError).join('; ') });
  }
  // Invalidação (A.3): calcula dependentes, recusa referência inválida e marca as evidências. Não aprova nada.
  const invalidation = computeInvalidation({ scenarios, designText: readDesign(dir), previous });
  markInvalidated(dir, invalidation.marks);
  const manifest = loadAcceptanceManifest(dir);
  const facts = { format: testConfig.format, paid_calls: paidCalls ?? null };
  const excepted = exceptedIds(records, change, policy.allowed_exceptions);
  const decisions = scenarios.map((scenario) => ({ scenario, ...evaluateApplicability(scenario, facts) }));
  const notices = decisions.filter((item) => item.notice).map((item) => item.notice);
  const required = decisions.filter((item) => item.required && !excepted.has(scenarioId(item.scenario))).map((item) => item.scenario);
  const declaredIds = new Set(scenarios.map(scenarioId).filter(Boolean));
  const before = snapshotState(root, change, runtime, profilePath);
  const checkRun = await runCheckScenarios(root, checks, required.filter((item) => verificationOf(item).startsWith(CHECK_PREFIX)), timeoutMs);
  const suite = await runTestReport({
    root, change, command: testConfig.command, executionId, format: testConfig.format, timeoutMs, fileCommand: testConfig.fileCommand,
    files: testConfig.files,
  });
  const after = snapshotState(root, change, runtime, profilePath);
  const protectedChanges = compareProtected(before.protected, after.protected);
  if (protectedChanges.length > 0) {
    return outcome({ change, executionId, verdict: 'stop', stopReason: 'protected_change', protectedChanges, message: 'caminho protegido alterado durante a validação' });
  }
  if (before.fingerprint !== after.fingerprint) {
    return outcome({ change, executionId, verdict: 'stop', stopReason: 'invalid_evidence', message: 'impressão alterada durante a validação (EV-006)' });
  }
  const tests = evaluateTestScenarios(suite, required, manifest);
  const reacceptance = reacceptanceFailures({
    required, invalidated: invalidation.invalidated, manifest, previous, records, change,
  });
  const inventoryCases = caseInventory(suite.cases, manifest);
  const inventory = { cases: inventoryCases, counts: inventoryCounts(inventoryCases, suite.reported_total) };
  const failures = [
    ...checkRun.failures,
    ...tests.failures,
    ...linkFailures(manifest, declaredIds),
    ...staleCaseFailures(root, required, manifest),
    ...reacceptance,
    ...inventoryFailures(inventory.counts),
    ...perFileFailures(suite),
    ...ambiguityFailures(suite, testConfig.format),
  ];
  if (suite.timedOut || suite.code !== 0) {
    failures.push({ id: SUITE_ID, code: 'suite_exit', message: `suíte "${testConfig.suite ?? testConfig.mode}" saiu com código ${suite.code}` });
  }
  const cases = [...checkRun.cases, ...tests.cases];
  const stopReason = stopReasonOf(failures);
  if (stopReason) return outcome({ change, executionId, verdict: 'stop', stopReason, failures, cases, notices, message: 'validação não aprovada' });
  if (failures.length > 0) return outcome({ change, executionId, verdict: 'fail', failures, cases, notices, message: 'validação reprovada' });
  const summary = buildSummary({
    root, change, executionId, runtime, policy, checks, testConfig, suite, manifest, required, cases, inventory, records, fp: after, contractItems: invalidation.digests,
  });
  writeFileAtomic(join(dir, SUMMARY_FILE), `${JSON.stringify(summary, null, 2)}\n`);
  return outcome({
    change, executionId, verdict: 'pass', cases, notices,
    extra: { mode: testConfig.mode, summary_path: toPosix(relative(root, join(dir, SUMMARY_FILE))), output_path: suite.output_path },
  });
}

const toPosix = (path) => path.split(sep).join('/');

// Validação final da change. Não lança para configuração: devolve stop com stop_reason.
// paidCalls: número de invocações pagas desta execução (condição "quando houver chamada paga", D30); ausente = não avaliável.
export async function validateChange({ root, change, executionId = randomUUID(), runtime = defaultRuntime(), profilePath, paidCalls } = {}) {
  try {
    return await runValidation({ root, change, executionId, runtime, profilePath, paidCalls });
  } catch (err) {
    if (err instanceof ConfigError) {
      return outcome({ change, executionId, verdict: 'stop', stopReason: err.stopReason ?? 'config_error', message: err.message });
    }
    throw err;
  }
}

// Confere o resumo durável antes do arquivamento: impressão igual e saída capturada presente (EV-005, EV-013).
// Resumo com marcas de invalidação não arquiva (A.3): a invalidação não aprova, e a reaceitação limpa as marcas.
export function archiveApproval({ root, change, runtime = defaultRuntime(), profilePath }) {
  const summary = readSummary(changeDir(root, change));
  if (summary === null) {
    return { approved: false, execution_id: null, reasons: [{ code: 'sem_resumo', message: 'sem resumo durável: a validação final precisa ser executada (EV-013)' }] };
  }
  const reasons = [];
  if (summary.verdict !== 'pass') reasons.push({ code: 'verdict_not_pass', message: 'o resumo durável não é de aprovação' });
  if (Object.keys(summary.invalidated ?? {}).length > 0) {
    reasons.push({ code: INVALIDATED_STOP, message: `evidência invalidada: ${Object.keys(summary.invalidated).join(', ')}; reaceitação e validação final (EV-014)` });
  }
  if (fingerprint({ root, change, runtime, profilePath }).fingerprint !== summary.fingerprint) {
    reasons.push({ code: 'fingerprint_changed', message: 'código ou artefatos mudaram depois da aprovação: nova validação final (EV-005)' });
  }
  const captured = join(root, summary.tests.output_path);
  if (!existsSync(captured) || sha256(readFileSync(captured)) !== summary.tests.output_sha256) {
    reasons.push({ code: 'revalidation_required', message: 'saída capturada ausente ou alterada: revalidação obrigatória (EV-013)' });
  }
  return { approved: reasons.length === 0, execution_id: summary.execution_id, reasons };
}

function toolVersion(command) {
  try {
    return execFileSync(command, ['--version'], { encoding: 'utf8', timeout: 10 * MS_PER_SECOND }).trim();
  } catch {
    return 'indisponível';
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf('--root');
  const root = rootIndex === -1 ? process.cwd() : resolve(args[rootIndex + 1]);
  const rootValueIndex = rootIndex === -1 ? -1 : rootIndex + 1;
  const positional = args.filter((arg, index) => !arg.startsWith('--') && index !== rootValueIndex);
  const change = positional[0];
  if (!change) {
    console.log('uso: node scripts/harness/validate.mjs <change> [--root <dir>] [--archive]');
    process.exit(3);
  }
  const runtime = { node: process.version, claude: toolVersion('claude'), openspec: toolVersion('openspec') };
  if (args.includes('--archive')) {
    const check = archiveApproval({ root, change, runtime });
    console.log(JSON.stringify(check, null, 2));
    process.exit(check.approved ? 0 : 2);
  }
  validateChange({ root, change, runtime }).then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(EXIT_BY_VERDICT[result.verdict] ?? 3);
  });
}
