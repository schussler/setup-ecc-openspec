// Percurso integrado multifatia (change add-multislice-run): duas fatias dependentes, raiz do projeto com
// espaço no caminho, --claude-bin em array JSON e o simulador no lugar do modelo. Chama o CLI cli.mjs como o
// usuário chamaria. Nenhum modelo é chamado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { revalidateApprovals } from '../../harness/cli-run.mjs';
import { PROJECT_ID, REPO_ROOT } from './fixture.mjs';
import { CHANGE, CHANGE_DIR, adopt, changeRepo, stateOf, writeText } from './cli-support.mjs';
import { saveState } from '../../harness/state.mjs';
import { newCallLog, simulatorCalls } from './simulator.mjs';

const CLI = join(REPO_ROOT, 'scripts', 'harness', 'cli.mjs');
const FAKE = join(REPO_ROOT, 'scripts', 'test', 'harness', 'fixtures', 'fake-claude.mjs');
const CLAUDE_BIN = JSON.stringify([process.execPath, FAKE]);
const PROFILE = '.claude/harness/profiles/default.json';
const PAID = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'ok', total_cost_usd: 0.1 });
const HUMAN = { origin: 'human', project_id: PROJECT_ID, scope: { change: CHANGE }, approver: 'Douglas', recorded_at: '2026-10-24T12:00:00.000Z' };
const TAP = 'node --test --test-reporter=tap scripts/e2e/cenario.test.mjs';
const CASE_FIRST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

test('[E2E-001] o primeiro marcador existe', () => {
  assert.ok(existsSync('first.flag'), 'first.flag ausente');
});
`;
const CASE_BOTH = `${CASE_FIRST}
test('[E2E-002] o segundo marcador existe', () => {
  assert.ok(existsSync('second.flag'), 'second.flag ausente');
});
`;
const SPEC = `## ADDED Requirements

### Requirement: Duas fatias dependentes
O projeto SHALL criar os dois marcadores, um por fatia.

#### Scenario: primeiro marcador
- **ID:** E2E-001
- **Revisão:** 1
- **WHEN** a primeira fatia roda
- **THEN** o teste \`[E2E-001]\` passa

#### Scenario: segundo marcador
- **ID:** E2E-002
- **Revisão:** 1
- **WHEN** a segunda fatia roda
- **THEN** o teste \`[E2E-002]\` passa
`;
// Caso que trava enquanto hang.flag existir (revalidação interrompida pelo prazo, MS-017).
const HANG_CASE = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

test('[E2E-001] o primeiro marcador existe', () => {
  if (existsSync('hang.flag')) setInterval(() => {}, 1000);
  assert.ok(existsSync('first.flag'), 'first.flag ausente');
});
`;
// Caso com ID quase igual ao cenário (MS-019): não pode cumprir E2E-001.
const CASE_NEAR_MISS = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

test('[E2E-0010] o primeiro marcador existe', () => {
  assert.ok(existsSync('first.flag'), 'first.flag ausente');
});
`;
const TASKS = `# Tarefas

## Fatia: primeira

- Cenários: E2E-001
- [ ] 1.1 criar first.flag

## Fatia: segunda

- Cenários: E2E-002
- [ ] 2.1 criar second.flag
`;

// Projeto com raiz em caminho com espaço; só a primeira fatia tem caso no início da execução.
function project() {
  const made = changeRepo();
  const root = join(mkdtempSync(join(tmpdir(), 'multifatia-')), 'projeto com espaço');
  renameSync(made, root);
  writeText(root, 'template.json', `${JSON.stringify({ checks: {
    test: { command: TAP, suite: 'e2e' },
    test_report: { command: TAP, suite: 'e2e', format: 'tap' },
    lint: 'node -e ""',
    typecheck: 'node -e ""',
  } }, null, 2)}\n`);
  writeText(root, 'scripts/e2e/cenario.test.mjs', CASE_FIRST);
  const profile = JSON.parse(readFileSync(join(REPO_ROOT, PROFILE), 'utf8'));
  writeText(root, PROFILE, `${JSON.stringify({ ...profile, modo_financeiro: true }, null, 2)}\n`);
  writeText(root, '.claude/settings.json', `${JSON.stringify({ permissions: { allow: ['Read', 'Edit', 'Write'] } }, null, 2)}\n`);
  writeText(root, `${CHANGE_DIR}/specs/harness-cli/spec.md`, SPEC);
  writeText(root, `${CHANGE_DIR}/tasks.md`, TASKS);
  const record = { id: 'bud-1', kind: 'budget', total_usd: 10, per_call_usd: 1, reason: 'teste multifatia', date: '2026-10-24', ...HUMAN };
  writeText(root, `${CHANGE_DIR}/authorizations.json`, `${JSON.stringify([record], null, 2)}\n`);
  adopt(root);
  return root;
}

