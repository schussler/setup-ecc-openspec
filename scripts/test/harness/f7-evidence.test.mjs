// Impressão da evidência, caminhos protegidos e tarefas (F7, EV-001 a EV-004).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareProtected, fingerprint, protectedSnapshot } from '../../harness/evidence.mjs';
import { runHarnessStep } from '../../harness/runner.mjs';
import { runSlice } from '../../harness/slice.mjs';
import { loadState } from '../../harness/state.mjs';
import { FAKE_CLAUDE_BIN, newCallLog, simulatorEnv } from './simulator.mjs';
import { OK_OUTPUT, PROMPT, grant, writeAuthorizations } from './f6-support.mjs';
import { CHANGE } from './fixture.mjs';
import { CHANGE_DIR, RUNTIME, humanRecord, setAuthorizations, setupRepo } from './f7-support.mjs';

const fp = (root) => fingerprint({ root, change: CHANGE, runtime: RUNTIME }).fingerprint;
const snap = (root) => protectedSnapshot({ root, change: CHANGE });
const TASKS = `${CHANGE_DIR}/tasks.md`;

// Simulador que altera um arquivo do contrato durante a invocação (EV-003).
function mutatingClaude(root, target) {
  const dir = mkdtempSync(join(tmpdir(), 'f7-claude-'));
  const script = join(dir, 'mutating-claude.mjs');
  writeFileSync(script, [
    "import { appendFileSync } from 'node:fs';",
    `appendFileSync(${JSON.stringify(join(root, target))}, '\\nalterado durante a invocação\\n');`,
    `console.log(${JSON.stringify(JSON.stringify({ ...OK_OUTPUT, total_cost_usd: 0.1 }))});`,
    '',
  ].join('\n'));
  return [process.execPath, script];
}

test('[EV-001] impressão muda quando surge arquivo novo não commitado', () => {
  const root = setupRepo();
  const before = fp(root);
  writeFileSync(join(root, 'novo.mjs'), 'export const valor = 1;\n');
  assert.notEqual(fp(root), before);
});

test('[EV-002] run-state, gates.json e summary.md não mudam a impressão', () => {
  const root = setupRepo();
  const before = fp(root);
  mkdirSync(join(root, '.harness-local', CHANGE), { recursive: true });
  writeFileSync(join(root, '.harness-local', CHANGE, 'run-state.json'), '{"revision": 2}\n');
  writeFileSync(join(root, CHANGE_DIR, 'gates.json'), '{}\n');
  writeFileSync(join(root, CHANGE_DIR, 'summary.md'), '# resumo operacional\n');
  assert.equal(fp(root), before);
});

test('[EV-003] alteração de proposta, design ou specs aparece como caminho protegido alterado', () => {
  const root = setupRepo();
  const before = snap(root);
  writeFileSync(join(root, CHANGE_DIR, 'proposal.md'), 'alterado\n');
  assert.deepEqual(compareProtected(before, snap(root)), [`${CHANGE_DIR}/proposal.md`]);
});

test('[EV-003] remover uma exclusão de policy.json é detectado como alteração protegida', () => {
  const root = setupRepo();
  const before = snap(root);
  const policyPath = join(root, '.claude', 'harness', 'policy.json');
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
  policy.excluded_paths = policy.excluded_paths.filter((entry) => entry !== 'gates.json');
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
  const changed = compareProtected(before, snap(root));
  assert.ok(changed.includes('.claude/harness/policy.json:excluded_paths'), `alterados: ${changed}`);
});

test('[EV-003] alteração de contrato durante uma invocação vira forbidden_action_stopped com protected_change', async () => {
  const root = setupRepo();
  writeAuthorizations(root, [grant('budget-1', 10)]);
  const result = await runHarnessStep({
    root, change: CHANGE, bin: mutatingClaude(root, `${CHANGE_DIR}/proposal.md`), prompt: PROMPT,
    allowedTools: ['Read'], env: {}, protect: () => snap(root),
  });
  assert.equal(result.invoked, true);
  assert.equal(result.state, 'forbidden_action_stopped');
  assert.equal(result.stop_reason, 'protected_change');
  assert.equal(loadState(root, CHANGE).state, 'forbidden_action_stopped');
  assert.ok(result.protected_changes.includes(`${CHANGE_DIR}/proposal.md`));
});

test('[EV-003] alteração de contrato durante a avaliação do gate vira forbidden_action_stopped', async () => {
  const root = setupRepo();
  writeAuthorizations(root, [grant('budget-1', 10)]);
  const target = join(root, CHANGE_DIR, 'design.md');
  const result = await runSlice({
    root, change: CHANGE, bin: FAKE_CLAUDE_BIN, prompt: PROMPT, correctionPrompt: PROMPT,
    allowedTools: ['Read'], env: simulatorEnv(newCallLog(), OK_OUTPUT), gate: 'implement',
    protect: () => snap(root),
    evaluate: async () => {
      appendFileSync(target, '\nalterado no gate\n');
      return { outcome: 'passed', failures: [], errorClass: null };
    },
  });
  assert.equal(result.state, 'forbidden_action_stopped');
  assert.equal(result.stop_reason, 'protected_change');
});

test('[EV-003] alterar um registro de autorização existente é protegido; acrescentar registro não é', () => {
  const first = humanRecord('rev-1', 'revision', { change: CHANGE, scenario: 'AC-011', revision: 1 });
  const root = setupRepo({ authorizations: [first] });
  const before = snap(root);
  setAuthorizations(root, [first, humanRecord('rev-2', 'revision', { change: CHANGE, scenario: 'AC-011', revision: 2 })]);
  assert.deepEqual(compareProtected(before, snap(root)), [], 'acréscimo é permitido');
  setAuthorizations(root, [{ ...first, reason: 'motivo reescrito' }]);
  assert.deepEqual(compareProtected(before, snap(root)), [`${CHANGE_DIR}/authorizations.json`]);
});

test('[EV-004] marcar [ ] como [x] em tasks.md não registra alteração proibida', () => {
  const root = setupRepo({ files: { [TASKS]: '## 1\n\n- [ ] 1.1 primeira\n- [ ] 1.2 segunda\n' } });
  const before = snap(root);
  writeFileSync(join(root, TASKS), '## 1\n\n- [x] 1.1 primeira\n- [ ] 1.2 segunda\n');
  assert.deepEqual(compareProtected(before, snap(root)), []);
});

test('[EV-004] desmarcar uma tarefa é alteração operacional; alterar outro texto de tasks.md é alteração proibida', () => {
  const root = setupRepo({ files: { [TASKS]: '## 1\n\n- [x] 1.1 primeira\n- [ ] 1.2 segunda\n' } });
  const before = snap(root);
  writeFileSync(join(root, TASKS), '## 1\n\n- [ ] 1.1 primeira\n- [ ] 1.2 segunda\n');
  assert.deepEqual(compareProtected(before, snap(root)), [], 'desmarcar é alternância de checkbox (D31)');

  const again = snap(root);
  writeFileSync(join(root, TASKS), '## 1\n\n- [ ] 1.1 primeira, reescrita\n- [ ] 1.2 segunda\n');
  assert.deepEqual(compareProtected(again, snap(root)), [TASKS]);
});
