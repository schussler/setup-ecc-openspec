// Testes de aceitação da política do harness (F1). O nome de cada teste começa
// com o ID do cenário em openspec/changes/add-spec-harness/specs/*.
//
// Regra PO-012: nenhum teste deste diretório chama o binário real do modelo.
// A verificação abaixo procura a forma executável do comando em arquivos de
// teste. Linhas de comentário são ignoradas. Uma linha com a palavra "simulador"
// é aceita porque ali a string só descreve o simulador falso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, makeTempDir, writeTree } from '../helpers.mjs';
import {
  ConfigError,
  checkSchemaCompatibility,
  effectiveLimit,
  loadPolicy,
  loadProfile,
  validateProfileAgainstPolicy,
} from '../../harness/policy.mjs';

const POLICY_PATH = join(REPO_ROOT, '.claude/harness/policy.json');
const POLICY_MD_PATH = join(REPO_ROOT, '.claude/harness/policy.md');
const PROFILE_PATH = join(REPO_ROOT, '.claude/harness/profiles/default.json');
const HARNESS_TEST_DIR = join(REPO_ROOT, 'scripts/test/harness');

function readJsonFile(path) {
  assert.ok(existsSync(path), `arquivo ausente: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function validPolicy(overrides = {}) {
  return { ...readJsonFile(POLICY_PATH), ...overrides };
}

// Política de teste com teto de USD por chamada, usada só nos testes de limite.
function ceilingPolicy() {
  return { ...readJsonFile(POLICY_PATH), max_usd_per_call: 3 };
}

// --- PO-001 -----------------------------------------------------------------

test('[PO-001] parametro definido em um so lugar', () => {
  const policy = loadPolicy(REPO_ROOT);
  assert.ok(policy, 'loadPolicy deve devolver a política');
  assert.equal(policy.max_corrections_per_gate, 3);
  assert.equal(policy.reserve_margin_ratio, 0.25);

  assert.ok(existsSync(POLICY_MD_PATH), 'policy.md ausente');
  const rules = readFileSync(POLICY_MD_PATH, 'utf8');
  assert.match(rules, /max_corrections_per_gate/, 'policy.md deve citar a chave');
  // Os valores numéricos da política não podem aparecer repetidos nas regras.
  for (const value of [0.25, 900, 90]) {
    const pattern = new RegExp(`(?<![\\d.,])${String(value).replace('.', '[.,]')}(?![\\d.,])`);
    assert.doesNotMatch(rules, pattern, `valor ${value} repetido em policy.md`);
  }
});

test('[PO-001] policy.json nao define a mesma chave duas vezes', () => {
  assert.ok(existsSync(POLICY_PATH), 'policy.json ausente');
  const raw = readFileSync(POLICY_PATH, 'utf8');
  const keys = [...raw.matchAll(/"([^"]+)"\s*:/g)].map((match) => match[1]);
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  assert.deepEqual(duplicates, []);
});

test('[PO-001] policy.json traz versao e os parametros da F1', () => {
  const policy = readJsonFile(POLICY_PATH);
  assert.equal(policy.version, '1.0.0');
  assert.equal(policy.reserve_margin_ratio, 0.25);
  assert.equal(policy.max_corrections_per_gate, 3);
  assert.equal(policy.lock_stale_seconds, 900);
  assert.equal(policy.log_retention_days, 90);
});

test('[PO-001] loadPolicy recusa politica sem chave obrigatoria', () => {
  const root = makeTempDir('policy-missing-');
  const broken = validPolicy();
  delete broken.max_corrections_per_gate;
  writeTree(root, { '.claude/harness/policy.json': broken });
  assert.throws(() => loadPolicy(root), ConfigError);
});

test('[PO-001] loadPolicy recusa tipo errado', () => {
  const root = makeTempDir('policy-type-');
  writeTree(root, { '.claude/harness/policy.json': validPolicy({ max_corrections_per_gate: 'tres' }) });
  assert.throws(() => loadPolicy(root), ConfigError);
});

// --- PO-002 -----------------------------------------------------------------

test('[PO-002] configuracao que amplia o teto de correcoes e recusada', () => {
  const policy = validPolicy();
  const profile = { provisional: true, max_corrections_per_gate: 5 };
  assert.throws(() => validateProfileAgainstPolicy(profile, policy), ConfigError);
});

test('[PO-002] candidato que amplia teto da politica e recusado', () => {
  const policy = ceilingPolicy();
  const profile = { provisional: true, candidate_usd_per_call: 4 };
  assert.throws(() => validateProfileAgainstPolicy(profile, policy), ConfigError);
});

// --- PO-003 -----------------------------------------------------------------

test('[PO-003] configuracao reduzida e aceita', () => {
  const policy = validPolicy();
  const profile = { provisional: true, max_corrections_per_gate: 2 };
  assert.doesNotThrow(() => validateProfileAgainstPolicy(profile, policy));
});

test('[PO-003] perfil padrao carrega e e aceito pela politica', () => {
  const policy = loadPolicy(REPO_ROOT);
  const profile = loadProfile(REPO_ROOT, '.claude/harness/profiles/default.json');
  assert.ok(profile, 'loadProfile deve devolver o perfil');
  assert.doesNotThrow(() => validateProfileAgainstPolicy(profile, policy));
});

test('[PO-003] loadProfile recusa arquivo inexistente', () => {
  const root = makeTempDir('profile-missing-');
  assert.throws(() => loadProfile(root, '.claude/harness/profiles/nao-existe.json'), ConfigError);
});

// --- PO-005 -----------------------------------------------------------------

test('[PO-005] perfil padrao declara candidatos como provisorios', () => {
  const profile = readJsonFile(PROFILE_PATH);
  assert.equal(profile.provisional, true);
  const candidates = Object.keys(profile).filter((key) => key.startsWith('candidate_'));
  assert.ok(candidates.length >= 7, 'candidatos ausentes no perfil padrao');
});

test('[PO-005] candidato sem marca provisional e recusado', () => {
  const policy = validPolicy();
  const profile = { candidate_usd_per_change: 30 };
  assert.throws(() => validateProfileAgainstPolicy(profile, policy), ConfigError);
});

// --- PO-008 -----------------------------------------------------------------

test('[PO-008] allowlist de configuracao nao contem nomes de segredo', () => {
  const policy = readJsonFile(POLICY_PATH);
  assert.ok(Array.isArray(policy.non_sensitive_config));
  const suspicious = policy.non_sensitive_config.filter((name) => /TOKEN|SECRET|KEY|PASSWORD/i.test(name));
  assert.deepEqual(suspicious, []);
});

// --- PO-009 -----------------------------------------------------------------

test('[PO-009] schema do estado maior que a versao instalada gera ConfigError', () => {
  assert.throws(() => checkSchemaCompatibility('2.0.0', '1.0.0'), ConfigError);
});

test('[PO-009] schema compativel passa sem erro', () => {
  assert.doesNotThrow(() => checkSchemaCompatibility('1.0.0', '1.0.0'));
  assert.doesNotThrow(() => checkSchemaCompatibility('1.0.0', '1.2.0'));
});

// --- RC-021 e RC-022: limite efetivo ----------------------------------------

test('[RC-021] sem autorizacao budget o limite efetivo e nulo com motivo', () => {
  const result = effectiveLimit(ceilingPolicy(), { candidate_usd_per_call: 2, provisional: true }, []);
  assert.equal(result.limit, null);
  assert.equal(result.reason, 'sem autorização');
});

test('[RC-022] limite efetivo e o menor entre politica, candidato e autorizacao', () => {
  const authorizations = [{ id: 'a1', kind: 'budget', total_usd: 3, per_call_usd: 1.5 }];
  const result = effectiveLimit(ceilingPolicy(), { candidate_usd_per_call: 2, provisional: true }, authorizations);
  assert.equal(result.limit, 1.5);
});

test('[RC-022] autorizacao de outro tipo nao libera gasto', () => {
  const authorizations = [{ id: 'a2', kind: 'round', total_usd: 50, per_call_usd: 50 }];
  const result = effectiveLimit(ceilingPolicy(), { candidate_usd_per_call: 2, provisional: true }, authorizations);
  assert.equal(result.limit, null);
});

// --- PO-012 -----------------------------------------------------------------

test('[PO-012] testes do harness nao invocam o binario real do modelo', () => {
  const files = readdirSync(HARNESS_TEST_DIR).filter((name) => name.endsWith('.mjs'));
  assert.ok(files.length > 0);
  const offenders = [];
  for (const name of files) {
    const lines = readFileSync(join(HARNESS_TEST_DIR, name), 'utf8').split('\n');
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const isComment = /^(\/\/|\/\*|\*|#)/.test(trimmed);
      const isSimulator = /simulador/i.test(line);
      if (!isComment && !isSimulator && /claude\s+-p\b/.test(line)) offenders.push(`${name}:${index + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
});
