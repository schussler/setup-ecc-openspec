// Testes da execução por exceção (change simplify-approval-and-execution, capacidade
// execution-by-exception). O nome de cada teste começa pelo ID do cenário. EX-001 a EX-004 são
// verificados no texto das skills (regra de continuidade e de pedido de decisão); EX-005 a EX-007,
// no diagnóstico de parada de scripts/harness/stop-report.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diagnoseStop } from '../../harness/stop-report.mjs';
import { REPO_ROOT } from './fixture.mjs';

const policy = JSON.parse(readFileSync(join(REPO_ROOT, '.claude', 'harness', 'policy.json'), 'utf8'));
const skill = (name) => readFileSync(join(REPO_ROOT, '.claude', 'skills', name, 'SKILL.md'), 'utf8');

test('[EX-001] detalhe interno reversível não pede confirmação', () => {
  const text = skill('spec-implement');
  assert.match(text, /Execução por exceção/);
  assert.match(text, /detalhe interno reversível/);
  assert.match(text, /sem nova confirmação/);
});

test('[EX-002] correção editorial não pede confirmação', () => {
  assert.match(skill('spec-implement'), /correção editorial sem mudança de significado/);
});

test('[EX-003] mudança de comportamento pede decisão', () => {
  assert.match(skill('spec-implement'), /mudança relevante de comportamento, escopo, risco ou aceite/);
});

test('[EX-004] publicação sem autorização pede decisão', () => {
  assert.match(skill('spec-implement'), /publicação não autorizada/);
});

test('[EX-005] repetição improdutiva para com diagnóstico', () => {
  const diagnosis = diagnoseStop(
    { stopReason: 'repeated_symptom', evidence: 'mesmo sintoma três vezes', recommendation: 'decidir o bloqueio', repeats: policy.max_diagnostics_per_signature + 1 },
    policy,
  );
  assert.equal(diagnosis.stop_reason, 'human_decision_needed');
  assert.match(diagnosis.evidence, /mesmo sintoma/);
});

test('[EX-006] parada informa motivo, evidência e recomendação', () => {
  const diagnosis = diagnoseStop(
    { stopReason: 'budget_exhausted', evidence: 'US$ 3,00 de US$ 3,00 gastos', recommendation: 'autorizar novo orçamento ou encerrar', repeats: 0 },
    policy,
  );
  assert.equal(diagnosis.stop_reason, 'budget_exhausted');
  assert.equal(diagnosis.evidence, 'US$ 3,00 de US$ 3,00 gastos');
  assert.equal(diagnosis.recommendation, 'autorizar novo orçamento ou encerrar');
});

test('[EX-007] motivo fora da lista é recusado', () => {
  const diagnosis = diagnoseStop(
    { stopReason: 'motivo_inventado', evidence: 'algo', recommendation: 'algo', repeats: 0 },
    policy,
  );
  assert.equal(diagnosis.stop_reason, 'config_error');
  assert.match(diagnosis.evidence, /motivo_inventado/);
});
