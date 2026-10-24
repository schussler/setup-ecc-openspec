// F12 (tarefas 12.1 e 12.2): migração de uma execução legada para o modo runner
// (PM-001 a PM-009). Fixtures em repositório git temporário; nenhuma chamada ao modelo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempDir, REPO_ROOT, writeTree } from './helpers.mjs';
import {
  archiveNeedsRevalidation, countCorrections, migrateLegacyRun, readMigratedHistory, rollbackLegacyRun,
} from '../../.claude/skills/template-migrate/legacy-run.mjs';

const CHANGE = 'add-service-fee';
const IMPLEMENT_GATE = join(REPO_ROOT, 'scripts/gates/implement-gate.mjs');
const NOW = new Date('2026-10-23T12:00:00.000Z');

const attempt = (verdict, note = '') => ({ attempt: 0, verdict, note, at: '2026-10-22T10:00:00.000Z' });

// Repositório git com identidade do projeto, toolset mínimo e histórico legado.
function legacyProject({ gates, tracker = null, archived = true }) {
  const root = makeTempDir('pm-legacy-');
  const files = {
    '.harness-project.json': `${JSON.stringify({ project_id: randomUUID() }, null, 2)}\n`,
    '.claude/harness/policy.json': readFileSync(join(REPO_ROOT, '.claude/harness/policy.json'), 'utf8'),
    'template.json': `${JSON.stringify({ checks: { test: 'node --test' } }, null, 2)}\n`,
    [`openspec/changes/${CHANGE}/gates.json`]: `${JSON.stringify(gates, null, 2)}\n`,
    'docs/agents/issue-tracker.md': tracker ?? '# Issue tracker\n\n## Gates\n\n| Data | Change | Gate | Tentativa | O que falhou | O que mudou | Pontuação | Veredito |\n|---|---|---|---|---|---|---|---|\n',
    'test/sample.test.js': 'import { test } from "node:test";\ntest("ok", () => {});\n',
  };
  if (archived) {
    files['openspec/changes/archive/2026-01-01-old-change/proposal.md'] = 'antigo\n';
    files['openspec/changes/archive/2026-01-01-old-change/gates.json'] = '{"implement":{"attempts":[{"verdict":"pass"}]}}\n';
  }
  writeTree(root, files);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'legado'], { cwd: root });
  return root;
}

const TRACKER_WITH_PASS = [
  '# Issue tracker', '', '## Gates', '',
  '| Data | Change | Gate | Tentativa | O que falhou | O que mudou | Pontuação | Veredito |',
  '|---|---|---|---|---|---|---|---|',
  `| 2026-10-22 | ${CHANGE} | implement | 1 | — | — | 100% | pass |`,
  '',
].join('\n');

const passingGates = () => ({ implement: { baseline: { test_files: ['test/sample.test.js'] }, attempts: [{ attempt: 1, verdict: 'pass', note: 'primeira' }] } });

