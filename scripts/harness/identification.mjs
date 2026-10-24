// Identificação e hash do contrato (D32, RC-047, RC-050). Funções puras, sem gravação:
// usadas pelo registro de autorizações e pelas verificações de contrato e de reconciliação.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { ConfigError } from './policy.mjs';

const CONTRACT_FILES = ['proposal.md', 'design.md'];
const SPECS_DIR = 'specs';
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;

// Lista de arquivos do contrato em ordem lexicográfica: proposta, design e tudo em specs/ (D32).
function contractPaths(dir) {
  const specsDir = join(dir, SPECS_DIR);
  const specs = existsSync(specsDir)
    ? readdirSync(specsDir, { recursive: true })
      .map((entry) => entry.split(sep).join('/'))
      .filter((entry) => statSync(join(specsDir, entry)).isFile())
      .map((entry) => `${SPECS_DIR}/${entry}`)
    : [];
  return [...CONTRACT_FILES, ...specs].sort();
}

// sha256 do contrato: para cada caminho em ordem, o caminho seguido de \n, depois o conteúdo e \n (D32).
// Falta de proposta ou design é erro: não há contrato para aprovar.
export function calculateContractHash(changeDirectory) {
  const missing = CONTRACT_FILES.filter((file) => !existsSync(join(changeDirectory, file)));
  if (missing.length > 0) throw new ConfigError(`contrato incompleto: ausente ${missing.join(', ')}`);
  const hash = createHash('sha256');
  for (const relative of contractPaths(changeDirectory)) {
    hash.update(`${relative}\n`);
    hash.update(readFileSync(join(changeDirectory, relative)));
    hash.update('\n');
  }
  return hash.digest('hex');
}

// Campos de identificação que toda autorização precisa (D32, RC-050). Devolve os problemas encontrados.
// projectId é opcional: sem ele, só confere a presença dos campos.
export function authorizationIdentityIssues(record, { projectId: expectedProjectId, change }) {
  const issues = [];
  if (!nonEmpty(record?.project_id)) issues.push('registro sem project_id');
  else if (expectedProjectId !== undefined && record.project_id !== expectedProjectId) {
    issues.push(`project_id "${record.project_id}" diverge do projeto validado`);
  }
  if (!nonEmpty(record?.scope?.change)) issues.push('registro sem scope.change');
  else if (record.scope.change !== change) issues.push(`scope.change "${record.scope.change}" diverge da change ${change}`);
  return issues;
}
