// Declaração de runtime (F9, item 5) e ignore de .harness-local/ (F9, 9.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHANGE, REPO_ROOT } from './fixture.mjs';
import { buildReport, currentRuntime, nodeCompatibility, renderMarkdown } from '../../harness/report.mjs';
import { GENERATED_AT } from './f9-support.mjs';

const NOT_VERIFIED = 'Node >= 22: não verificado';

test('o relatório registra a versão de Node em uso e marca Node >= 22 como não verificado fora da linha 22', () => {
  // Arrange
  const runtime = currentRuntime();

  // Act
  const report = buildReport({ change: CHANGE, events: [], runtime, generatedAt: GENERATED_AT });

  // Assert
  assert.equal(report.runtime.node_version, process.versions.node);
  assert.match(renderMarkdown(report), new RegExp(`Node ${process.versions.node.replace(/\./g, '\\.')}`));
  const major = Number(process.versions.node.split('.')[0]);
  if (major !== 22) assert.ok(renderMarkdown(report).includes(NOT_VERIFIED));
});

test('a marca Node >= 22 não verificado aparece para versões fora de 22.x e some dentro de 22.x', () => {
  // Arrange / Act
  const node24 = nodeCompatibility('24.21.0');
  const node22 = nodeCompatibility('22.12.0');
  const node20 = nodeCompatibility('20.11.1');

  // Assert
  assert.equal(node24.status, NOT_VERIFIED);
  assert.equal(node20.status, NOT_VERIFIED);
  assert.notEqual(node22.status, NOT_VERIFIED);
  assert.equal(node22.node_version, '22.12.0');
});

test('o .gitignore da raiz ignora .harness-local/', () => {
  // Arrange
  const path = join(REPO_ROOT, '.gitignore');

  // Act
  const lines = readFileSync(path, 'utf8').split('\n').map((line) => line.trim());

  // Assert
  assert.ok(lines.includes('.harness-local/'));
});
