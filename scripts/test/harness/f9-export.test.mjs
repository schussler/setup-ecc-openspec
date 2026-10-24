// Exportação (F9, TE-007): arquivo único e resumido, sem valores de segredos e sem eventos brutos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHANGE, makeRepo } from './fixture.mjs';
import { recordEvent } from '../../harness/telemetry.mjs';
import { exportSummary, writeReports } from '../../harness/report.mjs';
import { NOW, RUNTIME_22 } from './f9-support.mjs';

// Padrões independentes da implementação: tokens da Anthropic e da GitHub, chaves AWS e
// cabeçalhos de chave privada, cabeçalhos Bearer e atribuições de segredo.
const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{8,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /Bearer\s+[A-Za-z0-9._-]{10,}/i,
  /(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9._-]{8,}/i,
];
const ALLOWED_KEYS = ['change', 'generated_at', 'runtime', 'cost', 'per_accepted_delivery', 'metrics', 'declarations'];

test('[TE-007] exportação não inclui valores de segredos nem eventos brutos', async () => {
  // Arrange
  const root = makeRepo();
  recordEvent(root, CHANGE, {
    agent: 'implementador', function: 'invocacao', cost_usd: 0.4, cost_source: 'reported', delivery: 'fatia-1', status: 'accepted',
    results: ['saída com chave sk-ant-api03-SEGREDO0123456789abcdef'],
    hashes: { 'config.json': 'ghp_0123456789abcdefghijklmnopqrstuvwxyz' },
    nondeterminism: [{ ref: 'PB-008', description: 'Authorization: Bearer abcdef0123456789xyz' }],
  });
  writeReports(root, CHANGE, { runtime: RUNTIME_22, now: NOW });

  // Act
  const path = exportSummary(root, CHANGE);
  const text = readFileSync(path, 'utf8');
  const exported = JSON.parse(text);

  // Assert
  for (const pattern of SECRET_PATTERNS) assert.doesNotMatch(text, pattern, `segredo exportado: ${pattern}`);
  assert.equal(text.includes('SEGREDO0123456789'), false);
  assert.equal('events' in exported, false);
  assert.deepEqual(Object.keys(exported).filter((key) => !ALLOWED_KEYS.includes(key)), []);
});
