// Defeitos de medição da rodada 1b (autorizados pelo dono): a validação final registra a aprovação e a
// entrega aceita, o relatório separa a aceitação interna do runner da avaliação externa de referência,
// e ausência de medição aparece como "não medida" (TE-004, TE-005). A validação final entra no tempo
// ativo e no limite total: ultrapassar o limite nessa fase impede aprovar (RC-026, RC-036).
// Validação injetada e relógio controlado: nenhum modelo, nenhuma espera real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHANGE, makeRepo } from './fixture.mjs';
import { validateFinal } from '../../harness/cli-actions.mjs';
import { buildReport, renderMarkdown } from '../../harness/report.mjs';
import { readEvents } from '../../harness/telemetry.mjs';
import { createState, loadState, saveState } from '../../harness/state.mjs';
import { changeDir } from '../../harness/identity.mjs';

const EXEC = 'exec-medicao-0001';
const RUNTIME = { node_version: '24.21.0', claude: null, openspec: null };
const LIMIT_SECONDS = 10;
const PROFILE = { path: '.claude/harness/profiles/experimento.json', content: { provisional: true, candidate_seconds_per_change: LIMIT_SECONDS } };

// Execução com a fatia aprovada, pronta para a validação final, e tempo ativo já gasto.
function approvedSlice(activeMs) {
  const root = makeRepo();
  const created = createState(root, CHANGE, { mode: 'runner', executionId: EXEC });
  saveState(root, CHANGE, {
    ...created, state: 'approved', stop_reason: null, profile: PROFILE, active_ms: activeMs,
    active_ms_by_category: { invocacao: activeMs, gate: 0, diagnostico: 0, ferramenta: 0 },
    slice_approvals: [{ slice: 'implement', attempt: 1, fingerprint: 'f', cases: ['c'], at: '2026-10-24T15:00:00.000Z' }],
  });
  return root;
}

// Validação injetada que aprova e grava o resumo durável com dois cenários aprovados.
function passingValidation(root) {
  return async () => {
    writeFileSync(join(changeDir(root, CHANGE), 'evidence-summary.json'), `${JSON.stringify({
      verdict: 'pass', execution_id: EXEC,
      scenarios: { 'KC-001': { status: 'pass' }, 'KC-002': { status: 'pass' } },
    }, null, 2)}\n`);
    return { verdict: 'pass', stop_reason: null, execution_id: EXEC };
  };
}

// Relógio que avança `ms` entre a primeira e a segunda leitura.
function clockAdvancing(ms) {
  let reads = 0;
  return () => (reads++ === 0 ? 1_000_000 : 1_000_000 + ms);
}

function reportOf(root) {
  return buildReport({ change: CHANGE, events: readEvents(root, CHANGE), state: loadState(root, CHANGE), runtime: RUNTIME, generatedAt: 'x' });
}

test('[TE-004] sem validação final, aprovação final e aceitações aparecem como não medidas, não como 0 de 0', () => {
  const root = approvedSlice(1000);

  const report = reportOf(root);
  const markdown = renderMarkdown(report);

  assert.equal(report.metrics.final_approval, 'não medida');
  assert.equal(report.metrics.acceptance.rate, null);
  assert.equal(report.metrics.external_evaluation, 'não medida');
  assert.match(markdown, /Aprovação final do runner: não medida/);
  assert.match(markdown, /Aceitação interna do runner \(cenários obrigatórios\): não medida/);
  assert.match(markdown, /Avaliação externa de referência: não medida/);
  assert.doesNotMatch(markdown, /0 de 0/);
});

test('[TE-005] validação final aprovada registra a entrega aceita e a aceitação interna do runner', async () => {
  const root = approvedSlice(1000);

  const result = await validateFinal({ root, change: CHANGE, validate: passingValidation(root), now: clockAdvancing(2000) });

  assert.equal(result.status, 'pass');
  const report = reportOf(root);
  assert.equal(report.metrics.final_approval, 'aprovada');
  assert.equal(report.per_accepted_delivery.accepted, 1);
  assert.deepEqual(report.metrics.acceptance, { mandatory_total: 2, mandatory_passing: 2, rate: 1 });
  // A referência externa fica fora do runner: o relatório não a confunde com a aceitação interna.
  assert.equal(report.metrics.external_evaluation, 'não medida');
  assert.match(renderMarkdown(report), /Aceitação interna do runner \(cenários obrigatórios\): 2 de 2/);
});

test('[RC-036] validação final entra no tempo ativo, na categoria validacao', async () => {
  const root = approvedSlice(1000);

  await validateFinal({ root, change: CHANGE, validate: passingValidation(root), now: clockAdvancing(2000) });

  const state = loadState(root, CHANGE);
  assert.equal(state.active_ms, 3000);
  assert.equal(state.active_ms_by_category.validacao, 2000);
});

test('[RC-026] validação final que ultrapassa o limite total não aprova a execução', async () => {
  const root = approvedSlice(9000);

  const result = await validateFinal({ root, change: CHANGE, validate: passingValidation(root), now: clockAdvancing(2000) });

  assert.equal(result.status, 'stop');
  assert.equal(result.stop_reason, 'time_limit');
  assert.equal(result.execution_approved, false);
  const state = loadState(root, CHANGE);
  assert.equal(state.execution_approval, null);
  assert.equal(state.state, 'awaiting_decision');
  assert.equal(state.stop_reason, 'time_limit');
  assert.equal(state.active_ms, 11000);
  const report = reportOf(root);
  assert.equal(report.metrics.final_approval, 'não aprovada');
  assert.equal(report.per_accepted_delivery.accepted, 0);
  assert.deepEqual(report.metrics.stops_by_type, { time_limit: 1 });
});

test('[RC-026] com o limite total já atingido, a validação final não roda e a execução não é aprovada', async () => {
  const root = approvedSlice(LIMIT_SECONDS * 1000);
  let called = false;

  const result = await validateFinal({
    root, change: CHANGE, validate: async () => { called = true; return { verdict: 'pass' }; }, now: clockAdvancing(0),
  });

  assert.equal(called, false);
  assert.equal(result.status, 'stop');
  assert.equal(result.stop_reason, 'time_limit');
  assert.equal(loadState(root, CHANGE).execution_approval ?? null, null);
});
