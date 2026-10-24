// Impressão da evidência e caminhos protegidos (F7, D14, EV-001 a EV-004).
// A impressão identifica o que foi avaliado: código (árvore rastreada e não rastreada, sem
// os artefatos operacionais), contrato, manifesto de aceitação, checks, perfil, autorizações
// e a allowlist de configuração. Artefatos operacionais não mudam a impressão.
// Caminhos protegidos são comparados por hash antes e depois de cada invocação e gate;
// tasks.md aceita só a marcação [ ] -> [x].
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { isExcluded } from '../gates/scope-check.mjs';
import { loadAuthorizations } from './contract.mjs';
import { MANIFEST_FILE, loadAcceptanceManifest } from './acceptance.mjs';
import { AUTHORIZATIONS_STAMP, changeDir, localDir } from './identity.mjs';
import { ConfigError, loadPolicy } from './policy.mjs';

const TEMPLATE_FILE = 'template.json';
const POLICY_FILE = '.claude/harness/policy.json';
const PROFILE_DEFAULT = '.claude/harness/profiles/default.json';
const TASKS_FILE = 'tasks.md';
const MISSING = 'ausente';
const GIT_MAX_BUFFER = 64 * 1024 * 1024;
// Artefatos do próprio processo de aprovação: fora da árvore avaliada, para não se invalidarem.
const PROCESS_ARTIFACTS = ['tasks.md', 'evidence-summary.json', 'checkpoint.json', 'authorizations.json'];
// Chaves de policy.json cuja alteração é sempre protegida (EV-003), mesmo sem o arquivo inteiro.
const POLICY_PROTECTED_KEYS = ['excluded_paths', 'protected_paths'];
const TASK_OPEN_OR_DONE = /^(\s*-\s)\[[ xX]\]/gm;

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const toPosix = (path) => path.split(sep).join('/');

export function defaultRuntime() {
  return { node: process.version };
}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER });
}

// Arquivos rastreados e não rastreados que o Git não ignora (EV-001).
export function gitFiles(root) {
  return git(root, ['ls-files', '-co', '--exclude-standard', '-z']).split('\0').filter(Boolean).sort();
}

function digestOf(path) {
  if (!existsSync(path) || statSync(path).isDirectory()) return MISSING;
  return sha256(readFileSync(path));
}

function digestOrNull(path) {
  return existsSync(path) ? digestOf(path) : null;
}

// Arquivos de um diretório (recursivo), em ordem.
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    });
}

export function readTemplate(root) {
  const path = join(root, TEMPLATE_FILE);
  if (!existsSync(path)) throw new ConfigError(`${TEMPLATE_FILE} ausente em ${root}`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new ConfigError(`${TEMPLATE_FILE} inválido (${err.message})`);
  }
}

// Entradas da árvore avaliada: sem excluded_paths de policy.json e sem os artefatos do processo.
export function codeEntries(root, change) {
  const excluded = loadPolicy(root).excluded_paths;
  const artifacts = PROCESS_ARTIFACTS.map((name) => `openspec/changes/${change}/${name}`);
  return gitFiles(root)
    .filter((file) => !isExcluded(file, excluded) && !artifacts.includes(file))
    .map((file) => ({ path: file, sha256: digestOf(join(root, file)) }));
}

// Contrato: proposta, design e specs da change (com as revisões dos cenários).
function contractEntries(root, change) {
  const dir = changeDir(root, change);
  const files = ['proposal.md', 'design.md'].map((name) => join(dir, name));
  const specs = existsSync(join(dir, 'specs')) ? walk(join(dir, 'specs')).filter((path) => path.endsWith('.md')) : [];
  return [...files, ...specs]
    .filter((path) => existsSync(path))
    .map((path) => ({ path: toPosix(relative(root, path)), sha256: digestOf(path) }));
}

// Chaves da allowlist de configuração (policy.non_sensitive_config). Nunca segredos.
function allowlistValues(root, runtime) {
  const values = {
    node_version: runtime.node ?? null,
    claude_cli_version: runtime.claude ?? null,
    model: runtime.model ?? null,
    effort: runtime.effort ?? null,
  };
  return Object.fromEntries(loadPolicy(root).non_sensitive_config.map((key) => [key, values[key] ?? null]));
}

// Derivados que entram na impressão só quando contêm configuração executável (EV-002, D31).
const DERIVED_ARTIFACTS = ['gates.json', 'checkpoint.json', 'run-state.json', 'summary.md'];
const EXECUTABLE_KEYS = new Set(['checks', 'test_report', 'test_file', 'file_command', 'command', 'lint', 'typecheck']);
const EXECUTABLE_TEXT = /"(checks|test_report|test_file|file_command|command|lint|typecheck)"\s*:/;

