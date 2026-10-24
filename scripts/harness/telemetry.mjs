// Telemetria local (F9, D16, D17, TE-001 a TE-003, TE-009, TE-010). Registros append-only em
// .harness-local/<change>/events.jsonl, fora do Git. Toda gravação no arquivo passa por
// appendTelemetryLine: uma linha JSON completa por chamada, em append síncrono. Custo sem origem
// vira unknown, nunca zero; modelo solicitado diferente do efetivo fica marcado. Três tipos de
// registro dividem o arquivo: invocação (sem kind), ciclo de vida (kind "lifecycle") e lock
// (kind "lock"). A retenção fica em retention.mjs.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertChangeName, localDir, localId, projectId } from './identity.mjs';
import { ConfigError } from './policy.mjs';

export const EVENTS_FILE = 'events.jsonl';
export const EVENT_SCHEMA_VERSION = '1.0.0';
export const COST_SOURCES = Object.freeze(['reported', 'estimated', 'unknown', 'unmeasured']);
export const LOCK_KIND = 'lock';
export const LIFECYCLE_KIND = 'lifecycle';
// Tentativa de transição recusada pela tabela (RC-001). Não afirma que o estado mudou.
export const TRANSITION_REFUSED_KIND = 'transition_refused';
// Restauração manual (D32, manual_rollback): evento próprio, sem tipo novo em authorizations.json.
export const RESTORE_KIND = 'restore';
export const LIFECYCLE_PHASES = Object.freeze(['start', 'resume', 'complete', 'fail', 'interrupt']);

const REPORTED = 'reported';
const ESTIMATED = 'estimated';
const UNKNOWN = 'unknown';
const UNMEASURED = 'unmeasured';
const PROVIDER_CLI = 'claude-cli';

// Campos de contexto que o chamador pode passar além do resultado da invocação.
const CONTEXT_FIELDS = [
  'execution_id', 'invocation_id', 'delivery', 'attempt', 'status', 'cases', 'checks', 'results', 'hashes',
  'corrections_requested', 'changes_produced', 'stops', 'interruptions', 'human_decisions', 'reserves', 'nondeterminism',
];

function requireText(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new ConfigError(`evento sem ${label}`);
  return value;
}

const isNonNegativeNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const arrayOf = (value) => (Array.isArray(value) ? value : []);
const orNull = (value) => value ?? null;

// Origem do custo: reported ou estimated só com valor numérico. Sem valor, a origem é unknown.
// Etapa sem medição é unmeasured. Etapa sem chamada paga não tem custo (cost_source null).
function normalizeCost(fields, paid) {
  if (!paid) return { cost_usd: null, cost_source: null };
  const source = fields.cost_source ?? UNKNOWN;
  if (source === UNMEASURED) return { cost_usd: null, cost_source: UNMEASURED };
  if ((source === REPORTED || source === ESTIMATED) && isNonNegativeNumber(fields.cost_usd)) {
    return { cost_usd: fields.cost_usd, cost_source: source };
  }
  return { cost_usd: null, cost_source: UNKNOWN };
}

// Divergência literal entre o modelo solicitado e o efetivo. Sem os dois valores, não há comparação.
function modelDivergence(requested, effective) {
  if (!requested || !effective) return null;
  return requested !== effective;
}

// Evento de invocação normalizado. Campos ausentes viram null ou lista vazia; nenhum custo ausente vira zero.
export function buildEvent(fields, { at = new Date().toISOString() } = {}) {
  const paid = fields.paid !== false;
  const cost = normalizeCost(fields, paid);
  const modelRequested = orNull(fields.model_requested);
  const modelEffective = orNull(fields.model_effective);
  return {
    schema: EVENT_SCHEMA_VERSION,
    at,
    agent: requireText(fields.agent, 'agente'),
    function: requireText(fields.function, 'função'),
    provider: orNull(fields.provider),
    paid,
    model_requested: modelRequested,
    model_effective: modelEffective,
    model_divergent: modelDivergence(modelRequested, modelEffective),
    effort_requested: orNull(fields.effort_requested),
    effort_effective: orNull(fields.effort_effective),
    duration_ms: isNonNegativeNumber(fields.duration_ms) ? fields.duration_ms : null,
    tokens: orNull(fields.tokens),
    cost_usd: cost.cost_usd,
    cost_source: cost.cost_source,
    status: orNull(fields.status),
    delivery: orNull(fields.delivery),
    attempt: orNull(fields.attempt),
    execution_id: orNull(fields.execution_id),
    invocation_id: orNull(fields.invocation_id),
    cases: arrayOf(fields.cases),
    checks: arrayOf(fields.checks),
    results: arrayOf(fields.results),
    hashes: fields.hashes ?? {},
    corrections_requested: fields.corrections_requested ?? 0,
    changes_produced: arrayOf(fields.changes_produced),
    stops: arrayOf(fields.stops),
    interruptions: arrayOf(fields.interruptions),
    human_decisions: arrayOf(fields.human_decisions),
    reserves: orNull(fields.reserves),
    nondeterminism: arrayOf(fields.nondeterminism),
  };
}

export function eventsPath(root, change) {
  return join(localDir(root, change), EVENTS_FILE);
}

// Ponto único de escrita em events.jsonl: uma linha JSON completa por chamada, em append síncrono.
// Quem chama precisa ser o detentor do lock da change, ou o procedimento de liberação sob esse lock.
export function appendTelemetryLine(root, change, record) {
  const dir = localDir(root, change);
  mkdirSync(dir, { recursive: true });
  appendFileSync(eventsPath(root, change), `${JSON.stringify(record)}\n`);
  return record;
}

