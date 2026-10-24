// Subcomando `run` da CLI do runner: a entrada pública da execução headless. Conecta o ciclo da
// fatia que já existe (slice.mjs: invocação, gate, correções com teto, sintoma repetido, divergência)
// ao gate de implementação real e à validação final (cli-actions.mjs). É o único subcomando que chama
// o modelo, sempre por runHarnessStep: autorização budget, reserva e lock vêm de lá (HE-005, RC-008).
// Uso: node scripts/harness/cli.mjs run --change <nome> [--task <texto>] [--model <m>] [--effort <e>]
//      [--profile <arquivo>] [--claude-bin "<comando>"] [--root <dir>]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateImplementation } from '../gates/implement-gate.mjs';
import { validateFinal, withLock } from './cli-actions.mjs';
import { defaultRuntime, fingerprint, protectedSnapshot, sha256, sortKeys } from './evidence.mjs';
import { applyTransition, STATE_APPROVED } from './machine.mjs';
import { ConfigError, loadProfile } from './policy.mjs';
import { runSlice } from './slice.mjs';
import { loadState, saveState } from './state.mjs';
import { buildStopReport } from './stop-report.mjs';

const RUNNER = 'runner';
const GATE = 'implement';
const SKILL = '/spec-implement';
const PROFILE_DEFAULT = '.claude/harness/profiles/default.json';
const DEFAULT_BIN = ['claude'];

// Prompt de cada passo (HE-001): a skill nomeada e o argumento de tarefa. --runner-step diz à skill
// que o runner avalia o gate; a correção leva as falhas do gate.
export function stepPrompt(change, task) {
  return `${SKILL} ${change} --runner-step${task ? ` --task ${task}` : ''}`;
}

export function correctionPrompt(change, task, verdict) {
  const failures = verdict.failures.length > 0 ? verdict.failures.join(', ') : 'sem caso identificado (ver lint, tipos ou código de saída)';
  return `${stepPrompt(change, task)} --correction "falhas do gate de implementação: ${failures}"`;
}

const print = (root, change) => fingerprint({ root, change, runtime: defaultRuntime() }).fingerprint;

// Cada avaliação vira uma tentativa do gate no estado, como em gate-implement (gate-archive lê a última).
function recordAttempt(root, change, result, verdict) {
  const current = loadState(root, change);
  const implement = current.gates.implement;
  const attempt = { attempt: (implement.attempts ?? []).length + 1, at: new Date().toISOString(), note: 'run', ...result, verdict };
  saveState(root, change, { ...current, gates: { ...current.gates, implement: { ...implement, attempts: [...(implement.attempts ?? []), attempt] } } });
  return attempt.attempt;
}

// Gate real adaptado ao ciclo da fatia. A fatia só aprova com casos executados e a mesma impressão
// antes e depois da avaliação; impressão alterada ou ausência de casos pedem decisão humana.
function implementEvaluation(root, change, evaluate) {
  return async ({ onSpawn }) => {
    const baseline = loadState(root, change).gates.implement.baseline;
    const before = print(root, change);
    const result = await evaluate({ root, baseline, onSpawn });
    const after = print(root, change);
    const cases = Array.isArray(result.cases) ? result.cases : [];
    const failures = cases.filter((item) => item.status !== 'pass').map((item) => item.id);
    let outcome = result.passed ? 'passed' : 'failed';
    if (before !== after || (result.passed && cases.length === 0)) outcome = 'human_decision_needed';
    const attempt = recordAttempt(root, change, result, outcome === 'passed' ? 'pass' : 'retry');
    return { outcome, failures, errorClass: null, cases: cases.map((item) => item.id), fingerprint: after, attempt };
  };
}

function binOf(options) {
  const raw = options['claude-bin'];
  if (raw === undefined) return DEFAULT_BIN;
  if (typeof raw !== 'string' || raw.trim() === '') throw new ConfigError('--claude-bin exige um comando');
  return raw.trim().split(/\s+/);
}

