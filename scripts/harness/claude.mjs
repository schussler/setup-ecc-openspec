// Invocação headless do harness (F5, HE-001 a HE-006). Monta os argumentos de
// `claude -p`, executa o binário informado e classifica o resultado pela causa
// identificada. Nunca usa --dangerously-skip-permissions, --bare nem
// --fallback-model: os hooks do ECC continuam ativos e o modelo não troca sozinho.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_KILL_GRACE_MS, spawnInGroup, terminateGroup } from './process-group.mjs';

// Teto de tempo por chamada: max_seconds_per_call de policy.json (1500 s).
export const DEFAULT_TIMEOUT_MS = 1500 * 1000;
// Limite de uso da conta é infraestrutura, não falha de agente nem de gate.
const QUOTA = /usage limit reached|hit your (session |usage |weekly )?limit/i;
const STOP_REASON_BY_STATUS = { quota_unavailable: 'quota_unavailable', timeout_unclassified: 'timeout_unclassified' };

export const COST_SOURCE = { reported: 'reported', unknown: 'unknown' };
// Posição do prompt em buildHarnessArgs (-p <prompt>).
const PROMPT_INDEX = 1;

// Argumentos de `claude -p`. allowedTools fica por último: a opção aceita uma lista variádica.
export function buildHarnessArgs({ prompt, allowedTools, sessionId, maxBudgetUsd, model, effort }) {
  if (!allowedTools?.length) throw new Error('allowedTools vazio: o modo headless só roda com permissões explícitas');
  if (!sessionId) throw new Error('sessionId obrigatório: o runner gera o --session-id de cada chamada');
  return [
    '-p', prompt,
    '--output-format', 'json',
    '--permission-mode', 'dontAsk',
    '--session-id', sessionId,
    ...(maxBudgetUsd === undefined || maxBudgetUsd === null ? [] : ['--max-budget-usd', String(maxBudgetUsd)]),
    ...(model ? ['--model', model] : []),
    ...(effort ? ['--effort', effort] : []),
    '--allowedTools', ...allowedTools,
  ];
}

// Lista de ferramentas de .claude/settings.json (permissions.allow). Ausente é erro explícito.
export function readAllowedTools(root) {
  const path = join(root, '.claude', 'settings.json');
  if (!existsSync(path)) throw new Error(`${path} não existe: o modo headless precisa de permissions.allow`);
  const allow = JSON.parse(readFileSync(path, 'utf8')).permissions?.allow;
  if (!Array.isArray(allow) || allow.length === 0) throw new Error(`${path} não tem permissions.allow`);
  return allow;
}

function costOf(json) {
  return typeof json?.total_cost_usd === 'number' && Number.isFinite(json.total_cost_usd)
    ? { cost_usd: json.total_cost_usd, cost_source: COST_SOURCE.reported }
    : { cost_usd: null, cost_source: COST_SOURCE.unknown };
}

// Tokens de usage da saída JSON (TE-001). usage cobre só o laço principal, sem subagentes; por isso
// o escopo vai junto. Sem usage, ou com contagem inválida, os tokens ficam nulos: nunca viram zero.
const TOKEN_FIELDS = { input: 'input_tokens', output: 'output_tokens', cache_creation_input: 'cache_creation_input_tokens', cache_read_input: 'cache_read_input_tokens' };

function tokensOf(json) {
  const usage = json?.usage;
  if (!usage || typeof usage !== 'object') return null;
  const counts = Object.fromEntries(Object.entries(TOKEN_FIELDS).map(([key, field]) => [key, usage[field]]));
  const valid = Object.values(counts).every((value) => value === undefined || (Number.isInteger(value) && value >= 0));
  if (!valid || Object.values(counts).every((value) => value === undefined)) return null;
  return { ...Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value ?? null])), scope: 'main_loop' };
}

function parseLastLine(stdout) {
  try {
    return JSON.parse(stdout.trim().split('\n').at(-1));
  } catch {
    return null;
  }
}

function outcome(status, fields) {
  return { status, stop_reason: STOP_REASON_BY_STATUS[status] ?? null, cause: null, ...fields };
}

