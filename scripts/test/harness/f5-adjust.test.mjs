// Testes dos ajustes de contrato da F5 (orçamento em duas dimensões, revogação,
// probe_result referenciado, preservação, TTY, rascunho e motivos de parada).
// Nome de cada teste começa pelo ID do cenário. As invocações passam sempre pelo
// simulador local (FAKE_CLAUDE_BIN), nunca pelo binário real do modelo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { recordAuthorization } from '../../harness/authorize.mjs';
import { activeGrants, authorizedTotalUsd, checkReserve, marginUsd, reservationUsd } from '../../harness/budget.mjs';
import { checkScenarios } from '../../harness/contract.mjs';
import { ConfigError, effectiveLimit, loadPolicy } from '../../harness/policy.mjs';
import { runHarnessStep } from '../../harness/runner.mjs';
import { makeTempDir, writeTree } from '../helpers.mjs';
import { CHANGE, PROJECT_ID, REPO_ROOT, makeRepo } from './fixture.mjs';
import { FAKE_CLAUDE_BIN, newCallLog, simulatorCalls, simulatorEnv } from './simulator.mjs';

const POLICY = { version: '1.0.0', reserve_margin_ratio: 0.25, max_usd_per_call: 2, max_usd_per_change: 30 };
const ZERO = { known_usd: 0, estimated_usd: 0, unknown_calls: 0 };
const FIXED_NOW = new Date('2026-10-23T12:00:00.000Z');
const AUTHORIZE_CLI = join(REPO_ROOT, 'scripts', 'harness', 'authorize.mjs');
const SHA256 = 'a'.repeat(64);
const EVIDENCE = { path: 'relatorios/sonda-p2.json', sha256: SHA256 };
const interactive = { isInteractive: () => true, now: FIXED_NOW, confirm: async (_summary, code) => code };
const OK_OUTPUT = { type: 'result', subtype: 'success', is_error: false, result: 'ok' };
const HUMAN = { origin: 'human', scope: { change: CHANGE }, recorded_at: '2026-10-23T12:00:00.000Z', author: 'douglas', project_id: PROJECT_ID };

function authPath(root) {
  return join(root, 'openspec', 'changes', CHANGE, 'authorizations.json');
}

function readRecords(root) {
  return JSON.parse(readFileSync(authPath(root), 'utf8'));
}

function writeAuthorizations(root, records) {
  writeTree(root, { [`openspec/changes/${CHANGE}/authorizations.json`]: records });
}

// Concessão de orçamento já gravada (formato F5 com total_usd e per_call_usd).
function grant(id, totalUsd, perCallUsd = 2, extra = {}) {
  return { id, kind: 'budget', total_usd: totalUsd, per_call_usd: perCallUsd, reason: 'teste', approver: 'Douglas', ...HUMAN, ...extra };
}

function step(root, log, options = {}) {
  return runHarnessStep({
    root, change: CHANGE, bin: FAKE_CLAUDE_BIN, prompt: '/spec-implement add-spec-harness', allowedTools: ['Read'],
    env: simulatorEnv(log, OK_OUTPUT), ...options,
  });
}

function budgetInput(extra = {}) {
  return { kind: 'budget', reason: 'orçamento da fatia F5', approver: 'Douglas', totalUsd: 30, perCallUsd: 2, ...extra };
}

function probeInput(extra = {}) {
  return { kind: 'probe', reason: 'sonda P.2', approver: 'Douglas', ...extra };
}

function probeResultInput(data, extra = {}) {
  return { kind: 'probe_result', reason: 'sonda P.2', approver: 'Douglas', result: 'enforced', data, ...extra };
}

