// CLI do runner: despacho, start, fail, interrupt, resume, checkpoint, report e summary (SP-009, TE-010, RS-024).
// Os testes chamam a CLI in-process; nenhuma chamada ao modelo acontece.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHANGE, EXEC, adopt, changeRepo, cli, eventsOf, seedRunner, stateOf } from './cli-support.mjs';
import { dispatch } from '../../harness/cli.mjs';
import { REPO_ROOT } from './fixture.mjs';

test('[SP-009] start em modo runner sem marco de adoção registrado é recusado e não cria estado', async () => {
  const root = changeRepo();
  const result = await cli(root, 'start', ['--mode', 'runner']);
  assert.equal(result.status, 'refused');
  assert.equal(result.stop_reason, 'config_error');
  assert.equal(stateOf(root), null);
});

test('[TE-010] start cria a execução em legacy por padrão e grava o evento de início com execution_id', async () => {
  const root = changeRepo();
  const result = await cli(root, 'start');
  assert.equal(result.status, 'started');
  const state = stateOf(root);
  assert.equal(state.mode, 'legacy');
  assert.equal(state.execution_id, result.execution_id);
  assert.deepEqual(eventsOf(root).filter((event) => event.kind === 'lifecycle').map((event) => event.phase), ['start']);
  assert.equal(eventsOf(root).find((event) => event.kind === 'lifecycle').execution_id, result.execution_id);
});

test('[SP-009] start com marco registrado cria execução runner e registra o baseline do gate de implementação', async () => {
  const root = changeRepo();
  adopt(root);
  const result = await cli(root, 'start', ['--mode', 'runner']);
  assert.equal(result.status, 'started');
  assert.equal(stateOf(root).mode, 'runner');
  assert.ok(Array.isArray(stateOf(root).gates.implement.baseline.test_files));
});

test('start sobre execução existente é recusado e preserva o execution_id', async () => {
  const root = changeRepo();
  seedRunner(root);
  const result = await cli(root, 'start', ['--mode', 'runner']);
  assert.equal(result.status, 'refused');
  assert.equal(stateOf(root).execution_id, EXEC);
});

test('[TE-010] fail registra o evento de falha com a causa e leva a execução a awaiting_decision', async () => {
  const root = changeRepo();
  seedRunner(root, { state: 'invoking', invocation_id: 'inv-1' });
  const result = await cli(root, 'fail', ['--stop-reason', 'timeout_unclassified', '--cause', 'tempo esgotado']);
  assert.equal(result.status, 'recorded');
  assert.equal(stateOf(root).state, 'awaiting_decision');
  assert.equal(stateOf(root).stop_reason, 'timeout_unclassified');
  const failure = eventsOf(root).find((event) => event.phase === 'fail');
  assert.equal(failure.stop_reason, 'timeout_unclassified');
  assert.equal(failure.cause, 'tempo esgotado');
});

test('[TE-010] fail com motivo desconhecido é recusado sem alterar o estado', async () => {
  const root = changeRepo();
  seedRunner(root);
  const result = await cli(root, 'fail', ['--stop-reason', 'motivo_inventado']);
  assert.equal(result.status, 'error');
  assert.equal(stateOf(root).state, 'ready');
});

test('[TE-010] interrupt registra interrupção com evento próprio e leva a execução a interrupted', async () => {
  const root = changeRepo();
  seedRunner(root, { state: 'invoking', invocation_id: 'inv-1' });
  const result = await cli(root, 'interrupt');
  assert.equal(result.status, 'recorded');
  assert.equal(stateOf(root).state, 'interrupted');
  assert.ok(eventsOf(root).some((event) => event.phase === 'interrupt' && event.invocation_id === 'inv-1'));
});

