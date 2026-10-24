// Relatórios e exportação (F9, D17, TE-004 a TE-008). report.json e report.md são derivados dos
// eventos e do estado. Custo conhecido, estimado, desconhecido (contagem) e não medido ficam em
// campos separados; o total só aparece quando não há desconhecido nem etapa não medida.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { localDir } from './identity.mjs';
import { ConfigError } from './policy.mjs';
import { readEvents } from './telemetry.mjs';
import { loadState, writeFileAtomic } from './state.mjs';

const REPORT_SCHEMA = '1.0.0';
const NODE_REQUIRED_MAJOR = 22;
const NODE_NOT_VERIFIED = 'Node >= 22: não verificado';
const NODE_LINE_IN_USE = 'Node 22.x em uso';
const ACCEPTED = 'accepted';
const SUCCESS_STATUSES = ['ok', 'success', 'accepted'];
const PASS = 'pass';
const NONDETERMINISM_OPEN = 'aberto';
const NONDETERMINISM_CAUSE = 'não identificada';
const REDACTED = '[REDACTED]';

// Declarações fixas do relatório (TE-006, EV-010, TE-002, TE-004). Não são opcionais.
export const DECLARATIONS = Object.freeze([
  'A separação entre agentes de implementação e de aceitação não comprova independência técnica do avaliador (TE-006).',
  'A v1 detecta alterações sem isolar o executor. O bloqueio de ação proibida é advisory: não impede a ação (EV-010).',
  'Custo com origem unknown não é zero, e etapa unmeasured não entra em total completo (TE-002, TE-004).',
]);

// Declaração da execução restaurada pelo procedimento manual_rollback (D32, PM-009, PM-011).
export const RESTORE_DECLARATION = 'A restauração a partir da cópia pré-migração não é transparente: o consumo acumulado e as evidências locais continuam no histórico, e as reservas abertas exigem reconciliação antes de qualquer chamada paga (PM-009, PM-011).';

function restorationSummary(state) {
  const restored = state?.restored;
  if (!restored) return null;
  return { at: restored.at, approver: restored.approver, source: restored.source, previous_sha256: restored.previous_sha256, restored_sha256: restored.restored_sha256, transparent: false };
}

// Padrões de segredo removidos da exportação (TE-007). Cobertura mínima, não garantia.
const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /ghp_[A-Za-z0-9]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /Bearer\s+[A-Za-z0-9._-]{10,}/gi,
  /(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9._-]{8,}/gi,
];

const round = (value) => Math.round(value * 1e6) / 1e6;
const sum = (values) => values.reduce((total, value) => total + value, 0);

export function currentRuntime() {
  return { node_version: process.versions.node, platform: process.platform };
}

// Marca de compatibilidade: só 22.x sem marca. Outras linhas ficam "não verificado" (item 5, D21).
export function nodeCompatibility(version = process.versions.node) {
  const major = Number(String(version).split('.')[0]);
  return {
    node_version: version,
    required: '>= 22',
    status: major === NODE_REQUIRED_MAJOR ? NODE_LINE_IN_USE : NODE_NOT_VERIFIED,
  };
}

// O estado entra como piso: chamada interrompida sem evento (runner morto) continua desconhecida (D17, RC-024).
// Escopo do total: só a execução automatizada é medida; a preparação interativa (entrevista, contrato)
// não passa pelo runner e não entra no total.
export const TOTAL_SCOPE = 'execução automatizada medida; preparação interativa não mensurada';

function costSummary(events, state = null) {
  const paid = events.filter((event) => event.paid !== false);
  const bySource = (source) => paid.filter((event) => event.cost_source === source).map((event) => event.cost_usd);
  const knownUsd = round(sum(bySource('reported')));
  const estimatedUsd = round(sum(bySource('estimated')));
  const unknownCalls = Math.max(paid.filter((event) => event.cost_source === 'unknown').length, state?.consumption?.unknown_calls ?? 0);
  const unknownExposureUsd = round(state?.consumption?.unknown_exposure_usd ?? 0);
  const unmeasuredSteps = paid.filter((event) => event.cost_source === 'unmeasured').length;
  const complete = unknownCalls === 0 && unmeasuredSteps === 0;
  return {
    known_usd: knownUsd,
    estimated_usd: estimatedUsd,
    unknown_calls: unknownCalls,
    unknown_exposure_usd: unknownExposureUsd,
    unmeasured_steps: unmeasuredSteps,
    total_complete: complete,
    total_scope: TOTAL_SCOPE,
    total_usd: complete ? round(knownUsd + estimatedUsd) : null,
  };
}

