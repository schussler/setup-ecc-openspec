// Três níveis de resultado de uma execução do benchmark (PB-001 a PB-005):
// execução concluída, gates aprovados e aceitação funcional. Falha do runner
// (erro ou tempo esgotado de uma etapa) não é falha funcional.

import { classificationOf, INFORMATIVE } from './hidden.mjs';

// Ocorrências que o relatório mostra como abertas. Nenhuma passagem as encerra
// (PB-009): o campo `resolved` é fixo e só muda com revisão versionada do código.
export const NONDETERMINISM = Object.freeze([
  Object.freeze({
    ref: 'PB-009',
    case: 'PB-008',
    status: 'aberto',
    resolved: false,
    evidence: '18 reexecuções sem reprodução (15 sequenciais e 3 paralelas, em 2026-10-24); a ocorrência original não tem mensagem de erro registrada',
    cause: 'não identificada',
    note: 'Passagens posteriores não encerram a ocorrência. O marco de adoção fica bloqueado até a investigação.',
  }),
]);

// Plano de calibração de onde vêm os candidatos do relatório (PB-003).
export const CALIBRATION = Object.freeze({ source: '.claude/harness/policy.md', section: 'Plano de calibração' });

// O gate `hidden` não entra no nível de gates: ele é a regra obrigatória de domínio
// da aceitação funcional (PB-004).
const isPipelineGate = (name) => name !== 'hidden';
const RUNNER_ERROR_STATUSES = new Set(['error', 'timeout']);

function executionOf(run) {
  const steps = run.steps ?? [];
  if (run.status === 'budget_exhausted' || steps.some((step) => step.status === 'budget_exhausted')) return 'budget_exhausted';
  const runnerError = (run.failure ?? '').startsWith('erro do runner') || steps.some((step) => RUNNER_ERROR_STATUSES.has(step.status));
  return runnerError ? 'runner_failed' : 'completed';
}

function gatesOf(run, execution) {
  const evaluated = Object.entries(run.gates ?? {}).filter(([name, gate]) => isPipelineGate(name) && gate !== undefined);
  if (evaluated.length === 0) return { level: 'not_evaluated', failed: [] };
  const failed = evaluated.filter(([, gate]) => !gate.passed).map(([name]) => name);
  if (failed.length > 0) return { level: 'rejected', failed };
  return { level: execution === 'completed' ? 'approved' : 'incomplete', failed };
}

// Regras reprovadas do gate hidden separadas pela classificação declarada
// (regra sem classificação é obrigatória). Gate reprovado sem detalhe por regra
// conta como falha obrigatória: sem classificação, nada é informativo.
function hiddenFailures(hidden) {
  if (hidden?.passed !== false) return { mandatory: [], informative: [], domainFailed: false };
  const failed = Object.entries(hidden.rules ?? {}).filter(([, ok]) => !ok).map(([rule]) => rule);
  const informative = failed.filter((rule) => classificationOf(hidden.classification, rule) === INFORMATIVE);
  const mandatory = failed.filter((rule) => !informative.includes(rule));
  return { mandatory, informative, domainFailed: mandatory.length > 0 || failed.length === 0 };
}

// Níveis de uma execução. `acceptance` exige execução concluída, gates aprovados e
// as regras obrigatórias de domínio (gate hidden) cumpridas quando existem. Um
// diagnóstico informativo reprovado não muda a aceitação (PB-011).
export function levelsOf(run) {
  const execution = executionOf(run);
  const { level: gates, failed: failedGates } = gatesOf(run, execution);
  const { mandatory, informative, domainFailed } = hiddenFailures(run.gates?.hidden);
  let acceptance = 'not_evaluated';
  if (execution === 'completed' && gates === 'rejected') acceptance = 'rejected';
  else if (execution === 'completed' && gates === 'approved') acceptance = domainFailed ? 'rejected' : 'accepted';
  return { execution, gates, acceptance, failed_gates: failedGates, failed_rules: mandatory, failed_informative: informative };
}

// Motivo de falha de uma execução que chegou ao fim, nomeando a regra ou o gate.
export function failureOf(levels) {
  if (levels.failed_rules.length > 0) return `regra obrigatória reprovada: ${levels.failed_rules.join(', ')}`;
  if (levels.failed_gates.length > 0) return `gate ${levels.failed_gates[0]} reprovado`;
  return 'aceitação funcional não avaliada';
}

// Maior custo por chamada observado (PB-005): origem e declaração de que não é garantia.
export function maxCostPerCall(runs) {
  const costs = runs.flatMap((run) => (run.steps ?? []).map((step) => step.cost_usd).filter((cost) => typeof cost === 'number'));
  if (costs.length === 0) return null;
  return {
    usd: Math.max(...costs),
    origin: `campo total_cost_usd de claude -p, medido em ${costs.length} invocações desta execução`,
    origin_invocations: costs.length,
    declaration: 'O máximo observado nesta execução não é garantia de máximo futuro.',
  };
}
