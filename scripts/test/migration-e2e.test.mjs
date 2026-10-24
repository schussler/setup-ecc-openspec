// F12 (tarefa 12.4a): preparação verificável com fixtures sintéticas em Node. Um
// projeto sintético com checks.test em string é migrado pela CLI real, o
// checks.test_report declarado é executado pelo caminho do runner (runTestReport)
// e a saída TAP capturada é lida pelo adaptador. Nada chama o modelo, e nenhuma
// compatibilidade com outros stacks é afirmada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempDir, REPO_ROOT, writeTree } from './helpers.mjs';
import { runTestReport } from '../harness/test-report.mjs';

const MIGRATE = join(REPO_ROOT, '.claude/skills/template-migrate/migrate.mjs');
const CHANGE = 'add-sum';
const SUITE_GLOB = 'test/**/*.test.mjs';
const TEST_CMD = `node --test "${SUITE_GLOB}"`;
const TAP_CMD = `node --test --test-reporter=tap "${SUITE_GLOB}"`;

// Projeto Node sintético: uma função, dois testes com [ID] no nome, checks em string.
function syntheticProject() {
  const dir = makeTempDir('e2e-migrate-');
  writeTree(dir, {
    '.harness-project.json': `${JSON.stringify({ project_id: randomUUID() }, null, 2)}\n`,
    // Manifesto de projeto derivado: managed e owned existem, mesmo vazios.
    'template.json': `${JSON.stringify({
      template: { repo: 'sintetico', branch: 'main' },
      managed: [],
      owned: [],
      project: { name: 'sintetico' },
      checks: { test: TEST_CMD, lint: 'node -e "process.exit(0)"', typecheck: 'node -e "process.exit(0)"' },
    }, null, 2)}\n`,
    'src/sum.mjs': 'export const sum = (a, b) => a + b;\n',
    'test/sum.test.mjs': [
      "import { test } from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { sum } from '../src/sum.mjs';",
      "test('soma [AC-001] dois números', () => assert.equal(sum(1, 2), 3));",
      "test('soma [AC-002] zero é neutro', () => assert.equal(sum(4, 0), 4));",
      '',
    ].join('\n'),
  });
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'sintetico'], { cwd: dir });
  return dir;
}

const cli = (args) => JSON.parse(execFileSync(process.execPath, [MIGRATE, ...args], { encoding: 'utf8' }));
const manifestOf = (dir) => JSON.parse(readFileSync(join(dir, 'template.json'), 'utf8'));

test('[12.4a] projeto sintético migra checks.test_report e o comando declarado produz TAP com a suíte', async () => {
  const project = syntheticProject();
  const before = cli(['plan', '--template', REPO_ROOT, '--project', project]);
  assert.equal(before.items.find((item) => item.id === 'checks').details.test_report.status, 'needed');

  cli([
    'apply', '--template', REPO_ROOT, '--project', project, '--items', 'checks',
    '--checks-test', TEST_CMD, '--checks-test-report', TAP_CMD, '--checks-suite', 'unit',
  ]);
  const checks = manifestOf(project).checks;
  assert.deepEqual(checks.test, { command: TEST_CMD, suite: 'unit' });
  assert.deepEqual(checks.test_report, { command: TAP_CMD, suite: 'unit', format: 'tap' });

  const run = await runTestReport({
    root: project, change: CHANGE, command: checks.test_report.command, executionId: randomUUID(), format: 'tap',
  });
  assert.equal(run.code, 0, 'saída de teste com código diferente de zero');
  assert.equal(run.command_sha256, createHash('sha256').update(TAP_CMD).digest('hex'));
  const passed = run.cases.filter((item) => item.status === 'pass').map((item) => item.name);
  assert.ok(passed.some((name) => name.includes('[AC-001]')), passed.join(' | '));
  assert.ok(passed.some((name) => name.includes('[AC-002]')), passed.join(' | '));
  assert.ok(existsSync(join(project, run.output_path)), 'saída capturada ausente');
});

test('[12.4a] depois da migração o item checks fica done e reaplicar não muda o manifesto', () => {
  const project = syntheticProject();
  const args = [
    'apply', '--template', REPO_ROOT, '--project', project, '--items', 'checks',
    '--checks-test', TEST_CMD, '--checks-test-report', TAP_CMD, '--checks-suite', 'unit',
  ];
  cli(args);
  const once = readFileSync(join(project, 'template.json'), 'utf8');
  const status = cli(['plan', '--template', REPO_ROOT, '--project', project]).items.find((item) => item.id === 'checks').status;
  assert.equal(status, 'done');
  cli(args);
  assert.equal(readFileSync(join(project, 'template.json'), 'utf8'), once);
});
