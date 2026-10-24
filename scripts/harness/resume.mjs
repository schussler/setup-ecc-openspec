// Retomada e rodada local (F6, RC-012, RC-013, RC-028). Abrir rodada exige autorização
// do tipo round (registro humano, não revogado) e parte de estado de parada.
import { STATE_READY, STOP_STATES, applyTransition } from './machine.mjs';
import { startRound } from './counters.mjs';
import { loadAuthorizations } from './contract.mjs';
import { changeDir } from './identity.mjs';
import { loadState, saveState } from './state.mjs';

const ROUND_KIND = 'round';
const HUMAN_ORIGIN = 'human';

function hasRoundAuthorization(records, change) {
  const revoked = new Set(records.map((record) => record?.revokes).filter(Boolean));
  return records.some((record) => record?.kind === ROUND_KIND
    && record.origin === HUMAN_ORIGIN
    && record.scope?.change === change
    && typeof record.approver === 'string' && record.approver.length > 0
    && !revoked.has(record.id));
}

// Abre a rodada local seguinte. Sem autorização round, recusa e não grava nada.
export function openLocalRound(root, change) {
  const state = loadState(root, change);
  if (state === null || !STOP_STATES.has(state.state)) {
    return { ok: false, stop_reason: 'human_decision_needed', reason: 'rodada só abre a partir de estado de parada' };
  }
  const { records } = loadAuthorizations(changeDir(root, change));
  const started = startRound(state, { authorized: hasRoundAuthorization(records, change) });
  if (!started.ok) return { ok: false, stop_reason: started.stop_reason };
  const ready = applyTransition(started.state, STATE_READY);
  if (!ready.ok) return { ok: false, stop_reason: 'human_decision_needed', reason: ready.reason };
  return { ok: true, state: saveState(root, change, ready.state) };
}