function snapshot(dir) {
  const out = {};
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else out[path] = readFileSync(path, 'utf8');
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

const readJsonIf = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
const migrationDir = (root) => join(root, '.harness-local', CHANGE, 'migration');

test('[PM-001] migracao preserva historico sem aprovacao artificial', () => {
  const root = legacyProject({ gates: passingGates(), tracker: TRACKER_WITH_PASS });
  const result = migrateLegacyRun({ root, change: CHANGE, now: NOW });
  const history = readMigratedHistory(root, CHANGE);
  const row = history.find((entry) => entry.source === 'legacy-markdown');
  assert.ok(row, 'linha da tabela ausente do histórico');
  assert.equal(row.verdict, 'pass');
  assert.equal(row.approved, false);
  assert.deepEqual(result.approvals, [], 'nenhuma aprovação pode ser criada');
  assert.equal(history.filter((entry) => entry.approved === true).length, 0);
});

test('[PM-002] migracao copia o estado legado antes de importar', () => {
  const root = legacyProject({ gates: passingGates(), tracker: TRACKER_WITH_PASS });
  const original = readFileSync(join(root, 'openspec', 'changes', CHANGE, 'gates.json'), 'utf8');
  const seenBeforeHistory = [];
  migrateLegacyRun({
    root, change: CHANGE, now: NOW,
    hooks: {
      onStep: (name) => {
        if (name === 'history') seenBeforeHistory.push(readFileSync(join(migrationDir(root), 'pre-migration', 'gates.json'), 'utf8'));
      },
    },
  });
  assert.equal(seenBeforeHistory.length, 1, 'a cópia pré-migração precisa existir antes da importação');
  assert.equal(seenBeforeHistory[0], original);
});

test('[PM-003] avaliação de gate não é contada como correção; só retry seguido de nova tentativa', () => {
  // Três avaliações, dois retry; só o primeiro retry é seguido de uma nova tentativa (com nota).
  const events = [
    { gate: 'implement', verdict: 'retry', note: '' },
    { gate: 'implement', verdict: 'retry', note: '' },
    { gate: 'implement', verdict: 'pass', note: 'corrigi o arredondamento' },
  ];
  const counters = countCorrections(events);
  assert.equal(counters.evaluations, 3);
  assert.equal(counters.corrections, 1);
  assert.equal(counters.counters_certain, true);
});

test('[PM-003] sem nota registrada os contadores não são certos e a migração diz isso', () => {
  const gates = { implement: { attempts: [{ attempt: 1, verdict: 'retry' }, { attempt: 2, verdict: 'pass' }] } };
  const root = legacyProject({ gates });
  const result = migrateLegacyRun({ root, change: CHANGE, now: NOW });
  assert.equal(result.counters_certain, false);
  assert.equal(readJsonIf(join(migrationDir(root), 'counters.json')).counters_certain, false);
});

test('[PM-004] baseline da migração registra a data da migração e nenhuma aprovação anterior vale', () => {
  const root = legacyProject({ gates: passingGates(), tracker: TRACKER_WITH_PASS });
  migrateLegacyRun({ root, change: CHANGE, now: NOW });
  const baseline = readJsonIf(join(migrationDir(root), 'baseline.json'));
  assert.equal(baseline.created_at, NOW.toISOString());
  assert.equal(baseline.historical, false);
  assert.equal(baseline.source, 'migration-discovery');
  assert.ok(baseline.test_files.includes('test/sample.test.js'));
  assert.equal(readMigratedHistory(root, CHANGE).some((entry) => entry.approved === true), false);
});

test('[PM-005] migração não altera change arquivada', async () => {
  const root = legacyProject({ gates: passingGates(), tracker: TRACKER_WITH_PASS });
  const before = snapshot(join(root, 'openspec', 'changes', 'archive'));
  migrateLegacyRun({ root, change: CHANGE, now: NOW });
  await rollbackLegacyRun({ root, change: CHANGE, ...manualRollback() });
  assert.deepEqual(snapshot(join(root, 'openspec', 'changes', 'archive')), before);
});

test('[PM-006] evidência anterior à migração exige nova validação final antes de arquivar', () => {
  const root = legacyProject({ gates: passingGates(), tracker: TRACKER_WITH_PASS });
  migrateLegacyRun({ root, change: CHANGE, now: NOW });
  const summaryPath = join(root, 'openspec', 'changes', CHANGE, 'evidence-summary.json');
  writeFileSync(summaryPath, `${JSON.stringify({ generated_at: '2026-10-01T00:00:00.000Z' })}\n`);
  assert.equal(archiveNeedsRevalidation(root, CHANGE).revalidate, true);
  writeFileSync(summaryPath, `${JSON.stringify({ generated_at: '2026-10-24T00:00:00.000Z' })}\n`);
  assert.equal(archiveNeedsRevalidation(root, CHANGE).revalidate, false);
});

test('[PM-007] migração interrompida completa na reexecução sem linhas duplicadas', () => {
  const tracker = [
    '## Gates', '', '| Data | Change | Gate | Tentativa | O que falhou | O que mudou | Pontuação | Veredito |', '|---|---|---|---|---|---|---|---|',
    `| 2026-10-20 | ${CHANGE} | implement | 1 | a | b | 50% | retry |`,
    `| 2026-10-21 | ${CHANGE} | implement | 2 | a | b | 70% | retry |`,
    `| 2026-10-22 | ${CHANGE} | implement | 3 | — | — | 100% | pass |`,
    `| 2026-10-22 | ${CHANGE} | archive | 1 | — | — | 100% | pass |`,
  ].join('\n');
  const root = legacyProject({ gates: passingGates(), tracker });
  let imported = 0;
  assert.throws(() => migrateLegacyRun({
    root, change: CHANGE, now: NOW,
    hooks: { onEntry: () => { imported += 1; if (imported === 3) throw new Error('interrompido no meio do histórico'); } },
  }), (err) => {
    assert.match(err.message, /reexecute/);
    return true;
  });
  const second = migrateLegacyRun({ root, change: CHANGE, now: NOW });
  const history = readMigratedHistory(root, CHANGE);
  const ids = history.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'linha duplicada');
  assert.equal(history.filter((entry) => entry.source === 'legacy-markdown').length, 4);
  assert.equal(second.history_count, history.length);
});

