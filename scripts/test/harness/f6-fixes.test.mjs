// Correções da F6 (decisões de 2026-10-24): sem parada por contagem no runner novo (RC-041),
// três ocorrências seguidas param (RC-014), encerramento da árvore de processos (D25, RC-043,
// RC-044, RC-042), tempo ativo por categoria (RC-036), origem TTY (RC-039), diagnóstico (RC-016),
// interrupção (RC-046) e registro de reconciliação em proposta (RC-045, D26).
// Nenhuma chamada ao modelo: o binário é sempre um simulador local.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { makeRepo, CHANGE } from './fixture.mjs';
import { newCallLog, simulatorCalls } from './simulator.mjs';
import { invokeHarness } from '../../harness/claude.mjs';
import { recordAuthorization } from '../../harness/authorize.mjs';
import { lockPath } from '../../harness/lock.mjs';
import { applyTransition, STATE_DIAGNOSING } from '../../harness/machine.mjs';
import { loadState } from '../../harness/state.mjs';
import { evaluateImplementation } from '../../gates/implement-gate.mjs';
import { writeTree } from '../helpers.mjs';
import {
  CHANGE_DIR, OK_OUTPUT, checkpointExists, failed, grant, passed, scripted, slice, step, writeAuthorizations,
  readAuthorizationsFile, patchState,
} from './f6-support.mjs';
import { simulatorEnv } from './simulator.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TERM_IGNORING = join(HERE, 'fixtures', 'term-ignoring-claude.mjs');
const POLL_MS = 50;
const GONE_LIMIT_MS = 4000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Espera o processo sumir. Retorna true se sumiu dentro do limite.
async function goneWithin(pid, limitMs = GONE_LIMIT_MS) {
  const deadline = Date.now() + limitMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (err) {
      if (err.code === 'ESRCH') return true;
    }
    await sleep(POLL_MS);
  }
  return false;
}

// Atraso antes de devolver o veredito, para medir o tempo ativo do gate.
const slowly = (ms, responses) => async (context) => {
  await sleep(ms);
  return responses(context);
};

const sumBook = (book) => Object.values(book ?? {}).reduce((total, value) => total + value, 0);

// --- RC-041 e RC-014: sem parada por contagem no runner novo -----------------

test('[RC-041] falhas que não caem entre avaliações com sintomas diferentes não param o runner', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  const evaluate = scripted([failed(['a', 'b']), failed(['c', 'd']), passed(), passed()]);
  const result = await slice(root, log, { evaluate });
  assert.equal(result.state, 'approved');
  assert.equal(result.stop_reason, null);
  assert.equal(loadState(root, CHANGE).counters.corrections.implement, 2);
  assert.equal(simulatorCalls(log).length, 3);
});

test('[RC-014] três avaliações seguidas com o mesmo sintoma param o runner com repeated_symptom', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  // Mesmo sintoma (mesmos casos e classe), com hipóteses diferentes: a assinatura não muda (RC-014).
  const evaluate = scripted([
    { ...failed(['a', 'b']), hypothesis: 'ajustar soma' },
    { ...failed(['a', 'b']), hypothesis: 'ajustar limite' },
    { ...failed(['a', 'b']), hypothesis: 'trocar fixture' },
    passed(),
  ]);
  const result = await slice(root, log, { evaluate });
  assert.equal(result.state, 'awaiting_decision');
  assert.equal(result.stop_reason, 'repeated_symptom');
  assert.equal(evaluate.calls.length, 3);
  assert.equal(simulatorCalls(log).length, 3);
});

test('[RC-041] a regra de SG-018 fica identificada como legada e o runner não a usa', async () => {
  const { legacyNoProgressStop } = await import('../../gates/gate-store.mjs');
  assert.equal(typeof legacyNoProgressStop, 'function');
  assert.equal(legacyNoProgressStop(2, 2), true);
  assert.equal(legacyNoProgressStop(1, 2), false);
  const { readFileSync: read } = await import('node:fs');
  const source = read(join(HERE, '..', '..', 'harness', 'slice.mjs'), 'utf8');
  assert.equal(source.includes('legacyNoProgressStop'), false);
});

// --- D25, RC-043, RC-044: encerramento de árvore de processos ----------------

test('[RC-043] comando que ignora SIGTERM tem a árvore inteira encerrada no timeout', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'f6-tree-'));
  const pidFile = join(dir, 'child.pid');
  const result = await invokeHarness({
    bin: [process.execPath, TERM_IGNORING], cwd: dir, prompt: 'x', allowedTools: ['Read'], sessionId: randomUUID(),
    timeoutMs: 800, killGraceMs: 200, env: { FAKE_CHILD_PID_FILE: pidFile },
  });
  assert.equal(result.status, 'timeout_unclassified');
  assert.equal(result.termination_confirmed, true);
  const childPid = Number(readFileSync(pidFile, 'utf8'));
  assert.equal(await goneWithin(childPid), true);
});

