// Retenção por datas registradas (TE-003, TE-011, decisão aprovada 3): a idade vem de `at` nos
// eventos, de generated_at nos relatórios e do evento da execução nas saídas capturadas. Nunca do
// mtime. Dado sem data válida gera aviso e é preservado. Datas simuladas, sem relógio real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHANGE, makeRepo } from './fixture.mjs';
import { acquireLock } from '../../harness/lock.mjs';
import { pruneRetention } from '../../harness/retention.mjs';
import { buildEvent, readEvents } from '../../harness/telemetry.mjs';
import { ageFile, DAY_MS, NOW } from './f9-support.mjs';
import { writeTree } from '../helpers.mjs';

const LOCAL = join('.harness-local', CHANGE);
const EVENTS = join(LOCAL, 'events.jsonl');
const iso = (daysAgo) => new Date(NOW - daysAgo * DAY_MS).toISOString();
const abs = (root, path) => join(root, path);

function invocation(daysAgo, fields = {}) {
  return JSON.stringify(buildEvent({ agent: 'implementador', function: 'invocacao', cost_usd: 1, cost_source: 'reported', ...fields }, { at: iso(daysAgo) }));
}

function reportJson(generatedAt) {
  const body = { schema: '1.0.0', change: CHANGE };
  return `${JSON.stringify(generatedAt === undefined ? body : { ...body, generated_at: generatedAt }, null, 2)}\n`;
}

test('[TE-003] evento antigo sai pela data registrada mesmo com mtime recente, e evento recente fica com mtime antigo', () => {
  // Arrange: o arquivo tem um evento de 100 dias e um de 10 dias; o mtime aponta para o passado.
  const root = makeRepo();
  writeTree(root, { [EVENTS]: `${invocation(100, { cost_usd: 1 })}\n${invocation(10, { cost_usd: 2 })}\n` });
  ageFile(abs(root, EVENTS), 400);

  // Act
  const result = pruneRetention(root, { now: NOW });

  // Assert
  assert.equal(result.removed_events, 1);
  assert.deepEqual(readEvents(root, CHANGE).map((event) => event.cost_usd), [2]);
});

test('[TE-003] relatório antigo com mtime recente sai, e relatório recente com mtime antigo fica', () => {
  // Arrange
  const root = makeRepo();
  writeTree(root, {
    [`${LOCAL}/report.json`]: reportJson(iso(100)),
    [`${LOCAL}/report-export.json`]: reportJson(iso(5)),
  });
  ageFile(abs(root, `${LOCAL}/report.json`), 0);
  ageFile(abs(root, `${LOCAL}/report-export.json`), 400);

  // Act
  const result = pruneRetention(root, { now: NOW });

  // Assert
  assert.equal(existsSync(abs(root, `${LOCAL}/report.json`)), false);
  assert.equal(existsSync(abs(root, `${LOCAL}/report-export.json`)), true);
  assert.deepEqual(result.removed_files, [join(LOCAL, 'report.json')]);
});

test('[TE-003] report.md antigo é lido pela linha "Gerado em" e sai com mtime recente', () => {
  // Arrange
  const root = makeRepo();
  writeTree(root, { [`${LOCAL}/report.md`]: `# Relatório\n\nGerado em ${iso(100)}.\n` });
  ageFile(abs(root, `${LOCAL}/report.md`), 0);

  // Act
  pruneRetention(root, { now: NOW });

  // Assert
  assert.equal(existsSync(abs(root, `${LOCAL}/report.md`)), false);
});

