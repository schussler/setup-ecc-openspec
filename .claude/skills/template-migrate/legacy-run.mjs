// Migração de uma execução legada para o modo runner (F12, PM-001 a PM-009).
// A ordem é fixa: copia o estado legado, importa o histórico como `legacy-markdown`
// (nunca aprovação), grava os contadores conservadores e a baseline, grava o checkpoint
// de migração e só então muda o modo. Cada etapa concluída fica em progress.json, e a
// reexecução completa o que faltou sem repetir linhas. A cópia pré-migração é a única
// origem de uma restauração (manual_rollback, D32), que exige decisão humana em terminal
// interativo, confere o hash da cópia e não é transparente.
import { createHash } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { listTestFiles } from '../../../scripts/gates/checks.mjs';
import { localDir } from '../../../scripts/harness/identity.mjs';
import { acquireLock, releaseLock } from '../../../scripts/harness/lock.mjs';
import { buildInitialState, loadState, saveState, STATE_FILE, writeFileAtomic } from '../../../scripts/harness/state.mjs';
import { recordRestoreEvent } from '../../../scripts/harness/telemetry.mjs';

const MIGRATION = 'migration';
const PRE_MIGRATION = 'pre-migration';
const RECOVERY = 'reexecute o migrate: as etapas concluídas são puladas e o histórico é completado sem repetir linhas';
const TTY_PROCEDURE = 'tty';
const NOT_TRANSPARENT = 'A restauração a partir da cópia pré-migração não é transparente: o consumo acumulado e as evidências locais continuam no histórico.';

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJsonIf = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

// Hash de um diretório: caminho relativo e sha256 de cada arquivo, em ordem lexicográfica.
export function treeHash(dir) {
  const files = [];
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk(dir);
  return sha256(files.map((path) => relative(dir, path)).sort()
    .map((name) => `${name}\n${sha256(readFileSync(join(dir, name)))}\n`).join(''));
}

export function migrationPaths(root, change) {
  const dir = join(localDir(root, change), MIGRATION);
  return {
    dir,
    pre: join(dir, PRE_MIGRATION),
    history: join(dir, 'history.jsonl'),
    counters: join(dir, 'counters.json'),
    baseline: join(dir, 'baseline.json'),
    checkpoint: join(dir, 'checkpoint.json'),
    progress: join(dir, 'progress.json'),
    migrated: join(dir, 'migrated.json'),
    consumption: join(dir, 'consumption-preserved.json'),
    state: join(localDir(root, change), STATE_FILE),
    gates: join(root, 'openspec', 'changes', change, 'gates.json'),
    tracker: join(root, 'docs', 'agents', 'issue-tracker.md'),
  };
}

// Tentativas do gates.json (inclusive as do histórico de baseline anterior). Cada uma é
// uma avaliação; a nota é o que mudou desde a anterior, e é o que conta como nova tentativa.
function gateEvaluations(gates) {
  return Object.entries(gates).flatMap(([gate, record]) => {
    const attempts = [...(record?.history ?? []).flatMap((past) => past.attempts ?? []), ...(record?.attempts ?? [])];
    return attempts.map((item, index) => ({
      kind: 'evaluation', source: 'legacy-gates-json', gate, index: index + 1,
      verdict: item.verdict, note: item.note,
    }));
  });
}

// Linhas da tabela de gates do issue-tracker da change: histórico, nunca aprovação.
export function trackerRows(text, change) {
  return text.split('\n').flatMap((line) => {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 8 || cells[1] !== change || cells[0] === 'Data') return [];
    const [date, , gate, attempt, , , score, verdict] = cells;
    return [{ kind: 'legacy-row', source: 'legacy-markdown', approved: false, date, change, gate, attempt, verdict, score }];
  });
}

// Conta correções de forma conservadora: um retry só conta quando a avaliação seguinte do
// mesmo gate registra uma nota (uma nova tentativa). Avaliação de gate nunca é correção.
// counters_certain é falso quando algum registro não tem nota.
export function countCorrections(events) {
  let corrections = 0;
  let certain = true;
  events.forEach((event, index) => {
    if (typeof event.note !== 'string') certain = false;
    if (event.verdict !== 'retry') return;
    const next = events.slice(index + 1).find((later) => later.gate === event.gate);
    if (next && typeof next.note === 'string' && next.note.trim() !== '') corrections += 1;
  });
  return { evaluations: events.length, corrections, counters_certain: certain };
}

function importEntries(root, change) {
  const p = migrationPaths(root, change);
  const gates = readJsonIf(p.gates);
  const tracker = existsSync(p.tracker) ? readFileSync(p.tracker, 'utf8') : '';
  const evaluations = gates ? gateEvaluations(gates) : [];
  const rows = trackerRows(tracker, change);
  return { evaluations, rows, gatesFound: gates !== null };
}

