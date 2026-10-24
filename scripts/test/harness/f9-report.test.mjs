// Relatórios (F9, TE-004, TE-005, TE-006, TE-008): custo conhecido, estimado, desconhecido e não medido
// separados; custo por entrega aceita com tentativas; métricas; declarações de limite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHANGE } from './fixture.mjs';
import { buildEvent } from '../../harness/telemetry.mjs';
import { buildReport, renderMarkdown } from '../../harness/report.mjs';
import { callEvent, GENERATED_AT, RUNTIME_22 } from './f9-support.mjs';

const REPORT_INPUT = { change: CHANGE, runtime: RUNTIME_22, generatedAt: GENERATED_AT };
const TE006_DECLARATION = 'não comprova independência técnica';

function section(markdown, title) {
  const start = markdown.indexOf(`## ${title}`);
  assert.notEqual(start, -1, `seção ausente: ${title}`);
  const next = markdown.indexOf('\n## ', start + 1);
  return markdown.slice(start, next === -1 ? undefined : next);
}

test('[TE-004] etapa interativa sem telemetria aparece como não mensurada e o total não se diz completo', () => {
  // Arrange
  const events = [
    callEvent({ cost_usd: 1.25, cost_source: 'reported' }),
    buildEvent({ agent: 'especificador', function: 'entrevista', cost_source: 'unmeasured' }, { at: GENERATED_AT }),
  ];

  // Act
  const report = buildReport({ ...REPORT_INPUT, events });

  // Assert
  assert.equal(report.cost.known_usd, 1.25);
  assert.equal(report.cost.unmeasured_steps, 1);
  assert.equal(report.cost.total_complete, false);
  assert.equal(report.cost.total_usd, null);
  assert.match(renderMarkdown(report), /Total completo: não/);
});

test('[TE-004] métricas trazem aceitação, regressões, retrabalho, intervenção, paradas e não determinismo', () => {
  // Arrange
  const events = [
    callEvent({
      delivery: 'fatia-1', status: 'failed', corrections_requested: 2, changes_produced: ['a.mjs'],
      cases: [
        { id: 'CN-1', outcome: 'fail', mandatory: true, regression: false },
        { id: 'CN-2', outcome: 'pass', mandatory: true, regression: false },
        { id: 'RG-1', outcome: 'fail', mandatory: false, regression: true },
      ],
      stops: ['correction_limit'],
    }),
    callEvent({
      delivery: 'fatia-1', status: 'accepted', corrections_requested: 1, changes_produced: [],
      cases: [
        { id: 'CN-1', outcome: 'pass', mandatory: true, regression: false },
        { id: 'RG-1', outcome: 'pass', mandatory: false, regression: true },
      ],
      human_decisions: [{ decided_by: 'mantenedor', note: 'aceito' }],
      stops: ['human_decision_needed'],
      interruptions: [{ at: GENERATED_AT }],
    }),
    callEvent({ cost_source: 'unmeasured', nondeterminism: [{ ref: 'PB-008', description: 'falha intermitente' }, { ref: 'PB-009', description: 'sem causa' }] }),
  ];

  // Act
  const { metrics } = buildReport({ ...REPORT_INPUT, events });

  // Assert
  assert.deepEqual(metrics.acceptance, { mandatory_total: 2, mandatory_passing: 2, rate: 1 });
  assert.equal(metrics.regressions.open, 0);
  assert.deepEqual(metrics.rework, { corrections_requested: 3, changes_produced: 1 });
  assert.equal(metrics.human_intervention.decisions, 1);
  assert.equal(metrics.interruptions, 1);
  assert.deepEqual(metrics.stops_by_type, { correction_limit: 1, human_decision_needed: 1 });
  assert.deepEqual(metrics.nondeterminism.map((item) => [item.ref, item.status]), [['PB-008', 'aberto'], ['PB-009', 'aberto']]);
});

test('[TE-005] custo por entrega aceita soma as tentativas que falharam e a aprovada', () => {
  // Arrange
  const events = [
    callEvent({ delivery: 'fatia-1', status: 'failed', cost_usd: 1 }),
    callEvent({ delivery: 'fatia-1', status: 'failed', cost_usd: 2 }),
    callEvent({ delivery: 'fatia-1', status: 'accepted', cost_usd: 3 }),
  ];

  // Act
  const { per_accepted_delivery: perDelivery } = buildReport({ ...REPORT_INPUT, events });

  // Assert
  assert.equal(perDelivery.accepted, 1);
  assert.equal(perDelivery.failed_attempts, 2);
  assert.equal(perDelivery.complete, true);
  assert.equal(perDelivery.usd, 6);
});

test('[TE-008] chamadas com custo desconhecido aparecem como contagem ao lado do custo conhecido, sem somar zero', () => {
  // Arrange
  const events = [
    callEvent({ cost_usd: null, cost_source: 'unknown' }),
    callEvent({ cost_usd: null, cost_source: 'unknown' }),
    callEvent({ cost_usd: 1.5, cost_source: 'reported' }),
  ];

  // Act
  const report = buildReport({ ...REPORT_INPUT, events });

  // Assert
  assert.equal(report.cost.known_usd, 1.5);
  assert.equal(report.cost.unknown_calls, 2);
  assert.equal(report.cost.total_usd, null);
  assert.match(renderMarkdown(report), /2 chamadas com custo desconhecido/);
});

test('[TE-006] seção de métricas declara que a separação de agentes não comprova independência técnica', () => {
  // Arrange
  const report = buildReport({ ...REPORT_INPUT, events: [] });

  // Act
  const markdown = renderMarkdown(report);

  // Assert
  assert.ok(report.declarations.some((text) => text.includes(TE006_DECLARATION)));
  assert.ok(section(markdown, 'Métricas').includes(TE006_DECLARATION));
});
