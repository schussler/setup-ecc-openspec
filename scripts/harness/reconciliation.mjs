// Registro de reconciliação (D26, RC-045, RC-050 a RC-058). Aprovado pelo dono do projeto em
// 2026-10-24; o registro formal em authorizations.json continua pendente. Enquanto isso, a CLI do
// runner guarda os registros no estado da execução (run-state.json), com o mesmo cálculo.
//
// Nada neste módulo grava arquivo, concede autorização ou libera gasto: as funções calculam, validam
// e devolvem o novo estado para quem persiste. O saldo é calculado aqui (RC-045): valores informados
// no registro são conferidos, nunca aceitos como saldo.
//
// Decisões reversíveis registradas em design.md (D26, "Decisões reversíveis da CLI"):
// - kept não contabiliza custo (cost obrigatoriamente unknown);
// - custo observado acima da reserva gera efeito líquido negativo, sem truncamento, com aviso;
// - unknown_calls_after conta cada chamada desconhecida uma vez.
import { committedUsd, applyReconciliation } from './budget.mjs';
import { authorizationIdentityIssues } from './identification.mjs';
import { ConfigError } from './policy.mjs';

export const RECONCILIATION_KIND = 'reconciliation';
const RESERVE_DECISIONS = ['kept', 'closed_observed', 'closed_unknown'];
const COST_STATUSES = ['observed', 'estimated', 'unknown'];
const ORIGIN_BY_STATUS = Object.freeze({ observed: 'reported', estimated: 'estimated', unknown: 'none' });
const UNKNOWN_TREATMENT = 'counted_in_budget';
const ROUND_DIGITS = 6;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const BALANCE_FIELDS = Object.freeze([
  'reserved_usd', 'reserve_released_usd', 'cost_accounted_usd', 'exposure_unknown_usd',
  'available_before_usd', 'net_available_effect_usd', 'available_after_usd',
]);
const OVER_RESERVE_WARNING = 'custo observado acima da reserva: efeito líquido negativo, sem truncamento (D26 regra 1)';

const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const round = (value) => Math.round(value * 10 ** ROUND_DIGITS) / 10 ** ROUND_DIGITS;
const isReconciliation = (record) => record?.kind === RECONCILIATION_KIND;

function checkEvidence(list, errors) {
  if (!Array.isArray(list)) {
    errors.push('evidence_available deve ser uma lista');
    return;
  }
  list.forEach((item, index) => {
    if (!isPlainObject(item) || !nonEmpty(item.nome) || !SHA256_HEX.test(item.sha256 ?? '')) {
      errors.push(`evidence_available[${index}] exige nome e sha256 (64 caracteres hexadecimais)`);
    }
  });
}

// Custo (D26 regra 4): unknown exige usd null; observed e estimated exigem número finito não negativo.
// Zero é valor observado ou estimado; nunca substitui desconhecido.
function checkCost(cost, errors) {
  if (!isPlainObject(cost)) {
    errors.push('cost deve ser um objeto');
    return;
  }
  if (!COST_STATUSES.includes(cost.status)) {
    errors.push(`cost.status deve ser ${COST_STATUSES.join(', ')}`);
    return;
  }
  if (cost.status === 'unknown') {
    if (cost.usd !== null) errors.push('cost.usd deve ser null quando cost.status é unknown');
  } else if (!isNumber(cost.usd) || cost.usd < 0) {
    errors.push(`cost.usd deve ser número finito não negativo quando cost.status é ${cost.status}`);
  }
  if (cost.origin !== ORIGIN_BY_STATUS[cost.status]) {
    errors.push(`cost.origin deve ser ${ORIGIN_BY_STATUS[cost.status]} para cost.status ${cost.status} (origin reported identifica a fonte, não comprova cobrança)`);
  }
}

// Decisão sobre a reserva (D26 regras 4 e 6): cada decisão exige o tipo de custo que ela pode registrar.
function checkDecision(record, errors) {
  const { reserve_decision: decision, cost, unknown_treatment: treatment } = record;
  if (decision === 'kept' && cost?.status !== 'unknown') {
    errors.push('reserve_decision kept exige cost.status unknown; custo conhecido é registrado com closed_observed');
  }
  if (decision === 'closed_observed' && cost?.status === 'unknown') {
    errors.push('reserve_decision closed_observed exige custo observado ou estimado');
  }
  if (decision === 'closed_unknown') {
    if (cost?.status !== 'unknown') errors.push('reserve_decision closed_unknown exige cost.status unknown');
    if (treatment !== UNKNOWN_TREATMENT) errors.push(`reserve_decision closed_unknown exige unknown_treatment ${UNKNOWN_TREATMENT} (RC-055)`);
  } else if (treatment !== undefined) {
    errors.push('unknown_treatment só existe com reserve_decision closed_unknown');
  }
}

function checkHumanDecision(decision, errors) {
  if (!isPlainObject(decision) || !nonEmpty(decision.decided_by) || !nonEmpty(decision.decided_at) || typeof decision.note !== 'string') {
    errors.push('human_decision exige decided_by, decided_at e note');
  }
}

