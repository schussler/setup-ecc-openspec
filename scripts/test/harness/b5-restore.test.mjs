// B.5: procedimento manual_rollback (D32, PM-009, PM-011). Fixtures em repositório temporário,
// terminal interativo simulado por injeção e simulador do claude; nenhuma chamada ao modelo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { migrateLegacyRun, migrationPaths, rollbackLegacyRun } from '../../../.claude/skills/template-migrate/legacy-run.mjs';
import { buildReport, renderMarkdown } from '../../harness/report.mjs';
import { resumeExecution, uncoveredReservations } from '../../harness/runner.mjs';
import { loadState } from '../../harness/state.mjs';
import { CHANGE, makeRepo } from './fixture.mjs';
import { CHANGE_DIR, grant, OK_OUTPUT, patchState, step, writeAuthorizations } from './f6-support.mjs';
import { newCallLog, simulatorCalls } from './simulator.mjs';
import { writeTree } from '../helpers.mjs';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const ORIGINAL_GATES = `${JSON.stringify({ implement: { attempts: [{ attempt: 1, verdict: 'pass', note: 'legado' }] } }, null, 2)}\n`;
const TRACKER = '# Issue tracker\n\n## Gates\n\n| Data | Change | Gate | Tentativa | O que falhou | O que mudou | Pontuação | Veredito |\n|---|---|---|---|---|---|---|---|\n';
const CONSUMPTION = { known_usd: 1.25, estimated_usd: 0, unknown_calls: 1 };
const RESERVATION = { session_id: 'sessao-aberta', reserved_usd: 2.5, status: 'open', invocation_id: 'inv-1', attempt_id: 1, opened_at: '2026-10-24T11:00:00.000Z' };
const HUMAN_DECISION = { approver: 'mantenedor', reason: 'migração reprovada pelo dono' };

// Terminal interativo simulado: confirma digitando o código mostrado.
const tty = { isInteractive: () => true, confirm: async (_summary, code) => code };
const noTty = { isInteractive: () => false, confirm: async () => { throw new Error('não deveria perguntar'); } };

// Projeto migrado com consumo acumulado e uma reserva aberta depois da migração.
function migratedProject() {
  const root = makeRepo();
  writeTree(root, { [`${CHANGE_DIR}/gates.json`]: ORIGINAL_GATES, 'docs/agents/issue-tracker.md': TRACKER });
  migrateLegacyRun({ root, change: CHANGE, now: NOW });
  writeFileSync(join(root, CHANGE_DIR, 'gates.json'), '{"implement":{"attempts":[]}}\n');
  patchState(root, { consumption: CONSUMPTION, open_reservations: [RESERVATION] });
  return root;
}

// Conteúdo de todos os arquivos fora do .git, para provar que nada mudou.
function snapshot(root) {
  const out = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === '.git') continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else out[relative(root, path)] = readFileSync(path, 'utf8');
    }
  };
  walk(root);
  return out;
}

const eventsOf = (root) => {
  const path = join(root, '.harness-local', CHANGE, 'events.jsonl');
  return existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [];
};
const sha = (text) => createHash('sha256').update(text).digest('hex');

test('[PM-011] sem terminal interativo a restauração é recusada sem alterar arquivos', async () => {
  const root = migratedProject();
  const before = snapshot(root);
  await assert.rejects(rollbackLegacyRun({ root, change: CHANGE, ...HUMAN_DECISION, ...noTty }), (err) => {
    assert.equal(err.stop_reason, 'authorization_required');
    assert.match(err.message, /terminal interativo/);
    return true;
  });
  assert.deepEqual(snapshot(root), before);
});

test('[PM-011] hash divergente da cópia pré-migração recusa a restauração sem alterar arquivos', async () => {
  const root = migratedProject();
  writeFileSync(join(migrationPaths(root, CHANGE).pre, 'gates.json'), '{"adulterado":true}\n');
  const before = snapshot(root);
  await assert.rejects(rollbackLegacyRun({ root, change: CHANGE, ...HUMAN_DECISION, ...tty }), (err) => {
    assert.equal(err.stop_reason, 'config_error');
    assert.match(err.message, /hash/);
    return true;
  });
  assert.deepEqual(snapshot(root), before);
  assert.equal(eventsOf(root).some((event) => event.kind === 'restore'), false);
});

test('[PM-011] checkpoint de migração sem hash registrado recusa a restauração', async () => {
  const root = migratedProject();
  const { checkpoint } = migrationPaths(root, CHANGE);
  const { pre_migration_sha256: _ignored, ...withoutHash } = JSON.parse(readFileSync(checkpoint, 'utf8'));
  writeFileSync(checkpoint, `${JSON.stringify(withoutHash, null, 2)}\n`);
  const before = snapshot(root);
  await assert.rejects(rollbackLegacyRun({ root, change: CHANGE, ...HUMAN_DECISION, ...tty }), /hash/);
  assert.deepEqual(snapshot(root), before);
});

