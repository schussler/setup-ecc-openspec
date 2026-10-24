// Retenção de log_retention_days por datas registradas (F9, TE-003, TE-011, decisão aprovada 3).
// A idade vem do que o próprio registro grava: `at` em cada linha de events.jsonl; `generated_at`
// em report.json e report-export.json; a linha "Gerado em" de report.md; e o `at` mais recente
// dos eventos da execução para as saídas em evidence/<execution_id>/. Nunca vem do mtime.
// Dado sem data válida gera aviso e é preservado. Só mexe em .harness-local/. Estado, checkpoint,
// autorizações e resumo durável nunca são removidos. Reescrever events.jsonl exige o lock da change.
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { assertChangeName } from './identity.mjs';
import { acquireLock, releaseLock } from './lock.mjs';
import { loadPolicy } from './policy.mjs';
import { eventsPath, EVENTS_FILE } from './telemetry.mjs';
import { writeFileAtomic } from './state.mjs';

const LOCAL_ROOT = '.harness-local';
const EVIDENCE_DIR = 'evidence';
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;
const GENERATED_LINE = /^Gerado em (.+)\.$/m;
const REPORT_JSON_FILES = new Set(['report.json', 'report-export.json']);
const REPORT_MARKDOWN = 'report.md';

// Arquivos que a retenção nunca remove (TE-003). Ficam no estado local ou versionados na change.
const PROTECTED_FILES = new Set([
  'run-state.json', 'run-state.json.prev', 'checkpoint.json', 'authorizations.json', 'evidence-summary.json',
]);

// Milissegundos de uma data registrada em ISO 8601, ou null quando ausente ou inválida.
function timeOf(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Data de cada execução: a mais recente `at` entre os eventos que a citam. Lida antes da limpeza.
function executionDates(path) {
  const dates = new Map();
  if (!existsSync(path)) return dates;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const record = parseJson(line);
    const time = timeOf(record?.at);
    if (time === null || typeof record.execution_id !== 'string') continue;
    dates.set(record.execution_id, Math.max(time, dates.get(record.execution_id) ?? time));
  }
  return dates;
}

// Veredito de uma linha de events.jsonl: expirada, ou preservada (com aviso quando não há data válida).
function lineVerdict(line, cutoffMs) {
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    return { expired: false, warning: 'não é JSON válido; preservada' };
  }
  const time = timeOf(record?.at);
  if (time === null) return { expired: false, warning: 'sem data registrada válida; preservada' };
  return { expired: time < cutoffMs, warning: null };
}

function pruneLines(text, cutoffMs, label) {
  const kept = [];
  const warnings = [];
  let removed = 0;
  text.split('\n').forEach((line, index) => {
    if (line.length === 0) return;
    const verdict = lineVerdict(line, cutoffMs);
    if (verdict.expired) {
      removed += 1;
      return;
    }
    if (verdict.warning) warnings.push(`${label} linha ${index + 1}: ${verdict.warning}`);
    kept.push(line);
  });
  return { kept, removed, warnings };
}

// Reescreve events.jsonl sob o lock da change. Com o lock detido por outro processo, não mexe no arquivo.
function pruneEvents(root, change, cutoffMs, summary) {
  const path = eventsPath(root, change);
  if (!existsSync(path)) return;
  const label = relative(root, path);
  const executionId = randomUUID();
  const lock = acquireLock(root, change, { executionId });
  if (!lock.acquired) {
    summary.warnings.push(`${label}: lock da change em uso (${lock.stopReason}); events.jsonl não limpo nesta passagem`);
    return;
  }
  try {
    const { kept, removed, warnings } = pruneLines(readFileSync(path, 'utf8'), cutoffMs, label);
    summary.warnings.push(...warnings);
    if (removed > 0) writeFileAtomic(path, kept.map((line) => `${line}\n`).join(''));
    summary.removed_events += removed;
  } finally {
    releaseLock(root, change, executionId, { record: false });
    // A limpeza não grava diagnóstico de lock: é procedimento de manutenção, não detentor da change.
  }
}

function jsonTime(path) {
  const data = parseJson(readFileSync(path, 'utf8'));
  return timeOf(data?.generated_at ?? data?.recorded_at);
}

function markdownTime(path) {
  const match = GENERATED_LINE.exec(readFileSync(path, 'utf8'));
  return match ? timeOf(match[1]) : null;
}

// Data registrada de um arquivo retido; undefined quando a classe do arquivo não é retida.
function registeredTime(path, dir, dates) {
  const name = basename(path);
  const [first, executionId] = relative(dir, path).split(/[\\/]/);
  if (first === EVIDENCE_DIR) return dates.get(executionId) ?? null;
  if (REPORT_JSON_FILES.has(name)) return jsonTime(path);
  if (name === REPORT_MARKDOWN) return markdownTime(path);
  return undefined;
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function pruneFiles(root, dir, dates, cutoffMs, summary) {
  for (const path of listFiles(dir)) {
    const name = basename(path);
    if (PROTECTED_FILES.has(name) || name === EVENTS_FILE) continue;
    const time = registeredTime(path, dir, dates);
    if (time === undefined) continue;
    const label = relative(root, path);
    if (time === null) {
      summary.warnings.push(`${label}: sem data registrada válida; preservado`);
    } else if (time < cutoffMs) {
      unlinkSync(path);
      summary.removed_files.push(label);
    }
  }
}

function isChangeName(name) {
  try {
    assertChangeName(name);
    return true;
  } catch {
    return false;
  }
}

// Retenção de log_retention_days (TE-003, TE-011). Devolve o corte, o que foi removido e os avisos.
export function pruneRetention(root, { now = Date.now() } = {}) {
  const days = loadPolicy(root).log_retention_days;
  const cutoffMs = now - days * DAY_MS;
  const summary = { cutoff: new Date(cutoffMs).toISOString(), removed_events: 0, removed_files: [], warnings: [] };
  const base = join(root, LOCAL_ROOT);
  if (!existsSync(base)) return summary;
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!isChangeName(entry.name)) {
      summary.warnings.push(`${LOCAL_ROOT}/${entry.name}: nome fora do padrão de change; não limpo`);
      continue;
    }
    const dir = join(base, entry.name);
    const dates = executionDates(eventsPath(root, entry.name));
    pruneEvents(root, entry.name, cutoffMs, summary);
    pruneFiles(root, dir, dates, cutoffMs, summary);
  }
  return summary;
}
