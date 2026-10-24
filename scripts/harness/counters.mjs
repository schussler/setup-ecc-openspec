// Contadores do runner (F6, RC-003 a RC-007, D9). Funções puras sobre o estado:
// devolvem um estado novo. Os contadores de rodada zeram em startRound; attempt_id
// e invocations_total da change nunca zeram (RC-004, RC-037).

export function emptyCounters() {
  return {
    invocations: 0,
    gate_evaluations: 0,
    corrections: {},
    diagnostics: {},
    symptom: null,
    actions: [],
    last_correction: null,
  };
}

function withCounters(state, patch) {
  return { ...state, counters: { ...state.counters, ...patch } };
}

// Uma invocação do modelo. Avaliação de gate não passa por aqui (RC-003).
export function countInvocation(state) {
  return withCounters(state, { invocations: (state.counters?.invocations ?? 0) + 1 });
}

export function countGateEvaluation(state) {
  return withCounters(state, { gate_evaluations: (state.counters?.gate_evaluations ?? 0) + 1 });
}

// Correção consome o limite ao ser despachada (RC-005). Ao atingir o teto, recusa e
// devolve o estado sem alteração, com correction_limit (RC-007).
export function dispatchCorrection(state, gate, maxCorrections) {
  const used = state.counters?.corrections?.[gate] ?? 0;
  if (used >= maxCorrections) return { ok: false, stop_reason: 'correction_limit', state };
  const corrections = { ...state.counters.corrections, [gate]: used + 1 };
  return { ok: true, state: withCounters(state, { corrections }) };
}

// Nova rodada local (RC-004, RC-013). Exige autorização round; sem ela, nada muda.
// attempt_id e o consumo ficam como estão; só os contadores de rodada zeram.
export function startRound(state, { authorized }) {
  if (!authorized) return { ok: false, stop_reason: 'human_decision_needed', state };
  return {
    ok: true,
    state: { ...state, round: state.round + 1, counters: emptyCounters() },
  };
}