export function readMigratedHistory(root, change) {
  const path = migrationPaths(root, change).history;
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function interrupted(err) {
  const error = new Error(`migração interrompida: ${err.message}; ${RECOVERY}`);
  error.recovery = RECOVERY;
  return error;
}

// Etapa de histórico: uma linha por entrada, sem repetir o que já foi importado.
function importHistory(p, entries, onEntry) {
  const seen = new Set(existsSync(p.history) ? readFileSync(p.history, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line).id) : []);
  let index = 0;
  for (const entry of entries) {
    const withId = { ...entry, id: digest(entry) };
    if (seen.has(withId.id)) continue;
    index += 1;
    onEntry?.(index, withId);
    appendFileSync(p.history, `${JSON.stringify(withId)}\n`);
    seen.add(withId.id);
  }
}

export function migrateLegacyRun({ root, change, now = new Date(), hooks = {} }) {
  const p = migrationPaths(root, change);
  mkdirSync(p.dir, { recursive: true });
  const journal = readJsonIf(p.progress) ?? { completed: [] };
  const step = (name, run) => {
    hooks.onStep?.(name);
    if (journal.completed.includes(name)) return;
    run();
    journal.completed.push(name);
    writeFileAtomic(p.progress, json(journal));
  };
  const { evaluations, rows, gatesFound } = importEntries(root, change);
  try {
    step('copy', () => {
      if (existsSync(p.pre)) return;
      mkdirSync(p.pre, { recursive: true });
      for (const file of [p.gates, p.tracker, p.state]) {
        if (existsSync(file)) copyFileSync(file, join(p.pre, file.split('/').pop()));
      }
    });
    step('history', () => importHistory(p, [...evaluations, ...rows], hooks.onEntry));
    step('counters', () => {
      const counted = countCorrections(evaluations);
      // Sem gates.json não há contagem a reconstruir: a certeza é falsa.
      writeFileAtomic(p.counters, json({ ...counted, counters_certain: gatesFound && counted.counters_certain, source: 'legacy-gates-json' }));
    });
    step('baseline', () => {
      writeFileAtomic(p.baseline, json({
        created_at: now.toISOString(), source: 'migration-discovery', historical: false, test_files: listTestFiles(root),
      }));
    });
    step('checkpoint', () => {
      const history = readMigratedHistory(root, change);
      writeFileAtomic(p.checkpoint, json({
        milestone: 'migration', migrated_at: now.toISOString(), history_count: history.length, approvals: [],
        pre_migration_sha256: treeHash(p.pre),
      }));
    });
    step('mode', () => {
      const current = readJsonIf(p.state);
      const next = current
        ? { ...current, mode: 'runner', revision: current.revision + 1 }
        : buildInitialState(root, change, { mode: 'runner' });
      writeFileAtomic(p.state, json(next));
    });
    step('migrated', () => writeFileAtomic(p.migrated, json({ migrated_at: now.toISOString(), mode: 'runner' })));
  } catch (err) {
    throw interrupted(err);
  }
  const counters = readJsonIf(p.counters);
  return {
    migrated: true,
    mode: 'runner',
    history_count: readMigratedHistory(root, change).length,
    approvals: [],
    corrections: counters.corrections,
    counters_certain: counters.counters_certain,
  };
}

// Evidência anterior à migração não serve ao arquivamento (PM-006).
export function archiveNeedsRevalidation(root, change) {
  const migrated = readJsonIf(migrationPaths(root, change).migrated);
  const summary = readJsonIf(join(root, 'openspec', 'changes', change, 'evidence-summary.json'));
  if (!migrated || !summary) return { revalidate: false, reason: null };
  const older = !(Date.parse(summary.generated_at) > Date.parse(migrated.migrated_at));
  return { revalidate: older, reason: older ? 'evidência anterior à migração' : null };
}

// Arquivos que a restauração devolve ao conteúdo da cópia pré-migração. O run-state.json
// legado da cópia não volta: o modo é imutável (RS-008) e o estado recebe a marca `restored`.
const restorable = (p) => [p.gates, p.tracker];

// Hash do conjunto restaurável no projeto: caminho e sha256 de cada arquivo ("ausente" quando falta).
function restorableHash(root, p) {
  return sha256(restorable(p).map((file) => `${relative(root, file)}\n${existsSync(file) ? sha256(readFileSync(file)) : 'ausente'}\n`).join(''));
}

function refusal(message, stopReason) {
  const error = new Error(message);
  error.stop_reason = stopReason;
  return error;
}

// Pré-condição (D32, passo a): cópia pré-migração presente e com o hash do checkpoint de migração.
function checkPreMigrationCopy(p) {
  if (!existsSync(p.pre)) throw refusal('cópia pré-migração ausente: não há de onde restaurar; nada foi alterado', 'config_error');
  const expected = readJsonIf(p.checkpoint)?.pre_migration_sha256;
  if (typeof expected !== 'string') {
    throw refusal('checkpoint de migração sem hash registrado da cópia pré-migração; nada foi alterado', 'config_error');
  }
  const actual = treeHash(p.pre);
  if (actual !== expected) {
    throw refusal(`hash da cópia pré-migração (${actual}) não confere com o checkpoint (${expected}); nada foi alterado`, 'config_error');
  }
  return actual;
}

// Terminal interativo e confirmação por código, no mesmo padrão da gravação de autorizações. A skill
// não importa o registro de autorizações (RC-029): a restauração não grava em authorizations.json.
const CODE_LENGTH = 8;
const shortCodeOf = (summary) => sha256(summary).slice(0, CODE_LENGTH);
const defaultInteractive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

