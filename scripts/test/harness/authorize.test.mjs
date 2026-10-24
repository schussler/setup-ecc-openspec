// Testes do registro de autorizações (F5, RC-029, RC-030, PO-011). Nome de cada
// teste começa pelo ID do cenário. Os testes do fluxo de gravação injetam o
// terminal e a confirmação; o caminho real (sem TTY) é testado pelo CLI com stdin de pipe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { AUTHORIZATION_KINDS, recordAuthorization } from '../../harness/authorize.mjs';
import { loadAuthorizations } from '../../harness/contract.mjs';
import { ConfigError } from '../../harness/policy.mjs';
import { CHANGE, PROJECT_ID, REPO_ROOT, makeRepo } from './fixture.mjs';

const AUTHORIZE = join(REPO_ROOT, 'scripts', 'harness', 'authorize.mjs');
const FIXED_NOW = new Date('2026-10-23T12:00:00.000Z');
const interactive = { isInteractive: () => true, now: FIXED_NOW };
const accept = async (_summary, code) => code;

function authPath(root) {
  return join(root, 'openspec', 'changes', CHANGE, 'authorizations.json');
}

function readRecords(root) {
  return JSON.parse(readFileSync(authPath(root), 'utf8'));
}

function budgetInput(extra = {}) {
  return { kind: 'budget', reason: 'orçamento da fatia F5', approver: 'mantenedor', totalUsd: 30, perCallUsd: 2, ...extra };
}

