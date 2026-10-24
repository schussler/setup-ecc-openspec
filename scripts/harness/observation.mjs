// Modo de observação e consumo (add-silent-consumption-observability, CO-001 a CO-020).
// Padrão: observação, sem autorização budget, reserva nem bloqueio por custo. O modo financeiro
// só vale com modo_financeiro: true no perfil da change (ausente ou falso é observação).
// Este módulo lê events.jsonl, consolida o consumo e grava o resumo arquivado. Não chama o modelo,
// não abre rede e não bloqueia o passo: falha de observação vira aviso (RG-003).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertChangeName } from './identity.mjs';
import { ConfigError } from './policy.mjs';
import { appendTelemetryLine, eventsPath, EVENT_SCHEMA_VERSION, LIFECYCLE_KIND } from './telemetry.mjs';

export const FINANCIAL_FLAG = 'modo_financeiro';
export const OBSERVABILITY_KIND = 'observability';
export const SUMMARY_FILE = 'consumo-e-observacoes-finais.md';
export const SUMMARY_TITLE = 'Consumo e observações finais';
const ARCHIVE_DIR = join('openspec', 'changes', 'archive');
const SUCCESS_STATUS = 'success';
const TOKEN_CATEGORIES = Object.freeze([
  ['input', 'Entrada'], ['output', 'Saída'], ['cache_creation_input', 'Cache (criação)'], ['cache_read_input', 'Cache (leitura)'],
]);
const TOP_CONSUMERS = 3;
const USD_DIGITS = 4;
const NO_EVIDENCE = 'Sem evidência para explicar o gasto: nenhuma correção, repetição ou falha registrada.';
const NO_HYPOTHESIS = 'Nenhuma registrada: o resumo não infere causas sem evidência.';
const NOT_MEASURED = 'subagentes e sessões interativas: não medidos (fora da telemetria do runner)';

export function financialMode(profile) {
  const value = profile?.[FINANCIAL_FLAG];
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new ConfigError(`perfil: "${FINANCIAL_FLAG}" deve ser verdadeiro ou falso`);
  return value;
}

// Aviso de observabilidade (CO-014): nunca lança para quem chama. Se nem o aviso couber no arquivo,
// o erro original segue na resposta, e o passo continua com o mesmo resultado funcional.
export function observeSafely(root, change, action) {
  try {
    return { ok: true, value: action(), warning: null };
  } catch (err) {
    try {
      appendTelemetryLine(root, change, {
        schema: EVENT_SCHEMA_VERSION, kind: OBSERVABILITY_KIND, at: new Date().toISOString(), change, message: err.message,
      });
    } catch {
      // Sem canal de aviso gravável: o aviso segue só na resposta.
    }
    return { ok: false, value: null, warning: err.message };
  }
}

// Lê events.jsonl tolerando linhas inválidas: cada uma vira lacuna de medição, não erro.
function readEvents(root, change) {
  const path = eventsPath(root, change);
  if (!existsSync(path)) return { records: [], unreadable: 0 };
  const records = [];
  let unreadable = 0;
  for (const line of readFileSync(path, 'utf8').split('\n').filter(Boolean)) {
    try {
      records.push(JSON.parse(line));
    } catch {
      unreadable += 1;
    }
  }
  return { records, unreadable };
}

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isInvocation = (record) => record.kind === undefined;
const isPaid = (record) => record.paid !== false;
const isObserved = (record) => (record.cost_source === 'reported' || record.cost_source === 'estimated') && isNumber(record.cost_usd);

// Custo por invocação: conhecido (informado ou estimado), desconhecido ou não medido. Nunca vira zero.
function costOf(record) {
  if (!isPaid(record)) return { kind: 'free', usd: 0 };
  if (isObserved(record)) return { kind: record.cost_source, usd: record.cost_usd };
  if (record.cost_source === 'unmeasured') return { kind: 'unmeasured', usd: 0 };
  return { kind: 'unknown', usd: 0 };
}

function tokenTotals(invocations) {
  const totals = Object.fromEntries(TOKEN_CATEGORIES.map(([key]) => [key, 0]));
  let missing = 0;
  for (const record of invocations.filter(isPaid)) {
    if (!record.tokens || typeof record.tokens !== 'object') {
      missing += 1;
      continue;
    }
    for (const [key] of TOKEN_CATEGORIES) {
      if (isNumber(record.tokens[key])) totals[key] += record.tokens[key];
      else missing += 1;
    }
  }
  return { totals, missing };
}