// balance_effect é opcional na entrada: quando vem, é conferido contra o cálculo (RC-045), nunca aceito como saldo.
function checkBalanceShape(balance, errors) {
  if (balance === undefined) return;
  const complete = isPlainObject(balance)
    && BALANCE_FIELDS.every((field) => isNumber(balance[field]))
    && typeof balance.reserve_closed === 'boolean'
    && Number.isInteger(balance.unknown_calls_after) && balance.unknown_calls_after >= 0;
  if (!complete) {
    errors.push(`balance_effect, quando informado, exige ${BALANCE_FIELDS.join(', ')}, reserve_closed (booleano) e unknown_calls_after (inteiro não negativo)`);
  }
}

// Valida o formato do registro (D26). Devolve { ok, errors } e não lança. Não confere identidade,
// correspondência nem saldo: isso é feito por reconcileRecord.
export function validateReconciliationRecord(record) {
  const errors = [];
  if (!isPlainObject(record)) return { ok: false, errors: ['registro deve ser um objeto'] };
  if (record.kind !== RECONCILIATION_KIND) errors.push(`kind deve ser ${RECONCILIATION_KIND}`);
  for (const field of ['reconciliation_id', 'execution_id', 'invocation_id', 'reserve_id']) {
    if (!nonEmpty(record[field])) errors.push(`${field} obrigatório`);
  }
  if (!RESERVE_DECISIONS.includes(record.reserve_decision)) {
    errors.push(`reserve_decision deve ser ${RESERVE_DECISIONS.join(', ')}`);
  }
  if (record.supersedes !== undefined && !nonEmpty(record.supersedes)) errors.push('supersedes deve ser um reconciliation_id não vazio');
  checkEvidence(record.evidence_available, errors);
  checkCost(record.cost, errors);
  checkDecision(record, errors);
  checkHumanDecision(record.human_decision, errors);
  checkBalanceShape(record.balance_effect, errors);
  return { ok: errors.length === 0, errors };
}

// Constrói o registro a partir dos campos, validado. Erro com a lista de problemas.
export function buildReconciliationRecord(fields) {
  const record = { kind: RECONCILIATION_KIND, ...fields };
  const { ok, errors } = validateReconciliationRecord(record);
  if (!ok) throw new ConfigError(`registro de reconciliação inválido: ${errors.join('; ')}`);
  return record;
}

// Reconciliações ativas: as que não foram substituídas por uma correção ativa (RC-056).
function activeRecords(records) {
  const superseded = new Set(records.filter(isReconciliation).map((record) => record.supersedes).filter(Boolean));
  return records.filter((record) => isReconciliation(record) && !superseded.has(record.reconciliation_id));
}

// Efeito no saldo (D26 regra 1). Cada decisão tem o seu tratamento; nada é truncado em zero.
// before e after são os estados antes e depois da decisão; totalUsd é o saldo total autorizado.
function effectOf({ entry, record, before, after, totalUsd }) {
  const decision = record.reserve_decision;
  const observed = decision === 'closed_observed';
  const releasedUsd = observed ? entry.reserved_usd : 0;
  const costUsd = observed ? record.cost.usd : 0;
  const exposureUsd = decision === 'closed_unknown' ? entry.reserved_usd : 0;
  return {
    reserved_usd: entry.reserved_usd,
    reserve_closed: decision !== 'kept',
    reserve_released_usd: releasedUsd,
    cost_accounted_usd: costUsd,
    exposure_unknown_usd: exposureUsd,
    available_before_usd: round(totalUsd - committedUsd(before.consumption, before.open_reservations)),
    net_available_effect_usd: round(releasedUsd - costUsd),
    available_after_usd: round(totalUsd - committedUsd(after.consumption, after.open_reservations)),
    unknown_calls_after: after.consumption.unknown_calls,
  };
}

// Aplica uma decisão a uma reserva aberta e devolve o novo estado e o efeito no saldo calculado (RC-045).
// Reserva já encerrada ou inexistente é recusada, para que a segunda tentativa não libere nem some custo (RC-053).
function applyDecision(state, record, totalUsd) {
  const entry = state.open_reservations.find((item) => item.session_id === record.reserve_id);
  if (!entry) throw new ConfigError(`reserva "${record.reserve_id}" já encerrada ou inexistente nesta execução; registro recusado (RC-053)`);
  const observed = record.reserve_decision === 'closed_observed';
  const next = applyReconciliation(state.consumption, state.open_reservations, [{
    session_id: record.reserve_id,
    decision: record.reserve_decision,
    observed_usd: observed ? record.cost.usd : undefined,
    source: observed ? record.cost.origin : undefined,
  }]);
  const nextState = { consumption: next.consumption, open_reservations: next.open_reservations };
  const effect = totalUsd === undefined ? null : effectOf({ entry, record, before: state, after: nextState, totalUsd });
  return { state: nextState, effect, entry };
}

