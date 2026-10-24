// Entrada pública da execução headless: `node scripts/harness/cli.mjs run`. Cada teste chama o
// mesmo comando entregue ao usuário, num processo próprio; só --claude-bin aponta para o simulador
// (fixtures/fake-claude.mjs). Nenhum modelo é chamado. O gate e a validação final são os reais,
// sobre a suíte mínima da fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ID, REPO_ROOT } from './fixture.mjs';
import { lockPath } from '../../harness/lock.mjs';
import { CHANGE, CHANGE_DIR, adopt, changeRepo, stateOf, writeRecord, writeText } from './cli-support.mjs';
import { newCallLog, simulatorCalls } from './simulator.mjs';

const CLI = join(REPO_ROOT, 'scripts', 'harness', 'cli.mjs');
const FAKE = join(REPO_ROOT, 'scripts', 'test', 'harness', 'fixtures', 'fake-claude.mjs');
const CLAUDE_BIN = `${process.execPath} ${FAKE}`;
const FLAG = 'ok.flag';
const PROFILE = '.claude/harness/profiles/default.json';
const PAID = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'ok', total_cost_usd: 0.1 });
const HUMAN = { origin: 'human', project_id: PROJECT_ID, scope: { change: CHANGE }, approver: 'Douglas', recorded_at: '2026-10-24T12:00:00.000Z' };
const TAP = 'node --test --test-reporter=tap scripts/e2e/cenario.test.mjs';

const SPEC = `## ADDED Requirements

### Requirement: Cenário mínimo da fixture
A fixture SHALL passar o teste do cenário mínimo quando o marcador da correção existir.

#### Scenario: marcador da correção torna o teste verde
- **ID:** E2E-001
- **Revisão:** 1
- **WHEN** a correção cria o marcador \`${FLAG}\` na raiz do projeto
- **THEN** o teste \`[E2E-001]\` passa
`;

const CASE = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