// Change de teste em <repo>/openspec/changes/<change>, com .harness-project.json (D32, RC-050).
// Um cenário, proposal.md opcional e authorizations.json opcional. Devolve o diretório da change.
const FIXTURE_PROJECT_ID = '3f2c9a1e-6b7d-4e8f-9a0b-1c2d3e4f5a6b';
function makeChange(scenarioBlock, { proposal, authorizations } = {}) {
  const repo = makeTempDir('f5-adjust-');
  const root = join(repo, 'openspec', 'changes', CHANGE);
  writeTree(repo, { '.harness-project.json': { project_id: FIXTURE_PROJECT_ID } });
  const files = { 'specs/exemplo/spec.md': ['## ADDED Requirements', '', '### Requirement: Exemplo', '', 'O sistema SHALL existir.', '', scenarioBlock].join('\n') };
  if (proposal !== undefined) files['proposal.md'] = proposal;
  if (authorizations !== undefined) files['authorizations.json'] = authorizations.map((record) => JSON.stringify(record)).join('\n');
  writeTree(root, files);
  return root;
}

function scenario(name, fields) {
  const lines = [`#### Scenario: ${name}`];
  for (const [key, value] of Object.entries(fields)) lines.push(`- **${key}:** ${value}`);
  lines.push('- **WHEN** a condição ocorre', '- **THEN** o comportamento acontece', '');
  return lines.join('\n');
}

const DRAFT = '## Contrato\n\n- **Comportamento novo:** sim\n- **Estado do contrato:** rascunho\n';
const APPROVED = '## Contrato\n\n- **Comportamento novo:** sim\n- **Estado do contrato:** aprovado\n';
const REVISION_AUTH = {
  id: 'R-1', kind: 'revision', purpose: 'scenario_change', project_id: FIXTURE_PROJECT_ID, scope: { change: CHANGE, scenario: 'HI-900', revision: 2 },
  reason: 'exceção aprovada', approver: 'Douglas', source: 'cli', date: '2026-10-23',
};

// --- RC-022: orçamento em duas dimensões ------------------------------------

test('[RC-022] limite por chamada é o menor entre política, candidato e per_call_usd da autorização', () => {
  const profile = { provisional: true, candidate_usd_per_call: 1.5 };
  assert.equal(effectiveLimit(POLICY, profile, [grant('a', 30, 2)]).limit, 1.5);
  assert.equal(effectiveLimit(POLICY, {}, [grant('a', 30, 1)]).limit, 1);
  assert.equal(effectiveLimit(POLICY, {}, [grant('a', 30, 5)]).limit, 2);
});

test('[RC-022] saldo total é o menor entre autorização, política e candidato de change', () => {
  assert.equal(authorizedTotalUsd(POLICY, { provisional: true, candidate_usd_per_change: 10 }, [grant('a', 30, 2)]), 10);
  assert.equal(authorizedTotalUsd(POLICY, {}, [grant('a', 5, 2)]), 5);
  assert.equal(authorizedTotalUsd(POLICY, {}, [grant('a', 40, 2)]), 30);
});

test('[RC-022] margem e reserva são valores separados: margem 0,5 e reserva 2,5 para limite 2', () => {
  assert.equal(marginUsd(2, 0.25), 0.5);
  assert.equal(reservationUsd(2, 0.25), 2.5);
});

test('[RC-022] autorização de orçamento exige total e por chamada positivos, com por chamada não maior que o total', async () => {
  const root = makeRepo();
  await assert.rejects(recordAuthorization(root, CHANGE, budgetInput({ totalUsd: 1, perCallUsd: 2 }), interactive), /per_call_usd/);
  await assert.rejects(recordAuthorization(root, CHANGE, budgetInput({ totalUsd: 0 }), interactive), /total_usd/);
  await assert.rejects(recordAuthorization(root, CHANGE, budgetInput({ perCallUsd: undefined }), interactive), /per_call_usd/);
  assert.equal(existsSync(authPath(root)), false);
});

test('[RC-022] autorização de orçamento grava total_usd e per_call_usd sem amount_usd', async () => {
  const root = makeRepo();
  const record = await recordAuthorization(root, CHANGE, budgetInput({ totalUsd: 30, perCallUsd: 2 }), interactive);
  assert.equal(record.total_usd, 30);
  assert.equal(record.per_call_usd, 2);
  assert.equal('amount_usd' in record, false);
});