// Estado após aplicar, na ordem, as reconciliações ativas sobre a base (snapshot antes das reconciliações).
function replayActive(base, active) {
  const start = { consumption: { ...base.consumption }, open_reservations: base.open_reservations.map((entry) => ({ ...entry })) };
  return active.reduce((state, record) => applyDecision(state, record).state, start);
}

// Estado calculado a partir de base e dos registros: o saldo nunca vem do registro (RC-045).
export function replayReconciliations(base, records = []) {
  return replayActive(base, activeRecords(records));
}

// Chave canônica: objeto com chaves ordenadas, para comparar conteúdo sem depender da ordem de escrita.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isPlainObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
const sameJson = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

// Repetição com o mesmo reconciliation_id: idêntica se o conteúdo é o mesmo, sem balance_effect (que é calculado).
function isSameContent(existing, record) {
  const { balance_effect: _existingBalance, ...stored } = existing;
  const { balance_effect: _incomingBalance, ...incoming } = record;
  if (!sameJson(stored, incoming)) return false;
  return record.balance_effect === undefined || sameJson(record.balance_effect, existing.balance_effect);
}

function findActiveTarget(records, supersedesId, reserveId) {
  const target = activeRecords(records).find((record) => record.reconciliation_id === supersedesId);
  if (!target) throw new ConfigError(`supersedes "${supersedesId}" não aponta para reconciliação ativa desta change (RC-056)`);
  if (target.reserve_id !== reserveId) throw new ConfigError(`correção refere-se à reserva ${target.reserve_id}, não a ${reserveId} (RC-056)`);
  return target;
}

// Confere a correspondência execução, invocação e reserva (RC-051, D26 regra 3).
function assertCorrespondence(state, record, invocations) {
  const invocation = invocations.find((item) => item.invocation_id === record.invocation_id && item.execution_id === record.execution_id);
  if (!invocation) throw new ConfigError(`invocação "${record.invocation_id}" não existe na execução "${record.execution_id}" (RC-051)`);
  const entry = state.open_reservations.find((item) => item.session_id === record.reserve_id);
  if (entry && entry.invocation_id !== record.invocation_id) {
    throw new ConfigError(`reserva "${record.reserve_id}" não pertence à invocação "${record.invocation_id}" (RC-051)`);
  }
}

// Confere a identidade do projeto e da change, a origem humana e o formato (D32, RC-050).
function assertIdentity(record, identity) {
  const issues = authorizationIdentityIssues(record, identity);
  if (record.origin !== 'human') issues.push('origin deve ser human (decisão humana)');
  if (issues.length > 0) throw new ConfigError(`registro de reconciliação recusado: ${issues.join('; ')} (RC-050)`);
}

function assertTotal(totalUsd) {
  if (!isNumber(totalUsd) || totalUsd <= 0) throw new ConfigError('saldo total autorizado ausente: sem concessão vigente não há efeito no saldo (RC-031)');
}

// Registra uma reconciliação sobre base (estado antes das reconciliações) e records (registros já gravados).
// Devolve { status: 'accepted' | 'duplicate', record, records, state, warnings }. Não grava nada.
// - duplicate: mesmo reconciliation_id e mesmo conteúdo; nada muda (RC-052);
// - mesmo reconciliation_id com conteúdo diferente, reserva já encerrada, correspondência ou saldo
//   divergente: ConfigError, e base e records não são alterados (RC-045, RC-051, RC-052, RC-053).
export function reconcileRecord({ base, records = [], record, invocations = [], identity, totalUsd }) {
  const verdict = validateReconciliationRecord(record);
  if (!verdict.ok) throw new ConfigError(`registro de reconciliação inválido: ${verdict.errors.join('; ')}`);
  assertIdentity(record, identity);
  assertTotal(totalUsd);
  const existing = records.find((item) => isReconciliation(item) && item.reconciliation_id === record.reconciliation_id);
  if (existing) {
    if (isSameContent(existing, record)) {
      return { status: 'duplicate', record: existing, records, state: replayReconciliations(base, records), warnings: [] };
    }
    throw new ConfigError(`reconciliation_id "${record.reconciliation_id}" já usado com conteúdo diferente; registro recusado (RC-052)`);
  }
  const target = record.supersedes === undefined ? null : findActiveTarget(records, record.supersedes, record.reserve_id);
  const stateBefore = replayActive(base, activeRecords(records).filter((item) => item !== target));
  assertCorrespondence(stateBefore, record, invocations);
  const { effect, entry } = applyDecision(stateBefore, record, totalUsd);
  if (record.balance_effect !== undefined && !sameJson(record.balance_effect, effect)) {
    throw new ConfigError(`balance_effect divergente do calculado: informado ${JSON.stringify(record.balance_effect)}, calculado ${JSON.stringify(effect)}; registro recusado (RC-045)`);
  }
  const warnings = record.reserve_decision === 'closed_observed' && record.cost.usd > entry.reserved_usd ? [OVER_RESERVE_WARNING] : [];
  const stored = { ...record, balance_effect: effect };
  const nextRecords = [...records, stored];
  return { status: 'accepted', record: stored, records: nextRecords, state: replayReconciliations(base, nextRecords), warnings };
}

