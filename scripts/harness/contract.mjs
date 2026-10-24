#!/usr/bin/env node
// Regras de contrato dos cenários (harness-interview, HI-003 a HI-011).
// O openspec validate não conhece estas regras. A validação completa do contrato é
// `openspec validate <change> --strict` seguido de `node scripts/harness/contract.mjs <changeDir>`.
// Aprovação humana: o campo deve ser `auth:<id>`, com <id> de um registro kind "revision"
// em authorizations.json, sem revogação. Texto livre ou booleano não é aprovação.
// Uso: node scripts/harness/contract.mjs <changeDir>
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorizationIdentityIssues, calculateContractHash } from './identification.mjs';
import { projectId } from './identity.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERIFICATION_TEST = 'teste';
const CHECK_FORM = /^check:(\S+)$/;
const AUTH_FORM = /^auth:(\S+)$/;
const REVISION_KIND = 'revision';
const CONTRACT_APPROVAL = 'contract_approval';
const HUMAN_ORIGIN = 'human';
// HI-015: aprovação do contrato não corresponde ao hash atual (RC-047). HI-016: autorização sem identificação válida (RC-050).
const APPROVAL_MISMATCH_CODE = 'HI-015';
const IDENTITY_CODE = 'HI-016';
const REVISION_FORM = /^[1-9]\d*$/;
const TRUTHY = /^(sim|yes|true)$/i;
const SCENARIO_HEADER = /^#### Scenario:\s*(.+?)\s*$/;
const FIELD = /^- \*\*(.+?):\*\*\s*(.*)$/;
const OTHER_HEADER = /^#{1,4} /;
const AUTHORIZATIONS_FILE = 'authorizations.json';
const DECLARATION_FILES = ['proposal.md', 'design.md'];
const BEHAVIOR_DECLARATION = /^\s*-\s*\*\*Comportamento novo:\*\*\s*(.*?)\s*$/m;
const BEHAVIOR_APPROVAL = /^\s*-\s*\*\*Aprovação:\*\*\s*(.*?)\s*$/m;
const CONTRACT_STATE_DECLARATION = /^\s*-\s*\*\*Estado do contrato:\*\*\s*(.*?)\s*$/m;
const DRAFT_STATE = 'rascunho';
const PROPOSAL_FILE = 'proposal.md';
const DEPENDS_ON_FIELD = 'Depende de';
const DESIGN_FILE = 'design.md';
const SHARED_SECTION = /^## Interfaces e regras compartilhadas\s*$/m;
const SLICES_SECTION = /^## Fatias\s*$/m;
const SECTION_END = /^## /m;
const SHARED_LINE = /^- ((?:IF|RG)-[A-Za-z0-9][A-Za-z0-9_-]*):\s*(.*?)\s*$/gm;
const SCENARIO_ID_FORM = /^[A-Z]{2}-\d{3}$/;
const SHARED_REFERENCE_FORM = /^(IF|RG)-[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SLICE_FORM = /^F\d+$/;
const NO_DEPENDENCY_MARKS = ['—', '-', ''];
// Finalidades de autorização "revision" (D29, D30; lista fechada em PURPOSES, no registro de autorizações).
// Aprovação de alteração de revisão exige scenario_change. Aprovação de não aplicável, verificação check e
// comportamento novo não aceitam finalidades que só certificam testes (test_adequacy, sufficiency). A exceção
// (exception) é outra coisa: ela dispensa um cenário obrigatório (D30), e é conferida pelo validador.
const TEST_CERTIFYING_PURPOSES = ['test_adequacy', 'sufficiency'];
export const APPROVAL_RULES = Object.freeze({
  revision: Object.freeze({ purposes: ['scenario_change'], label: 'alteração de revisão' }),
  notApplicable: Object.freeze({ forbidden: TEST_CERTIFYING_PURPOSES, label: 'não aplicável' }),
  item: Object.freeze({ forbidden: TEST_CERTIFYING_PURPOSES, label: 'verificação ou comportamento novo' }),
});

// Lista os spec.md de uma change, em qualquer profundidade de specs/.
export function specFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return specFiles(path);
    return entry.name === 'spec.md' ? [path] : [];
  });
}