test('[PM-011] confirmação errada no terminal recusa a restauração sem alterar arquivos', async () => {
  const root = migratedProject();
  const before = snapshot(root);
  await assert.rejects(
    rollbackLegacyRun({ root, change: CHANGE, ...HUMAN_DECISION, isInteractive: () => true, confirm: async () => 'errado' }),
    (err) => err.stop_reason === 'authorization_required',
  );
  assert.deepEqual(snapshot(root), before);
});

test('[PM-011] restauração manual marca o estado e reconcilia antes de continuar', async () => {
  const root = migratedProject();
  const p = migrationPaths(root, CHANGE);
  const preHash = JSON.parse(readFileSync(p.checkpoint, 'utf8')).pre_migration_sha256;
  const result = await rollbackLegacyRun({ root, change: CHANGE, ...HUMAN_DECISION, ...tty, now: NOW });

  // Arquivos restaurados da cópia pré-migração.
  assert.equal(readFileSync(join(root, CHANGE_DIR, 'gates.json'), 'utf8'), ORIGINAL_GATES);
  assert.equal(result.transparent, false);

  // Campo restored com origem, hash anterior e hash atual.
  const state = loadState(root, CHANGE);
  assert.equal(state.restored.source.path, relative(root, p.pre));
  assert.equal(state.restored.source.sha256, preHash);
  assert.match(state.restored.previous_sha256, /^[0-9a-f]{64}$/);
  assert.match(state.restored.restored_sha256, /^[0-9a-f]{64}$/);
  assert.notEqual(state.restored.previous_sha256, state.restored.restored_sha256);
  assert.equal(state.restored.transparent, false);

  // Consumo acumulado preservado, reserva aberta mantida e reconciliação exigida.
  assert.deepEqual(state.consumption, CONSUMPTION);
  assert.deepEqual(state.open_reservations.map((entry) => entry.session_id), ['sessao-aberta']);
  assert.equal(state.stop_reason, 'reconciliation_required');
  assert.equal(uncoveredReservations(state).length, 1);

  // Evento kind restore com aprovador, data, motivo, origem e hash anterior.
  const restore = eventsOf(root).filter((event) => event.kind === 'restore');
  assert.equal(restore.length, 1);
  assert.equal(restore[0].approver, 'mantenedor');
  assert.equal(restore[0].reason, HUMAN_DECISION.reason);
  assert.equal(restore[0].at, NOW.toISOString());
  assert.equal(restore[0].source.sha256, preHash);
  assert.equal(restore[0].previous_sha256, state.restored.previous_sha256);
  assert.equal(restore[0].procedure, 'tty');

  // Nenhum kind novo em authorizations.json.
  assert.equal(existsSync(join(root, CHANGE_DIR, 'authorizations.json')), false);
});

test('[PM-011] nenhuma chamada paga inicia antes da reconciliação das reservas abertas da execução restaurada', async () => {
  const root = migratedProject();
  await rollbackLegacyRun({ root, change: CHANGE, ...HUMAN_DECISION, ...tty, now: NOW });
  assert.equal(resumeExecution({ root, change: CHANGE }).stop_reason, 'reconciliation_required');
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  // Reserva aberta da execução restaurada é fluxo financeiro: o modo financeiro é explícito.
  const outcome = await step(root, log, OK_OUTPUT, { profile: { provisional: true, modo_financeiro: true } });
  assert.equal(outcome.invoked, false);
  assert.equal(outcome.stop_reason, 'reconciliation_required');
  assert.equal(simulatorCalls(log).length, 0);
});

test('[PM-011] relatório da execução restaurada declara que a restauração não é transparente', async () => {
  const root = migratedProject();
  await rollbackLegacyRun({ root, change: CHANGE, ...HUMAN_DECISION, ...tty, now: NOW });
  const report = buildReport({ change: CHANGE, events: [], state: loadState(root, CHANGE) });
  assert.equal(report.restoration.transparent, false);
  assert.match(renderMarkdown(report), /restauração[^\n]*não é transparente/i);
});

test('[PM-009] restauração só ocorre com autorização registrada e o consumo acumulado continua no histórico', async () => {
  const root = migratedProject();
  await assert.rejects(rollbackLegacyRun({ root, change: CHANGE, approver: '', reason: '', ...tty }), (err) => err.stop_reason === 'authorization_required');
  assert.equal(readFileSync(join(root, CHANGE_DIR, 'gates.json'), 'utf8'), '{"implement":{"attempts":[]}}\n');
  await rollbackLegacyRun({ root, change: CHANGE, ...HUMAN_DECISION, ...tty, now: NOW });
  const events = eventsOf(root).filter((event) => event.kind === 'restore');
  assert.equal(events.length, 1);
  assert.deepEqual(loadState(root, CHANGE).consumption, CONSUMPTION);
  assert.deepEqual(JSON.parse(readFileSync(migrationPaths(root, CHANGE).consumption, 'utf8')), CONSUMPTION);
  assert.equal(sha(readFileSync(join(root, CHANGE_DIR, 'gates.json'), 'utf8')), sha(ORIGINAL_GATES));
});