test('[PM-008] execução migrada recusa escrita legada com mode_mismatch', () => {
  const root = legacyProject({ gates: passingGates(), tracker: TRACKER_WITH_PASS });
  migrateLegacyRun({ root, change: CHANGE, now: NOW });
  assert.equal(readJsonIf(join(root, '.harness-local', CHANGE, 'run-state.json')).mode, 'runner');
  const run = spawnSync(process.execPath, [IMPLEMENT_GATE, 'score', '--change', CHANGE, '--legacy-write', '--root', root], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(`${run.stdout}${run.stderr}`, /mode_mismatch/);
});

test('[PM-009] recuperação exige autorização explícita e preserva o consumo acumulado', async () => {
  const root = legacyProject({ gates: passingGates(), tracker: TRACKER_WITH_PASS });
  migrateLegacyRun({ root, change: CHANGE, now: NOW });
  const statePath = join(root, '.harness-local', CHANGE, 'run-state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  writeFileSync(statePath, `${JSON.stringify({ ...state, consumption: { known_usd: 1.25, estimated_usd: 0, unknown_calls: 1 } }, null, 2)}\n`);
  await assert.rejects(rollbackLegacyRun({ root, change: CHANGE, ...manualRollback(), isInteractive: () => false }), (err) => {
    assert.equal(err.stop_reason, 'authorization_required');
    return true;
  });
  const result = await rollbackLegacyRun({ root, change: CHANGE, ...manualRollback() });
  assert.equal(result.transparent, false);
  assert.deepEqual(readJsonIf(join(migrationDir(root), 'consumption-preserved.json')), { known_usd: 1.25, estimated_usd: 0, unknown_calls: 1 });
});

test('[PM-009] a restauração volta ao estado pré-migração', async () => {
  const root = legacyProject({ gates: passingGates(), tracker: TRACKER_WITH_PASS });
  const original = readFileSync(join(root, 'openspec', 'changes', CHANGE, 'gates.json'), 'utf8');
  migrateLegacyRun({ root, change: CHANGE, now: NOW });
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'gates.json'), '{"implement":{"attempts":[]}}\n');
  await rollbackLegacyRun({ root, change: CHANGE, ...manualRollback() });
  assert.equal(readFileSync(join(root, 'openspec', 'changes', CHANGE, 'gates.json'), 'utf8'), original);
});

// Decisão humana do procedimento manual_rollback (D32): aprovador e motivo, com terminal
// interativo simulado que confirma o código mostrado. Não é registro em authorizations.json.
function manualRollback() {
  return { approver: 'humano', reason: 'teste de recuperação', isInteractive: () => true, confirm: async (_summary, code) => code };
}