// Custo por entrega aceita: todas as tentativas do change (inclusive as malsucedidas) divididas
// pelas entregas aceitas. Com custo incompleto, o valor parcial é rotulado e não vira total.
function deliverySummary(events, cost) {
  const accepted = new Set(events.filter((event) => event.status === ACCEPTED && event.delivery).map((event) => event.delivery));
  // Tentativa malsucedida = invocação paga que não deu resultado de sucesso (negação, erro, quota, falha).
  // Validação final reprovada não é tentativa de chamada: fica de fora desta conta.
  const failedAttempts = events.filter((event) => event.function === 'invocacao' && event.paid !== false
    && !SUCCESS_STATUSES.includes(event.status)).length;
  const spent = round(cost.known_usd + cost.estimated_usd);
  const perAccepted = accepted.size === 0 ? null : round(spent / accepted.size);
  return {
    accepted: accepted.size,
    failed_attempts: failedAttempts,
    known_usd: cost.known_usd,
    estimated_usd: cost.estimated_usd,
    complete: cost.total_complete,
    usd: cost.total_complete ? perAccepted : null,
    usd_known_partial: cost.total_complete ? null : perAccepted,
  };
}

// Último resultado de cada caso citado nos eventos, na ordem de gravação.
function lastOutcomes(events) {
  const outcomes = new Map();
  for (const event of events) {
    for (const item of event.cases ?? []) {
      outcomes.set(item.id, { outcome: item.outcome, mandatory: item.mandatory === true, regression: item.regression === true });
    }
  }
  return [...outcomes.values()];
}

function acceptanceSummary(outcomes) {
  const mandatory = outcomes.filter((item) => item.mandatory);
  const passing = mandatory.filter((item) => item.outcome === PASS).length;
  return {
    mandatory_total: mandatory.length,
    mandatory_passing: passing,
    rate: mandatory.length === 0 ? null : round(passing / mandatory.length),
  };
}

function countBy(reasons) {
  const counts = {};
  for (const reason of reasons) counts[reason] = (counts[reason] ?? 0) + 1;
  return counts;
}

// Paradas dos eventos e do histórico do estado; por motivo, vale a maior contagem, porque a mesma
// parada pode estar nas duas fontes e a parada sem invocação não gera evento.
function stopsByType(events, state) {
  const fromEvents = countBy(events.flatMap((event) => event.stops ?? []));
  const fromState = countBy((state?.stop_history ?? []).map((item) => item.stop_reason).filter(Boolean));
  const reasons = [...new Set([...Object.keys(fromEvents), ...Object.keys(fromState)])].sort();
  return Object.fromEntries(reasons.map((reason) => [reason, Math.max(fromEvents[reason] ?? 0, fromState[reason] ?? 0)]));
}

// Correções despachadas: contadores do estado como piso, porque o evento da invocação não as traz.
function correctionsRequested(events, state) {
  const fromEvents = sum(events.map((event) => event.corrections_requested ?? 0));
  const fromState = sum(Object.values(state?.counters?.corrections ?? {}));
  return Math.max(fromEvents, fromState);
}

// Não determinismo registrado: cada referência aparece uma vez, como aberta e sem causa.
// Passagens posteriores não apagam o registro (PB-008, PB-009).
function nondeterminismSummary(events) {
  const refs = new Map();
  for (const item of events.flatMap((event) => event.nondeterminism ?? [])) {
    const current = refs.get(item.ref) ?? { ref: item.ref, status: NONDETERMINISM_OPEN, cause: NONDETERMINISM_CAUSE, observations: 0 };
    refs.set(item.ref, { ...current, observations: current.observations + 1 });
  }
  return [...refs.values()];
}