function simulator(log, extra = {}) {
  return { FAKE_CLAUDE_LOG: log, FAKE_CLAUDE_OUTPUT: PAID, ...extra };
}

function cli(root, subcommand, args = [], env = {}) {
  const run = spawnSync(process.execPath, [CLI, subcommand, '--change', CHANGE, '--root', root, ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ...env },
  });
  return { code: run.status, out: JSON.parse(run.stdout) };
}

const run = (root, env) => cli(root, 'run', ['--claude-bin', CLAUDE_BIN], env);
const taskOf = (args) => args[args.indexOf('-p') + 1].match(/--task (\S+)/)?.[1] ?? null;

test('[MS-003] [MS-004] [MS-007] [MS-008] duas fatias: a segunda falha, recebe correção e a execução conclui com as duas aprovadas', () => {
  const root = project();
  cli(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();

  // Chamada 1: primeira fatia cria first.flag. Chamada 2: segunda fatia sem efeito. Chamada 3: correção cria o caso.
  const result = run(root, simulator(log, {
    FAKE_CLAUDE_TOUCH: 'first.flag', FAKE_CLAUDE_TOUCH_ON_CALL: '1',
    FAKE_CLAUDE_WRITE: JSON.stringify([{ path: 'scripts/e2e/cenario.test.mjs', content: CASE_BOTH }, { path: 'second.flag', content: '' }]),
    FAKE_CLAUDE_WRITE_ON_CALL: '3',
  }));

  assert.equal(result.code, 0, JSON.stringify(result.out));
  assert.equal(result.out.status, 'pass');
  assert.equal(result.out.execution_approved, true);
  const calls = simulatorCalls(log).map((call) => call.args);
  assert.deepEqual(calls.map(taskOf), ['primeira', 'segunda', 'segunda']);
  assert.match(calls[2][calls[2].indexOf('-p') + 1], /--correction/);
  const state = stateOf(root);
  assert.deepEqual(state.slice_approvals.map((item) => item.task), ['primeira', 'segunda']);
  assert.equal(existsSync(join(root, 'second.flag')), true);
});

test('[MS-005] [MS-006] parada na segunda fatia, validação final recusada com pendência, retomada sem repetir a primeira', () => {
  const root = project();
  cli(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();

  // Primeira execução: primeira fatia aprova; a segunda não tem efeito e a correção também não tem.
  const stopped = run(root, simulator(log, { FAKE_CLAUDE_TOUCH: 'first.flag', FAKE_CLAUDE_TOUCH_ON_CALL: '1' }));
  assert.equal(stopped.code, 2, JSON.stringify(stopped.out));
  assert.deepEqual(stateOf(root).slice_approvals.map((item) => item.task), ['primeira']);

  // MS-006: com a segunda fatia pendente, a validação final é recusada e nomeia a pendência.
  const refused = cli(root, 'validate-final', []);
  assert.equal(refused.out.status, 'refused');
  assert.deepEqual(refused.out.pending_slices, ['segunda']);
  assert.equal(refused.out.execution_approved, false);

  // A pessoa corrige o caso da segunda fatia; a execução retoma pelo mesmo run.
  writeText(root, 'scripts/e2e/cenario.test.mjs', CASE_BOTH);
  writeText(root, 'second.flag', '');
  const resumed = run(root, simulator(log));

  assert.equal(resumed.code, 0, JSON.stringify(resumed.out));
  assert.equal(resumed.out.status, 'pass');
  const tasks = simulatorCalls(log).map((call) => taskOf(call.args));
  assert.equal(tasks.filter((task) => task === 'primeira').length, 1, 'a primeira fatia não pode ser invocada de novo');
  assert.deepEqual(tasks, ['primeira', 'segunda', 'segunda', 'segunda']);
  assert.deepEqual(stateOf(root).slice_approvals.map((item) => item.task), ['primeira', 'segunda']);
});

test('[MS-009] run sem identidade Git recusa com preflight_blocked e nenhuma chamada ao modelo', () => {
  const root = project();
  cli(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();
  // Identidade vazia local: a global fica de fora pelo ambiente do CLI (GIT_CONFIG_GLOBAL).
  execFileSync('git', ['-C', root, 'config', 'user.name', '']);
  execFileSync('git', ['-C', root, 'config', 'user.email', '']);

  const result = run(root, simulator(log, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }));

  assert.equal(result.code, 2);
  assert.equal(result.out.status, 'refused');
  assert.equal(result.out.stop_reason, 'preflight_blocked');
  assert.deepEqual(result.out.items.filter((item) => item.status === 'blocked').map((item) => item.id), ['git_identity']);
  assert.equal(simulatorCalls(log).length, 0);
});

test('[MS-010] negação de permissão para a execução sem chamada de correção', () => {
  const root = project();
  cli(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();
  const denied = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'sem permissão', permission_denials: [{ tool_name: 'Bash' }] });

  const result = run(root, simulator(log, { FAKE_CLAUDE_OUTPUT: denied }));

  assert.equal(result.code, 2);
  assert.equal(result.out.stop_reason, 'permission_denied');
  assert.equal(simulatorCalls(log).length, 1, 'não pode haver correção depois de negação de permissão');
  assert.equal(stateOf(root).slice_approvals ?? null, null);
});

// Primeira execução: primeira fatia aprovada; a segunda para sem efeito do modelo.
function stoppedAfterFirstSlice(root, log) {
  const stopped = run(root, simulator(log, { FAKE_CLAUDE_TOUCH: 'first.flag', FAKE_CLAUDE_TOUCH_ON_CALL: '1' }));
  assert.equal(stopped.code, 2, JSON.stringify(stopped.out));
}

test('[MS-011] mudança que não quebra o cenário mantém a aprovação, sem chamada para a primeira fatia', () => {
  const root = project();
  cli(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();
  stoppedAfterFirstSlice(root, log);

  // Mudança fora do cenário da primeira fatia; a pessoa completa o caso da segunda.
  writeText(root, 'README.md', 'alterado depois da aprovação\n');
  writeText(root, 'scripts/e2e/cenario.test.mjs', CASE_BOTH);
  writeText(root, 'second.flag', '');
  const resumed = run(root, simulator(log));

  assert.equal(resumed.code, 0, JSON.stringify(resumed.out));
  // A primeira execução fez três chamadas (primeira, segunda e a correção da segunda).
  const tasksAfter = simulatorCalls(log).slice(3).map((call) => taskOf(call.args));
  assert.deepEqual(tasksAfter, ['segunda'], 'só a segunda fatia pode ser invocada na retomada');
  const approval = stateOf(root).slice_approvals.find((item) => item.task === 'primeira');
  assert.equal(approval.revalidations.length, 1);
  assert.equal(stateOf(root).invalidated_slices ?? null, null);
});

test('[MS-012] mudança que quebra o cenário retira a aprovação e a primeira fatia roda de novo', () => {
  const root = project();
  cli(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();
  stoppedAfterFirstSlice(root, log);

  // A pessoa remove o marcador da primeira fatia e completa a segunda; o modelo recria o marcador na nova chamada.
  rmSync(join(root, 'first.flag'));
  writeText(root, 'scripts/e2e/cenario.test.mjs', CASE_BOTH);
  writeText(root, 'second.flag', '');
  const resumed = run(root, simulator(log, { FAKE_CLAUDE_TOUCH: 'first.flag', FAKE_CLAUDE_TOUCH_ON_CALL: '4' }));

  assert.equal(resumed.code, 0, JSON.stringify(resumed.out));
  assert.equal(resumed.out.status, 'pass');
  const tasksAfter = simulatorCalls(log).slice(3).map((call) => taskOf(call.args));
  assert.deepEqual(tasksAfter, ['primeira', 'segunda']);
  const invalidated = stateOf(root).invalidated_slices;
  assert.equal(invalidated.length, 1);
  assert.equal(invalidated[0].task, 'primeira');
});

test('[MS-013] conclusão para com reconciliation_mismatch quando o contador do estado diverge dos eventos', () => {
  const root = project();
  cli(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();
  const passed = run(root, simulator(log, {
    FAKE_CLAUDE_TOUCH: 'first.flag', FAKE_CLAUDE_TOUCH_ON_CALL: '1',
    FAKE_CLAUDE_WRITE: JSON.stringify([{ path: 'scripts/e2e/cenario.test.mjs', content: CASE_BOTH }, { path: 'second.flag', content: '' }]),
    FAKE_CLAUDE_WRITE_ON_CALL: '3',
  }));
  assert.equal(passed.out.status, 'pass', JSON.stringify(passed.out));

  // Contador adulterado depois da aprovação: a conclusão não pode aceitar o estado sem conferir os eventos.
  const state = stateOf(root);
  saveState(root, CHANGE, { ...state, counters: { ...state.counters, invocations: state.counters.invocations + 1 } });
  const again = run(root, simulator(log));

  assert.equal(again.code, 2);
  assert.equal(again.out.stop_reason, 'reconciliation_mismatch');
  assert.equal(again.out.execution_approved, false);
  assert.ok(again.out.conciliation.checks.some((item) => item.id === 'invocations_state_counter' && !item.ok));
});

test('[MS-014] negação já recuperada pelo modelo não para a execução quando o gate passa', () => {
  const root = project();
  cli(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();
  const recovered = JSON.stringify({
    type: 'result', subtype: 'success', is_error: false, result: 'ok',
    permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'cat a && cat b' } }],
  });

  // A saída com negação vale para toda chamada. A primeira fatia passa mesmo com negação registrada; a segunda
  // reprova e a invocação tinha negação, então para por permissão sem correção.
  const result = run(root, simulator(log, { FAKE_CLAUDE_OUTPUT: recovered, FAKE_CLAUDE_TOUCH: 'first.flag', FAKE_CLAUDE_TOUCH_ON_CALL: '1' }));

  assert.equal(result.code, 2);
  assert.equal(result.out.stop_reason, 'permission_denied');
  assert.deepEqual(stateOf(root).slice_approvals.map((item) => item.task), ['primeira']);
  assert.equal(simulatorCalls(log).length, 2, 'uma invocação por fatia, sem correção depois da negação');
});

test('[MS-011] revalidação com prazo estourado usa o guarda existente e não altera a aprovação', async () => {
  const root = project();
  cli(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();
  stoppedAfterFirstSlice(root, log);
  const before = stateOf(root).slice_approvals.find((item) => item.task === 'primeira');
  const callsBefore = simulatorCalls(log).length;
  writeText(root, 'README.md', 'mudança depois da aprovação\n');

  // Avaliação que nunca termina: o guarda precisa cortá-la pelo prazo, sem chamada ao modelo.
  const hanging = () => new Promise(() => {});
  const stopped = await revalidateApprovals({
    root, change: CHANGE, evaluate: hanging, slices: [{ name: 'primeira', scenarios: ['E2E-001'] }],
    guard: { timeoutMs: 100, terminate: async () => true, signalSource: new EventEmitter() },
  });

  assert.equal(stopped.status, 'interrupted');
  const after = stateOf(root);
  assert.deepEqual(after.slice_approvals.find((item) => item.task === 'primeira'), before);
  assert.equal(after.invalidated_slices ?? null, null);
  assert.equal(simulatorCalls(log).length, callsBefore, 'nenhuma chamada ao modelo na revalidação');
});

test('[MS-016] validação final recusa aprovação de impressão anterior, sem chamada ao modelo', () => {
  const root = project();
  cli(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();
  stoppedAfterFirstSlice(root, log);
  writeText(root, 'README.md', 'mudança depois da aprovação\n');
  const callsBefore = simulatorCalls(log).length;

  const refused = cli(root, 'validate-final', []);

  assert.equal(refused.out.status, 'refused');
  assert.deepEqual(refused.out.revalidation_required, ['primeira']);
  assert.equal(refused.out.execution_approved, false);
  assert.equal(simulatorCalls(log).length, callsBefore);
});

test('[MS-017] revalidação interrompida pelo prazo tem motivo explícito e a próxima execução retoma', () => {
  const root = project();
  cli(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();
  stoppedAfterFirstSlice(root, log);
  // Prazo curto só neste projeto de teste. O caso hang só trava enquanto hang.flag existir.
  const policyPath = join(root, '.claude', 'harness', 'policy.json');
  writeText(root, '.claude/harness/policy.json', `${JSON.stringify({ ...JSON.parse(readFileSync(policyPath, 'utf8')), max_seconds_per_gate: 3 }, null, 2)}\n`);
  writeText(root, 'scripts/e2e/cenario.test.mjs', HANG_CASE);
  writeText(root, 'hang.flag', '');
  writeText(root, 'README.md', 'mudança para forçar revalidação\n');
  const callsBefore = simulatorCalls(log).length;
  const approvalBefore = stateOf(root).slice_approvals.find((item) => item.task === 'primeira');

  const interrupted = run(root, simulator(log));

  assert.equal(interrupted.code, 2);
  assert.equal(interrupted.out.stop_reason, 'revalidation_interrupted');
  assert.equal(simulatorCalls(log).length, callsBefore, 'revalidação interrompida não chama o modelo');
  const kept = stateOf(root).slice_approvals.find((item) => item.task === 'primeira');
  assert.deepEqual(kept, approvalBefore, 'aprovação antiga fica como está até a revalidação completar');

  // Recuperação: o caso volta ao normal e a próxima execução revalida e segue.
  rmSync(join(root, 'hang.flag'));
  writeText(root, 'scripts/e2e/cenario.test.mjs', CASE_FIRST);
  const resumed = run(root, simulator(log));
  assert.notEqual(resumed.out.stop_reason, 'revalidation_interrupted');
  assert.equal(stateOf(root).slice_approvals.find((item) => item.task === 'primeira').revalidations.length, 1);
});

test('[MS-018] correções contam por fatia e gate; o total do change acumula', () => {
  const root = project();
  cli(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();
  const result = run(root, simulator(log, {
    FAKE_CLAUDE_TOUCH: 'first.flag', FAKE_CLAUDE_TOUCH_ON_CALL: '1',
    FAKE_CLAUDE_WRITE: JSON.stringify([{ path: 'scripts/e2e/cenario.test.mjs', content: CASE_BOTH }, { path: 'second.flag', content: '' }]),
    FAKE_CLAUDE_WRITE_ON_CALL: '3',
  }));
  assert.equal(result.out.status, 'pass', JSON.stringify(result.out));
  const counters = stateOf(root).counters;
  assert.deepEqual(counters.corrections, { 'segunda:implement': 1 });
  assert.equal(counters.corrections_total, 1);
});

test('[MS-019] cenário casa por igualdade exata: [E2E-0010] não cumpre E2E-001', () => {
  const root = project();
  cli(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();
  writeText(root, 'scripts/e2e/cenario.test.mjs', CASE_NEAR_MISS);

  const result = run(root, simulator(log, { FAKE_CLAUDE_TOUCH: 'first.flag', FAKE_CLAUDE_TOUCH_ON_CALL: '1' }));

  assert.equal(result.code, 2, JSON.stringify(result.out));
  assert.equal(stateOf(root).slice_approvals ?? null, null, 'nenhuma fatia pode aprovar com cenário quase igual');
});

test('[MS-016] aprovação grava tarefa e impressão no mesmo registro, sem escrita separada', () => {
  const root = project();
  cli(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();
  stoppedAfterFirstSlice(root, log);

  const [approval] = stateOf(root).slice_approvals;
  assert.equal(approval.task, 'primeira');
  assert.equal(typeof approval.fingerprint, 'string');
  assert.equal(approval.fingerprint.length, 64);
});
