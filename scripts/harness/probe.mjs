// Classificador puro da sonda de --max-turns (P.1, D6.1, PO-006, PO-007, PO-011, PO-015).
// Não faz I/O nem spawn: recebe a saída já lida e devolve o resultado. A sonda paga (P.2) é
// executada fora deste módulo, com autorização `probe` humana.
import { ConfigError } from './policy.mjs';

export const DEFAULT_MAX_TURNS = 1;
export const PROBE_RESULTS = Object.freeze({
  ENFORCED: 'enforced',
  INCONCLUSIVE: 'inconclusive',
  NOT_ENFORCED: 'not_enforced',
});

const UNREADABLE_REASON = 'saída ilegível';
const PROBE_KIND = 'probe';
const REVOCATION_KIND = 'revocation';
const HUMAN_ORIGIN = 'human';

// D6.1 não nomeia o campo de motivo. Escolha documentada: a saída JSON do `claude -p` traz o
// motivo em `subtype` (ex.: `error_max_turns`) e, em algumas versões, em `stop_reason`. Vale
// qualquer um dos dois que nomeie o limite de turnos.
const TURN_LIMIT_FIELDS = Object.freeze(['subtype', 'stop_reason']);
const TURN_LIMIT_PATTERN = /max[_-]?turns/i;

function parseOutput(output) {
  if (typeof output === 'string') {
    try {
      return toObjectOrNull(JSON.parse(output));
    } catch {
      return null;
    }
  }
  return toObjectOrNull(output);
}

function toObjectOrNull(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function hasTurnLimitMarker(output) {
  return TURN_LIMIT_FIELDS.some((field) => typeof output[field] === 'string' && TURN_LIMIT_PATTERN.test(output[field]));
}

// Controle sem o argumento: só conta quando é uma saída legível que precisou de mais de um turno.
function controlNeededMoreTurns(control, maxTurns) {
  const parsed = parseOutput(control);
  return parsed !== null && Number.isInteger(parsed.num_turns) && parsed.num_turns > maxTurns;
}

function outcome(result, reason, numTurns, maxTurns) {
  return { result, reason, num_turns: numTurns, max_turns: maxTurns };
}

function turnsOf(parsed) {
  return Number.isInteger(parsed.num_turns) ? parsed.num_turns : null;
}

function classifyParsed(parsed, maxTurns, control) {
  const numTurns = turnsOf(parsed);
  if (hasTurnLimitMarker(parsed)) {
    if (numTurns !== null && numTurns <= maxTurns) {
      return outcome(PROBE_RESULTS.ENFORCED, 'término por limite de turnos dentro do limite', numTurns, maxTurns);
    }
    return outcome(PROBE_RESULTS.INCONCLUSIVE, 'marcador de limite de turnos sem num_turns dentro do limite', numTurns, maxTurns);
  }
  if (parsed.is_error === true) {
    return outcome(PROBE_RESULTS.INCONCLUSIVE, 'is_error sem causa identificada', numTurns, maxTurns);
  }
  if (controlNeededMoreTurns(control, maxTurns)) {
    return outcome(PROBE_RESULTS.NOT_ENFORCED, 'controle precisou de mais de um turno e a sonda não identifica o limite', numTurns, maxTurns);
  }
  return outcome(PROBE_RESULTS.INCONCLUSIVE, 'conclusão normal sem motivo de limite de turnos', numTurns, maxTurns);
}

// Classifica a saída da sonda (D6.1). `enforced` exige motivo explícito de limite de turnos e
// num_turns dentro do limite. `not_enforced` exige a saída de controle sem o argumento. Demais
// casos são `inconclusive`. Controle ilegível equivale a controle ausente.
export function classifyProbe(output, { maxTurns = DEFAULT_MAX_TURNS, control } = {}) {
  if (!Number.isInteger(maxTurns) || maxTurns < 1) {
    throw new ConfigError('maxTurns deve ser inteiro positivo');
  }
  const parsed = parseOutput(output);
  if (parsed === null) {
    return outcome(PROBE_RESULTS.INCONCLUSIVE, UNREADABLE_REASON, null, maxTurns);
  }
  return classifyParsed(parsed, maxTurns, control);
}

// PO-011: sonda só com registro `probe` humano, desta change e não revogado.
// Revogação é registro próprio (`kind: revocation`, campo `revokes`).
export function assertProbeAuthorized(records, change) {
  if (!Array.isArray(records)) throw new ConfigError('registros de autorização devem ser uma lista');
  const isRevoked = (probeId) => records.some((record) => record?.kind === REVOCATION_KIND && record.revokes === probeId);
  const active = records.filter((record) => record?.kind === PROBE_KIND
    && record.origin === HUMAN_ORIGIN
    && record.scope?.change === change
    && !isRevoked(record.id));
  if (active.length === 0) {
    throw new ConfigError(`sonda sem autorização probe humana vigente na change ${change}; nenhuma chamada foi feita`);
  }
  return true;
}
