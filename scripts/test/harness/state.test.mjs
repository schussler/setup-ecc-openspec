import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHANGE, makeRepo } from './fixture.mjs';
import { changeDir, localDir } from '../../harness/identity.mjs';
import { createState, loadState, prepareReservation, saveState } from '../../harness/state.mjs';
import { ConfigError } from '../../harness/policy.mjs';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function statePath(root) {
  return join(localDir(root, CHANGE), 'run-state.json');
}

function prevPath(root) {
  return join(localDir(root, CHANGE), 'run-state.json.prev');
}

function readRaw(path) {
  return readFileSync(path, 'utf8');
}

function assertConfigError(fn, stopReason = 'config_error') {
  assert.throws(fn, (err) => err instanceof ConfigError && err.stopReason === stopReason);
}

test('[RS-003] gravacao valida incrementa a revisao em uma unidade e guarda a anterior em .prev', () => {
  const root = makeRepo();
  const first = createState(root, CHANGE, { mode: 'runner' });
  assert.equal(first.revision, 1);

  const second = saveState(root, CHANGE, { ...first, state: 'invoking' });

  assert.equal(second.revision, 2);
  assert.equal(loadState(root, CHANGE).revision, 2);
  assert.equal(JSON.parse(readRaw(prevPath(root))).revision, 1);
});

test('[RS-004] falha durante a escrita preserva a revisao anterior', () => {
  const root = makeRepo();
  const first = createState(root, CHANGE, { mode: 'runner' });
  const failBeforeRename = {
    hooks: {
      beforeRename() {
        throw new Error('falha injetada antes do rename');
      },
    },
  };

  assert.throws(() => saveState(root, CHANGE, { ...first, state: 'invoking' }, failBeforeRename), /falha injetada/);

  const after = loadState(root, CHANGE);
  assert.equal(after.revision, 1);
  assert.notEqual(after.recovered, true);
  assert.deepEqual(
    readdirSync(localDir(root, CHANGE)).filter((name) => name.endsWith('.tmp')),
    [],
    'o temporário de uma escrita falha não pode ficar para trás',
  );
});

test('[RS-005] run-state truncado recupera a revisao anterior pelo .prev sem recriar o estado', () => {
  const root = makeRepo();
  const first = createState(root, CHANGE, { mode: 'runner' });
  saveState(root, CHANGE, { ...first, state: 'invoking' });
  const truncated = '{"schema_version": "1.0.0", "revi';
  writeFileSync(statePath(root), truncated);

  const recovered = loadState(root, CHANGE);

  assert.equal(recovered.revision, 1);
  assert.equal(recovered.recovered, true);
  assert.equal(readRaw(statePath(root)), truncated, 'a leitura não pode regravar o arquivo principal');
});

test('[RS-006] estado ilegivel nos dois arquivos para com config_error e nao recria o estado', () => {
  const root = makeRepo();
  const first = createState(root, CHANGE, { mode: 'runner' });
  saveState(root, CHANGE, { ...first, state: 'invoking' });
  writeFileSync(statePath(root), '{truncado');
  writeFileSync(prevPath(root), 'não é json');

  assert.throws(
    () => loadState(root, CHANGE),
    (err) => err instanceof ConfigError && err.stopReason === 'config_error' && err.state === 'config_blocked',
  );
  assert.equal(readRaw(statePath(root)), '{truncado');
  assert.equal(readRaw(prevPath(root)), 'não é json');
});

test('[RS-007] reserva e session_id ficam gravados antes de qualquer processo', () => {
  const root = makeRepo();
  createState(root, CHANGE, { mode: 'runner' });

  const sessionId = prepareReservation(root, CHANGE, { reserved_usd: 1 });

  assert.match(sessionId, UUID_V4);
  const onDisk = JSON.parse(readRaw(statePath(root)));
  assert.equal(onDisk.revision, 2);
  assert.deepEqual(onDisk.open_reservations.map((item) => item.session_id), [sessionId]);
});

test('[RS-008] checkpoint ou estado com change divergente para com config_error e nao grava', () => {
  const root = makeRepo();
  const first = createState(root, CHANGE, { mode: 'runner' });
  const divergent = { ...first, change: 'outra-change' };
  writeFileSync(statePath(root), JSON.stringify(divergent, null, 2));
  const before = readRaw(statePath(root));

  assertConfigError(() => loadState(root, CHANGE));
  assertConfigError(() => saveState(root, CHANGE, { ...divergent, state: 'invoking' }));
  assert.equal(readRaw(statePath(root)), before);
});

test('[RS-008] estado com project_id de outro projeto para com config_error e não grava', () => {
  const root = makeRepo();
  const first = createState(root, CHANGE, { mode: 'runner' });
  const foreign = { ...first, project_id: '7d1e4c2b-0a9f-4b3e-8c6d-5e4f3a2b1c0d' };
  writeFileSync(statePath(root), JSON.stringify(foreign, null, 2));
  const before = readRaw(statePath(root));

  assertConfigError(() => loadState(root, CHANGE));
  assertConfigError(() => saveState(root, CHANGE, { ...foreign, state: 'invoking' }));
  assert.equal(readRaw(statePath(root)), before);
});

test('[RS-015] alterar o modo gravado no disco para com config_error e nao grava', () => {
  const root = makeRepo();
  const first = createState(root, CHANGE, { mode: 'runner' });
  const tampered = { ...first, mode: 'legacy' };
  writeFileSync(statePath(root), JSON.stringify(tampered, null, 2));
  const before = readRaw(statePath(root));

  assertConfigError(() => saveState(root, CHANGE, { ...first, state: 'invoking' }));
  assert.equal(readRaw(statePath(root)), before);
});

test('[RS-015] mudar o modo em memoria para com config_error e nao grava', () => {
  const root = makeRepo();
  const first = createState(root, CHANGE, { mode: 'runner' });
  const before = readRaw(statePath(root));

  assertConfigError(() => saveState(root, CHANGE, { ...first, mode: 'legacy' }));
  assert.equal(readRaw(statePath(root)), before);
});

test('[RS-015] modo fora de legacy e runner e recusado na criacao', () => {
  const root = makeRepo();

  assert.throws(() => createState(root, CHANGE, { mode: 'hibrido' }), ConfigError);
  assert.equal(existsSync(statePath(root)), false);
});

test('[RS-008] changeDir aponta para openspec/changes e recusa nomes com caminho', () => {
  const root = makeRepo();

  assert.equal(changeDir(root, CHANGE), join(root, 'openspec', 'changes', CHANGE));
  assert.throws(() => changeDir(root, '../fora'), ConfigError);
});
