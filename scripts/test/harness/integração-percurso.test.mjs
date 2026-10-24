// Percurso integrado pela CLI do runner (B.7): avaliação que falha, correção e nova avaliação,
// e interrupção reconciliada antes da retomada. Usa o simulador de comandos locais; nenhum modelo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ID } from './fixture.mjs';
import { CHANGE, CHANGE_DIR, EXEC, adopt, changeRepo, cli, seedRunner, stateOf, writeRecord, writeText } from './cli-support.mjs';

const FLAG = 'ok.flag';
// O comando de teste falha enquanto o arquivo de marca não existe: a correção é criá-lo.
const GATED_TEST = `${JSON.stringify({ checks: {
  test: { command: `node -e "process.exit(require('fs').existsSync('${FLAG}') ? 0 : 1)"`, suite: 'template' },
  lint: 'node -e ""',
  typecheck: 'node -e ""',
} }, null, 2)}\n`;

test('[SP-010] a primeira avaliação falha, a correção é feita e a nova avaliação passa, pelo runner', async () => {
  const root = changeRepo();
  writeText(root, 'template.json', GATED_TEST);
  adopt(root);
  const started = await cli(root, 'start', ['--mode', 'runner']);
  assert.equal(started.status, 'started');

  const first = await cli(root, 'gate-implement', ['--note', 'primeira tentativa']);
  assert.equal(first.status, 'retry');

  writeFileSync(join(root, FLAG), '');
  const second = await cli(root, 'gate-implement', ['--note', 'correção: marca criada']);
  assert.equal(second.status, 'pass');
  assert.equal(stateOf(root).gates.implement.attempts.length, 2);
  assert.equal(existsSync(join(root, CHANGE_DIR, 'gates.json')), false, 'o runner não grava gates.json');
});

test('[SP-010] arquivamento sem validação final aprovada é recusado e o checkpoint não é gravado', async () => {
  const root = changeRepo();
  seedRunner(root);
  const result = await cli(root, 'checkpoint', ['--milestone', 'archived']);
  assert.equal(result.status, 'refused');
  assert.equal(existsSync(join(root, CHANGE_DIR, 'checkpoint.json')), false);
});

test('[SP-011] interrupção com reserva aberta: retomada recusada até a reconciliação, depois retoma a mesma execução', async () => {
  const root = changeRepo();
  writeText(root, `${CHANGE_DIR}/authorizations.json`, `${JSON.stringify([{
    id: 'bud-1', kind: 'budget', origin: 'human', project_id: PROJECT_ID, scope: { change: CHANGE },
    total_usd: 12.5, per_call_usd: 2, reason: 'teste', approver: 'mantenedor', recorded_at: '2026-10-23T12:00:00.000Z',
  }], null, 2)}\n`);
  seedRunner(root, {
    state: 'invoking',
    invocation_id: 'inv-1',
    invocations: [{ invocation_id: 'inv-1', execution_id: EXEC }],
    open_reservations: [{ session_id: 'res-1', reserved_usd: 2.5, invocation_id: 'inv-1', status: 'open' }],
  });

  const interrupted = await cli(root, 'interrupt');
  assert.equal(interrupted.status, 'recorded');
  assert.equal(stateOf(root).state, 'interrupted');
  assert.equal(stateOf(root).stop_reason, 'reconciliation_required');

  const early = await cli(root, 'resume');
  assert.equal(early.status, 'refused');
  assert.equal(early.stop_reason, 'reconciliation_required');

  const path = writeRecord(root, 'rec-0001', {
    kind: 'reconciliation', origin: 'human', project_id: PROJECT_ID, scope: { change: CHANGE },
    reconciliation_id: 'rec-0001', execution_id: EXEC, invocation_id: 'inv-1', reserve_id: 'res-1',
    reserve_decision: 'closed_observed', evidence_available: [{ nome: 'saida.json', sha256: 'd'.repeat(64) }],
    cost: { usd: 0.42, status: 'observed', origin: 'reported' },
    human_decision: { decided_by: 'procedimento humano', decided_at: '2026-10-24T10:00:00Z', note: 'custo informado pela CLI' },
  });
  assert.equal((await cli(root, 'reconcile', ['--record', path])).status, 'accepted');

  const resumed = await cli(root, 'resume');
  assert.equal(resumed.status, 'resumed');
  assert.equal(stateOf(root).execution_id, EXEC);
  assert.equal(stateOf(root).consumption.known_usd, 0.42);
  assert.equal(stateOf(root).state, 'ready');
});
