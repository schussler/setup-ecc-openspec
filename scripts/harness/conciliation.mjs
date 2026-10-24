// Conciliação de invocações e consumo (add-multislice-run, MS-021). Função pura: compara fontes diferentes e não
// grava nada. Estado (contadores e lista de invocações) contra eventos e contra a medição do relatório; no modo
// financeiro, o consumo do estado contra a soma dos eventos. Nada compara um contador com ele mesmo.
// Modo de observação: o custo fica nos eventos (CO-004); a conferência de custo é a da fonte de cada evento.
export const INVOCATION_FUNCTION = 'invocacao';
const COST_SOURCES = Object.freeze(['reported', 'estimated', 'unknown']);
const MICRO_USD = 1e6;

const round = (value) => Math.round(value * MICRO_USD) / MICRO_USD;
const check = (id, expected, actual) => ({ id, expected, actual, ok: expected === actual });

// Chamada interrompida sem evento (D17, RC-024) é conhecida pela interrupção registrada: não conta como divergência.
function interruptedWithoutEvent(state, invocationEvents) {
  const eventIds = new Set(invocationEvents.map((event) => event.invocation_id));
  return (state.interruptions ?? []).filter((item) => item.invocation_id && !eventIds.has(item.invocation_id)).length;
}

function knownUsdOf(events) {
  const total = events
    .filter((event) => event.paid !== false && event.cost_source === 'reported')
    .reduce((sum, event) => sum + event.cost_usd, 0);
  return round(total);
}

export function conciliate({ state, events, reportInvocations, financial = false }) {
  const total = state.invocations_total ?? 0;
  const invocationEvents = events.filter((event) => event.function === INVOCATION_FUNCTION);
  const paidEvents = invocationEvents.filter((event) => event.paid !== false);
  const lost = interruptedWithoutEvent(state, invocationEvents);
  const checks = [
    check('invocations_state_list', total, (state.invocations ?? []).length),
    check('invocations_state_counter', total, state.counters?.invocations ?? 0),
    check('invocations_events', total - lost, invocationEvents.length),
    check('invocations_report', total - lost, reportInvocations),
    check('cost_sources', paidEvents.length, paidEvents.filter((event) => COST_SOURCES.includes(event.cost_source)).length),
  ];
  if (financial) checks.push(check('known_usd_state', knownUsdOf(events), round(state.consumption?.known_usd ?? 0)));
  return { status: checks.every((item) => item.ok) ? 'reconciled' : 'divergent', checks, interrupted_without_event: lost };
}
