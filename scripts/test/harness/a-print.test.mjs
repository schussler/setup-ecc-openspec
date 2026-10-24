// Impressão da evidência: derivados com configuração executável, tasks.md e autorizações (A.6, D31).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fingerprint, tasksChangeAllowed } from '../../harness/evidence.mjs';
import { recordAuthorization } from '../../harness/authorize.mjs';
import { CHANGE, CHANGE_DIR, RUNTIME, setupRepo, scenario, tapOf, validate } from './a-support.mjs';

const fp = (root) => fingerprint({ root, change: CHANGE, runtime: RUNTIME }).fingerprint;
const GATES = `${CHANGE_DIR}/gates.json`;
const TASKS_CHECKED = '## 1\n\n- [x] 1.1 primeira\n- [ ] 1.2 segunda\n';
const TASKS_OPEN = '## 1\n\n- [ ] 1.1 primeira\n- [ ] 1.2 segunda\n';

// Gravação real de autorização, com confirmação injetada (o terminal não existe em teste).
async function record(root, input) {
  return recordAuthorization(root, CHANGE, input, {
    isInteractive: () => true,
    confirm: async (_summary, code) => code,
    now: new Date('2026-10-23T12:00:00.000Z'),
    author: 'douglas',
  });
}

test('[EV-002] gates.json com configuração executável muda a impressão', () => {
  const root = setupRepo();
  const before = fp(root);
  writeFileSync(join(root, GATES), '{"checks": {"test": "echo sem gate"}}\n');
  assert.notEqual(fp(root), before, 'configuração executável em derivado entra na impressão');
});

test('[EV-002] gates.json operacional, sem configuração executável, não muda a impressão', () => {
  const root = setupRepo();
  const before = fp(root);
  writeFileSync(join(root, GATES), '{"implement": {"attempts": [{"gate": "lint", "verdict": "pass"}]}}\n');
  assert.equal(fp(root), before);
});

test('[EV-004] desmarcar uma tarefa em tasks.md é alteração operacional permitida', () => {
  assert.equal(tasksChangeAllowed(TASKS_CHECKED, TASKS_OPEN), true);
  assert.equal(tasksChangeAllowed(TASKS_OPEN, TASKS_CHECKED), true);
});

test('[EV-015] alterar o texto de uma tarefa em tasks.md é alteração protegida', () => {
  assert.equal(tasksChangeAllowed(TASKS_OPEN, TASKS_OPEN.replace('primeira', 'primeira, reescrita')), false);
});

test('[EV-015] acrescentar ou remover uma tarefa em tasks.md é alteração protegida', () => {
  assert.equal(tasksChangeAllowed(TASKS_OPEN, `${TASKS_OPEN}- [ ] 1.3 nova\n`), false);
  assert.equal(tasksChangeAllowed(TASKS_OPEN, '## 1\n\n- [ ] 1.1 primeira\n'), false);
});

test('[D31] registro acrescentado em authorizations.json fora de authorize record vira protected_change', async () => {
  const root = setupRepo({ scenarios: [scenario('AC-011')], tap: tapOf(['ok 1 - [AC-011] caso']) });
  await record(root, { kind: 'reconciliation', reason: 'registro legítimo', approver: 'Douglas' });
  assert.equal((await validate(root)).approved, true, 'registro feito por authorize record é aceito');

  const path = join(root, CHANGE_DIR, 'authorizations.json');
  const records = JSON.parse(readFileSync(path, 'utf8'));
  const forged = { ...records[0], id: 'forjado-0001', reason: 'acrescentado à mão' };
  writeFileSync(path, `${JSON.stringify([...records, forged], null, 2)}\n`);

  const result = await validate(root);
  assert.equal(result.stop_reason, 'protected_change', JSON.stringify(result));
  assert.ok(result.protected_changes.some((item) => item.endsWith('authorizations.json')));
});
