// Identidades do harness (F2, D1). Três ids distintos:
// - project_id: UUID em .harness-project.json (versionado, independe do caminho);
// - local_id: UUID em <git-common-dir>/harness/local-id (um por clone, compartilhado por worktrees, não versionado);
// - execution_id: UUID gerado a cada execução do runner.
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, writeSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { ConfigError } from './policy.mjs';

const CHANGE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT_FILE = '.harness-project.json';
const LOCAL_ID_RELATIVE = join('harness', 'local-id');
// Carimbo local (fora do Git) com o sha256 de authorizations.json após cada gravação do registro (D31).
export const AUTHORIZATIONS_STAMP = 'authorizations.sha256';
// local_id difere entre clones e não é erro na importação (D19); por isso fica fora da comparação.
const IDENTITY_FIELDS = ['project_id', 'change', 'execution_id'];

export function commonGitDir(root) {
  const raw = execFileSync('git', ['-C', root, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim();
  return realpathSync(isAbsolute(raw) ? raw : resolve(root, raw));
}

// Lê o project_id versionado na raiz do repositório. Ausente ou inválido é config_error.
export function projectId(root) {
  const path = join(root, PROJECT_FILE);
  if (!existsSync(path)) throw new ConfigError(`${PROJECT_FILE} ausente em ${root}`);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new ConfigError(`${PROJECT_FILE} ilegível (${err.message})`);
  }
  const id = parsed?.project_id;
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
    throw new ConfigError(`${PROJECT_FILE} sem project_id válido`);
  }
  return id;
}

function readLocalId(path) {
  const id = readFileSync(path, 'utf8').trim();
  if (!UUID_PATTERN.test(id)) throw new ConfigError(`local-id inválido em ${path}`);
  return id;
}

// Cria o local_id uma única vez por clone. A criação é exclusiva ('wx'); se outro
// processo criou o arquivo antes, lê o id existente.
export function localId(root) {
  const gitDir = commonGitDir(root);
  const path = join(gitDir, LOCAL_ID_RELATIVE);
  if (existsSync(path)) return readLocalId(path);
  mkdirSync(join(gitDir, 'harness'), { recursive: true });
  const id = randomUUID();
  let fd;
  try {
    fd = openSync(path, 'wx');
  } catch (err) {
    if (err.code === 'EEXIST') return readLocalId(path);
    throw err;
  }
  try {
    writeSync(fd, `${id}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return id;
}

export function assertChangeName(change) {
  if (typeof change !== 'string' || !CHANGE_NAME_PATTERN.test(change)) {
    throw new ConfigError(`nome de change inválido: "${change}"`);
  }
  return change;
}

export function changeDir(root, change) {
  return join(root, 'openspec', 'changes', assertChangeName(change));
}

export function localDir(root, change) {
  return join(root, '.harness-local', assertChangeName(change));
}

export function identityOf(root, change, executionId) {
  return {
    project_id: projectId(root),
    local_id: localId(root),
    change: assertChangeName(change),
    execution_id: executionId,
  };
}

// Compara só os campos presentes em expected. Divergência é config_error (RS-008).
export function assertSameIdentity(actual, expected) {
  for (const field of IDENTITY_FIELDS) {
    if (expected[field] === undefined) continue;
    if (actual?.[field] !== expected[field]) {
      throw new ConfigError(`identidade divergente em "${field}": ${actual?.[field]} != ${expected[field]}`);
    }
  }
}