test('[RC-022] a reserva da chamada precisa caber no saldo total descontando a reserva pendente', () => {
  const open = [{ session_id: 's1', reserved_usd: 2.5, status: 'open' }];
  const fits = checkReserve({ authorizedTotalUsd: 5, consumption: ZERO, openReservations: open, reserveUsd: 2.5 });
  assert.equal(fits.ok, true);
  assert.equal(fits.remaining_usd, 2.5);
  const tooBig = checkReserve({ authorizedTotalUsd: 5, consumption: ZERO, openReservations: open, reserveUsd: 2.6 });
  assert.equal(tooBig.stop_reason, 'budget_reserve_insufficient');
});

test('[RC-033] reserva aberta de chamada interrompida reduz o saldo da nova chamada', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 3, 2)]);
  const log = newCallLog();
  const first = await step(root, log);
  assert.equal(first.invoked, true);
  assert.equal(first.result.cost_source, 'unknown');
  const second = await step(root, log);
  assert.equal(second.invoked, false);
  assert.equal(second.stop_reason, 'budget_reserve_insufficient');
  assert.equal(simulatorCalls(log).length, 1);
});

test('[RC-021] candidato de gasto sem autorização para com authorization_required e nenhuma chamada', async () => {
  const root = makeRepo();
  writeAuthorizations(root, []);
  const log = newCallLog();
  const outcome = await step(root, log, { profile: { provisional: true, candidate_usd_per_change: 30 } });
  assert.equal(outcome.invoked, false);
  assert.equal(outcome.stop_reason, 'authorization_required');
  assert.equal(outcome.state, 'awaiting_decision');
  assert.equal(simulatorCalls(log).length, 0);
});

test('[RC-008] retorno do runner separa limite por chamada, margem e reserva', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 2, 2)]);
  const outcome = await step(root, newCallLog());
  assert.equal(outcome.stop_reason, 'budget_reserve_insufficient');
  assert.equal(outcome.limit_usd, 2);
  assert.equal(outcome.margin_usd, 0.5);
  assert.equal(outcome.reserved_usd, 2.5);
});

// --- RC-031: motivos de parada distintos ------------------------------------

test('[RC-031] sem autorização budget o motivo é authorization_required, não budget_reserve_insufficient', async () => {
  const root = makeRepo();
  writeAuthorizations(root, []);
  const outcome = await step(root, newCallLog());
  assert.equal(outcome.stop_reason, 'authorization_required');
  assert.equal(outcome.state, 'awaiting_decision');
});

test('[RC-031] autorização revogada conta como ausente e o motivo é authorization_required', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30, 2), { id: 'rev-1', kind: 'revocation', revokes: 'budget-1', origin: 'human', scope: { change: CHANGE }, reason: 'engano', approver: 'Douglas' }]);
  const outcome = await step(root, newCallLog());
  assert.equal(outcome.stop_reason, 'authorization_required');
});

test('[RC-031] autorização vigente sem saldo para com budget_reserve_insufficient', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 2, 2)]);
  const outcome = await step(root, newCallLog());
  assert.equal(outcome.stop_reason, 'budget_reserve_insufficient');
});

test('[RC-031] checkReserve sem concessão devolve authorization_required', () => {
  const verdict = checkReserve({ authorizedTotalUsd: null, consumption: ZERO, openReservations: [], reserveUsd: 2.5 });
  assert.equal(verdict.stop_reason, 'authorization_required');
});

test('[RC-031] policy.json aceita os stop_reasons authorization_required e lock_unreadable', () => {
  const reasons = loadPolicy(REPO_ROOT).stop_reasons;
  assert.ok(reasons.includes('authorization_required'));
  assert.ok(reasons.includes('lock_unreadable'));
});

// --- RC-034: revogação como registro próprio --------------------------------