function groupByStage(invocations) {
  const groups = new Map();
  for (const record of invocations) {
    const stage = record.stage ?? 'sem etapa';
    const attempt = record.attempt ?? '—';
    const key = `${stage}|${attempt}`;
    const current = groups.get(key) ?? { stage, attempt, invocations: 0, usd: 0, unknown: 0 };
    const cost = costOf(record);
    groups.set(key, {
      ...current,
      invocations: current.invocations + 1,
      usd: current.usd + cost.usd,
      unknown: current.unknown + (cost.kind === 'unknown' ? 1 : 0),
    });
  }
  return [...groups.values()];
}

function reworkOf(invocations) {
  const corrections = invocations.reduce((sum, record) => sum + (record.corrections_requested ?? 0), 0);
  const repeated = invocations.filter((record) => record.status && record.status !== SUCCESS_STATUS);
  const usd = repeated.reduce((sum, record) => sum + costOf(record).usd, 0);
  return { corrections, repeated: repeated.length, statuses: [...new Set(repeated.map((record) => record.status))], usd };
}

function causesOf(rework, stops) {
  const causes = [];
  if (rework.corrections > 0) causes.push(`${rework.corrections} correção(ões) solicitada(s) registrada(s)`);
  if (rework.repeated > 0) causes.push(`${rework.repeated} invocação(ões) com status diferente de ${SUCCESS_STATUS}: ${rework.statuses.join(', ')}`);
  if (stops.length > 0) causes.push(`parada(s) registrada(s): ${stops.join(', ')}`);
  return causes.length > 0 ? causes : [NO_EVIDENCE];
}

// Consolida events.jsonl. Totais somam só valores conhecidos; lacunas ficam contadas e nomeadas.
export function consumptionSummary(root, change) {
  const { records, unreadable } = readEvents(root, change);
  const invocations = records.filter(isInvocation);
  const costs = invocations.map(costOf);
  const sumKind = (kind) => costs.filter((cost) => cost.kind === kind).reduce((sum, cost) => sum + cost.usd, 0);
  const count = (kind) => costs.filter((cost) => cost.kind === kind).length;
  const tokens = tokenTotals(invocations);
  const stages = groupByStage(invocations);
  const stops = records.filter((record) => record.kind === LIFECYCLE_KIND && record.stop_reason).map((record) => record.stop_reason);
  const warnings = records.filter((record) => record.kind === OBSERVABILITY_KIND).length;
  const rework = reworkOf(invocations);
  const gaps = [];
  if (count('unknown') > 0) gaps.push(`${count('unknown')} invocação(ões) com custo desconhecido, não somada como zero`);
  if (count('unmeasured') > 0) gaps.push(`${count('unmeasured')} invocação(ões) com custo não medido`);
  if (tokens.missing > 0) gaps.push(`${tokens.missing} valor(es) de token ausente(s)`);
  if (unreadable > 0) gaps.push(`${unreadable} linha(s) ilegível(is) em events.jsonl`);
  if (warnings > 0) gaps.push(`${warnings} aviso(s) de observabilidade`);
  if (invocations.length > 0) gaps.push(`${invocations.length} invocação(ões) sem tarefa confiável (não atribuídas a tarefa)`);
  gaps.push(NOT_MEASURED);
  return {
    change,
    invocations: invocations.length,
    tokens,
    cost: { reported_usd: sumKind('reported'), estimated_usd: sumKind('estimated'), unknown: count('unknown'), unmeasured: count('unmeasured') },
    stages,
    top_consumers: [...stages].filter((stage) => stage.usd > 0).sort((a, b) => b.usd - a.usd).slice(0, TOP_CONSUMERS),
    rework,
    causes: causesOf(rework, stops),
    gaps,
    // Parcial enquanto houver qualquer lacuna. Subagentes e sessões interativas sempre entram como lacuna.
    status: gaps.length > 0 ? 'parcial' : 'completo',
  };
}

const usd = (value) => value.toFixed(USD_DIGITS);
const bullet = (text) => `- ${text}`;