test('[RS-024] resume retoma a mesma execução, preserva o execution_id e não faz chamada', async () => {
  const root = changeRepo();
  seedRunner(root, { state: 'awaiting_decision', stop_reason: 'human_decision_needed' });
  const result = await cli(root, 'resume');
  assert.equal(result.status, 'resumed');
  assert.equal(stateOf(root).execution_id, EXEC);
  assert.equal(stateOf(root).state, 'ready');
  assert.ok(eventsOf(root).some((event) => event.phase === 'resume' && event.execution_id === EXEC));
});

test('[RS-024] resume de execução com consumo não reconciliado recusa retomada com reconciliation_required', async () => {
  const root = changeRepo();
  seedRunner(root, {
    state: 'interrupted',
    stop_reason: 'reconciliation_required',
    open_reservations: [{ session_id: 'res-1', reserved_usd: 2.5, invocation_id: 'inv-1', status: 'open' }],
  });
  const result = await cli(root, 'resume');
  assert.equal(result.status, 'refused');
  assert.equal(result.stop_reason, 'reconciliation_required');
  assert.equal(stateOf(root).state, 'interrupted');
});

test('[SP-007] checkpoint contract_approved grava checkpoint.json com a execução atual', async () => {
  const root = changeRepo();
  seedRunner(root);
  const result = await cli(root, 'checkpoint', ['--milestone', 'contract_approved']);
  assert.equal(result.status, 'recorded');
  const checkpoint = JSON.parse(readFileSync(join(root, CHANGE_DIR_PATH(), 'checkpoint.json'), 'utf8'));
  assert.equal(checkpoint.milestone, 'contract_approved');
  assert.equal(checkpoint.execution_id, EXEC);
});

test('[SP-007] checkpoint archived sem validação final aprovada é recusado e não grava arquivo', async () => {
  const root = changeRepo();
  seedRunner(root);
  const result = await cli(root, 'checkpoint', ['--milestone', 'archived']);
  assert.equal(result.status, 'refused');
  assert.equal(existsSync(join(root, CHANGE_DIR_PATH(), 'checkpoint.json')), false);
});

test('checkpoint com marco desconhecido é recusado com erro explícito', async () => {
  const root = changeRepo();
  seedRunner(root);
  const result = await cli(root, 'checkpoint', ['--milestone', 'meio_do_caminho']);
  assert.equal(result.status, 'error');
});

test('report grava report.json e report.md no diretório local e devolve o caminho', async () => {
  const root = changeRepo();
  seedRunner(root);
  const result = await cli(root, 'report');
  assert.equal(result.status, 'written');
  assert.ok(existsSync(join(root, '.harness-local', CHANGE, 'report.json')));
  assert.ok(existsSync(join(root, '.harness-local', CHANGE, 'report.md')));
});

test('summary gera a visão de handoff a partir do estado, com execution_id e próximo passo', async () => {
  const root = changeRepo();
  seedRunner(root, { state: 'awaiting_decision', stop_reason: 'correction_limit' });
  const result = await cli(root, 'summary');
  assert.equal(result.status, 'ok');
  assert.equal(result.summary.execution_id, EXEC);
  assert.equal(result.summary.stop_reason, 'correction_limit');
  assert.ok(existsSync(join(root, '.harness-local', CHANGE, 'summary.json')));
});

test('subcomando desconhecido devolve status error com a lista de subcomandos', async () => {
  const result = await dispatch(['inexistente', '--change', CHANGE]);
  assert.equal(result.status, 'error');
  assert.match(result.error, /start/);
});

test('a CLI não chama o modelo: o módulo não importa o adaptador do claude nem o runner de invocação', () => {
  const source = readFileSync(join(REPO_ROOT, 'scripts', 'harness', 'cli.mjs'), 'utf8')
    + readFileSync(join(REPO_ROOT, 'scripts', 'harness', 'cli-actions.mjs'), 'utf8');
  assert.doesNotMatch(source, /from '\.\/claude\.mjs'/);
  assert.doesNotMatch(source, /runHarnessStep|invokeHarness/);
});

function CHANGE_DIR_PATH() {
  return `openspec/changes/${CHANGE}`;
}
