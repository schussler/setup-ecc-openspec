// RED e comportamento pré-existente da aceitação (F8, D10, D28, D29, AC-001 a AC-010).
// Classifica a falha esperada antes da implementação, registra o que já passa antes da alteração
// e recusa alteração de teste de aceitação aprovado sem registro de finalidade test_adequacy.
// A recusa usa a mesma regra de autorização de validate.mjs (scopedAuthorization) e a comparação
// de caminhos protegidos de evidence.mjs (compareProtected).
import { fileHash } from './acceptance.mjs';
import { compareProtected } from './evidence.mjs';
import { STATE_FORBIDDEN } from './machine.mjs';
import { scopedAuthorization } from './validate.mjs';

export const BEHAVIORAL = 'behavioral';
export const ENVIRONMENT = 'environment';
export const PREEXISTING_PASS = 'preexisting_pass';
export const MOCK_NOTICE = 'mock suspeito para revisão';
export const PURPOSE_ADEQUACY = 'test_adequacy';

const MISSING = 'ausente';
const PROTECTED_STOP_REASON = 'protected_change';

// Sinais de falha de ambiente: módulo, sintaxe, importação, configuração e comando (AC-007).
const ENVIRONMENT_SIGNALS = [
  /Cannot find (module|package)/,
  /MODULE_NOT_FOUND/,
  /ERR_UNKNOWN_FILE_EXTENSION|ERR_IMPORT|ERR_REQUIRE_ESM/,
  /SyntaxError/,
  /Failed to load/i,
  /command not found|comando não encontrado/i,
  /ENOENT/,
  /erro de importação|import error/i,
  /erro de configuração|configuration error|ConfigError/i,
];

// Sinais de asserção de comportamento: AssertionError, ou valor esperado e obtido (AC-008).
const BEHAVIORAL_SIGNALS = [
  /AssertionError|ERR_ASSERTION/,
  /\bexpected\b[\s\S]*\bactual\b|\bactual\b[\s\S]*\bexpected\b/i,
];

// Sinais de mock ou stub que devolve undefined: o teste quebra antes de qualquer asserção de valor.
const MOCK_SIGNALS = [/of undefined|undefined is not|returned undefined/, /devolveu undefined/];

const NOT_IMPLEMENTED = /NotImplemented/;

const hasEnvironmentSignal = (text) => ENVIRONMENT_SIGNALS.some((pattern) => pattern.test(text));
const hasBehavioralSignal = (text) => BEHAVIORAL_SIGNALS.some((pattern) => pattern.test(text));

// Classifica a saída de uma falha de RED. Ambíguo, vazio ou com sinal de ambiente vira environment,
// porque só falha de comportamento conta como RED válido (AC-007, AC-008).
export function classifyRedFailure(output) {
  const text = typeof output === 'string' ? output : '';
  if (text === '' || hasEnvironmentSignal(text)) return ENVIRONMENT;
  return hasBehavioralSignal(text) ? BEHAVIORAL : ENVIRONMENT;
}

// Aceita um caso como RED quando ele falhou por comportamento. Um stub NotImplemented sem asserção
// de comportamento é recusado com o motivo próprio; um caso que passou não é RED.
export function acceptRed(caseResult) {
  const output = caseResult?.output ?? '';
  const classification = classifyRedFailure(output);
  if (caseResult?.status === 'pass') return { accepted: false, classification, reason: 'no_failure' };
  if (classification === BEHAVIORAL) return { accepted: true, classification, reason: null };
  const reason = NOT_IMPLEMENTED.test(output) ? 'not_implemented' : 'environment';
  return { accepted: false, classification, reason };
}

// Falha de mock: a saída mostra undefined sem asserção de valor, ou o caller marcou o caso como mock.
function isMockFailure(item) {
  const text = item.output ?? '';
  if (hasBehavioralSignal(text)) return false;
  return item.mock === true || MOCK_SIGNALS.some((pattern) => pattern.test(text));
}

// Status do caso e aviso. A heurística de mock (AC-010) só gera aviso para revisão humana: não comprova
// conformidade, não aprova e não reprova, e não muda o status do caso.
function preexistingOf(item) {
  if (item.status === 'pass') return { status: PREEXISTING_PASS };
  if (item.status === 'skip') return { status: 'preexisting_skip' };
  return isMockFailure(item) ? { status: 'preexisting_fail', notice: MOCK_NOTICE } : { status: 'preexisting_fail' };
}

// Registra o comportamento pré-existente antes da alteração (AC-009, AC-010). Falha não é fabricada:
// cada caso mantém o próprio estado. Sem nenhum caso, a caracterização deve ser criada pelo spec-accept
// e passar no código atual antes de qualquer alteração.
export function recordPreexisting(cases = []) {
  const records = cases.map((item) => ({ name: item.name, ...preexistingOf(item) }));
  return { records, characterization_needed: cases.length === 0 };
}

// Identidade da aprovação: o file_hash guardado no manifesto por arquivo.
function approvedDigests(entries) {
  return Object.fromEntries(entries.map((entry) => [entry.file, entry.file_hash]));
}

// Hash atual de cada arquivo de teste de aceitação, com os helpers declarados (D28).
function currentDigests(root, entries) {
  return Object.fromEntries(entries.map((entry) => [entry.file, fileHash(root, entry.file, entry.helpers) ?? MISSING]));
}

// Um arquivo alterado está autorizado quando todo caso dele tem, para cada cenário, registro humano
// do tipo revision com finalidade test_adequacy e escopo de casos que inclui o caso (D29).
function fileAuthorized(file, entries, change, records) {
  return entries
    .filter((entry) => entry.file === file)
    .every((entry) => entry.scenario_ids.every((id) => scopedAuthorization(records, change, id, {
      purpose: PURPOSE_ADEQUACY, cases: [entry.case_id],
    })));
}

// Compara os testes de aceitação com o manifesto aprovado (AC-002). Alteração sem registro vai a
// forbidden_action_stopped com protected_change. Alteração registrada é permitida e listada em authorized_changes.
export function checkAcceptanceChange({ root, change, entries = [], records = [] }) {
  const before = { files: approvedDigests(entries), tasks: null, authorizations: null };
  const after = { files: currentDigests(root, entries), tasks: null, authorizations: null };
  const changed = compareProtected(before, after);
  const authorized = changed.filter((file) => fileAuthorized(file, entries, change, records));
  const unauthorized = changed.filter((file) => !authorized.includes(file));
  const stopped = unauthorized.length > 0;
  return {
    state: stopped ? STATE_FORBIDDEN : null,
    stop_reason: stopped ? PROTECTED_STOP_REASON : null,
    protected_changes: unauthorized,
    authorized_changes: authorized,
  };
}
