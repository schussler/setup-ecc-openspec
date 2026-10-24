// Preflight antes do loop (MS-009) e negação de permissão como bloqueio operacional (MS-010).
// Testes de unidade do preflight com repositórios temporários; o CLI não chama o modelo nestes casos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPreflight } from '../../harness/preflight.mjs';
import { parseHarnessOutput } from '../../harness/claude.mjs';
import { REPO_ROOT } from './fixture.mjs';

const FAKE = join(REPO_ROOT, 'scripts', 'test', 'harness', 'fixtures', 'fake-claude.mjs');
const OK_BIN = [process.execPath, FAKE];
const ADOPTION = '## Marco de adoção\n- **Marco de adoção registrado:** 2026-10-24 — aprovador: Douglas\n';
const CLEAN_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };

// Projeto mínimo que passa em todos os itens; cada teste quebra um item.
function project({ commit = true, identity = true, projectId = true, adoption = true, settings = true, checks = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'preflight-'));
  const git = (args) => execFileSync('git', ['-C', root, ...args], { env: CLEAN_ENV, stdio: 'pipe' });
  git(['init', '-q']);
  if (identity) {
    git(['config', 'user.name', 'Teste']);
    git(['config', 'user.email', 'teste@example.com']);
  }
  mkdirSync(join(root, '.claude', 'harness', 'profiles'), { recursive: true });
  writeFileSync(join(root, '.claude', 'harness', 'profiles', 'default.json'), '{}\n');
  if (settings) {
    mkdirSync(join(root, '.claude'), { recursive: true });
    writeFileSync(join(root, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Read', 'Edit'] } }));
  }
  if (checks) {
    writeFileSync(join(root, 'template.json'), JSON.stringify({ checks: { test: { command: 'node -e ""' }, lint: 'node -e ""', typecheck: 'node -e ""' } }));
  }
  if (projectId) writeFileSync(join(root, '.harness-project.json'), JSON.stringify({ project_id: 'pid-teste' }));
  mkdirSync(join(root, 'docs', 'agents'), { recursive: true });
  writeFileSync(join(root, 'docs', 'agents', 'issue-tracker.md'), adoption ? ADOPTION : '# Sem marco\n');
  writeFileSync(join(root, 'README.md'), 'x\n');
  if (commit) git(['add', '-A']) && git(['commit', '-q', '-m', 'base']);
  return root;
}

const blockedIds = (report) => report.items.filter((item) => item.status === 'blocked').map((item) => item.id);
const preflight = (root, bin = OK_BIN) => runPreflight({ root, bin, env: CLEAN_ENV, profilePath: '.claude/harness/profiles/default.json' });

test('[MS-009] projeto completo passa no preflight', () => {
  const report = preflight(project());
  assert.equal(report.status, 'ready', JSON.stringify(report.items));
});

test('[MS-009] repositório sem commit base é bloqueado em git_head', () => {
  assert.deepEqual(blockedIds(preflight(project({ commit: false }))), ['git_head']);
});

test('[MS-009] sem identidade Git é bloqueado em git_identity', () => {
  assert.deepEqual(blockedIds(preflight(project({ identity: false }))), ['git_identity']);
});

test('[MS-009] sem identidade do projeto é bloqueado em project_id', () => {
  assert.deepEqual(blockedIds(preflight(project({ projectId: false }))), ['project_id']);
});

test('[MS-009] sem marco de adoção é bloqueado em adoption', () => {
  assert.deepEqual(blockedIds(preflight(project({ adoption: false }))), ['adoption']);
});

test('[MS-009] sem permissões do projeto é bloqueado em permissions', () => {
  assert.deepEqual(blockedIds(preflight(project({ settings: false }))), ['permissions']);
});

test('[MS-009] checks ausentes no template são bloqueados em checks', () => {
  assert.deepEqual(blockedIds(preflight(project({ checks: false }))), ['checks']);
});

test('[MS-009] ferramenta claude ausente é bloqueada em claude_binary, sem chamada ao modelo', () => {
  assert.deepEqual(blockedIds(preflight(project(), ['/nao/existe/claude'])), ['claude_binary']);
});

test('[MS-010] negação registrada na saída só com o nome da ferramenta, sem mudar o status', () => {
  const json = {
    type: 'result', subtype: 'success', is_error: false, result: 'ok',
    permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'cat a.md && cat b.md' } }],
  };
  const outcome = parseHarnessOutput({ code: 0, stdout: `${JSON.stringify(json)}\n`, durationMs: 1, stderr: '' });
  assert.equal(outcome.status, 'success');
  // Sanitizado (revisão): só o nome da ferramenta; a primeira palavra do comando não é mais gravada.
  assert.deepEqual(outcome.permission_denials, [{ tool_name: 'Bash' }]);
  assert.equal(JSON.stringify(outcome).includes('b.md'), false, 'argumentos do comando não podem ir para o registro');
});

// Change com fatias declaradas; cada cenário citado precisa existir numa spec da change (MS-009, referências).
function changeWithSlices(root, tasks, specIds = ['E2E-001', 'E2E-002']) {
  const dir = join(root, 'openspec', 'changes', 'mudanca-teste');
  mkdirSync(join(dir, 'specs', 'capacidade'), { recursive: true });
  writeFileSync(join(dir, 'tasks.md'), tasks);
  writeFileSync(join(dir, 'specs', 'capacidade', 'spec.md'), specIds.map((id) => `#### Scenario: x\n- **ID:** ${id}\n`).join('\n'));
  return 'mudanca-teste';
}

test('[MS-009] fatia que cita cenário inexistente é bloqueada em slice_references', () => {
  const root = project();
  const change = changeWithSlices(root, '## Fatia: primeira\n\n- Cenários: E2E-001\n\n## Fatia: segunda\n\n- Cenários: E2E-999\n');
  const report = runPreflight({ root, bin: OK_BIN, env: CLEAN_ENV, profilePath: '.claude/harness/profiles/default.json', change });
  assert.deepEqual(blockedIds(report), ['slice_references']);
  assert.match(report.items.find((item) => item.id === 'slice_references').detail, /E2E-999/);
});

test('[MS-009] fatias com cenários existentes passam em slice_references', () => {
  const root = project();
  const change = changeWithSlices(root, '## Fatia: primeira\n\n- Cenários: E2E-001\n\n## Fatia: segunda\n\n- Cenários: E2E-002\n');
  const report = runPreflight({ root, bin: OK_BIN, env: CLEAN_ENV, profilePath: '.claude/harness/profiles/default.json', change });
  assert.equal(report.status, 'ready', JSON.stringify(report.items));
});

test('[MS-022] o registro de negação não contém nada do comando, nem valores de variáveis', () => {
  const json = {
    type: 'result', subtype: 'success', is_error: false, result: 'ok',
    permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'TOKEN=segredo-123 curl https://exemplo.test/x' } }],
  };
  const outcome = parseHarnessOutput({ code: 0, stdout: `${JSON.stringify(json)}\n`, durationMs: 1, stderr: '' });
  const recorded = JSON.stringify(outcome.permission_denials);
  assert.deepEqual(outcome.permission_denials, [{ tool_name: 'Bash' }]);
  assert.equal(recorded.includes('segredo'), false);
  assert.equal(recorded.includes('curl'), false);
});