test('[TE-003] saída capturada segue a data do evento da sua execução, e sem evento de execução fica preservada', () => {
  // Arrange
  const root = makeRepo();
  writeTree(root, {
    [EVENTS]: `${invocation(100, { execution_id: 'exec-old' })}\n${invocation(5, { execution_id: 'exec-new' })}\n`,
    [`${LOCAL}/evidence/exec-old/captured.txt`]: 'saída antiga\n',
    [`${LOCAL}/evidence/exec-new/captured.txt`]: 'saída recente\n',
    [`${LOCAL}/evidence/exec-orphan/captured.txt`]: 'sem evento\n',
  });
  ageFile(abs(root, `${LOCAL}/evidence/exec-old/captured.txt`), 0);
  ageFile(abs(root, `${LOCAL}/evidence/exec-new/captured.txt`), 400);
  ageFile(abs(root, `${LOCAL}/evidence/exec-orphan/captured.txt`), 400);

  // Act
  const result = pruneRetention(root, { now: NOW });

  // Assert
  assert.equal(existsSync(abs(root, `${LOCAL}/evidence/exec-old/captured.txt`)), false);
  assert.equal(existsSync(abs(root, `${LOCAL}/evidence/exec-new/captured.txt`)), true);
  assert.equal(existsSync(abs(root, `${LOCAL}/evidence/exec-orphan/captured.txt`)), true);
  assert.ok(result.warnings.some((text) => text.includes('exec-orphan')));
});

test('[TE-011] evento sem data registrada é preservado com aviso que nomeia arquivo e linha, mesmo com mtime antigo', () => {
  // Arrange
  const root = makeRepo();
  const withoutDate = JSON.stringify({ schema: '1.0.0', agent: 'implementador', function: 'invocacao', cost_usd: 3, cost_source: 'reported' });
  writeTree(root, { [EVENTS]: `${withoutDate}\n${invocation(100)}\n` });
  ageFile(abs(root, EVENTS), 400);

  // Act
  const result = pruneRetention(root, { now: NOW });

  // Assert
  assert.equal(result.removed_events, 1);
  assert.deepEqual(readEvents(root, CHANGE).map((event) => event.cost_usd), [3]);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /events\.jsonl linha 1/);
  assert.match(result.warnings[0], /sem data/);
});

test('[TE-011] evento com data inválida é preservado com aviso', () => {
  // Arrange
  const root = makeRepo();
  const invalid = JSON.stringify({ schema: '1.0.0', agent: 'x', function: 'invocacao', at: 'não é data', cost_usd: 4, cost_source: 'reported' });
  writeTree(root, { [EVENTS]: `${invalid}\n` });
  ageFile(abs(root, EVENTS), 400);

  // Act
  const result = pruneRetention(root, { now: NOW });

  // Assert
  assert.equal(readFileSync(abs(root, EVENTS), 'utf8').trim(), invalid);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /linha 1/);
});

test('[TE-011] relatório sem generated_at e report.md sem data válida são preservados com aviso', () => {
  // Arrange
  const root = makeRepo();
  writeTree(root, {
    [`${LOCAL}/report.json`]: reportJson(undefined),
    [`${LOCAL}/report.md`]: '# Relatório\n\nGerado em amanhã.\n',
  });
  ageFile(abs(root, `${LOCAL}/report.json`), 400);
  ageFile(abs(root, `${LOCAL}/report.md`), 400);

  // Act
  const result = pruneRetention(root, { now: NOW });

  // Assert
  assert.equal(existsSync(abs(root, `${LOCAL}/report.json`)), true);
  assert.equal(existsSync(abs(root, `${LOCAL}/report.md`)), true);
  assert.equal(result.warnings.length, 2);
  assert.ok(result.warnings.some((text) => text.includes('report.json')));
  assert.ok(result.warnings.some((text) => text.includes('report.md')));
});

test('[TE-003] com o lock da change detido por outro processo, a limpeza não reescreve events.jsonl', () => {
  // Arrange: outro processo detém o lock; a limpeza não pode reescrever o arquivo sob ele.
  const root = makeRepo();
  writeTree(root, { [EVENTS]: `${invocation(100)}\n` });
  acquireLock(root, CHANGE, { executionId: 'holder-exec' });
  const before = readFileSync(abs(root, EVENTS), 'utf8');

  // Act
  const result = pruneRetention(root, { now: NOW });

  // Assert
  assert.equal(readFileSync(abs(root, EVENTS), 'utf8').includes(before.trim()), true);
  assert.equal(result.removed_events, 0);
  assert.ok(result.warnings.some((text) => /lock/.test(text)));
});