// Extrai cenários e seus campos "- **Chave:** valor" até o próximo cabeçalho.
export function parseScenarios(text) {
  const scenarios = [];
  let current = null;
  for (const line of text.split('\n')) {
    const header = line.match(SCENARIO_HEADER);
    if (header) {
      current = { name: header[1], fields: {} };
      scenarios.push(current);
      continue;
    }
    if (OTHER_HEADER.test(line)) {
      current = null;
      continue;
    }
    const field = current && line.match(FIELD);
    if (field && !(field[1] in current.fields)) current.fields[field[1]] = field[2].trim();
  }
  return scenarios;
}

// Registros de authorizations.json: array JSON ou um objeto JSON por linha.
// Arquivo ausente equivale a nenhum registro.
export function loadAuthorizations(changeDir) {
  const path = join(changeDir, AUTHORIZATIONS_FILE);
  if (!existsSync(path)) return { records: [], errors: [] };
  const text = readFileSync(path, 'utf8').trim();
  if (text === '') return { records: [], errors: [] };
  try {
    const parsed = JSON.parse(text);
    return { records: Array.isArray(parsed) ? parsed : [parsed], errors: [] };
  } catch {
    // Não é um JSON único: tenta uma linha por registro.
  }
  const records = [];
  const errors = [];
  text.split('\n').forEach((line, index) => {
    if (line.trim() === '') return;
    try {
      records.push(JSON.parse(line));
    } catch {
      errors.push({ code: 'HI-009', file: AUTHORIZATIONS_FILE, scenario: null, message: `linha ${index + 1} não é JSON válido` });
    }
  });
  return { records, errors };
}

// Mapa id -> { problem, purpose } para cada registro. problem é null quando a autorização é
// revision, humana e não revogada; senão, o motivo. A finalidade é conferida por APPROVAL_RULES.
function revisionAuthorizations(records) {
  const revoked = new Set(records.map((record) => record?.revokes).filter(Boolean));
  const byId = new Map();
  for (const record of records) {
    if (!record || typeof record !== 'object' || typeof record.id !== 'string') continue;
    const purpose = record.purpose ?? null;
    if (record.kind !== REVISION_KIND) byId.set(record.id, { problem: `tipo "${record.kind}", não "${REVISION_KIND}"`, purpose });
    else if (revoked.has(record.id)) byId.set(record.id, { problem: 'revogado', purpose });
    else byId.set(record.id, { problem: null, purpose });
  }
  return byId;
}

// Devolve a mensagem de erro da aprovação, ou null quando ela referencia autorização válida
// com a finalidade exigida pela regra (APPROVAL_RULES). Sem regra, basta a autorização válida.
function approvalError(value, authById, rule = null) {
  if (!value) return 'aprovação ausente: use auth:<id> de autorização do tipo revision';
  const match = value.match(AUTH_FORM);
  if (!match) return `aprovação inválida "${value}": texto livre ou booleano não é aprovação, use auth:<id>`;
  if (!authById.has(match[1])) return `auth:${match[1]} não existe em ${AUTHORIZATIONS_FILE}`;
  const { problem, purpose } = authById.get(match[1]);
  if (problem) return `auth:${match[1]} inválida: ${problem}`;
  if (rule?.purposes && !rule.purposes.includes(purpose)) {
    return `auth:${match[1]} tem finalidade "${purpose}"; ${rule.label} exige: ${rule.purposes.join(' ou ')}`;
  }
  if (rule?.forbidden?.includes(purpose)) return `auth:${match[1]} tem finalidade "${purpose}", que não aprova ${rule.label}`;
  return null;
}

function defaultChecks() {
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'template.json'), 'utf8'));
  return Object.keys(manifest.checks ?? {});
}

// Estado do contrato declarado em proposal.md (HI-013, D21b). Sem declaração, o contrato
// é tratado como aprovado: a regra estrita vale até que o rascunho seja declarado.
export function isDraftContract(changeDir) {
  const path = join(changeDir, PROPOSAL_FILE);
  if (!existsSync(path)) return false;
  const match = readFileSync(path, 'utf8').match(CONTRACT_STATE_DECLARATION);
  if (!match) return false;
  return match[1].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase() === DRAFT_STATE;
}