test('[E2E-001] o marcador da correção existe e o cenário passa', () => {
  assert.ok(existsSync('${FLAG}'), '${FLAG} ausente');
});
`;

// Projeto com o marco de adoção, um cenário e um caso que só passa depois da "correção".
function project() {
  const root = changeRepo();
  writeText(root, 'template.json', `${JSON.stringify({ checks: {
    test: { command: TAP, suite: 'e2e' },
    test_report: { command: TAP, suite: 'e2e', format: 'tap' },
    lint: 'node -e ""',
    typecheck: 'node -e ""',
  } }, null, 2)}\n`);
  writeText(root, 'scripts/e2e/cenario.test.mjs', CASE);
  writeText(root, PROFILE, readFileSync(join(REPO_ROOT, PROFILE), 'utf8'));
  writeText(root, '.claude/settings.json', `${JSON.stringify({ permissions: { allow: ['Read', 'Edit', 'Write'] } }, null, 2)}\n`);
  writeText(root, `${CHANGE_DIR}/specs/harness-cli/spec.md`, SPEC);
  adopt(root);
  return root;
}

function budget(root, extra = {}) {
  const record = { id: 'bud-1', kind: 'budget', total_usd: 10, per_call_usd: 1, reason: 'teste do run', date: '2026-10-24', ...HUMAN, ...extra };
  writeText(root, `${CHANGE_DIR}/authorizations.json`, `${JSON.stringify([record], null, 2)}\n`);
}

function simulator(log, extra = {}) {
  return { FAKE_CLAUDE_LOG: log, FAKE_CLAUDE_OUTPUT: PAID, ...extra };
}

// O comando do usuário, num processo próprio. Devolve o código de saída e o JSON impresso.
function cli(root, subcommand, args = [], env = {}) {
  const run = spawnSync(process.execPath, [CLI, subcommand, '--change', CHANGE, '--root', root, ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ...env },
  });
  return { code: run.status, out: JSON.parse(run.stdout) };
}

const run = (root, env, args = []) => cli(root, 'run', ['--claude-bin', CLAUDE_BIN, ...args], env);

test('[HE-005] [RC-021] run sem autorização budget para com authorization_required e não chama o modelo', () => {
  const root = project();
  assert.equal(cli(root, 'start', ['--mode', 'runner']).out.status, 'started');
  const log = newCallLog();

  const result = run(root, simulator(log));

  assert.equal(result.code, 2);
  assert.equal(result.out.status, 'stop');
  assert.equal(result.out.stop_reason, 'authorization_required');
  assert.equal(simulatorCalls(log).length, 0);
  assert.equal(stateOf(root).state, 'awaiting_decision');
  assert.equal(stateOf(root).stop_reason, 'authorization_required');

  // Retomada depois da autorização: a mesma execução segue, sem nova execução.
  const before = stateOf(root).execution_id;
  budget(root);
  const resumed = run(root, simulator(log, { FAKE_CLAUDE_TOUCH: FLAG, FAKE_CLAUDE_TOUCH_ON_CALL: '1' }));
  assert.equal(resumed.out.status, 'pass', JSON.stringify(resumed.out));
  assert.equal(resumed.out.execution_id, before);
  assert.equal(simulatorCalls(log).length, 1);
});

test('[RC-008] [RC-031] run com orçamento que não comporta a reserva para com budget_reserve_insufficient', () => {
  const root = project();
  budget(root, { total_usd: 0.5, per_call_usd: 0.5 });
  cli(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();

  const result = run(root, simulator(log));

  assert.equal(result.out.status, 'stop');
  assert.equal(result.out.stop_reason, 'budget_reserve_insufficient');
  assert.equal(simulatorCalls(log).length, 0);
});

test('[SP-010] [HE-001] [HE-002] run executa, avalia, corrige e conclui com a validação final aprovada', () => {
  const root = project();
  budget(root);
  cli(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();

  // A primeira chamada não corrige; a segunda (correção) cria o marcador.
  const result = run(root, simulator(log, { FAKE_CLAUDE_TOUCH: FLAG, FAKE_CLAUDE_TOUCH_ON_CALL: '2' }));

  assert.equal(result.code, 0, JSON.stringify(result.out));
  assert.equal(result.out.status, 'pass');
  assert.equal(result.out.slice_approved, true);
  assert.equal(result.out.execution_approved, true);
  const calls = simulatorCalls(log);
  assert.equal(calls.length, 2);
  const [first, correction] = calls.map((call) => call.args);
  assert.ok(first.includes('-p'));
  assert.match(first[first.indexOf('-p') + 1], new RegExp(`^/spec-implement ${CHANGE} --runner-step`));
  assert.match(correction[correction.indexOf('-p') + 1], /--correction/);
  assert.match(correction[correction.indexOf('-p') + 1], /E2E-001/);
  for (const args of [first, correction]) {
    assert.ok(args.includes('--output-format') && args.includes('json'));
    assert.equal(args[args.indexOf('--permission-mode') + 1], 'dontAsk');
    assert.equal(args.includes('--dangerously-skip-permissions'), false);
    assert.equal(args.includes('--bare'), false);
  }
  const state = stateOf(root);
  assert.equal(state.gates.implement.attempts.at(-1).verdict, 'pass');
  assert.equal(state.slice_approvals.at(-1).fingerprint !== null, true);
  assert.equal(state.consumption.known_usd, 0.2);
});

// Correção sem efeito repete a falha e o descritor da ação; a segunda correção igual não é despachada sem
// justificativa (RC-015), antes do terceiro sintoma igual (RC-014).
test('[RC-015] run com correção sem efeito para na correção repetida, pedindo decisão humana, sem aprovar', () => {
  const root = project();
  budget(root);
  cli(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();

  const result = run(root, simulator(log));

  assert.equal(result.code, 2);
  assert.equal(result.out.status, 'stop');
  assert.equal(result.out.stop_reason, 'human_decision_needed');
  assert.equal(result.out.state, 'awaiting_decision');
  assert.equal(result.out.stop_report.blocker.stop_reason, 'human_decision_needed');
  assert.equal(simulatorCalls(log).length, 2);
  assert.equal(stateOf(root).counters.corrections.implement, 1);
  assert.equal(stateOf(root).slice_approvals?.length ?? 0, 0);
});

test('[SP-011] run interrompido no meio da invocação: reconciliação, retomada e conclusão pelo mesmo comando', async () => {
  const root = project();
  budget(root);
  cli(root, 'start', ['--mode', 'runner']);
  const executionId = stateOf(root).execution_id;
  const log = newCallLog();

  // 1. O processo do run morre com a chamada em andamento.
  const child = spawn(process.execPath, [CLI, 'run', '--change', CHANGE, '--root', root, '--claude-bin', CLAUDE_BIN], {
    cwd: root, env: { ...process.env, ...simulator(log, { FAKE_CLAUDE_HANG: '1', FAKE_CLAUDE_HANG_MS: '3000' }) }, stdio: 'ignore',
  });
  const exited = new Promise((resolve) => child.on('exit', resolve));
  for (let waited = 0; simulatorCalls(log).length === 0 && waited < 10000; waited += 50) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  child.kill('SIGKILL');
  await exited;
  assert.equal(stateOf(root).state, 'invoking');

  // 2. Sem decisão humana, o lock do processo morto bloqueia.
  assert.equal(run(root, simulator(log)).out.stop_reason, 'lock_held');

  // 3. Decisão humana sobre o lock (o heartbeat envelhecido representa o tempo passado).
  const lock = JSON.parse(readFileSync(lockPath(root, CHANGE), 'utf8'));
  writeFileSync(lockPath(root, CHANGE), `${JSON.stringify({ ...lock, heartbeat_at: '2000-01-01T00:00:00.000Z' }, null, 2)}\n`);
  const records = JSON.parse(readFileSync(join(root, CHANGE_DIR, 'authorizations.json'), 'utf8'));
  writeText(root, `${CHANGE_DIR}/authorizations.json`, `${JSON.stringify([...records, {
    id: 'lock-1', kind: 'lock_release', execution_id: lock.execution_id, reason: 'processo morto no teste', date: '2026-10-24', ...HUMAN,
  }], null, 2)}\n`);

  // 4. O run encontra a chamada interrompida e para pedindo reconciliação, sem nova chamada.
  const stopped = run(root, simulator(log));
  assert.equal(stopped.out.status, 'stop');
  assert.equal(stopped.out.state, 'interrupted');
  assert.equal(stopped.out.stop_reason, 'reconciliation_required');
  assert.equal(simulatorCalls(log).length, 1);
  assert.equal(cli(root, 'resume').out.stop_reason, 'reconciliation_required');

  // 5. Reconciliação D26 da reserva interrompida e retomada da mesma execução.
  const state = stateOf(root);
  const [reserve] = state.open_reservations;
  const path = writeRecord(root, 'rec-1', {
    kind: 'reconciliation', origin: 'human', project_id: PROJECT_ID, scope: { change: CHANGE },
    reconciliation_id: 'rec-1', execution_id: executionId, invocation_id: reserve.invocation_id, reserve_id: reserve.session_id,
    reserve_decision: 'closed_unknown', evidence_available: [], cost: { usd: null, status: 'unknown', origin: 'none' }, unknown_treatment: 'counted_in_budget',
    human_decision: { decided_by: 'procedimento humano', decided_at: '2026-10-24T12:30:00Z', note: 'processo morto no teste' },
  });
  const reconciled = cli(root, 'reconcile', ['--record', path]).out;
  assert.equal(reconciled.status, 'accepted', JSON.stringify(reconciled));
  assert.equal(cli(root, 'resume').out.status, 'resumed');

  // 6. O mesmo comando conclui: chamada 2 sem correção, chamada 3 corrige.
  const finished = run(root, simulator(log, { FAKE_CLAUDE_TOUCH: FLAG, FAKE_CLAUDE_TOUCH_ON_CALL: '3' }));
  assert.equal(finished.out.status, 'pass', JSON.stringify(finished.out));
  assert.equal(finished.out.execution_id, executionId);
  assert.equal(finished.out.execution_approved, true);
  assert.equal(simulatorCalls(log).length, 3);
});

test('[RC-025] run com quota esgotada na invocação para sem avaliar o gate nem chamar de novo', () => {
  const root = project();
  budget(root);
  cli(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();
  const quota = JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Claude AI usage limit reached' });

  const result = run(root, simulator(log, { FAKE_CLAUDE_OUTPUT: quota }));

  assert.equal(result.out.status, 'stop');
  assert.equal(result.out.state, 'awaiting_decision');
  assert.equal(result.out.stop_reason, 'quota_unavailable');
  assert.equal(simulatorCalls(log).length, 1);
  assert.deepEqual(stateOf(root).gates.implement.attempts, []);
});

test('[EV-001] run grava no estado o perfil usado, com caminho e sha256', () => {
  const root = project();
  budget(root);
  writeText(root, '.claude/harness/profiles/experimento.json', '{\n  "provisional": true,\n  "candidate_usd_per_call": 1\n}\n');
  cli(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();

  run(root, simulator(log, { FAKE_CLAUDE_TOUCH: FLAG, FAKE_CLAUDE_TOUCH_ON_CALL: '1' }), ['--profile', '.claude/harness/profiles/experimento.json']);

  const { profile } = stateOf(root);
  assert.equal(profile.path, '.claude/harness/profiles/experimento.json');
  assert.match(profile.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(profile.content, { provisional: true, candidate_usd_per_call: 1 });
});

test('[SP-009] run recusa execução sem estado em modo runner', () => {
  const root = project();
  budget(root);
  const log = newCallLog();

  const result = run(root, simulator(log));

  assert.equal(result.out.status, 'error');
  assert.match(result.out.error, /rode start antes/);
  assert.equal(simulatorCalls(log).length, 0);
});