function containsExecutableKey(value) {
  if (Array.isArray(value)) return value.some(containsExecutableKey);
  if (value === null || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => EXECUTABLE_KEYS.has(key) || containsExecutableKey(child));
}

export function hasExecutableConfig(text) {
  try {
    return containsExecutableKey(JSON.parse(text));
  } catch {
    return EXECUTABLE_TEXT.test(text);
  }
}

// Derivados da change com configuração executável: entram na impressão; os demais ficam fora.
export function derivedConfigEntries(root, change) {
  const dir = changeDir(root, change);
  return DERIVED_ARTIFACTS.flatMap((name) => {
    const path = join(dir, name);
    if (!existsSync(path)) return [];
    const text = readFileSync(path, 'utf8');
    return hasExecutableConfig(text) ? [{ path: toPosix(relative(root, path)), sha256: sha256(text) }] : [];
  });
}

// Integridade de authorizations.json (D31): o hash gravado por authorize record precisa bater.
// Sem carimbo (nenhum registro feito pelo authorize record), não há referência e vale o conteúdo atual.
export function authorizationsIntegrity(root, change) {
  const stampPath = join(localDir(root, change), AUTHORIZATIONS_STAMP);
  if (!existsSync(stampPath)) return { ok: true, path: null };
  const file = join(changeDir(root, change), 'authorizations.json');
  const current = existsSync(file) ? sha256(readFileSync(file)) : MISSING;
  const path = toPosix(relative(root, file));
  return current === readFileSync(stampPath, 'utf8').trim() ? { ok: true, path: null } : { ok: false, path };
}

// Impressão da evidência. O hash cobre cada parte; as partes ficam para o resumo durável.
// Caminho do perfil gravado no estado por run --profile. Lê só esse campo do arquivo bruto, sem validar
// o estado: o restante de run-state.json continua fora da impressão (EV-002).
function recordedProfilePath(root, change) {
  try {
    const path = JSON.parse(readFileSync(join(localDir(root, change), 'run-state.json'), 'utf8'))?.profile?.path;
    return typeof path === 'string' && path !== '' ? path : null;
  } catch {
    return null;
  }
}

// Perfil efetivo (EV-001): o gravado no estado pela execução (run --profile); sem ele, o padrão.
// O conteúdo entra na impressão; perfil que não é JSON válido entra como null, com o hash do arquivo.
function profileOf(root, change, profilePath) {
  const path = profilePath ?? recordedProfilePath(root, change) ?? PROFILE_DEFAULT;
  const file = join(root, path);
  let content = null;
  if (existsSync(file)) {
    try {
      content = sortKeys(JSON.parse(readFileSync(file, 'utf8')));
    } catch {
      content = null;
    }
  }
  return { path, sha256: digestOrNull(file), content };
}

export function fingerprint({ root, change, runtime = defaultRuntime(), profilePath }) {
  const profile = profileOf(root, change, profilePath);
  const code = codeEntries(root, change);
  const template = existsSync(join(root, TEMPLATE_FILE)) ? readTemplate(root) : {};
  const parts = {
    code_tree_sha256: sha256(JSON.stringify(code)),
    derived_config: derivedConfigEntries(root, change),
    contract_sha256: sha256(JSON.stringify(contractEntries(root, change))),
    acceptance_manifest_sha256: digestOrNull(join(changeDir(root, change), 'acceptance-manifest.json')),
    checks_sha256: sha256(JSON.stringify(sortKeys(template.checks ?? {}))),
    profile_path: profile.path,
    profile_sha256: profile.sha256,
    profile_content: profile.content,
    authorizations_sha256: sha256(JSON.stringify(loadAuthorizations(changeDir(root, change)).records)),
    allowlist: allowlistValues(root, runtime),
  };
  return { fingerprint: sha256(JSON.stringify(sortKeys(parts))), parts, code };
}

export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
}

// Expande um caminho protegido de policy.json: '*' vale para um segmento; diretórios são recursivos.
function expandPattern(root, pattern) {
  const found = pattern.split('/').reduce((bases, segment) => bases.flatMap((base) => {
    if (segment !== '*') return [join(base, segment)];
    return existsSync(base) && statSync(base).isDirectory()
      ? readdirSync(base).map((name) => join(base, name))
      : [];
  }).filter((path) => existsSync(path)), [root]);
  return found.flatMap((path) => (statSync(path).isDirectory() ? walk(path) : [path]));
}

// Chave de policy.json ou de template.json (ex.: "template.json:checks"): hash do valor.
function pseudoDigest(root, file, key) {
  const path = join(root, file);
  if (!existsSync(path)) return MISSING;
  try {
    return sha256(JSON.stringify(sortKeys(JSON.parse(readFileSync(path, 'utf8'))[key] ?? null)));
  } catch (err) {
    throw new ConfigError(`${file} ilegível para proteção (${err.message})`);
  }
}