function checkScenario(file, scenario, context) {
  const errors = [];
  const { name, fields } = scenario;
  const fail = (code, message) => errors.push({ code, file, scenario: name, message });
  const needsApproval = [];

  if (!fields.ID) fail('HI-003', 'cenário sem ID');
  const revision = fields['Revisão'];
  if (!revision) {
    fail('HI-003', 'cenário sem revisão');
  } else if (!REVISION_FORM.test(revision)) {
    fail('HI-003', `revisão inválida: ${revision}`);
  } else if (Number(revision) > 1 && !context.draft) {
    // Em rascunho a revisão é rastreada pelo número, sem autorização (HI-013).
    needsApproval.push(APPROVAL_RULES.revision);
  }

  const verification = fields['Verificação'] || VERIFICATION_TEST;
  const checkMatch = verification.match(CHECK_FORM);
  if (checkMatch) {
    if (!context.checks.has(checkMatch[1])) fail('HI-008', `check inexistente em checks: ${checkMatch[1]}`);
    if (!fields['Justificativa']) fail('HI-009', 'check sem justificativa');
    needsApproval.push(APPROVAL_RULES.item);
  } else if (verification !== VERIFICATION_TEST) {
    fail('HI-008', `forma de verificação inválida: ${verification}`);
  }

  if (TRUTHY.test(fields['Não aplicável'] ?? '')) {
    if (!fields['Condição de disparo']) fail('HI-011', 'cenário não aplicável sem condição de disparo');
    needsApproval.push(APPROVAL_RULES.notApplicable);
  }

  if (needsApproval.length > 0) {
    const labels = needsApproval.map((rule) => rule.label).join(', ');
    const message = needsApproval.map((rule) => approvalError(fields['Aprovação'], context.authById, rule)).find(Boolean);
    if (message) fail('HI-009', `${labels}: ${message}`);
  }
  return errors;
}

// Monta o contexto compartilhado: checks declarados e autorizações (com erros de leitura).
// Raiz do repositório e nome da change, a partir do diretório validado openspec/changes/<change> (D32).
function changeLocation(changeDir) {
  return { root: resolve(changeDir, '..', '..', '..'), change: basename(changeDir) };
}

// Registros com identificação válida (project_id do projeto e scope.change da change). O resto vira erro
// HI-016 e não vale como autorização (RC-050). Erros de leitura do arquivo continuam como estavam.
export function identifiedAuthorizations(changeDir) {
  const { records, errors } = loadAuthorizations(changeDir);
  const { root, change } = changeLocation(changeDir);
  const expected = projectIdOrNull(root);
  const identified = [];
  const identityErrors = [];
  records.forEach((record, index) => {
    const issues = expected === null ? ['project_id validado indisponível (.harness-project.json)'] : [];
    issues.push(...authorizationIdentityIssues(record, { projectId: expected ?? undefined, change }));
    if (issues.length === 0) identified.push(record);
    else identityErrors.push({ code: IDENTITY_CODE, file: AUTHORIZATIONS_FILE, scenario: null, message: `registro ${record?.id ?? index + 1} recusado: ${issues.join('; ')}` });
  });
  return { records: identified, errors: [...errors, ...identityErrors] };
}

function projectIdOrNull(root) {
  try {
    return projectId(root);
  } catch {
    return null;
  }
}

function buildContext(changeDir, options) {
  const { records, errors } = identifiedAuthorizations(changeDir);
  const checks = options.checks ?? defaultChecks();
  return { errors, checks: new Set(checks), authById: revisionAuthorizations(records), draft: isDraftContract(changeDir) };
}

// Devolve os erros estruturados ({ code, file, scenario, message }) dos cenários; lista vazia = aceito.
export function checkScenarios(changeDir, options = {}) {
  const context = buildContext(changeDir, options);
  const errors = [...context.errors];
  let total = 0;
  for (const path of specFiles(join(changeDir, 'specs'))) {
    const file = relative(changeDir, path);
    for (const scenario of parseScenarios(readFileSync(path, 'utf8'))) {
      total += 1;
      errors.push(...checkScenario(file, scenario, context));
    }
  }
  if (total === 0) errors.push({ code: 'HI-003', file: 'specs', scenario: null, message: 'nenhum cenário encontrado' });
  return errors;
}