// Acrescenta um evento de invocação e devolve o evento gravado (append-only).
export function recordEvent(root, change, fields, options = {}) {
  return appendTelemetryLine(root, change, buildEvent(fields, options));
}

// Diagnóstico de lock (TE-009, decisão 1): identificação própria, kind "lock".
export function recordLockEvent(root, change, fields = {}, { at = new Date().toISOString() } = {}) {
  const { event, lock_id: lockId, execution_id: executionId, ...extra } = fields;
  return appendTelemetryLine(root, change, {
    ...extra,
    schema: EVENT_SCHEMA_VERSION,
    kind: LOCK_KIND,
    at,
    change: assertChangeName(change),
    project_id: projectId(root),
    local_id: localId(root),
    event: requireText(event, 'evento de lock'),
    lock_id: orNull(lockId),
    execution_id: orNull(executionId),
  });
}

// Ciclo de vida da execução (TE-010): início, retomada, conclusão, falha e interrupção.
export function recordLifecycleEvent(root, change, fields, { at = new Date().toISOString() } = {}) {
  if (!LIFECYCLE_PHASES.includes(fields.phase)) throw new ConfigError(`fase de ciclo de vida desconhecida: "${fields.phase}"`);
  return appendTelemetryLine(root, change, {
    schema: EVENT_SCHEMA_VERSION,
    kind: LIFECYCLE_KIND,
    at,
    change: assertChangeName(change),
    phase: fields.phase,
    execution_id: requireText(fields.execution_id, 'execution_id'),
    previous_execution_id: orNull(fields.previous_execution_id),
    invocation_id: orNull(fields.invocation_id),
    state: orNull(fields.state),
    stop_reason: orNull(fields.stop_reason),
    status: orNull(fields.status),
    cause: orNull(fields.cause),
  });
}

// Registra uma transição recusada: estado de origem, estado pedido e motivo. Não traz `state` nem
// `phase`, para que nenhum leitor confunda a tentativa recusada com uma transição aceita (RC-001, C2).
export function recordTransitionRefused(root, change, fields, { at = new Date().toISOString() } = {}) {
  return appendTelemetryLine(root, change, {
    schema: EVENT_SCHEMA_VERSION,
    kind: TRANSITION_REFUSED_KIND,
    at,
    change: assertChangeName(change),
    execution_id: requireText(fields.execution_id, 'execution_id'),
    from_state: requireText(fields.from_state, 'from_state'),
    to_state: requireText(fields.to_state, 'to_state'),
    reason: requireText(fields.reason, 'reason'),
  });
}

// Decisão humana de restauração (D32, passo b): aprovador, data, motivo, origem (caminho e hash da
// cópia pré-migração) e hash do estado antes da restauração. Gravado sob o lock da change.
export function recordRestoreEvent(root, change, fields, { at = new Date().toISOString() } = {}) {
  return appendTelemetryLine(root, change, {
    schema: EVENT_SCHEMA_VERSION,
    kind: RESTORE_KIND,
    at,
    change: assertChangeName(change),
    project_id: projectId(root),
    execution_id: requireText(fields.execution_id, 'execution_id'),
    approver: requireText(fields.approver, 'aprovador'),
    reason: requireText(fields.reason, 'motivo'),
    procedure: requireText(fields.procedure, 'procedimento'),
    source: { path: requireText(fields.source?.path, 'origem'), sha256: requireText(fields.source?.sha256, 'hash da origem') },
    previous_sha256: requireText(fields.previous_sha256, 'hash anterior'),
    transparent: false,
  });
}

// Registros de telemetria da change na ordem de gravação. Linha inválida é erro explícito.
function readRecords(root, change) {
  const path = eventsPath(root, change);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new ConfigError(`${path} linha ${index + 1} não é JSON válido`);
    }
  }).filter((record) => record?.schema === EVENT_SCHEMA_VERSION);
}

// Eventos de invocação (sem kind), usados pelo relatório.
export function readEvents(root, change) {
  return readRecords(root, change).filter((record) => record.kind === undefined);
}

export function readLockEvents(root, change) {
  return readRecords(root, change).filter((record) => record.kind === LOCK_KIND);
}

export function readRestoreEvents(root, change) {
  return readRecords(root, change).filter((record) => record.kind === RESTORE_KIND);
}

export function readLifecycleEvents(root, change) {
  return readRecords(root, change).filter((record) => record.kind === LIFECYCLE_KIND);
}

// Etapa interativa ou sem telemetria: fica registrada como unmeasured, sem custo (TE-004).
export function recordUnmeasuredStep(root, change, fields) {
  return recordEvent(root, change, { ...fields, cost_source: UNMEASURED });
}

// Converte o resultado de invokeHarness em campos de evento. O texto livre do modelo não é gravado:
// só o status e a causa classificada. O esforço efetivo não é verificável pela CLI, então fica null.
export function eventFromInvocation(result, context = {}) {
  const models = arrayOf(result.models);
  return {
    agent: context.agent,
    function: context.function,
    provider: context.provider ?? PROVIDER_CLI,
    paid: context.paid,
    model_requested: context.model ?? null,
    model_effective: models.length === 0 ? null : models.join(','),
    effort_requested: context.effort ?? null,
    effort_effective: null,
    duration_ms: result.duration_ms,
    tokens: result.tokens ?? null,
    cost_usd: result.cost_usd,
    cost_source: result.cost_source,
    status: result.status,
    stops: result.stop_reason ? [result.stop_reason] : [],
    results: [{ status: result.status, cause: result.cause ?? null }],
    ...Object.fromEntries(CONTEXT_FIELDS.filter((key) => key in context).map((key) => [key, context[key]])),
  };
}