const NOT_MEASURED = 'não medida';
const FINAL_VALIDATION = 'validacao_final';

// Aprovação final do runner (TE-005): aprovada só com execution_approval da execução atual; com validação
// final registrada e sem aprovação, não aprovada; sem validação final, não medida.
function finalApproval(events, state) {
  if (state?.execution_approval && state.execution_approval.execution_id === state.execution_id) return 'aprovada';
  return events.some((event) => event.function === FINAL_VALIDATION) ? 'não aprovada' : NOT_MEASURED;
}

function metricsSummary(events, state = null) {
  const outcomes = lastOutcomes(events);
  const decisionEvents = events.filter((event) => (event.human_decisions ?? []).length > 0);
  return {
    final_approval: finalApproval(events, state),
    acceptance: acceptanceSummary(outcomes),
    // A avaliação externa de referência fica fora do runner: o relatório não a mede nem a deduz.
    external_evaluation: NOT_MEASURED,
    regressions: { open: outcomes.filter((item) => item.regression && item.outcome !== PASS).length },
    rework: {
      corrections_requested: correctionsRequested(events, state),
      changes_produced: sum(events.map((event) => (event.changes_produced ?? []).length)),
    },
    human_intervention: {
      decisions: sum(events.map((event) => (event.human_decisions ?? []).length)),
      events: decisionEvents.length,
    },
    interruptions: Math.max(sum(events.map((event) => (event.interruptions ?? []).length)), (state?.interruptions ?? []).length),
    stops_by_type: stopsByType(events, state),
    nondeterminism: nondeterminismSummary(events),
  };
}

function stateSummary(state) {
  if (state === null) return null;
  return {
    state: state.state,
    stop_reason: state.stop_reason ?? null,
    execution_id: state.execution_id ?? null,
    invocations_total: state.invocations_total ?? 0,
    consumption: state.consumption ?? null,
    open_reservations: (state.open_reservations ?? []).length,
  };
}

// Relatório derivado: função pura sobre eventos, estado e runtime.
export function buildReport({ change, events, state = null, runtime = currentRuntime(), generatedAt = new Date().toISOString() }) {
  const cost = costSummary(events, state);
  return {
    schema: REPORT_SCHEMA,
    change,
    generated_at: generatedAt,
    runtime: { ...runtime, ...nodeCompatibility(runtime.node_version) },
    state: stateSummary(state),
    events_total: events.length,
    cost,
    per_accepted_delivery: deliverySummary(events, cost),
    metrics: metricsSummary(events, state),
    restoration: restorationSummary(state),
    declarations: state?.restored ? [...DECLARATIONS, RESTORE_DECLARATION] : [...DECLARATIONS],
  };
}

const plural = (count, singular, pluralForm) => (count === 1 ? singular : pluralForm);
const usd = (value) => `US$ ${value}`;

function costLines(cost) {
  const unknownText = `${cost.unknown_calls} ${plural(cost.unknown_calls, 'chamada', 'chamadas')} com custo desconhecido (não somadas como zero)`;
  const scope = `(escopo: ${cost.total_scope ?? TOTAL_SCOPE})`;
  const totalLine = cost.total_complete
    ? `Total completo: sim, ${usd(cost.total_usd)} ${scope}`
    : `Total completo: não ${scope}. Total não apresentado enquanto houver custo desconhecido ou etapa não mensurada.`;
  return [
    `- Custo conhecido (reported): ${usd(cost.known_usd)}`,
    `- Custo estimado: ${usd(cost.estimated_usd)}`,
    `- ${unknownText}`,
    ...(cost.unknown_exposure_usd > 0 ? [`- Exposição desconhecida mantida no comprometido: ${usd(cost.unknown_exposure_usd)} (D26 regra 6; não é custo conhecido)`] : []),
    `- ${cost.unmeasured_steps} ${plural(cost.unmeasured_steps, 'etapa não mensurada', 'etapas não mensuradas')}`,
    `- ${totalLine}`,
  ];
}

