// Assinatura de sintoma e ações duplicadas (F6, D9, RC-014, RC-015).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAction, recordSymptom, symptomSignature } from '../../harness/symptoms.mjs';
import { emptyCounters } from '../../harness/counters.mjs';

const CASES = { gate: 'implement', failures: ['[AC-001] soma', '[AC-002] limite'], errorClass: 'assert' };

test('[RC-014] a assinatura não depende da hipótese, só do gate, dos casos e da classe do erro', () => {
  const first = symptomSignature(CASES);
  const second = symptomSignature({ ...CASES, failures: [...CASES.failures].reverse() });
  assert.equal(first, second);
  assert.notEqual(first, symptomSignature({ ...CASES, errorClass: 'timeout' }));
});

test('[RC-014] três ocorrências seguidas do mesmo sintoma na rodada param com repeated_symptom', () => {
  const signature = symptomSignature(CASES);
  let counters = emptyCounters();
  const first = recordSymptom(counters, signature);
  counters = first.counters;
  const second = recordSymptom(counters, signature);
  counters = second.counters;
  const third = recordSymptom(counters, signature);
  assert.equal(first.stop, false);
  assert.equal(second.stop, false);
  assert.equal(third.stop, true);
  assert.equal(third.stop_reason, 'repeated_symptom');
  assert.equal(third.counters.symptom.count, 3);
});

test('[RC-014] sintoma diferente zera a sequência da assinatura anterior', () => {
  const other = symptomSignature({ ...CASES, failures: ['[AC-003] outro'] });
  let counters = emptyCounters();
  counters = recordSymptom(counters, symptomSignature(CASES)).counters;
  counters = recordSymptom(counters, symptomSignature(CASES)).counters;
  const result = recordSymptom(counters, other);
  assert.equal(result.stop, false);
  assert.equal(result.counters.symptom.count, 1);
});

test('[RC-015] ação já executada na rodada exige justificativa registrada', () => {
  const descriptor = 'correcao:implement:ajustar-soma';
  const first = checkAction(emptyCounters(), descriptor, null);
  assert.equal(first.ok, true);
  const duplicated = checkAction(first.counters, descriptor, null);
  assert.equal(duplicated.ok, false);
  assert.equal(duplicated.stop_reason, 'human_decision_needed');
  const justified = checkAction(first.counters, descriptor, 'o gate mudou de caso desde a última tentativa');
  assert.equal(justified.ok, true);
  assert.equal(justified.counters.actions.at(-1).justification, 'o gate mudou de caso desde a última tentativa');
});