async function askInTerminal(summary, code) {
  process.stdout.write(`${summary}\n`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(`Para restaurar, digite o código ${code}: `);
  } finally {
    rl.close();
  }
}

function restoreSummary({ change, approver, reason, source }) {
  return [
    `Restauração manual (manual_rollback, D32) da change ${change}`,
    `Origem: ${source.path} (sha256 ${source.sha256})`,
    `Aprovador: ${approver}`,
    `Motivo: ${reason}`,
    NOT_TRANSPARENT,
    'As reservas abertas precisam de reconciliação (D26) antes de qualquer chamada paga.',
  ].join('\n');
}

// Procedimento manual_rollback (D32, PM-009, PM-011), nesta ordem: terminal interativo; pré-condição
// de hash; confirmação humana; sob o lock da change, evento kind "restore" em events.jsonl, restauração
// dos arquivos, marca `restored` no run-state.json com consumo e reservas preservados, e parada com
// reconciliation_required quando há reservas abertas. Qualquer recusa ocorre antes de alterar arquivos.
// isInteractive e confirm são injetáveis apenas para teste.
export async function rollbackLegacyRun({
  root, change, approver, reason, now = new Date(), isInteractive = defaultInteractive, confirm = askInTerminal,
}) {
  if (!isInteractive()) throw refusal('restauração exige terminal interativo (stdin e stdout); nada foi alterado', 'authorization_required');
  if (!approver || !reason) throw refusal('restauração exige aprovador e motivo registrados; nada foi alterado', 'authorization_required');
  const p = migrationPaths(root, change);
  const state = loadState(root, change);
  if (!state) throw refusal('sem run-state.json da execução migrada; nada foi alterado', 'config_error');
  const source = { path: relative(root, p.pre), sha256: checkPreMigrationCopy(p) };
  const summary = restoreSummary({ change, approver, reason, source });
  const code = shortCodeOf(summary);
  if (String((await confirm(summary, code)) ?? '').trim() !== code) {
    throw refusal('confirmação não confere; nada foi alterado', 'authorization_required');
  }
  const lock = acquireLock(root, change, { executionId: state.execution_id });
  if (!lock.acquired) throw refusal('lock da change ocupado: há invocação em curso; nada foi alterado', 'lock_held');
  try {
    checkPreMigrationCopy(p);
    const previous = restorableHash(root, p);
    const at = now.toISOString();
    recordRestoreEvent(root, change, {
      execution_id: state.execution_id, approver, reason, procedure: TTY_PROCEDURE, source, previous_sha256: previous,
    }, { at });
    const current = loadState(root, change);
    if (current.consumption) writeFileAtomic(p.consumption, json(current.consumption));
    for (const target of restorable(p)) {
      const origin = join(p.pre, target.split('/').pop());
      if (!existsSync(origin)) continue;
      mkdirSync(join(target, '..'), { recursive: true });
      copyFileSync(origin, target);
    }
    const restored = {
      at, approver, reason, procedure: TTY_PROCEDURE, source, previous_sha256: previous,
      restored_sha256: restorableHash(root, p), transparent: false,
    };
    const open = current.open_reservations ?? [];
    const saved = saveState(root, change, {
      ...current,
      restored,
      ...(open.length > 0 ? { state: 'awaiting_decision', stop_reason: 'reconciliation_required' } : {}),
    });
    return {
      transparent: false, restored, consumption_preserved: saved.consumption,
      open_reservations: open.length, stop_reason: saved.stop_reason ?? null, declaration: NOT_TRANSPARENT,
    };
  } finally {
    releaseLock(root, change, state.execution_id);
  }
}

// Ponto de entrada mínimo (B.4): `migrate --change <nome> [--root <dir>]`. A restauração é o comando
// humano do procedimento manual_rollback (D32, PM-011): `restore --change <nome> --approver <nome>
// --reason <texto> [--root <dir>]`, que exige terminal interativo e nunca é transparente.
const USAGE = 'uso: legacy-run.mjs migrate --change <nome> [--root <dir>] | restore --change <nome> --approver <nome> --reason <texto> [--root <dir>]';
const COMMANDS = ['migrate', 'restore'];
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const option = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const change = option('--change');
  if (!COMMANDS.includes(args[0]) || !change) {
    console.log(JSON.stringify({ status: 'error', error: USAGE }, null, 2));
    process.exit(3);
  }
  const root = resolve(option('--root') ?? process.cwd());
  try {
    if (args[0] === 'migrate') {
      const result = migrateLegacyRun({ root, change });
      console.log(JSON.stringify({ status: 'migrated', ...result }, null, 2));
    } else {
      const result = await rollbackLegacyRun({ root, change, approver: option('--approver'), reason: option('--reason') });
      console.log(JSON.stringify({ status: 'restored', ...result }, null, 2));
    }
  } catch (err) {
    console.log(JSON.stringify({ status: 'error', stop_reason: err.stop_reason ?? null, error: err.message }, null, 2));
    process.exit(3);
  }
}
