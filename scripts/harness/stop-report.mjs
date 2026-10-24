// Relatório de parada (F6, RC-017, RC-019, RC-020, RC-031). Monta o conteúdo como objeto;
// a gravação em arquivo fica com quem chama. Hipóteses vêm de quem chama: o relatório só
// corta a lista em três e marca a base de cada uma, sem inventar hipóteses.
const MAX_HYPOTHESES = 3;
const REPLAN_SAME_STOP = 3;
const BASIS_LABEL = { evidence: 'evidência', suspicion: 'suspeita' };
const REPLAN_TEXT = 'replanejamento: a change já passou por duas rodadas locais ou parou três vezes pelo mesmo motivo; recomenda-se revisar o plano antes de nova rodada';
const CONTINUE_TEXT = 'decidir o bloqueio atual e retomar na mesma rodada';

function countInvocations(state) {
  return state?.counters?.invocations ?? 0;
}

function interruptedCalls(state) {
  return (state?.open_reservations ?? []).filter((entry) => entry.interrupted === true).length;
}

function needsReplan(state, stopReason) {
  if ((state?.round ?? 1) >= 2) return true;
  const sameStops = (state?.stop_history ?? []).filter((item) => item.stop_reason === stopReason).length;
  return stopReason !== null && sameStops >= REPLAN_SAME_STOP;
}

export function buildStopReport({ outcome, state = null, objective = null, hypotheses = [], decision = null, nextStep = null }) {
  const stopReason = outcome.stop_reason ?? null;
  return {
    objective,
    attempts: {
      round: state?.round ?? 1,
      attempt_id: state?.attempt_id ?? null,
      invocations: countInvocations(state),
      gate_evaluations: state?.counters?.gate_evaluations ?? 0,
      corrections: state?.counters?.corrections ?? {},
      interrupted_calls: interruptedCalls(state),
    },
    blocker: { state: outcome.state ?? null, stop_reason: stopReason },
    hypotheses: hypotheses.slice(0, MAX_HYPOTHESES).map((item) => ({
      text: item.text,
      basis: BASIS_LABEL[item.basis] ?? BASIS_LABEL.suspicion,
    })),
    recommendation: needsReplan(state, stopReason) ? REPLAN_TEXT : CONTINUE_TEXT,
    decision: decision ?? (stopReason ? `decisão humana sobre ${stopReason}` : 'nenhuma decisão pendente'),
    next_step: nextStep ?? 'registrar a decisão em authorizations.json e rodar o runner novamente',
  };
}