test('[RC-043] término não confirmado grava o estado, mantém o lock e não inicia nova avaliação', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  const evaluate = scripted([passed()]);
  const unconfirmed = async () => ({ confirmed: false, signals: ['SIGTERM', 'SIGKILL'] });
  const result = await slice(root, log, {
    evaluate, terminate: unconfirmed, timeoutMs: 200, killGraceMs: 100,
    env: simulatorEnv(log, OK_OUTPUT, { FAKE_CLAUDE_HANG: '1', FAKE_CLAUDE_HANG_MS: '800' }),
  });
  const state = loadState(root, CHANGE);
  assert.equal(result.state, 'awaiting_decision');
  assert.equal(result.stop_reason, 'human_decision_needed');
  assert.equal(evaluate.calls.length, 0);
  assert.equal(typeof state.termination_unconfirmed?.invocation_id, 'string');
  assert.equal(state.termination_unconfirmed.invocation_id, state.invocation_id);
  assert.equal(existsLock(root), true);
  assert.equal(simulatorCalls(log).length, 1);
});

test('[RC-044] com término não confirmado, nova avaliação e nova invocação não começam', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  const unconfirmed = async () => ({ confirmed: false, signals: ['SIGTERM', 'SIGKILL'] });
  await slice(root, log, {
    evaluate: scripted([passed()]), terminate: unconfirmed, timeoutMs: 200, killGraceMs: 100,
    env: simulatorEnv(log, OK_OUTPUT, { FAKE_CLAUDE_HANG: '1', FAKE_CLAUDE_HANG_MS: '800' }),
  });
  const later = scripted([passed()]);
  const again = await slice(root, log, { evaluate: later });
  assert.equal(again.invoked, false);
  assert.equal(later.calls.length, 0);
  assert.equal(simulatorCalls(log).length, 1);
});

// --- RC-042 e 6.14: gate travado é encerrado com a árvore --------------------

test('[RC-042] gate que excede o tempo é encerrado com a árvore, falha por tempo e registra a evidência', async () => {
  const root = makeRepo();
  writeTree(root, {
    'template.json': {
      checks: {
        test: "trap '' TERM; sleep 4 & echo $! > child.pid; wait",
        lint: 'true',
        typecheck: 'true',
      },
    },
  });
  const started = Date.now();
  const result = await evaluateImplementation({ root, baseline: { test_files: [], case_ids: [] }, timeoutMs: 300, killGraceMs: 200 });
  assert.ok(Date.now() - started < 3500, 'o gate não pode esperar o sleep inteiro');
  assert.equal(result.passed, false);
  assert.deepEqual(result.evidence.timed_out, ['<suite>']);
  const childPid = Number(readFileSync(join(root, 'child.pid'), 'utf8'));
  assert.equal(await goneWithin(childPid), true);
});

// --- RC-036: tempo ativo por categoria ---------------------------------------

test('[RC-036] tempo de invocação entra no tempo ativo na categoria invocacao', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  await step(root, newCallLog(), OK_OUTPUT);
  const state = loadState(root, CHANGE);
  assert.ok(state.active_ms_by_category.invocacao > 0);
  assert.equal(sumBook(state.active_ms_by_category), state.active_ms);
});

test('[RC-036] tempo de avaliação do gate entra no tempo ativo na categoria gate', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const evaluate = slowly(120, scripted([passed(), passed()]));
  const result = await slice(root, newCallLog(), { evaluate });
  const state = loadState(root, CHANGE);
  assert.equal(result.state, 'approved');
  assert.ok(state.active_ms_by_category.gate >= 100, `gate=${state.active_ms_by_category.gate}`);
  assert.equal(sumBook(state.active_ms_by_category), state.active_ms);
});

// --- RC-039: origem da autorização -------------------------------------------

test('[RC-039] registro gravado no terminal tem origin human e procedure tty', async () => {
  const root = makeRepo();
  await recordAuthorization(root, CHANGE, {
    kind: 'budget', totalUsd: 30, perCallUsd: 2, reason: 'teste de origem', approver: 'Douglas',
  }, {
    isInteractive: () => true, confirm: async (_summary, code) => code,
    now: new Date('2026-10-23T12:00:00.000Z'), author: 'douglas',
  });
  const [record] = readAuthorizationsFile(root);
  assert.equal(record.origin, 'human');
  assert.equal(record.procedure, 'tty');
});

// --- RC-016: diagnóstico com motivo opcional ---------------------------------

