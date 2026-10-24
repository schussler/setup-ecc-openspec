// Preflight antes do loop (add-multislice-run, MS-009). Confere Git, identidade, projeto, adoção, perfil,
// checks, ferramenta e permissões. Não chama o modelo nem executa o binário: a ferramenta é resolvida no
// caminho. Cada item devolve { id, status: ok|blocked, detail }; `run` recusa se algum estiver bloqueado.
import { accessSync, constants, existsSync, readdirSync, readFileSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { adoptionRegistered } from './cli-actions.mjs';
import { headCommit } from './evidence.mjs';
import { sliceDeclarations } from './slice.mjs';

export const PREFLIGHT_BLOCKED = 'preflight_blocked';
const CHECK_KEYS = ['test', 'lint', 'typecheck'];

const item = (id, ok, detail) => ({ id, status: ok ? 'ok' : 'blocked', detail });

function gitValue(root, key, env) {
  try {
    return execFileSync('git', ['-C', root, 'config', key], { encoding: 'utf8', env, stdio: 'pipe' }).trim();
  } catch {
    return '';
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// Resolve o executável sem executá-lo: caminho absoluto ou busca no PATH.
export function resolvesExecutable(command, env = process.env) {
  const candidates = isAbsolute(command)
    ? [command]
    : (env.PATH ?? '').split(delimiter).filter(Boolean).map((dir) => join(dir, command));
  return candidates.some((path) => {
    try {
      accessSync(path, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

function gitItems(root, env) {
  const head = headCommit(root);
  const name = gitValue(root, 'user.name', env);
  const email = gitValue(root, 'user.email', env);
  return [
    item('git_head', head !== null, head ? 'commit base presente' : 'repositório sem commit base'),
    item('git_identity', name !== '' && email !== '', name && email ? 'identidade Git configurada' : 'user.name ou user.email ausente'),
  ];
}

function projectItems(root, profilePath) {
  const identity = readJson(join(root, '.harness-project.json'));
  const hasId = typeof identity?.project_id === 'string' && identity.project_id !== '';
  const profile = existsSync(join(root, profilePath)) ? readJson(join(root, profilePath)) : null;
  const template = readJson(join(root, 'template.json'));
  const checksOk = CHECK_KEYS.every((key) => template?.checks?.[key] !== undefined);
  return [
    item('project_id', hasId, hasId ? 'identidade do projeto presente' : '.harness-project.json sem project_id'),
    item('adoption', adoptionRegistered(root), 'marco de adoção no issue-tracker'),
    item('profile', profile !== null, profile !== null ? `perfil ${profilePath}` : `perfil ${profilePath} ausente ou inválido`),
    item('checks', checksOk, checksOk ? 'test, lint e typecheck definidos' : 'template.json sem test, lint ou typecheck'),
  ];
}

function toolAndPermissionItems(root, bin, env) {
  const executable = Array.isArray(bin) && bin.length > 0 ? bin[0] : null;
  const toolOk = executable !== null && resolvesExecutable(executable, env);
  const settings = readJson(join(root, '.claude', 'settings.json'));
  const allow = settings?.permissions?.allow;
  const permissionsOk = Array.isArray(allow) && allow.length > 0;
  return [
    item('claude_binary', toolOk, toolOk ? `executável ${executable} resolvido` : `executável ${executable ?? '(vazio)'} não encontrado`),
    item('permissions', permissionsOk, permissionsOk ? 'permissions.allow do projeto' : '.claude/settings.json sem permissions.allow'),
  ];
}

// Texto de todas as specs da change (recursivo), para conferir os IDs citados pelas fatias.
function specTextOf(root, change) {
  const dir = join(root, 'openspec', 'changes', change, 'specs');
  if (!existsSync(dir)) return '';
  const walk = (folder) => readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.name.endsWith('.md') ? [readFileSync(path, 'utf8')] : [];
  });
  return walk(dir).join('\n');
}

// Referências das fatias (MS-009): nomes únicos, cada fatia com cenários, e cada cenário citado existente na spec.
function sliceItems(root, change) {
  const declared = sliceDeclarations(root, change);
  if (declared.length === 0) return [];
  const specText = specTextOf(root, change);
  const names = declared.map((slice) => slice.name);
  const problems = [
    ...names.filter((name, index) => names.indexOf(name) !== index).map((name) => `fatia duplicada ${name}`),
    ...declared.filter((slice) => slice.scenarios.length === 0).map((slice) => `fatia sem cenário ${slice.name}`),
    ...declared.flatMap((slice) => slice.scenarios
      .filter((id) => !specText.includes(`**ID:** ${id}`))
      .map((id) => `cenário ausente ${id} em ${slice.name}`)),
  ];
  return [item('slice_references', problems.length === 0, problems.length === 0 ? `${declared.length} fatias com cenários existentes` : problems.join('; '))];
}

// Entrada pública: devolve { status: ready|blocked, items }. Nunca lança por item ausente.
export function runPreflight({ root, bin, env = process.env, profilePath, change = null }) {
  const items = [
    ...gitItems(root, env),
    ...projectItems(root, profilePath),
    ...toolAndPermissionItems(root, bin, env),
    ...(change ? sliceItems(root, change) : []),
  ];
  return { status: items.every((entry) => entry.status === 'ok') ? 'ready' : 'blocked', items };
}
