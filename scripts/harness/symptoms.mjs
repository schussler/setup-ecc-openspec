// Assinatura de sintoma e ações duplicadas (F6, D9, RC-014, RC-015). A assinatura
// usa só o gate, os casos que falharam e a classe do erro: reescrever a hipótese não
// muda a assinatura, então não reinicia a contagem.
import { createHash } from 'node:crypto';

export const REPEAT_LIMIT = 3;

export function symptomSignature({ gate, failures, errorClass }) {
  const canonical = JSON.stringify({ gate, failures: [...failures].sort(), errorClass: errorClass ?? null });
  return createHash('sha256').update(canonical).digest('hex');
}

// Conta ocorrências seguidas da mesma assinatura na rodada. A terceira para (RC-014).
export function recordSymptom(counters, signature) {
  const previous = counters.symptom;
  const count = previous?.signature === signature ? previous.count + 1 : 1;
  const stop = count >= REPEAT_LIMIT;
  return {
    counters: { ...counters, symptom: { signature, count } },
    stop,
    stop_reason: stop ? 'repeated_symptom' : null,
  };
}

// Ação já executada na rodada (mesmo descritor) só segue com justificativa (RC-015).
export function checkAction(counters, descriptor, justification) {
  const repeated = counters.actions.some((action) => action.descriptor === descriptor);
  if (repeated && !justification) return { ok: false, stop_reason: 'human_decision_needed', counters };
  const actions = [...counters.actions, { descriptor, justification: justification ?? null }];
  return { ok: true, counters: { ...counters, actions } };
}
