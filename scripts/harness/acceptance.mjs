// Manifesto de aceitação (D28, AC-024 a AC-026): vínculo entre cenários e casos de teste.
// O manifesto não prova aprovação (D29): a aprovação depende da execução e das autorizações.
// Campo do hash: file_hash (A.3, item C). É o hash do arquivo de teste inteiro, com os helpers declarados.
// case_body_hash é aceito somente como alias de leitura de manifestos antigos; a gravação usa file_hash.
// Limitação declarada (D28): a granularidade é o arquivo. Alterar outro caso do mesmo arquivo invalida o
// file_hash de todos os casos dele. Helpers entram só pela lista fixada em "helpers"; a v1 não detecta
// helpers por análise de imports (questão aberta 6).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigError } from './policy.mjs';

export const MANIFEST_FILE = 'acceptance-manifest.json';
export const MANIFEST_SCHEMA_VERSION = 1;
const HEX_SHA256 = /^[0-9a-f]{64}$/;
const SUITE_STATUS_ORDER = ['fail', 'skip', 'pass'];
const SCENARIO_STATUS_ORDER = ['fail', 'missing', 'skip', 'pass'];
const SCENARIO_TAG = /\[([A-Z]{2}-\d{3})\]/g;
const ALIAS_FIELD = 'case_body_hash';

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');
export const normalizeName = (name) => name.trim().replace(/\s+/g, ' ');
export const normalizeText = (text) => text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
export const caseIdOf = (file, testName) => `${file}::${normalizeName(testName)}`;
// Tags [ID] citadas no nome do caso, sem repetição e na ordem em que aparecem.
export const tagsOf = (name) => [...new Set([...name.matchAll(SCENARIO_TAG)].map((match) => match[1]))];

const fileDigest = (path) => sha256(normalizeText(readFileSync(path, 'utf8')));

// Hash de um helper declarado no manifesto (mesma fórmula de helper_hashes, D28).
export function helperDigestOf(root, helper) {
  return fileDigest(join(root, helper));
}

// file_hash (D28): arquivo normalizado e, para cada helper em ordem de caminho, "<caminho>\n<hash>\n".
// Devolve null quando o arquivo ou um helper não existe.
export function fileHash(root, file, helpers = []) {
  const path = join(root, file);
  if (!existsSync(path)) return null;
  let body = normalizeText(readFileSync(path, 'utf8'));
  for (const helper of [...helpers].sort()) {
    const helperPath = join(root, helper);
    if (!existsSync(helperPath)) return null;
    body += `${helper}\n${fileDigest(helperPath)}\n`;
  }
  return sha256(body);
}

// Hash dos corpos de um cenário: sha256 da lista ordenada dos hashes de seus casos.
export function scenarioBodyHash(hashes) {
  return sha256(hashes.slice().sort().join('\n'));
}

function fail(message) {
  throw new ConfigError(`${MANIFEST_FILE}: ${message}`);
}

// As tags do nome do caso e scenario_ids devem ser o mesmo conjunto (AC-026): tag sem cenário e cenário sem tag
// são vínculo ambíguo.
function checkTags(entry) {
  for (const id of entry.scenario_ids) {
    if (!entry.test_name.includes(`[${id}]`)) fail(`o caso "${entry.test_name}" precisa da tag [${id}] para o cenário ${id} (D28)`);
  }
  const listed = new Set(entry.scenario_ids);
  const extra = tagsOf(entry.test_name).filter((tag) => !listed.has(tag));
  if (extra.length > 0) fail(`vínculo ambíguo: o caso "${entry.test_name}" cita [${extra.join('], [')}], que não estão em scenario_ids`);
}

function checkRevisions(entry) {
  for (const id of entry.scenario_ids) {
    const revision = entry.scenario_revisions[id];
    if (!Number.isInteger(revision) || revision < 1) fail(`scenario_revisions de ${id} deve ser inteiro maior ou igual a 1`);
  }
}

function checkHelpers(entry) {
  const hashes = entry.helper_hashes;
  const declared = entry.helpers.slice().sort().join('\n');
  if (Object.keys(hashes).slice().sort().join('\n') !== declared) fail(`helper_hashes de "${entry.case_id}" não corresponde a helpers`);
  for (const value of Object.values(hashes)) if (!HEX_SHA256.test(value)) fail(`helper_hashes de "${entry.case_id}" com hash inválido`);
}