// Declaração "Comportamento novo" da change (HI-010). Vale em proposal.md ou design.md.
// "não" exige aprovação auth:<id> na mesma linha de Aprovação do mesmo arquivo.
function checkBehaviorDeclaration(changeDir, options) {
  const file = DECLARATION_FILES.find((name) => existsSync(join(changeDir, name)) && BEHAVIOR_DECLARATION.test(readFileSync(join(changeDir, name), 'utf8')));
  if (!file) return [{ code: 'HI-010', file: DECLARATION_FILES.join(' ou '), scenario: null, message: 'declaração "Comportamento novo" ausente' }];
  const text = readFileSync(join(changeDir, file), 'utf8');
  const value = text.match(BEHAVIOR_DECLARATION)[1].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (value !== 'sim' && value !== 'nao') {
    return [{ code: 'HI-010', file, scenario: null, message: `"Comportamento novo" deve ser sim ou não: ${value}` }];
  }
  if (value === 'sim') return [];
  const context = buildContext(changeDir, options);
  const approval = text.match(BEHAVIOR_APPROVAL)?.[1];
  const message = approvalError(approval, context.authById, APPROVAL_RULES.item);
  return message ? [{ code: 'HI-009', file, scenario: null, message: `Comportamento novo: não, ${message}` }] : [];
}

// Conteúdo de uma seção de design.md, até o próximo cabeçalho de nível 2.
function sectionOf(text, heading) {
  const start = text.search(heading);
  if (start === -1) return '';
  const rest = text.slice(start).replace(heading, '');
  const end = rest.search(SECTION_END);
  return end === -1 ? rest : rest.slice(0, end);
}

// Lista separada por vírgula, sem marcas de "sem dependência".
export function listOf(value) {
  return (value ?? '').split(',').map((item) => item.trim()).filter((item) => !NO_DEPENDENCY_MARKS.includes(item));
}

// Linhas da tabela de Fatias (cabeçalho com "Depende de"): fatia -> { row, dependsOn }.
function sliceRows(section) {
  const rows = section.split('\n').filter((line) => line.trim().startsWith('|'));
  const cellsOf = (line) => line.split('|').slice(1, -1).map((cell) => cell.trim());
  const header = rows.length > 0 ? cellsOf(rows[0]) : [];
  const dependsIndex = header.indexOf(DEPENDS_ON_FIELD);
  return new Map(rows.slice(1).flatMap((line) => {
    const cells = cellsOf(line);
    if (!SLICE_FORM.test(cells[0] ?? '')) return [];
    const dependsOn = dependsIndex === -1 ? [] : listOf(cells[dependsIndex]);
    return [[cells[0], { row: line.trim(), dependsOn }]];
  }));
}

// Declarações de design.md (D21b): interfaces e regras com a descrição, e fatias com a linha e
// as fatias de que dependem. Usado pelo contrato e pela invalidação (A.3).
export function declarations(text) {
  const shared = new Map([...sectionOf(text, SHARED_SECTION).matchAll(SHARED_LINE)].map((match) => [match[1], match[2]]));
  const slices = sliceRows(sectionOf(text, SLICES_SECTION));
  return { shared, slices };
}

// Interfaces (IF-) e regras (RG-) declaradas em "Interfaces e regras compartilhadas", e fatias (F<n>) da tabela.
function declaredReferences(changeDir) {
  const path = join(changeDir, DESIGN_FILE);
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const { shared, slices } = declarations(text);
  return new Set([...shared.keys(), ...slices.keys()]);
}

