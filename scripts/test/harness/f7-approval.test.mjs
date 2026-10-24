// Aprovação, arquivamento, revisão de cenário e resumo durável (F7, EV-005 a EV-013).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHANGE } from './fixture.mjs';
import {
  CHANGE_DIR, EXEC, RUNTIME, archive, codes, defaultTemplate, humanRecord, readSummary,
  scenario, setAuthorizations, setSpec, setupRepo, validate,
} from './f7-support.mjs';

const TWO_CASES = 'TAP version 13\nok 1 - [AC-011] primeiro\nok 2 - [AC-012] segundo\n1..2\n# pass 2\n# fail 0\n';
const SUMMARY = `${CHANGE_DIR}/evidence-summary.json`;

test('[EV-011] validação completa com suíte zero, caso pass na revisão atual e impressão estável registra aprovação', async () => {
  const root = setupRepo();
  const result = await validate(root);
  assert.equal(result.verdict, 'pass');
  assert.equal(result.approved, true);
  assert.equal(archive(root).approved, true);
  assert.ok(existsSync(join(root, SUMMARY)), 'o resumo durável é gravado na aprovação');
});

test('[EV-005] aprovação com impressão antiga é recusada no arquivamento', async () => {
  const root = setupRepo();
  await validate(root);
  writeFileSync(join(root, 'src-depois.mjs'), 'export const depois = true;\n');
  const check = archive(root);
  assert.equal(check.approved, false);
  assert.ok(check.reasons.some((reason) => reason.code === 'fingerprint_changed'), JSON.stringify(check.reasons));
});

test('[EV-006] arquivo relevante que muda enquanto a suíte roda invalida a aprovação', async () => {
  const template = defaultTemplate();
  template.checks.test_report.command = `echo v2 > src.mjs; cat report.tap; exit $(cat exit.code)`;
  const root = setupRepo({ template, files: { 'src.mjs': 'v1\n' } });
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.equal(result.verdict, 'stop');
  assert.equal(result.stop_reason, 'invalid_evidence');
  assert.equal(existsSync(join(root, SUMMARY)), false);
});

test('[EV-007] revisão de cenário com autorização invalida as evidências do cenário e das dependências', async () => {
  const dependent = scenario('AC-012', { dependsOn: 'AC-011' });
  const root = setupRepo({ scenarios: [scenario('AC-011'), dependent], tap: TWO_CASES });
  assert.equal((await validate(root)).approved, true);

  setSpec(root, [
    scenario('AC-011', { revision: 2, approval: 'auth:rev-011' }),
    dependent,
  ]);
  setAuthorizations(root, [humanRecord('rev-011', 'revision', { change: CHANGE, scenario: 'AC-011', revision: 2 })]);
  const result = await validate(root);
  assert.equal(result.approved, false);
  const invalid = [...new Set(result.failures.filter((failure) => failure.code === 'invalid_evidence').map((failure) => failure.id))].sort();
  assert.deepEqual(invalid, ['AC-011', 'AC-012']);
});

test('[EV-008] mudança de cenário sem autorização de revisão vira forbidden_action_stopped com protected_change', async () => {
  const root = setupRepo();
  assert.equal((await validate(root)).approved, true);
  setSpec(root, [scenario('AC-011', { revision: 2 })]);
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.equal(result.state, 'forbidden_action_stopped');
  assert.equal(result.stop_reason, 'protected_change');
});

test('[EV-010] o relatório declara o limite de isolamento e o caráter advisory do bloqueio', async () => {
  const root = setupRepo();
  const result = await validate(root);
  const declaration = result.declarations.isolation;
  assert.match(declaration, /advisory/);
  assert.match(declaration, /mesma conta/);
  assert.match(declaration, /isolamento/);
  const summary = readSummary(root);
  assert.ok(summary.limitations.includes(declaration), 'o resumo durável repete a declaração');
});

test('[EV-012] resumo durável traz os campos de auditoria e não contém a saída TAP bruta', async () => {
  const root = setupRepo();
  await validate(root);
  const text = readFileSync(join(root, SUMMARY), 'utf8');
  const summary = JSON.parse(text);
  assert.equal(summary.contract.revisions['AC-011'], 1);
  assert.match(summary.code.tree_sha256, /^[0-9a-f]{64}$/);
  assert.match(summary.code.commit_base, /^[0-9a-f]{40}$/);
  assert.ok(Array.isArray(summary.code.changed_paths));
  assert.equal(summary.tests.exit_code, 0);
  assert.equal(summary.tests.execution_id, EXEC);
  assert.match(summary.tests.test_report_command_sha256, /^[0-9a-f]{64}$/);
  assert.match(summary.tests.test_command_sha256, /^[0-9a-f]{64}$/);
  assert.ok(summary.cases.some((item) => item.name.includes('[AC-011]') && item.status === 'pass' && item.scenario_ids.includes('AC-011')));
  assert.ok('manifest_sha256' in summary.tests);
  assert.equal(summary.environment.node, RUNTIME.node);
  assert.equal(summary.environment.claude, RUNTIME.claude);
  assert.equal(summary.environment.openspec, RUNTIME.openspec);
  assert.match(summary.environment.checks_sha256, /^[0-9a-f]{64}$/);
  assert.match(summary.environment.test_report_sha256, /^[0-9a-f]{64}$/);
  assert.equal(summary.environment.schema_version, '1.0.0');
  assert.ok(summary.environment.policy_version);
  assert.ok(summary.limitations.length > 0);
  assert.ok('unknown_calls' in summary.consumption && 'reported_usd' in summary.consumption);
  assert.ok('pending' in summary.reservations);
  assert.ok(Array.isArray(summary.authorizations));
  assert.equal(summary.scenarios['AC-011'].verification, 'teste');
  assert.equal(summary.scenarios['AC-011'].revision, 1);
  assert.equal(text.includes('ok 1 - [AC-011]'), false, 'TAP bruto não entra no Git');
});

test('[EV-013] saída capturada ausente exige revalidação antes de arquivar', async () => {
  const root = setupRepo();
  await validate(root);
  rmSync(join(root, '.harness-local', CHANGE, 'evidence', EXEC, 'test-report.tap'));
  const check = archive(root);
  assert.equal(check.approved, false);
  assert.ok(check.reasons.some((reason) => reason.code === 'revalidation_required'), JSON.stringify(check.reasons));
});

test('[EV-013] impressão igual sem resumo durável não aprova o arquivamento', async () => {
  const root = setupRepo();
  await validate(root);
  rmSync(join(root, SUMMARY));
  const check = archive(root);
  assert.equal(check.approved, false);
  assert.ok(check.reasons.some((reason) => reason.code === 'sem_resumo'));
});