// Negações de permissão da sessão: só o nome da ferramenta. Nada do comando, nem a primeira palavra dele
// (comandos podem trazer valores de variáveis e conteúdo sensível).
export function permissionDenialsOf(json) {
  const denials = Array.isArray(json?.permission_denials) ? json.permission_denials : [];
  return denials.map((denial) => ({ tool_name: typeof denial?.tool_name === 'string' ? denial.tool_name : null }));
}

// Classifica a saída do processo. Só a causa identificada vira status especial;
// is_error sem causa é 'error' sem causa (HE-006).
function classify({ code, json, durationMs, stderr }) {
  const common = { duration_ms: durationMs, stderr, exit_code: code, num_turns: null, models: [], result: null, session_id: null };
  if (!json) return outcome('error', { ...common, ...costOf(null), cause: 'saída sem JSON' });
  const fields = {
    ...common,
    ...costOf(json),
    num_turns: json.num_turns ?? null,
    tokens: tokensOf(json),
    models: Object.keys(json.modelUsage ?? {}),
    result: typeof json.result === 'string' ? json.result.slice(-2000) : null,
    session_id: json.session_id ?? null,
  };
  if (typeof json.result === 'string' && QUOTA.test(json.result)) return outcome('quota_unavailable', fields);
  // Negações registradas sem conteúdo do comando (MS-010): nome da ferramenta e primeira palavra do comando.
  const denials = permissionDenialsOf(json);
  if (json.is_error || code !== 0) return outcome('error', { ...fields, permission_denials: denials, cause: json.subtype ?? null });
  return outcome('success', { ...fields, permission_denials: denials });
}

// Classifica uma saída já capturada (usado pelos testes de negação de permissão e pelo runner).
export function parseHarnessOutput({ code, stdout, durationMs, stderr }) {
  return classify({ code, json: parseLastLine(stdout), durationMs, stderr });
}

// Executa o binário (o simulador nos testes) e devolve o resultado classificado.
// Cada chamada roda em grupo próprio: no timeout, o grupo inteiro é encerrado (D25).
// termination_confirmed: true/false quando houve timeout; null quando não houve.
export function invokeHarness({
  bin = ['claude'], cwd, prompt, allowedTools, sessionId, maxBudgetUsd, model, effort, env = {},
  timeoutMs = DEFAULT_TIMEOUT_MS, killGraceMs = DEFAULT_KILL_GRACE_MS, terminate = terminateGroup,
}) {
  const args = buildHarnessArgs({ prompt, allowedTools, sessionId, maxBudgetUsd, model, effort });
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawnInGroup(bin[0], [...bin.slice(1), ...args], {
      cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const out = [];
    const err = [];
    let settled = false;
    let timedOut = false;
    let spawnFailed = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const onTimeout = async () => {
      timedOut = true;
      const termination = await terminate(child.pid, { graceMs: killGraceMs });
      // Diagnóstico exigido por D9: saída parcial, tempo e comando (o prompt não vai ao diagnóstico).
      const partialOutput = Buffer.concat(out).toString('utf8').slice(-2000);
      const command = [...bin, ...args.map((arg, index) => (index === PROMPT_INDEX ? '<prompt omitido>' : arg))];
      settle(outcome('timeout_unclassified', {
        cause: 'timeout', ...costOf(null), duration_ms: Date.now() - started,
        stderr: Buffer.concat(err).toString('utf8').slice(-2000), exit_code: null,
        num_turns: null, models: [], result: null, session_id: null, partial_output: partialOutput, command,
        termination_confirmed: termination.confirmed,
      }));
    };
    const timer = setTimeout(onTimeout, timeoutMs);
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => err.push(chunk));
    // Binário ausente: 'close' não é emitido depois de falha de spawn, então resolve aqui.
    child.on('error', (error) => {
      spawnFailed = true;
      settle(outcome('error', {
        cause: `spawn: ${error.code ?? error.message}`, ...costOf(null), duration_ms: Date.now() - started,
        stderr: '', exit_code: null, num_turns: null, models: [], result: null, session_id: null,
      }));
    });
    child.on('close', (code) => {
      // Com timeout, o desfecho é o do encerramento: o close que chega antes dele não decide.
      if (spawnFailed || settled || timedOut) return;
      const stderr = Buffer.concat(err).toString('utf8').slice(-2000);
      const json = parseLastLine(Buffer.concat(out).toString('utf8'));
      settle({ ...classify({ code, json, durationMs: Date.now() - started, stderr }), termination_confirmed: null });
    });
  });
}