// Estado de tasks.md para a regra [ ] -> [x]: hash do texto sem marcações e índices marcados.
export function taskSnapshot(root, change) {
  const path = join(changeDir(root, change), TASKS_FILE);
  if (!existsSync(path)) return null;
  return { path: toPosix(relative(root, path)), normalized_sha256: sha256(normalizeTasks(readFileSync(path, 'utf8'))) };
}

function normalizeTasks(text) {
  return text.replace(TASK_OPEN_OR_DONE, '$1[ ]');
}

// Registros de authorizations.json por id: acréscimo é permitido; registro existente alterado não (EV-003, 5.5).
function authorizationsSnapshot(root, change) {
  const dir = changeDir(root, change);
  const path = join(dir, 'authorizations.json');
  if (!existsSync(path)) return null;
  const { records } = loadAuthorizations(dir);
  return {
    path: toPosix(relative(root, path)),
    records: Object.fromEntries(records.map((record, index) => [record?.id ?? `#${index}`, sha256(JSON.stringify(record))])),
  };
}

function authorizationChanges(before, after) {
  if (!before || !after) return before && !after ? [before.path] : [];
  const altered = Object.keys(before.records).some((id) => after.records[id] !== before.records[id]);
  return altered ? [before.path] : [];
}

// Insumos do manifesto de aceitação do próprio projeto (A.3, item F): o manifesto, os arquivos de teste
// que ele lista e os helpers declarados. Resolvido pelo projeto, e não por caminhos fixos do template.
// Manifesto ilegível durante a validação não some da proteção: o hash do próprio arquivo continua valendo.
function manifestFiles(root, change) {
  const dir = changeDir(root, change);
  const files = { [toPosix(relative(root, join(dir, MANIFEST_FILE)))]: digestOf(join(dir, MANIFEST_FILE)) };
  let entries = [];
  try {
    entries = loadAcceptanceManifest(dir).entries;
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
  }
  for (const entry of entries) {
    files[entry.file] = digestOf(join(root, entry.file));
    for (const helper of entry.helpers) files[helper] = digestOf(join(root, helper));
  }
  return files;
}

// Hashes dos caminhos protegidos de policy.json, das chaves protegidas, de tasks.md e dos registros de autorização (EV-003).
export function protectedSnapshot({ root, change }) {
  const policy = loadPolicy(root);
  const files = manifestFiles(root, change);
  for (const pattern of policy.protected_paths) {
    if (pattern.includes(':')) {
      const [file, key] = pattern.split(':');
      files[pattern] = pseudoDigest(root, file, key);
      continue;
    }
    for (const path of expandPattern(root, pattern)) files[toPosix(relative(root, path))] = digestOf(path);
  }
  for (const key of POLICY_PROTECTED_KEYS) {
    files[`${POLICY_FILE}:${key}`] = pseudoDigest(root, POLICY_FILE, key);
  }
  return { files, tasks: taskSnapshot(root, change), authorizations: authorizationsSnapshot(root, change) };
}

// Só a alternância de checkbox é operacional: o texto normalizado (checkboxes como [ ]) deve ser igual.
function tasksChanges(before, after) {
  if (!before && !after) return [];
  if (!before || !after) return [(before ?? after).path];
  return before.normalized_sha256 === after.normalized_sha256 ? [] : [before.path];
}

// Caminhos protegidos alterados entre dois instantâneos. Vazio = nenhuma alteração proibida.
export function compareProtected(before, after) {
  const keys = new Set([...Object.keys(before.files), ...Object.keys(after.files)]);
  const changedFiles = [...keys].filter((key) => before.files[key] !== after.files[key]);
  return [
    ...changedFiles,
    ...tasksChanges(before.tasks, after.tasks),
    ...authorizationChanges(before.authorizations, after.authorizations),
  ].sort();
}

// Há só marcação [ ] -> [x] entre dois textos de tasks.md (EV-004).
export function tasksChangeAllowed(beforeText, afterText) {
  return normalizeTasks(beforeText) === normalizeTasks(afterText);
}

// Arquivos alterados em relação ao HEAD (rastreados e não rastreados), sem os artefatos excluídos.
export function changedCodePaths(root, change) {
  const excluded = loadPolicy(root).excluded_paths;
  const artifacts = PROCESS_ARTIFACTS.map((name) => `openspec/changes/${change}/${name}`);
  const entries = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']).split('\0').filter(Boolean);
  return entries
    .map((entry) => entry.slice(3))
    .filter((file) => !isExcluded(file, excluded) && !artifacts.includes(file))
    .sort()
    .map((file) => ({ path: file, sha256: digestOf(join(root, file)) }));
}

export function headCommit(root) {
  try {
    return git(root, ['rev-parse', 'HEAD']).trim();
  } catch {
    return null;
  }
}

export function hasUncommittedChanges(root) {
  return git(root, ['status', '--porcelain=v1']).trim().length > 0;
}