test('[RC-034] revogação é registro próprio: a original permanece e o saldo deixa de contá-la', async () => {
  const root = makeRepo();
  const original = await recordAuthorization(root, CHANGE, budgetInput(), interactive);
  const revocation = await recordAuthorization(root, CHANGE, { kind: 'revocation', reason: 'engano do valor', approver: 'Douglas', revokes: original.id }, interactive);
  const records = readRecords(root);
  assert.equal(records.length, 2);
  assert.deepEqual(records[0], original);
  assert.equal(records[1].kind, 'revocation');
  assert.equal(records[1].id, revocation.id);
  assert.equal(records[1].total_usd, undefined);
  assert.deepEqual(activeGrants(records, CHANGE), []);
});

test('[RC-034] revogação de id inexistente é recusada e nada é gravado', async () => {
  const root = makeRepo();
  await recordAuthorization(root, CHANGE, budgetInput(), interactive);
  const before = readFileSync(authPath(root), 'utf8');
  await assert.rejects(
    recordAuthorization(root, CHANGE, { kind: 'revocation', reason: 'x', approver: 'Douglas', revokes: 'inexistente' }, interactive),
    /não existe/,
  );
  assert.equal(readFileSync(authPath(root), 'utf8'), before);
});

test('[RC-034] revogação não carrega valor de orçamento', async () => {
  const root = makeRepo();
  const original = await recordAuthorization(root, CHANGE, budgetInput(), interactive);
  await assert.rejects(
    recordAuthorization(root, CHANGE, { kind: 'revocation', reason: 'x', approver: 'Douglas', revokes: original.id, totalUsd: 5 }, interactive),
    /revogação não concede orçamento/,
  );
});

test('[RC-034] revogação só é aceita como tipo revocation, não como budget com revokes', async () => {
  const root = makeRepo();
  const original = await recordAuthorization(root, CHANGE, budgetInput(), interactive);
  await assert.rejects(
    recordAuthorization(root, CHANGE, { kind: 'budget', reason: 'x', approver: 'Douglas', revokes: original.id }, interactive),
    /revokes exige kind revocation/,
  );
});

// --- PO-014: probe_result referenciado --------------------------------------

test('[PO-014] probe_result sem probe_id é recusado e nada é gravado', async () => {
  const root = makeRepo();
  await assert.rejects(recordAuthorization(root, CHANGE, probeResultInput({ evidence: EVIDENCE }), interactive), /probe_id/);
  assert.equal(existsSync(authPath(root)), false);
});

test('[PO-014] probe_result com probe_id inexistente é recusado', async () => {
  const root = makeRepo();
  await assert.rejects(recordAuthorization(root, CHANGE, probeResultInput({ probe_id: 'nao-existe', evidence: EVIDENCE }), interactive), /probe_id/);
});

test('[PO-014] probe_result cujo probe_id aponta para autorização que não é probe é recusado', async () => {
  const root = makeRepo();
  const budget = await recordAuthorization(root, CHANGE, budgetInput(), interactive);
  await assert.rejects(recordAuthorization(root, CHANGE, probeResultInput({ probe_id: budget.id, evidence: EVIDENCE }), interactive), /probe_id/);
});

test('[PO-014] probe_result sem evidência com caminho e sha256 é recusado', async () => {
  const root = makeRepo();
  const probe = await recordAuthorization(root, CHANGE, probeInput(), interactive);
  await assert.rejects(recordAuthorization(root, CHANGE, probeResultInput({ probe_id: probe.id }), interactive), /evidência/);
  await assert.rejects(recordAuthorization(root, CHANGE, probeResultInput({ probe_id: probe.id, evidence: { path: 'x', sha256: 'curto' } }), interactive), /evidência/);
});

test('[PO-014] probe_result com probe_id existente e evidência completa é gravado com as referências', async () => {
  const root = makeRepo();
  const probe = await recordAuthorization(root, CHANGE, probeInput(), interactive);
  const record = await recordAuthorization(root, CHANGE, probeResultInput({ probe_id: probe.id, evidence: EVIDENCE }), interactive);
  assert.equal(record.kind, 'probe_result');
  assert.equal(record.probe_id, probe.id);
  assert.deepEqual(record.evidence, EVIDENCE);
  assert.equal(record.result, 'enforced');
});