test('[RC-016] diagnosing aceita motivo opcional, nulo ou de parada válido', () => {
  const base = { state: 'awaiting_gate', stop_reason: null, counters: {}, round: 1 };
  const without = applyTransition(base, STATE_DIAGNOSING);
  const withReason = applyTransition(base, STATE_DIAGNOSING, { stopReason: 'timeout_unclassified' });
  assert.equal(without.ok, true);
  assert.equal(without.state.stop_reason, null);
  assert.equal(withReason.ok, true);
  assert.equal(withReason.state.stop_reason, 'timeout_unclassified');
});

test('[RC-016] divergência com o mesmo código vai a diagnosing, sem aprovar e sem checkpoint', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const result = await slice(root, newCallLog(), { evaluate: scripted([passed(), failed(['[AC-004] flaky'])]) });
  assert.equal(result.state, STATE_DIAGNOSING);
  assert.equal(checkpointExists(root), false);
});

// --- RC-046: interrupção com evento próprio ----------------------------------

test('[RC-046] interrupção sem consumo nem reserva registra o evento e não exige reconciliação', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  patchState(root, { state: 'invoking', invocation_id: 'inv-sem-custo', open_reservations: [] });
  const interrupted = await step(root, log, OK_OUTPUT);
  const state = loadState(root, CHANGE);
  assert.equal(interrupted.state, 'interrupted');
  assert.notEqual(interrupted.stop_reason, 'reconciliation_required');
  assert.equal(state.interruptions.length, 1);
  assert.equal(state.interruptions[0].invocation_id, 'inv-sem-custo');
  const resumed = await step(root, log, OK_OUTPUT);
  assert.equal(resumed.invoked, true);
  assert.equal(simulatorCalls(log).length, 1);
});

test('[RC-046] interrupção com reserva aberta continua exigindo reconciliação', async () => {
  const root = makeRepo();
  writeAuthorizations(root, [grant('budget-1', 30)]);
  const log = newCallLog();
  patchState(root, {
    state: 'invoking', invocation_id: 'inv-com-reserva',
    open_reservations: [{ session_id: 's-1', reserved_usd: 1, status: 'open', invocation_id: 'inv-com-reserva', attempt_id: 0, opened_at: '2026-10-23T12:00:00.000Z' }],
  });
  const outcome = await step(root, log, OK_OUTPUT);
  assert.equal(outcome.state, 'interrupted');
  assert.equal(outcome.stop_reason, 'reconciliation_required');
  assert.equal(simulatorCalls(log).length, 0);
});

// --- RC-045: registro de reconciliação (proposta D26, pendente de aprovação) --

const D26_EXAMPLE = {
  kind: 'reconciliation',
  reconciliation_id: 'rec-0001',
  execution_id: 'exec-0002',
  invocation_id: 'inv-0003',
  reserve_id: 'res-0003',
  reserve_decision: 'closed_observed',
  evidence_available: [{ nome: 'resultado-inv-0003.json', sha256: 'a'.repeat(64) }],
  cost: { usd: 0.42, status: 'observed', origin: 'reported' },
  human_decision: { decided_by: 'procedimento humano fictício', decided_at: '2026-10-24T10:00:00Z', note: 'custo informado pela CLI' },
  balance_effect: {
    reserved_usd: 2.5, reserve_closed: true, reserve_released_usd: 2.5, cost_accounted_usd: 0.42, exposure_unknown_usd: 0,
    available_before_usd: 10, net_available_effect_usd: 2.08, available_after_usd: 12.08, unknown_calls_after: 0,
  },
};

test('[RC-045] exemplo de D26 com dados fictícios é válido (esquema aprovado em 2026-10-24)', async () => {
  const { validateReconciliationRecord } = await import('../../harness/reconciliation.mjs');
  assert.deepEqual(validateReconciliationRecord(D26_EXAMPLE), { ok: true, errors: [] });
});

test('[RC-045] registro sem campos obrigatórios ou com valores fora da lista é recusado', async () => {
  const { validateReconciliationRecord } = await import('../../harness/reconciliation.mjs');
  const { reserve_decision: _omitted, ...withoutDecision } = D26_EXAMPLE;
  const invalidDecision = validateReconciliationRecord({ ...D26_EXAMPLE, reserve_decision: 'closed_maybe' });
  const missing = validateReconciliationRecord(withoutDecision);
  const unknownWithValue = validateReconciliationRecord({ ...D26_EXAMPLE, cost: { usd: 0.42, status: 'unknown', origin: 'none' } });
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join(' '), /reserve_decision/);
  assert.equal(invalidDecision.ok, false);
  assert.equal(unknownWithValue.ok, false);
});

// --- Auxiliares --------------------------------------------------------------

function existsLock(root) {
  return readFileSync(lockPath(root, CHANGE), 'utf8').length > 0;
}