test('[RC-029] CLI sem terminal interativo recusa e não grava nada', () => {
  const root = makeRepo();
  const result = spawnSync(process.execPath, [
    AUTHORIZE, 'record', '--kind', 'budget', '--change', CHANGE,
    '--total-usd', '30', '--per-call-usd', '2', '--reason', 'teste', '--approver', 'mantenedor',
  ], { cwd: root, input: '', encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /terminal interativo/);
  assert.equal(existsSync(authPath(root)), false);
});

test('[RC-029] record sem TTY lança ConfigError e não cria o arquivo', async () => {
  const root = makeRepo();
  await assert.rejects(
    recordAuthorization(root, CHANGE, budgetInput(), { isInteractive: () => false }),
    (err) => err instanceof ConfigError && /terminal interativo/.test(err.message),
  );
  assert.equal(existsSync(authPath(root)), false);
});

test('[RC-012] registro de orçamento traz origem humana, escopo, valor, autor e data', async () => {
  const root = makeRepo();
  await recordAuthorization(root, CHANGE, budgetInput(), { ...interactive, confirm: accept, author: 'mantenedor' });
  const [record] = readRecords(root);
  assert.equal(record.kind, 'budget');
  assert.equal(record.origin, 'human');
  assert.deepEqual(record.scope, { change: CHANGE });
  assert.equal(record.total_usd, 30);
  assert.equal(record.per_call_usd, 2);
  assert.equal('amount_usd' in record, false);
  assert.equal(record.approver, 'mantenedor');
  assert.equal(record.author, 'mantenedor');
  assert.equal(record.recorded_at, FIXED_NOW.toISOString());
  assert.equal(record.project_id, PROJECT_ID);
  assert.match(record.id, /^[0-9a-f-]{36}$/);
});

test('[RC-012] orçamento sem valor é recusado e tipo fora da lista também', async () => {
  const root = makeRepo();
  await assert.rejects(recordAuthorization(root, CHANGE, budgetInput({ totalUsd: undefined }), { ...interactive, confirm: accept }), /total_usd/);
  await assert.rejects(recordAuthorization(root, CHANGE, { ...budgetInput(), kind: 'livre' }, { ...interactive, confirm: accept }), /tipo/);
  assert.equal(existsSync(authPath(root)), false);
  assert.ok(AUTHORIZATION_KINDS.includes('probe_result'));
});

test('[RC-030] revogação acrescenta um registro novo e preserva o original', async () => {
  const root = makeRepo();
  const first = await recordAuthorization(root, CHANGE, budgetInput(), { ...interactive, confirm: accept });
  await recordAuthorization(root, CHANGE, { kind: 'revocation', reason: 'revogação pelo humano', approver: 'mantenedor', revokes: first.id }, { ...interactive, confirm: accept });
  const records = readRecords(root);
  assert.equal(records.length, 2);
  assert.deepEqual(records[0], first);
  assert.equal(records[1].revokes, first.id);
});

test('[RC-030] substituição exige um id existente no arquivo', async () => {
  const root = makeRepo();
  await recordAuthorization(root, CHANGE, budgetInput(), { ...interactive, confirm: accept });
  const before = readFileSync(authPath(root), 'utf8');
  await assert.rejects(
    recordAuthorization(root, CHANGE, budgetInput({ supersedes: 'inexistente' }), { ...interactive, confirm: accept }),
    /não existe/,
  );
  assert.equal(readFileSync(authPath(root), 'utf8'), before);
});

test('[RC-030] arquivo fora do formato canônico é recusado sem alteração', async () => {
  const root = makeRepo();
  mkdirSync(join(root, 'openspec', 'changes', CHANGE), { recursive: true });
  const manual = '[{"id":"manual","kind":"budget","origin":"agent","scope":{"change":"add-spec-harness"},"amount_usd":99}]';
  writeFileSync(authPath(root), manual);
  await assert.rejects(recordAuthorization(root, CHANGE, budgetInput(), { ...interactive, confirm: accept }), ConfigError);
  assert.equal(readFileSync(authPath(root), 'utf8'), manual);
});

test('[RC-030] arquivo alterado durante a confirmação é recusado e nada é gravado', async () => {
  const root = makeRepo();
  await recordAuthorization(root, CHANGE, budgetInput(), { ...interactive, confirm: accept });
  const editWhileConfirming = async (_summary, code) => {
    writeFileSync(authPath(root), '[]\n');
    return code;
  };
  await assert.rejects(
    recordAuthorization(root, CHANGE, budgetInput({ totalUsd: 5, perCallUsd: 1 }), { ...interactive, confirm: editWhileConfirming }),
    /mudou durante a confirmação/,
  );
  assert.equal(readFileSync(authPath(root), 'utf8'), '[]\n');
});

test('[RC-029] confirmação digitada errada não grava', async () => {
  const root = makeRepo();
  await assert.rejects(
    recordAuthorization(root, CHANGE, budgetInput(), { ...interactive, confirm: async () => 'errado' }),
    /confirmação/,
  );
  assert.equal(existsSync(authPath(root)), false);
});

test('[PO-011] probe_result grava o resultado com origem humana', async () => {
  const root = makeRepo();
  const probe = await recordAuthorization(root, CHANGE, { kind: 'probe', reason: 'sonda P.2', approver: 'mantenedor' }, { ...interactive, confirm: accept });
  const evidence = { path: 'relatorios/sonda-p2.json', sha256: 'b'.repeat(64) };
  await recordAuthorization(root, CHANGE, { kind: 'probe_result', reason: 'sonda P.2', approver: 'mantenedor', result: 'enforced', data: { probe_id: probe.id, evidence } }, { ...interactive, confirm: accept });
  const [, record] = readRecords(root);
  assert.equal(record.kind, 'probe_result');
  assert.equal(record.result, 'enforced');
  assert.equal(record.origin, 'human');
});

test('[RC-030] registros gravados são lidos pelo contract.mjs', async () => {
  const root = makeRepo();
  await recordAuthorization(root, CHANGE, budgetInput(), { ...interactive, confirm: accept });
  const { records, errors } = loadAuthorizations(join(root, 'openspec', 'changes', CHANGE));
  assert.deepEqual(errors, []);
  assert.equal(records.length, 1);
  assert.equal(records[0].author, userInfo().username);
});