// runHarnessStep recusa sem autorização budget (e perfil com turnos sem sonda) antes do lock, sem gravar.
// A entrada pública grava a parada com o lock, para o estado mostrar o motivo (RC-021, PO-013).
const STOPS_BEFORE_LOCK = new Set(['authorization_required', 'config_error']);

async function persistEarlyStop(root, change, outcome) {
  if (outcome.invoked || !STOPS_BEFORE_LOCK.has(outcome.stop_reason)) return;
  const { execution_id: executionId } = loadState(root, change);
  await withLock(root, change, executionId, () => {
    const current = loadState(root, change);
    const moved = applyTransition(current, outcome.state, { stopReason: outcome.stop_reason });
    if (moved.ok) saveState(root, change, moved.state);
  });
}

// Perfil efetivamente usado, gravado no estado antes da primeira chamada: a impressão o usa (EV-001).
async function recordProfile(root, change, path) {
  const raw = readFileSync(join(root, path));
  const profile = { path, sha256: sha256(raw), content: sortKeys(JSON.parse(raw.toString('utf8'))) };
  const { execution_id: executionId } = loadState(root, change);
  await withLock(root, change, executionId, () => saveState(root, change, { ...loadState(root, change), profile }));
  return profile;
}

async function conclude({ root, change, validate, outcome }) {
  const final = await validateFinal({ root, change, validate });
  const approved = final.status === 'pass';
  return {
    status: approved ? 'pass' : 'stop', state: loadState(root, change).state, stop_reason: approved ? null : (final.stop_reason ?? 'invalid_evidence'),
    execution_id: final.execution_id, slice_approved: true, execution_approved: final.execution_approved,
    final_validation: final, invoked: outcome?.invoked ?? false,
  };
}

export async function run({ root, change, options = {}, evaluate = evaluateImplementation, validate }) {
  const state = loadState(root, change);
  if (!state) throw new ConfigError(`sem execução para "${change}": rode start antes`);
  if (state.mode !== RUNNER) {
    return { status: 'refused', stop_reason: 'mode_mismatch', state: state.state, message: 'run é do modo runner: rode start --mode runner depois do marco de adoção' };
  }
  if (!state.gates?.implement?.baseline) throw new ConfigError(`sem baseline do gate de implementação para "${change}": rode start em modo runner`);
  // Fatia já aprovada: falta só a validação final, sem nova chamada.
  if (state.state === STATE_APPROVED) return conclude({ root, change, validate, outcome: null });

  const task = typeof options.task === 'string' ? options.task : null;
  const profilePath = typeof options.profile === 'string' ? options.profile : PROFILE_DEFAULT;
  const profile = loadProfile(root, profilePath);
  await recordProfile(root, change, profilePath);
  const outcome = await runSlice({
    root, change, gate: GATE, stage: GATE, cwd: root, bin: binOf(options),
    profile,
    model: typeof options.model === 'string' ? options.model : undefined,
    effort: typeof options.effort === 'string' ? options.effort : undefined,
    prompt: stepPrompt(change, task),
    correctionPrompt: (verdict) => correctionPrompt(change, task, verdict),
    evaluate: implementEvaluation(root, change, evaluate),
    snapshot: async () => print(root, change),
    protect: () => protectedSnapshot({ root, change }),
  });
  if (outcome.state === STATE_APPROVED) return conclude({ root, change, validate, outcome });
  await persistEarlyStop(root, change, outcome);
  const current = loadState(root, change);
  return {
    status: 'stop', state: outcome.state ?? current?.state ?? null, stop_reason: outcome.stop_reason ?? null,
    execution_id: current?.execution_id ?? null, slice_approved: false, execution_approved: false,
    blocked_by: outcome.blocked_by ?? null, protected_changes: outcome.protected_changes ?? null,
    stop_report: buildStopReport({ outcome, state: current, objective: `fatia ${GATE} da change ${change}` }),
  };
}