// Valida uma entrada do manifesto (D28): identidade, tags, revisões, hashes e helpers.
// Lê file_hash e, como alias de leitura, case_body_hash; a entrada devolvida sempre tem file_hash.
function validateEntry(input, index) {
  if (input === null || typeof input !== 'object') fail(`entrada ${index} não é objeto`);
  const fileHashValue = input.file_hash ?? input[ALIAS_FIELD];
  const { [ALIAS_FIELD]: _alias, ...rest } = input;
  const entry = { ...rest, file_hash: fileHashValue, helpers: input.helpers ?? [], helper_hashes: input.helper_hashes ?? {} };
  if (typeof entry.file !== 'string' || entry.file.trim() === '') fail(`entrada ${index} sem file`);
  if (typeof entry.test_name !== 'string' || normalizeName(entry.test_name) === '') fail(`entrada ${index} sem test_name`);
  if (entry.case_id !== caseIdOf(entry.file, entry.test_name)) fail(`case_id de "${entry.test_name}" não confere com arquivo e nome`);
  if (!Array.isArray(entry.scenario_ids) || entry.scenario_ids.length === 0) fail(`entrada "${entry.case_id}" sem scenario_ids`);
  if (entry.scenario_ids.some((id) => typeof id !== 'string')) fail(`entrada "${entry.case_id}" com scenario_ids inválido`);
  if (entry.scenario_revisions === null || typeof entry.scenario_revisions !== 'object') fail(`entrada "${entry.case_id}" sem scenario_revisions`);
  if (!HEX_SHA256.test(entry.file_hash ?? '')) fail(`entrada "${entry.case_id}" com file_hash inválido`);
  checkTags(entry);
  checkRevisions(entry);
  checkHelpers(entry);
  return entry;
}

// Um cenário tem uma só revisão em todo o manifesto: revisões diferentes são vínculo ambíguo (AC-026).
function checkRevisionAgreement(entries) {
  const seen = new Map();
  for (const entry of entries) {
    for (const id of entry.scenario_ids) {
      const revision = entry.scenario_revisions[id];
      if (seen.has(id) && seen.get(id) !== revision) {
        fail(`vínculo ambíguo: o cenário ${id} tem revisões ${seen.get(id)} e ${revision} no manifesto`);
      }
      seen.set(id, revision);
    }
  }
}

// Lê e valida o manifesto de uma change. Ausente equivale a nenhum caso vinculado.
// status (ex.: "proposto" na geração pela CLI) é informativo: não é aprovação (D28, D29).
export function loadAcceptanceManifest(dir) {
  const path = join(dir, MANIFEST_FILE);
  if (!existsSync(path)) return { sha256: null, entries: [], status: null };
  const raw = readFileSync(path, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`${MANIFEST_FILE} ilegível (${err.message})`);
  }
  if (data?.schema_version !== MANIFEST_SCHEMA_VERSION) fail(`schema_version deve ser ${MANIFEST_SCHEMA_VERSION}`);
  if (!Array.isArray(data.entries)) fail('sem a lista "entries"');
  const entries = data.entries.map(validateEntry);
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.case_id)) fail(`case_id duplicado: ${entry.case_id}`);
    seen.add(entry.case_id);
  }
  checkRevisionAgreement(entries);
  return { sha256: sha256(raw), entries, status: data.status ?? null };
}

// Casos do manifesto que declaram o cenário.
export function entriesOf(manifest, id) {
  return manifest.entries.filter((entry) => entry.scenario_ids.includes(id));
}

// Estado de um caso do manifesto pelos casos da saída com o mesmo nome normalizado. Com execução por
// arquivo (file_command, AC-028), o caso também precisa vir do arquivo da entrada: o homônimo de outro
// arquivo não conta. Sem caso na saída: missing. Vários com a mesma identidade: vale o pior (fail, skip, pass).
export function caseStatus(suiteCases, testName, file = null) {
  const sameFile = (item) => file === null || item.file === undefined || item.file === file;
  const hits = suiteCases.filter((item) => sameFile(item) && normalizeName(item.name) === normalizeName(testName));
  if (hits.length === 0) return 'missing';
  return SUITE_STATUS_ORDER.find((status) => hits.some((item) => item.status === status));
}

// Estado do cenário pelos casos do manifesto: todos precisam passar (AC-026). Pior estado vence.
export function scenarioStatus(suiteCases, entries) {
  const statuses = entries.map((entry) => caseStatus(suiteCases, entry.test_name, entry.file));
  return SCENARIO_STATUS_ORDER.find((status) => statuses.includes(status));
}