// Referência de "Depende de" (HI-014): ID de cenário da change, IF-/RG- declarado ou fatia F<n> da tabela.
// Exportada para a invalidação de dependentes, que recusa a mesma referência com a mesma mensagem.
export function dependencyError(item, scenarioIds, declared) {
  if (SCENARIO_ID_FORM.test(item)) return scenarioIds.has(item) ? null : `referência não declarada: ${item} não existe na change`;
  if (SHARED_REFERENCE_FORM.test(item)) return declared.has(item) ? null : `referência não declarada: ${item} não está em "Interfaces e regras compartilhadas" de design.md`;
  if (SLICE_FORM.test(item)) return declared.has(item) ? null : `referência não declarada: ${item} não está na tabela de Fatias de design.md`;
  return `texto livre em "${DEPENDS_ON_FIELD}" recusado: ${item}`;
}

// Campo "Depende de" de cada cenário: só referências validadas (HI-014, D21b).
function checkDependencies(changeDir, scenarioList) {
  const scenarioIds = new Set(scenarioList.map((scenario) => scenario.fields.ID).filter(Boolean));
  const declared = declaredReferences(changeDir);
  return scenarioList.flatMap(({ name, fields, file }) => {
    const items = (fields[DEPENDS_ON_FIELD] ?? '').split(',').map((item) => item.trim()).filter(Boolean);
    return items.flatMap((item) => {
      const message = dependencyError(item, scenarioIds, declared);
      return message ? [{ code: 'HI-014', file, scenario: name, message }] : [];
    });
  });
}

// Validação completa do contrato: cenários, dependências e declaração de comportamento novo.
// Aprovação do contrato vale só para o hash e a versão atuais (D32, RC-047). Com contrato aprovado e
// alguma aprovação registrada, a mais recente precisa corresponder ao contrato atual; uma aprovação
// anterior com o mesmo hash não vale quando a mais recente é outra. Rascunho não exige aprovação.
// Ausência total de aprovação ainda não é exigida aqui (ver relatório: decisão pendente).
function checkContractApproval(changeDir) {
  if (isDraftContract(changeDir)) return [];
  const { records } = identifiedAuthorizations(changeDir);
  const { change } = changeLocation(changeDir);
  const revoked = revokedIds(records);
  const approvals = records.filter((record) => record?.kind === REVISION_KIND && record.purpose === CONTRACT_APPROVAL
    && record.origin === HUMAN_ORIGIN && record.scope?.change === change && !revoked.has(record.id));
  if (approvals.length === 0) return [];
  const latest = approvals.reduce((best, record) => (record.contract_version > best.contract_version ? record : best));
  let current;
  try {
    current = calculateContractHash(changeDir);
  } catch (err) {
    return [{ code: APPROVAL_MISMATCH_CODE, file: AUTHORIZATIONS_FILE, scenario: null, message: `aprovação não pode ser conferida: ${err.message}` }];
  }
  if (latest.contract_hash === current) return [];
  return [{
    code: APPROVAL_MISMATCH_CODE,
    file: AUTHORIZATIONS_FILE,
    scenario: null,
    message: `aprovação mais recente (versão ${latest.contract_version}) tem hash diferente do contrato atual; aprovação anterior não vale, aprove de novo (RC-047)`,
  }];
}

function revokedIds(records) {
  return new Set(records.map((record) => record?.revokes).filter(Boolean));
}

export function checkContract(changeDir, options = {}) {
  const scenarioList = specFiles(join(changeDir, 'specs')).flatMap((path) => parseScenarios(readFileSync(path, 'utf8'))
    .map((scenario) => ({ ...scenario, file: relative(changeDir, path) })));
  return [
    ...checkScenarios(changeDir, options),
    ...checkDependencies(changeDir, scenarioList),
    ...checkBehaviorDeclaration(changeDir, options),
    ...checkContractApproval(changeDir),
  ];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const changeDir = process.argv[2];
  if (!changeDir) {
    console.log('uso: node scripts/harness/contract.mjs <changeDir>');
    process.exit(2);
  }
  const errors = checkContract(changeDir);
  for (const error of errors) {
    const where = error.scenario ? `${error.file} › ${error.scenario}` : error.file;
    console.log(`error: ${error.code}: ${where}: ${error.message}`);
  }
  console.log(`contract: ${errors.length} erro(s)`);
  process.exit(errors.length === 0 ? 0 : 1);
}
