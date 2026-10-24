// Conciliação de invocações e consumo entre estado, eventos e relatório (MS-013).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conciliate } from '../../harness/conciliation.mjs';
import { buildReport } from '../../harness/report.mjs';
import { callEvent } from './f9-support.mjs';

const invocationEvent = (cost) => ({ function: 'invocacao', paid: true, cost_usd: cost, cost_source: 'reported' });

function consistent() {
  return {
    state: {
      invocations_total: 2, counters: { invocations: 2 }, invocations: [{ invocation_id: 'a' }, { invocation_id: 'b' }],
      consumption: { known_usd: 0.3, estimated_usd: 0, unknown_calls: 0 },
    },
    events: [invocationEvent(0.1), invocationEvent(0.2)],
    reportInvocations: 2,
    reportKnownUsd: 0.3,
    financial: false,
  };
}

test('[MS-013] contagens e custo batem entre estado, eventos e relatório', () => {
  const result = conciliate(consistent());
  assert.equal(result.status, 'reconciled', JSON.stringify(result.checks));
});

test('[MS-013] contador de invocações divergente do número de eventos é divergência', () => {
  const input = consistent();
  input.state.counters.invocations = 3;
  const result = conciliate(input);
  assert.equal(result.status, 'divergent');
  // Id renomeado na revisão (MS-021): diz de qual fonte veio a divergência (contador do estado).
  assert.deepEqual(result.checks.filter((check) => !check.ok).map((check) => check.id), ['invocations_state_counter']);
});

// Revisão: a versão com o relatório como segunda fonte de custo foi retirada (o relatório lê os mesmos eventos).
// A intenção do teste, detectar custo diferente dos eventos, passa a ser exercida pela fonte real do modo
// financeiro: o consumo do estado contra a soma dos eventos. Registro no issue-tracker (2026-10-24).
test('[MS-013] custo do relatório diferente dos eventos é divergência', () => {
  const input = consistent();
  input.financial = true;
  input.state.consumption.known_usd = 0.5;
  const result = conciliate(input);
  assert.equal(result.status, 'divergent');
  assert.deepEqual(result.checks.filter((check) => !check.ok).map((check) => check.id), ['known_usd_state']);
});

test('[MS-021] evento pago sem fonte de custo é divergência (a checagem de custo não compara o relatório com ele mesmo)', () => {
  const input = consistent();
  input.events.push({ function: 'invocacao', paid: true, cost_usd: null, cost_source: null });
  input.state.invocations_total = 3;
  input.state.counters.invocations = 3;
  input.state.invocations = [{}, {}, {}];
  input.reportInvocations = 3;
  const result = conciliate(input);
  assert.equal(result.status, 'divergent');
  assert.deepEqual(result.checks.filter((check) => !check.ok).map((check) => check.id), ['cost_sources']);
});

test('[MS-013] em modo financeiro, o consumo do estado também entra na conciliação', () => {
  const input = consistent();
  input.financial = true;
  input.state.consumption.known_usd = 0.25;
  const result = conciliate(input);
  assert.equal(result.status, 'divergent');
  assert.ok(result.checks.some((check) => check.id === 'known_usd_state' && !check.ok));
});

test('[MS-013] no modo de observação, o consumo do estado não entra na conciliação', () => {
  const input = consistent();
  input.state.consumption.known_usd = 0;
  assert.equal(conciliate(input).status, 'reconciled');
});

test('[MS-013] chamada interrompida sem evento, registrada na interrupção, não é divergência', () => {
  const input = consistent();
  input.state.invocations_total = 3;
  input.state.counters.invocations = 3;
  input.state.invocations = [{ invocation_id: 'a' }, { invocation_id: 'b' }, { invocation_id: 'lost' }];
  input.state.interruptions = [{ invocation_id: 'lost' }];
  // O relatório mede eventos: a invocação interrompida sem evento não entra nessa medição.
  input.reportInvocations = 2;
  const result = conciliate(input);
  assert.equal(result.status, 'reconciled', JSON.stringify(result.checks));
  assert.equal(result.interrupted_without_event, 1);
});

test('[MS-013] invocação negada conta como tentativa malsucedida; validação final reprovada não', () => {
  const events = [
    callEvent({ status: 'success', cost_usd: 1 }),
    callEvent({ status: 'permission_denied', cost_usd: 0.5 }),
    callEvent({ function: 'validacao_final', status: 'failed', paid: false, cost_usd: null }),
  ];
  const report = buildReport({ change: 'mudanca-teste', events, state: null });
  assert.equal(report.per_accepted_delivery.failed_attempts, 1);
});

test('[MS-020] negação e falha são contagens separadas: negação recuperada não é falha', () => {
  const events = [
    callEvent({ status: 'success', cost_usd: 1, permission_denials: [{ tool_name: 'Bash' }] }),
    callEvent({ status: 'error', cost_usd: 0.5, permission_denials: [] }),
    callEvent({ status: 'success', cost_usd: 0.2 }),
  ];
  const { invocations, per_accepted_delivery: delivery } = buildReport({ change: 'mudanca-teste', events, state: null });
  assert.deepEqual(invocations, {
    measured: 3, with_denials: 1, denials_total: 1, recovered: 1, failed: 1, failed_with_denials: 0,
  });
  assert.equal(delivery.failed_attempts, 1);
});

test('[MS-020] evento antigo com status permission_denied conta como negação e falha, sem lista de negações', () => {
  const events = [callEvent({ status: 'permission_denied', cost_usd: 0.02 })];
  const { invocations } = buildReport({ change: 'mudanca-teste', events, state: null });
  assert.deepEqual(invocations, { measured: 1, with_denials: 1, denials_total: 1, recovered: 0, failed: 1, failed_with_denials: 1 });
});