function tokenLines({ totals, missing }) {
  const lines = TOKEN_CATEGORIES.map(([key, label]) => bullet(`${label}: ${totals[key]}`));
  lines.push(bullet(missing > 0 ? `valores ausentes: ${missing} (não contados como zero)` : 'valores ausentes: nenhum'));
  return lines;
}

function costLines(summary) {
  const known = summary.cost.reported_usd + summary.cost.estimated_usd;
  return [
    bullet(`Informado pela CLI: US$ ${usd(summary.cost.reported_usd)}`),
    bullet(`Estimado: US$ ${usd(summary.cost.estimated_usd)}`),
    bullet(`Desconhecido: ${summary.cost.unknown} invocação(ões), sem valor (não contado como zero)`),
    bullet(`Total conhecido: US$ ${usd(known)} (${summary.status}: ${summary.gaps.length} lacuna(s), ver abaixo)`),
  ];
}

function stageTable(stages) {
  if (stages.length === 0) return ['Nenhuma invocação registrada.'];
  const header = ['| Etapa | Tentativa | Invocações | Custo conhecido (US$) | Desconhecidos |', '|---|---|---|---|---|'];
  const rows = stages.map((stage) => `| ${stage.stage} | ${stage.attempt} | ${stage.invocations} | ${usd(stage.usd)} | ${stage.unknown} |`);
  return [...header, ...rows];
}

function consumerLines(top) {
  if (top.length === 0) return ['Nenhum custo conhecido para ranquear.'];
  return top.map((stage) => bullet(`etapa ${stage.stage}, tentativa ${stage.attempt}: US$ ${usd(stage.usd)} (${stage.invocations} invocação(ões))`));
}

// Texto do resumo. Título exato em SUMMARY_TITLE; causas e hipóteses em seções separadas (CO-012).
export function renderSummary(summary) {
  const sections = [
    [`## ${SUMMARY_TITLE}`, `Change: \`${summary.change}\``, `Invocações registradas: ${summary.invocations}`, `Status do total: ${summary.status}`],
    ['### Tokens por categoria', ...tokenLines(summary.tokens)],
    ['### Custo informado ou estimado', ...costLines(summary)],
    ['### Consumo por etapa e tentativa', ...stageTable(summary.stages)],
    ['### Maiores consumidores', ...consumerLines(summary.top_consumers)],
    ['### Correções e repetições', bullet(`correções solicitadas: ${summary.rework.corrections}`), bullet(`invocações repetidas ou com falha: ${summary.rework.repeated} (US$ ${usd(summary.rework.usd)})`)],
    ['### Causas observadas', ...summary.causes.map(bullet)],
    ['### Hipóteses', bullet(NO_HYPOTHESIS)],
    ['### Lacunas de medição', ...summary.gaps.map(bullet)],
  ];
  return `${sections.map((lines) => lines.join('\n')).join('\n\n')}\n`;
}

// Pasta arquivada da change: openspec/changes/archive/<data>-<change>. Null se não existir.
export function findArchivedDir(root, change) {
  const base = join(root, ARCHIVE_DIR);
  if (!existsSync(base)) return null;
  const matches = readdirSync(base).filter((name) => name.endsWith(`-${change}`)).sort();
  return matches.length === 0 ? null : join(base, matches.at(-1));
}

// Grava o resumo junto dos artefatos arquivados (CO-010). Não toca em proposal, design, specs nem aprovações.
export function writeArchivedSummary(root, change) {
  assertChangeName(change);
  const dir = findArchivedDir(root, change);
  if (dir === null) throw new ConfigError(`change arquivada "${change}" não encontrada em ${ARCHIVE_DIR}`);
  const path = join(dir, SUMMARY_FILE);
  writeFileSync(path, renderSummary(consumptionSummary(root, change)));
  return path;
}

// Subcomando `consumo`. Sem --archived é somente leitura (CO-016). Com --archived grava o resumo arquivado.
export function consumo({ root, change, options }) {
  if (options.archived === undefined) {
    const summary = consumptionSummary(root, change);
    return { status: 'ok', section: renderSummary(summary) };
  }
  const path = writeArchivedSummary(root, change);
  return { status: 'written', path, section: renderSummary(consumptionSummary(root, change)) };
}