function deliveryLines(delivery) {
  const amount = (value) => (value === null ? 'sem entrega aceita' : usd(value));
  const value = delivery.complete
    ? amount(delivery.usd)
    : `parcial, não é total: ${amount(delivery.usd_known_partial)}`;
  return [
    `- Entregas aceitas: ${delivery.accepted}`,
    `- Tentativas malsucedidas incluídas: ${delivery.failed_attempts}`,
    `- Custo por entrega aceita (com tentativas): ${value}`,
  ];
}

function metricLines(metrics) {
  const acceptance = metrics.acceptance;
  const stops = Object.entries(metrics.stops_by_type).map(([reason, count]) => `${reason}: ${count}`).join(', ') || 'nenhuma';
  const nondeterminism = metrics.nondeterminism.map((item) => `${item.ref} (${item.status}, ${item.cause})`).join(', ') || 'nenhum registro';
  return [
    `- Aprovação final do runner: ${metrics.final_approval}`,
    `- Aceitação interna do runner (cenários obrigatórios): ${acceptance.mandatory_total === 0 ? NOT_MEASURED : `${acceptance.mandatory_passing} de ${acceptance.mandatory_total}`}`,
    `- Avaliação externa de referência: ${metrics.external_evaluation} (fora do runner)`,
    `- Regressões abertas: ${metrics.regressions.open}`,
    `- Retrabalho: ${metrics.rework.corrections_requested} correções pedidas, ${metrics.rework.changes_produced} alterações produzidas`,
    `- Intervenção humana: ${metrics.human_intervention.decisions} decisões em ${metrics.human_intervention.events} eventos`,
    `- Interrupções: ${metrics.interruptions}`,
    `- Paradas por tipo: ${stops}`,
    `- Não determinismo: ${nondeterminism}`,
  ];
}

// Markdown para leitura. Seções fixas: Runtime, Custo, Entregas, Métricas (com as declarações).
export function renderMarkdown(report) {
  const runtime = report.runtime;
  return [
    `# Relatório da change ${report.change}`,
    '',
    `Gerado em ${report.generated_at}.`,
    '',
    '## Runtime',
    '',
    `- Node ${runtime.node_version}: ${runtime.status}`,
    '',
    '## Custo',
    '',
    ...costLines(report.cost),
    '',
    '## Entregas',
    '',
    ...deliveryLines(report.per_accepted_delivery),
    '',
    '## Métricas',
    '',
    ...metricLines(report.metrics),
    '',
    '### Limites declarados',
    '',
    ...report.declarations.map((text) => `- ${text}`),
    '',
  ].join('\n');
}

// Grava report.json e report.md em .harness-local/<change>/ (fora do Git).
export function writeReports(root, change, { runtime = currentRuntime(), now = Date.now() } = {}) {
  const events = readEvents(root, change);
  const state = loadState(root, change);
  const report = buildReport({ change, events, state, runtime, generatedAt: new Date(now).toISOString() });
  const dir = localDir(root, change);
  mkdirSync(dir, { recursive: true });
  writeFileAtomic(join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileAtomic(join(dir, 'report.md'), `${renderMarkdown(report)}\n`);
  return { json_path: join(dir, 'report.json'), md_path: join(dir, 'report.md') };
}

function redact(value) {
  if (typeof value === 'string') return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, REDACTED), value);
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]));
  return value;
}

// Exportação resumida (TE-007): um arquivo, sem eventos brutos, sem estado e sem segredos.
export function exportSummary(root, change) {
  const dir = localDir(root, change);
  const reportPath = join(dir, 'report.json');
  if (!existsSync(reportPath)) throw new ConfigError(`relatório ausente em ${reportPath}: gere com writeReports antes de exportar`);
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const summary = redact({
    change: report.change,
    generated_at: report.generated_at,
    runtime: report.runtime,
    cost: report.cost,
    per_accepted_delivery: report.per_accepted_delivery,
    metrics: report.metrics,
    declarations: report.declarations,
  });
  const path = join(dir, 'report-export.json');
  writeFileAtomic(path, `${JSON.stringify(summary, null, 2)}\n`);
  return path;
}
