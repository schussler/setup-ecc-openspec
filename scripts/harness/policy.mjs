// Política e configuração proposta do harness (F1).
// Fonte autoritativa dos parâmetros: .claude/harness/policy.json. O perfil
// (configuração proposta) só pode reduzir tetos e nunca autoriza gasto.
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

export const POLICY_RELATIVE_PATH = '.claude/harness/policy.json';
const STOP_REASON_CONFIG = 'config_error';
const CANDIDATE_PREFIX = 'candidate_';
const BUDGET_AUTHORIZATION_KIND = 'budget';
const SCHEMA_VERSION_PATTERN = /^\d+(\.\d+){0,2}$/;

// Teto da política que cada chave do perfil não pode ultrapassar. Um candidato
// só é comparado quando a política declara o teto correspondente.
const CEILING_KEY_BY_PROFILE_KEY = {
  max_corrections_per_gate: 'max_corrections_per_gate',
};

// Chaves obrigatórias da política e o tipo esperado de cada uma.
const POLICY_SCHEMA = {
  version: 'string',
  reserve_margin_ratio: 'number',
  max_corrections_per_gate: 'integer',
  lock_stale_seconds: 'integer',
  log_retention_days: 'integer',
  protected_paths: 'string-array',
  excluded_paths: 'string-array',
  states: 'string-array',
  stop_reasons: 'string-array',
  non_sensitive_config: 'string-array',
  allowed_exceptions: 'string-array',
};

export class ConfigError extends Error {
  constructor(message, { stopReason = STOP_REASON_CONFIG } = {}) {
    super(message);
    this.name = 'ConfigError';
    this.stopReason = stopReason;
  }
}

function isExpectedType(value, type) {
  if (type === 'string') return typeof value === 'string' && value.length > 0;
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'integer') return Number.isInteger(value) && value >= 0;
  if (type === 'string-array') return Array.isArray(value) && value.every((item) => typeof item === 'string');
  return false;
}

function readJson(path, description) {
  if (!existsSync(path)) throw new ConfigError(`${description} ausente: ${path}`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new ConfigError(`${description} inválido (${err.message}): ${path}`);
  }
}

function assertObject(value, description) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigError(`${description} deve ser um objeto JSON`);
  }
}

export function loadPolicy(root) {
  const policy = readJson(join(root, POLICY_RELATIVE_PATH), 'política');
  assertObject(policy, 'política');
  for (const [key, type] of Object.entries(POLICY_SCHEMA)) {
    if (!(key in policy)) throw new ConfigError(`política sem a chave obrigatória "${key}"`);
    if (!isExpectedType(policy[key], type)) throw new ConfigError(`política: "${key}" deve ser ${type}`);
  }
  return policy;
}

export function loadProfile(root, path) {
  const resolved = isAbsolute(path) ? path : join(root, path);
  const profile = readJson(resolved, 'perfil');
  assertObject(profile, 'perfil');
  return profile;
}

function assertCandidateValue(key, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new ConfigError(`perfil: "${key}" deve ser número finito e não negativo`);
  }
}

export function validateProfileAgainstPolicy(profile, policy) {
  assertObject(profile, 'perfil');
  const candidateKeys = Object.keys(profile).filter((key) => key.startsWith(CANDIDATE_PREFIX));
  if (candidateKeys.length > 0 && profile.provisional !== true) {
    throw new ConfigError('perfil com chaves candidate_* deve declarar "provisional": true');
  }
  for (const key of Object.keys(profile)) {
    const ceilingKey = CEILING_KEY_BY_PROFILE_KEY[key] ?? (key.startsWith(CANDIDATE_PREFIX) ? `max_${key.slice(CANDIDATE_PREFIX.length)}` : null);
    if (ceilingKey === null || profile[key] === undefined) continue;
    if (key.startsWith(CANDIDATE_PREFIX)) assertCandidateValue(key, profile[key]);
    const ceiling = policy[ceilingKey];
    if (typeof ceiling === 'number' && profile[key] > ceiling) {
      throw new ConfigError(`perfil: "${key}" (${profile[key]}) amplia o teto da política "${ceilingKey}" (${ceiling})`);
    }
  }
  return true;
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

// Autorização `budget` vigente que vale para o cálculo: a de maior `total_usd`,
// entre as que trazem total e por chamada positivos e por chamada não maior que o
// total (D23). Registros de outros tipos, ou malformados, não contam. Sem nenhum, null.
export function effectiveGrant(authorizations) {
  const grants = (authorizations ?? []).filter((entry) => entry?.kind === BUDGET_AUTHORIZATION_KIND
    && isPositiveNumber(entry.total_usd)
    && isPositiveNumber(entry.per_call_usd)
    && entry.per_call_usd <= entry.total_usd);
  if (grants.length === 0) return null;
  return grants.reduce((best, grant) => (grant.total_usd > best.total_usd ? grant : best));
}

// Limite efetivo por chamada, em USD: o menor entre o teto da política
// (`max_usd_per_call`), o candidato do perfil (`candidate_usd_per_call`) e o
// `per_call_usd` da autorização vigente. Sem autorização, limit null e o motivo.
// Sem teto declarado na política, falha fechada com ConfigError.
export function effectiveLimit(policy, profile, authorizations) {
  const grant = effectiveGrant(authorizations);
  if (grant === null) return { limit: null, reason: 'sem autorização' };
  const policyCeiling = policy.max_usd_per_call;
  if (typeof policyCeiling !== 'number') {
    throw new ConfigError('política sem teto "max_usd_per_call" para gasto por chamada');
  }
  const candidate = profile?.candidate_usd_per_call;
  const sources = [policyCeiling, grant.per_call_usd];
  if (typeof candidate === 'number') sources.push(candidate);
  return { limit: Math.min(...sources), reason: null };
}

function parseSchemaVersion(value, description) {
  if (typeof value !== 'string' || !SCHEMA_VERSION_PATTERN.test(value)) {
    throw new ConfigError(`${description} inválida: "${value}"`);
  }
  const parts = value.split('.').map(Number);
  while (parts.length < 3) parts.push(0);
  return parts;
}

// Compara a versão do estado com a instalada. Estado mais novo para com
// config_error e instrução de migração.
export function checkSchemaCompatibility(stateSchemaVersion, installedVersion) {
  const state = parseSchemaVersion(stateSchemaVersion, 'versão do estado');
  const installed = parseSchemaVersion(installedVersion, 'versão instalada');
  for (let index = 0; index < 3; index += 1) {
    if (state[index] > installed[index]) {
      throw new ConfigError(
        `estado com schema ${stateSchemaVersion} é mais novo que a versão instalada ${installedVersion}; atualize o template e rode a migração (template-migrate)`,
      );
    }
    if (state[index] < installed[index]) break;
  }
  return true;
}

// Teto efetivo de um limite da política com o candidato do perfil (D23): o menor
// dos dois. O candidato só reduz; ausente, vale o teto da política.
export function effectiveCeiling(policyValue, candidateValue) {
  return typeof candidateValue === 'number' ? Math.min(policyValue, candidateValue) : policyValue;
}
