// Classificador da sonda de --max-turns (P.1, D6.1, PO-006, PO-007, PO-011, PO-015). Sem chamada ao modelo:
// as entradas são fixtures sintéticas em fixtures/probe/ e textos montados no próprio teste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertProbeAuthorized, classifyProbe } from '../../harness/probe.mjs';
import { ConfigError } from '../../harness/policy.mjs';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'probe');
const CHANGE = 'add-spec-harness';

function fixture(name) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8'));
}

function probeRecord(overrides = {}) {
  return { id: 'probe-1', kind: 'probe', origin: 'human', scope: { change: CHANGE }, ...overrides };
}

test('[PO-015] término por limite de turnos com num_turns dentro do limite é enforced', () => {
  // Arrange
  const output = fixture('turn-limit.json');

  // Act
  const outcome = classifyProbe(output, { maxTurns: 1 });

  // Assert
  assert.equal(outcome.result, 'enforced');
  assert.equal(outcome.num_turns, 1);
  assert.equal(outcome.max_turns, 1);
});

test('[PO-015] is_error sem causa identificada é inconclusive', () => {
  // Arrange
  const output = fixture('is-error-no-cause.json');

  // Act
  const outcome = classifyProbe(output, { maxTurns: 1 });

  // Assert
  assert.equal(outcome.result, 'inconclusive');
});

test('[PO-015] conclusão normal sem fixture de controle é inconclusive e nunca not_enforced', () => {
  // Arrange
  const output = fixture('normal-conclusion.json');

  // Act
  const outcome = classifyProbe(output, { maxTurns: 1 });

  // Assert
  assert.equal(outcome.result, 'inconclusive');
  assert.notEqual(outcome.result, 'not_enforced');
});

test('[PO-015] conclusão normal com controle que precisou de mais turnos e sem marcador de limite é not_enforced', () => {
  // Arrange
  const output = fixture('normal-conclusion.json');
  const control = fixture('control.json');

  // Act
  const outcome = classifyProbe(output, { maxTurns: 1, control });

  // Assert
  assert.equal(outcome.result, 'not_enforced');
  assert.equal(outcome.num_turns, 1);
});

test('[PO-015] saída de controle presente não torna enforced uma conclusão normal', () => {
  // Arrange
  const output = fixture('normal-conclusion.json');
  const control = fixture('control.json');

  // Act
  const outcome = classifyProbe(output, { maxTurns: 1, control });

  // Assert
  assert.notEqual(outcome.result, 'enforced');
});

test('[PO-007] marcador de limite com num_turns acima do limite não é enforced', () => {
  // Arrange
  const output = { ...fixture('turn-limit.json'), num_turns: 2 };

  // Act
  const outcome = classifyProbe(output, { maxTurns: 1 });

  // Assert
  assert.equal(outcome.result, 'inconclusive');
  assert.equal(outcome.num_turns, 2);
});

test('[PO-007] is_error sem causa com controle presente continua inconclusive, sem not_enforced', () => {
  // Arrange
  const output = fixture('is-error-no-cause.json');
  const control = fixture('control.json');

  // Act
  const outcome = classifyProbe(output, { maxTurns: 1, control });

  // Assert
  assert.equal(outcome.result, 'inconclusive');
});

test('[PO-007] JSON inválido é inconclusive com motivo "saída ilegível"', () => {
  // Arrange
  const raw = '{"type": "result", "subtype": ';

  // Act
  const outcome = classifyProbe(raw, { maxTurns: 1 });

  // Assert
  assert.equal(outcome.result, 'inconclusive');
  assert.equal(outcome.reason, 'saída ilegível');
});

test('[PO-007] string JSON válida é aceita e classificada como o objeto', () => {
  // Arrange
  const raw = JSON.stringify(fixture('turn-limit.json'));

  // Act
  const outcome = classifyProbe(raw, { maxTurns: 1 });

  // Assert
  assert.equal(outcome.result, 'enforced');
});

test('[PO-006] texto de ajuda que lista --max-turns não é comprovação e resulta em inconclusive', () => {
  // Arrange
  const helpText = 'Usage: claude [options]\n  --max-budget-usd <amount>\n  --max-turns <turns>\n';

  // Act
  const outcome = classifyProbe(helpText, { maxTurns: 1 });

  // Assert
  assert.equal(outcome.result, 'inconclusive');
  assert.notEqual(outcome.result, 'enforced');
});

test('[PO-011] sem registro probe a asserção lança ConfigError', () => {
  // Arrange
  const records = [];

  // Act and Assert
  assert.throws(() => assertProbeAuthorized(records, CHANGE), ConfigError);
});

test('[PO-011] probe com origin diferente de human é recusado', () => {
  // Arrange
  const records = [probeRecord({ origin: 'agent' })];

  // Act and Assert
  assert.throws(() => assertProbeAuthorized(records, CHANGE), ConfigError);
});

test('[PO-011] probe de outra change é recusado', () => {
  // Arrange
  const records = [probeRecord({ scope: { change: 'outra-change' } })];

  // Act and Assert
  assert.throws(() => assertProbeAuthorized(records, CHANGE), ConfigError);
});

test('[PO-011] probe revogado por registro revocation é recusado', () => {
  // Arrange
  const records = [
    probeRecord(),
    { id: 'rev-1', kind: 'revocation', revokes: 'probe-1', scope: { change: CHANGE } },
  ];

  // Act and Assert
  assert.throws(() => assertProbeAuthorized(records, CHANGE), ConfigError);
});

test('[PO-011] probe humano vigente nesta change é aceito e devolve true', () => {
  // Arrange
  const records = [probeRecord()];

  // Act
  const authorized = assertProbeAuthorized(records, CHANGE);

  // Assert
  assert.equal(authorized, true);
});
