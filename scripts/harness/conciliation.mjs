// Conciliação de invocações e consumo (add-multislice-run, MS-013). Função pura: recebe o estado, os eventos e os
// valores que o relatório calculou, e devolve cada conferência. Não grava nada; quem chama decide.
// Modo de observação: o custo fica nos eventos (CO-004), então o consumo do estado só entra em modo financeiro.
export const INVOCATION_FUNCTION = 'invocacao';
const MICRO_USD = 1e6;

const round = (value) => Math.round(value * MICRO_USD) / MICRO_USD;
const check = (id, expected, actual) => ({ id, expected, actual, ok: expected === actual });

function knownUsdOf(events) {
  const total = events
    .filter((event) => event.paid !== false && event.cost_source === 'reported')
    .reduce((sum, event) => sum + event.cost_usd, 0);
  return round(total);
}

// Chamada interrompida sem evento (D17, RC-024) é conhecida pela interrupção registrada: não conta como divergência.
function interruptedWithoutEvent(state, invocationEvents) {
  const eventIds = new Set(invocationEvents.map((event) => event.invocation_id));
  return (state.interruptions ?? []).filter((item) => item.invocation_id && !eventIds.has(item.invocation_id)).length;
}

export function conciliate({ state, events, reportInvocations, reportKnownUsd, financial = false }) {
  const invocations = state.invocations_total ?? 0;
  const knownUsd = knownUsdOf(events);
  const invocationEvents = events.filter((event) => event.function === INVOCATION_FUNCTION);
  const lost = interruptedWithoutEvent(state, invocationEvents);
  const checks = [
    check('invocations_state', invocations, state.counters?.invocations ?? 0),
    check('invocations_list', invocations, (state.invocations ?? []).length),
    check('invocations_events', invocations - lost, invocationEvents.length),
    check('invocations_report', invocations, reportInvocations),
    check('known_usd_report', knownUsd, round(reportKnownUsd)),
  ];
  if (financial) checks.push(check('known_usd_state', knownUsd, round(state.consumption?.known_usd ?? 0)));
  return { status: checks.every((item) => item.ok) ? 'reconciled' : 'divergent', checks, interrupted_without_event: lost };
}
