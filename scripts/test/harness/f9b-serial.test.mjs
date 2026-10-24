// Escrita serializada de events.jsonl (TE-009, decisão aprovada 1): gravações de processos
// diferentes passam pela mesma função de telemetria e não corrompem linhas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANGE, makeRepo } from './fixture.mjs';
import { localId, localDir } from '../../harness/identity.mjs';
import { EVENTS_FILE } from '../../harness/telemetry.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WRITER = join(HERE, 'fixtures', 'telemetry-writer.mjs');
const WRITES_PER_PROCESS = 150;
const PAYLOAD_BYTES = 6000;

function runWriter(root, tag) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      HARNESS_ROOT: root,
      HARNESS_CHANGE: CHANGE,
      WRITER_TAG: tag,
      WRITES: String(WRITES_PER_PROCESS),
      PAYLOAD_BYTES: String(PAYLOAD_BYTES),
    };
    execFile(process.execPath, [WRITER], { env }, (error, _stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve();
    });
  });
}

test('[TE-009] duas gravações concorrentes de processos diferentes produzem só linhas JSON completas', async () => {
  // Arrange: o local_id é criado antes, para que a corrida não seja a do arquivo de identidade.
  const root = makeRepo();
  localId(root);

  // Act
  await Promise.all([runWriter(root, 'a'), runWriter(root, 'b')]);

  // Assert
  const lines = readFileSync(join(localDir(root, CHANGE), EVENTS_FILE), 'utf8').split('\n').filter(Boolean);
  assert.equal(lines.length, 2 * WRITES_PER_PROCESS);
  const records = lines.map((line) => JSON.parse(line));
  assert.equal(records.filter((record) => record.writer === 'a').length, WRITES_PER_PROCESS);
  assert.equal(records.filter((record) => record.writer === 'b').length, WRITES_PER_PROCESS);
  assert.ok(records.every((record) => record.payload.length === PAYLOAD_BYTES));
});