// --- RC-040: preservação do registro ----------------------------------------

test('[RC-040] gravação mantém os registros anteriores idênticos e o arquivo em formato canônico', async () => {
  const root = makeRepo();
  const first = await recordAuthorization(root, CHANGE, budgetInput(), interactive);
  const before = readFileSync(authPath(root), 'utf8');
  const second = await recordAuthorization(root, CHANGE, budgetInput({ totalUsd: 5, perCallUsd: 1 }), interactive);
  const after = readFileSync(authPath(root), 'utf8');
  assert.deepEqual(JSON.parse(after)[0], JSON.parse(before)[0]);
  assert.equal(after, `${JSON.stringify([first, second], null, 2)}\n`);
});

test('[RC-040] arquivo que muda entre a leitura e a gravação recusa a gravação', async () => {
  const root = makeRepo();
  await recordAuthorization(root, CHANGE, budgetInput(), interactive);
  const confirmWithChange = async (_summary, code) => {
    const current = readFileSync(authPath(root), 'utf8');
    writeFileSync(authPath(root), current.replace('"reason"', '"reason "'));
    return code;
  };
  await assert.rejects(
    recordAuthorization(root, CHANGE, budgetInput({ totalUsd: 5, perCallUsd: 1 }), { ...interactive, confirm: confirmWithChange }),
    /mudou durante a confirmação/,
  );
});

// --- RC-039: TTY como condição do procedimento ------------------------------

test('[RC-039] texto de ajuda declara que o terminal interativo não prova sozinho a autoria humana', () => {
  const root = makeRepo();
  const result = spawnSync(process.execPath, [AUTHORIZE_CLI], { cwd: root, input: '', encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /condição do procedimento/);
  assert.match(result.stderr, /não prova sozinho a autoria humana/);
});

// --- HI-013: rascunho e aprovado --------------------------------------------

test('[HI-013] revisão 2 em contrato em rascunho é aceita sem autorização', () => {
  const root = makeChange(scenario('revisado em rascunho', { ID: 'HI-900', 'Revisão': '2' }), { proposal: DRAFT });
  assert.deepEqual(checkScenarios(root), []);
});

test('[HI-013] revisão 3 em contrato em rascunho também é aceita sem autorização', () => {
  const root = makeChange(scenario('revisado de novo', { ID: 'HI-900', 'Revisão': '3' }), { proposal: DRAFT });
  assert.deepEqual(checkScenarios(root), []);
});

test('[HI-013] revisão 2 em contrato aprovado sem autorização revision é recusada', () => {
  const root = makeChange(scenario('revisado aprovado', { ID: 'HI-900', 'Revisão': '2' }), { proposal: APPROVED });
  assert.deepEqual(checkScenarios(root).map((error) => error.code), ['HI-009']);
});

test('[HI-013] revisão 2 em contrato aprovado com autorização revision válida é aceita', () => {
  const root = makeChange(scenario('revisado com aprovacao', { ID: 'HI-900', 'Revisão': '2', 'Aprovação': 'auth:R-1' }), {
    proposal: APPROVED,
    authorizations: [REVISION_AUTH],
  });
  assert.deepEqual(checkScenarios(root), []);
});

test('[HI-013] sem declaração de estado do contrato a regra é a de contrato aprovado', () => {
  const root = makeChange(scenario('sem estado', { ID: 'HI-900', 'Revisão': '2' }));
  assert.deepEqual(checkScenarios(root).map((error) => error.code), ['HI-009']);
});

// --- Registro de autorizações: somente acréscimo com o tipo probe -----------

test('[RC-030] autorização do tipo probe é aceita e permanece no arquivo', async () => {
  const root = makeRepo();
  const probe = await recordAuthorization(root, CHANGE, probeInput(), interactive);
  assert.equal(probe.kind, 'probe');
  assert.equal(readRecords(root).length, 1);
  assert.ok(existsSync(authPath(root)));
});
