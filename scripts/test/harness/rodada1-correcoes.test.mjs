// Regressões dos achados da rodada 1 do experimento add-kebab-case-helper (autorizadas pelo dono):
// relatório com correções e paradas do estado (TE-004), escopo declarado do total completo (TE-004)
// e impressão com o perfil efetivamente usado, incluindo o conteúdo (EV-001). Sem chamada ao modelo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, CHANGE } from './fixture.mjs';
import { newCallLog } from './simulator.mjs';
import { buildReport, renderMarkdown } from '../../harness/report.mjs';
import { fingerprint } from '../../harness/evidence.mjs';
import { createState, loadState, saveState } from '../../harness/state.mjs';
import { failed, grant, scripted, slice, writeAuthorizations } from './f6-support.mjs';
import { writeTree } from '../helpers.mjs';

const RUNTIME = { node_version: '24.21.0', claude: null, openspec: null };
const EXPERIMENT_PROFILE = '.claude/harness/profiles/experimento.json';
const SCOPE = 'execução automatizada medida; preparação interativa não mensurada';

function stoppedState() {
  return {
    state: 'awaiting_decision', stop_reason: 'human_decision_needed', execution_id: 'e1', invocations_total: 2,
    consumption: { known_usd: 0.78, estimated_usd: 0, unknown_calls: 0 }, open_reservations: [],
    counters: { corrections: { implement: 1 } },
    stop_history: [{ stop_reason: 'human_decision_needed', state: 'awaiting_decision', at: '2026-10-24T14:28:23.000Z' }],
  };
}

test('[TE-004] relatório conta as correções e as paradas registradas no estado', () => {
  const report = buildReport({ change: CHANGE, events: [], state: stoppedState(), runtime: RUNTIME, generatedAt: 'x' });

  assert.equal(report.metrics.rework.corrections_requested, 1);
  assert.deepEqual(report.metrics.stops_by_type, { human_decision_needed: 1 });
  const markdown = renderMarkdown(report);
  assert.match(markdown, /Retrabalho: 1 correções pedidas/);
  assert.match(markdown, /Paradas por tipo: human_decision_needed: 1/);
});

test('[TE-004] parada da fatia por decisão humana fica no histórico de paradas do estado', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  // Mesmo sintoma e mesma ação: a segunda correção não é despachada (RC-015).
  const evaluate = scripted([failed(['a']), failed(['a'])]);

  const result = await slice(root, newCallLog(), { evaluate });

  assert.equal(result.stop_reason, 'human_decision_needed');
  assert.deepEqual(loadState(root, CHANGE).stop_history.map((item) => item.stop_reason), ['human_decision_needed']);
});

test('[TE-004] total completo declara o escopo medido', () => {
  const report = buildReport({ change: CHANGE, events: [], state: stoppedState(), runtime: RUNTIME, generatedAt: 'x' });

  assert.equal(report.cost.total_scope, SCOPE);
  assert.match(renderMarkdown(report), new RegExp(`Total completo: sim, US\\$ 0 \\(escopo: ${SCOPE}\\)`));
});

test('[EV-001] impressão registra o perfil gravado no estado, com caminho e conteúdo', () => {
  const root = makeRepo();
  writeTree(root, {
    '.claude/harness/profiles/default.json': { provisional: true, candidate_usd_per_call: 2 },
    [EXPERIMENT_PROFILE]: { provisional: true, candidate_usd_per_call: 1 },
  });
  const created = createState(root, CHANGE, { mode: 'runner', executionId: 'e1' });
  saveState(root, CHANGE, { ...created, profile: { path: EXPERIMENT_PROFILE } });

  const before = fingerprint({ root, change: CHANGE });

  assert.equal(before.parts.profile_path, EXPERIMENT_PROFILE);
  assert.deepEqual(before.parts.profile_content, { candidate_usd_per_call: 1, provisional: true });
  // As partes de perfil seguem o perfil usado: alterar o padrão não as muda (o arquivo segue na árvore de
  // código da impressão); alterar o usado muda o conteúdo e a impressão.
  writeFileSync(join(root, '.claude/harness/profiles/default.json'), '{"provisional": true, "candidate_usd_per_call": 1.5}\n');
  const afterDefault = fingerprint({ root, change: CHANGE });
  assert.equal(afterDefault.parts.profile_sha256, before.parts.profile_sha256);
  assert.deepEqual(afterDefault.parts.profile_content, before.parts.profile_content);
  writeFileSync(join(root, EXPERIMENT_PROFILE), '{"provisional": true, "candidate_usd_per_call": 0.5}\n');
  const afterUsed = fingerprint({ root, change: CHANGE });
  assert.deepEqual(afterUsed.parts.profile_content, { candidate_usd_per_call: 0.5, provisional: true });
  assert.notEqual(afterUsed.fingerprint, afterDefault.fingerprint);
});

test('[EV-001] sem perfil gravado no estado, a impressão usa o perfil padrão', () => {
  const root = makeRepo();
  writeTree(root, { '.claude/harness/profiles/default.json': { provisional: true, candidate_usd_per_call: 2 } });

  const print = fingerprint({ root, change: CHANGE });

  assert.equal(print.parts.profile_path, '.claude/harness/profiles/default.json');
  assert.deepEqual(print.parts.profile_content, { candidate_usd_per_call: 2, provisional: true });
});
