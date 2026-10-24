// Retenção local (F9, D16, D17, TE-003): eventos e relatórios locais saem após log_retention_days,
// e o estado, o checkpoint, as autorizações e o resumo durável permanecem. Datas simuladas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHANGE, makeRepo } from './fixture.mjs';
import { writeTree } from '../helpers.mjs';
import { loadPolicy } from '../../harness/policy.mjs';
import { buildEvent, readEvents } from '../../harness/telemetry.mjs';
import { pruneRetention } from '../../harness/retention.mjs';
import { ageFile, DAY_MS, NOW } from './f9-support.mjs';

const LOCAL = join('.harness-local', CHANGE);
const VERSIONED = join('openspec', 'changes', CHANGE);

function eventLine(daysAgo, costUsd, executionId) {
  const at = new Date(NOW - daysAgo * DAY_MS).toISOString();
  return JSON.stringify(buildEvent({
    agent: 'implementador', function: 'invocacao', cost_usd: costUsd, cost_source: 'reported', execution_id: executionId,
  }, { at }));
}

test('[TE-003] limpeza remove eventos com mais de log_retention_days e mantém os recentes', () => {
  // Arrange
  const root = makeRepo();
  assert.equal(loadPolicy(root).log_retention_days, 90);
  writeTree(root, { [`${LOCAL}/events.jsonl`]: `${eventLine(100, 1)}\n${eventLine(10, 2)}\n` });

  // Act
  const result = pruneRetention(root, { now: NOW });

  // Assert
  assert.equal(result.removed_events, 1);
  assert.deepEqual(readEvents(root, CHANGE).map((event) => event.cost_usd), [2]);
});

test('[TE-003] limpeza remove relatórios e saídas capturadas antigos pela data registrada e mantém os recentes', () => {
  // Arrange: a idade vem de generated_at, da linha "Gerado em" e do evento da execução (não do mtime).
  const root = makeRepo();
  const generatedAt = (days) => new Date(NOW - days * DAY_MS).toISOString();
  const old = [`${LOCAL}/report.json`, `${LOCAL}/report.md`, `${LOCAL}/evidence/exec-1/captured.txt`];
  const recent = `${LOCAL}/evidence/exec-2/captured.txt`;
  writeTree(root, {
    [`${LOCAL}/report.json`]: `${JSON.stringify({ schema: '1.0.0', generated_at: generatedAt(100) })}\n`,
    [`${LOCAL}/report.md`]: `# Relatório\n\nGerado em ${generatedAt(100)}.\n`,
    [`${LOCAL}/evidence/exec-1/captured.txt`]: 'conteúdo\n',
    [`${LOCAL}/evidence/exec-2/captured.txt`]: 'conteúdo\n',
    [`${LOCAL}/events.jsonl`]: `${eventLine(100, 1, 'exec-1')}\n${eventLine(5, 1, 'exec-2')}\n`,
  });
  for (const path of [...old, recent]) ageFile(join(root, path), 0);

  // Act
  pruneRetention(root, { now: NOW });

  // Assert
  for (const path of old) assert.equal(existsSync(join(root, path)), false, `deveria ter sido removido: ${path}`);
  assert.equal(existsSync(join(root, recent)), true);
});

test('[TE-003] limpeza preserva evidence-summary.json, checkpoint, autorizações e run-state', () => {
  // Arrange
  const root = makeRepo();
  const protectedFiles = {
    [`${VERSIONED}/evidence-summary.json`]: '{"resumo":"durável"}\n',
    [`${VERSIONED}/checkpoint.json`]: '{"milestone":"archived"}\n',
    [`${VERSIONED}/authorizations.json`]: JSON.stringify({ records: [{ kind: 'reconciliation', reconciliation_id: 'rec-1' }] }),
    [`${LOCAL}/run-state.json`]: '{"state":"ready"}\n',
    [`${LOCAL}/run-state.json.prev`]: '{"state":"awaiting_decision"}\n',
  };
  writeTree(root, { ...protectedFiles, [`${LOCAL}/events.jsonl`]: `${eventLine(200, 1)}\n` });
  for (const path of Object.keys(protectedFiles)) ageFile(join(root, path), 200);
  const before = Object.fromEntries(Object.keys(protectedFiles).map((path) => [path, readFileSync(join(root, path), 'utf8')]));

  // Act
  const result = pruneRetention(root, { now: NOW });

  // Assert
  assert.equal(result.removed_events, 1, 'a limpeza precisa ter atuado para a preservação valer');
  for (const [path, content] of Object.entries(before)) {
    assert.equal(readFileSync(join(root, path), 'utf8'), content, `alterado indevidamente: ${path}`);
  }
});

test('[TE-003] diagnósticos de lock seguem a mesma data registrada dos eventos: o antigo sai e o recente fica', () => {
  // Arrange
  const root = makeRepo();
  const recentLock = JSON.stringify({ schema: '1.0.0', kind: 'lock', event: 'acquired', at: new Date(NOW - 5 * DAY_MS).toISOString() });
  const oldLock = JSON.stringify({ schema: '1.0.0', kind: 'lock', event: 'acquired', at: new Date(NOW - 200 * DAY_MS).toISOString() });
  writeTree(root, { [`${LOCAL}/events.jsonl`]: `${oldLock}\n${recentLock}\n${eventLine(200, 1)}\n` });

  // Act
  pruneRetention(root, { now: NOW });

  // Assert
  const lines = readFileSync(join(root, LOCAL, 'events.jsonl'), 'utf8').trim().split('\n');
  assert.deepEqual(lines, [recentLock]);
});
