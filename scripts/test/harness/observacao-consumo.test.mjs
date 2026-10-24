// Observação silenciosa e consumo (add-silent-consumption-observability, CO-001 a CO-020). O modo padrão
// roda sem autorização de orçamento; o modo financeiro só vale com modo_financeiro: true. A CLI real
// (cli.mjs) roda com --claude-bin apontando para o simulador: nenhum teste chama o modelo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { REPO_ROOT } from './fixture.mjs';
import { CHANGE, CHANGE_DIR, adopt, changeRepo, cli, eventsOf, stateOf, writeText } from './cli-support.mjs';
import { newCallLog, simulatorCalls } from './simulator.mjs';
import { calculateContractHash } from '../../harness/identification.mjs';
import { eventsPath } from '../../harness/telemetry.mjs';
import { consumptionSummary, financialMode, observeSafely, renderSummary, SUMMARY_FILE } from '../../harness/observation.mjs';

const CLI = join(REPO_ROOT, 'scripts', 'harness', 'cli.mjs');
const FAKE = join(REPO_ROOT, 'scripts', 'test', 'harness', 'fixtures', 'fake-claude.mjs');
const CLAUDE_BIN = `${process.execPath} ${FAKE}`;
const PROFILE = '.claude/harness/profiles/default.json';
const FLAG = 'ok.flag';
const MODEL = 'claude-sonnet-5-5';
const TAP = 'node --test --test-reporter=tap scripts/e2e/cenario.test.mjs';
const ARCHIVE = `openspec/changes/archive/2026-10-25-${CHANGE}`;
const SECTION = 'Consumo e observações finais';

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

// Saída do simulador com custo, uso e modelo. Variantes removem custo ou uso.
const USAGE = { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 30, cache_read_input_tokens: 40 };
const FULL_OUTPUT = JSON.stringify({
  type: 'result', subtype: 'success', is_error: false, result: 'ok', total_cost_usd: 0.1, usage: USAGE, modelUsage: { [MODEL]: {} },
});
const NO_COST_OUTPUT = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'ok' });
const NO_USAGE_OUTPUT = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'ok', total_cost_usd: 0.1 });

// Projeto da fixture com a change e o marco de adoção. `profile` é mesclado ao perfil padrão.
function project(profile = {}) {
  const root = changeRepo();
  writeText(root, 'template.json', `${JSON.stringify({ checks: {
    test: { command: TAP, suite: 'e2e' },
    test_report: { command: TAP, suite: 'e2e', format: 'tap' },
    lint: 'node -e ""',
    typecheck: 'node -e ""',
  } }, null, 2)}\n`);
  writeText(root, 'scripts/e2e/cenario.test.mjs', CASE);
  const base = JSON.parse(readFileSync(join(REPO_ROOT, PROFILE), 'utf8'));
  writeText(root, PROFILE, `${JSON.stringify({ ...base, ...profile }, null, 2)}\n`);
  writeText(root, '.claude/settings.json', `${JSON.stringify({ permissions: { allow: ['Read', 'Edit', 'Write'] } }, null, 2)}\n`);
  writeText(root, `${CHANGE_DIR}/specs/harness-cli/spec.md`, SPEC);
  adopt(root);
  return root;
}

// Subcomando da CLI em processo próprio, com a saída crua para conferir o que foi impresso.
function sub(root, command, args = [], env = {}) {
  const child = spawnSync(process.execPath, [CLI, command, '--change', CHANGE, '--root', root, ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ...env },
  });
  return { code: child.status, raw: child.stdout, out: JSON.parse(child.stdout) };
}

const runCli = (root, env, args = []) => sub(root, 'run', ['--claude-bin', CLAUDE_BIN, ...args], env);

function simulator(log, output = FULL_OUTPUT, extra = {}) {
  return { FAKE_CLAUDE_LOG: log, FAKE_CLAUDE_OUTPUT: output, ...extra };
}

function writeEvents(root, records) {
  const path = eventsPath(root, CHANGE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, records.map((record) => `${JSON.stringify(record)}\n`).join(''));
}

const invocation = (over = {}) => ({
  schema: '1.0.0', at: '2026-10-25T00:00:00.000Z', agent: 'runner', function: 'invocacao', provider: 'claude-cli',
  paid: true, model_requested: MODEL, model_effective: MODEL, effort_requested: null, effort_effective: null,
  duration_ms: 1000, tokens: null, cost_usd: null, cost_source: 'unknown', status: 'success', stage: 'implement',
  attempt: 1, task: null, corrections_requested: 0, stops: [], ...over,
});

const sectionOf = (out) => out.section;

test('[CO-001] execução padrão sem autorização de orçamento', () => {
  const root = project();
  assert.equal(sub(root, 'start', ['--mode', 'runner']).out.status, 'started');
  const log = newCallLog();

  const result = runCli(root, simulator(log, FULL_OUTPUT, { FAKE_CLAUDE_TOUCH: FLAG, FAKE_CLAUDE_TOUCH_ON_CALL: '1' }));

  assert.equal(result.out.status, 'pass', JSON.stringify(result.out));
  assert.notEqual(result.out.stop_reason, 'authorization_required');
  assert.equal(simulatorCalls(log).length, 1);
  assert.equal(stateOf(root).open_reservations.length, 0);
});

test('[CO-002] modo financeiro exige ativacao explicita', () => {
  const root = project();
  sub(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();

  runCli(root, simulator(log, FULL_OUTPUT, { FAKE_CLAUDE_TOUCH: FLAG, FAKE_CLAUDE_TOUCH_ON_CALL: '1' }));

  const args = simulatorCalls(log)[0].args;
  assert.equal(args.includes('--max-budget-usd'), false);
  assert.equal(financialMode({}), false);
  assert.equal(financialMode({ modo_financeiro: false }), false);
  assert.equal(financialMode({ modo_financeiro: true }), true);
  assert.throws(() => financialMode({ modo_financeiro: 'sim' }), /verdadeiro ou falso/);
});

test('[CO-003] controles nao financeiros continuam no modo de observacao', () => {
  // Limite de invocações da change zerado: a parada é a mesma que o modo financeiro teria.
  const root = project({ candidate_invocations_per_change: 0 });
  sub(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();

  const result = runCli(root, simulator(log));

  assert.equal(result.out.stop_reason, 'budget_exhausted');
  assert.equal(simulatorCalls(log).length, 0);
});

test('[CO-004] custo desconhecido nao bloqueia a observacao', () => {
  const root = project();
  sub(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();

  const result = runCli(root, simulator(log, NO_COST_OUTPUT, { FAKE_CLAUDE_TOUCH: FLAG, FAKE_CLAUDE_TOUCH_ON_CALL: '1' }));

  assert.equal(result.out.status, 'pass', JSON.stringify(result.out));
  const [event] = eventsOf(root).filter((record) => record.function === 'invocacao');
  assert.equal(event.cost_source, 'unknown');
  assert.equal(event.cost_usd, null);
  assert.equal(stateOf(root).open_reservations.length, 0);
});

test('[CO-005] registro completo por invocacao', () => {
  const root = project();
  sub(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();

  runCli(root, simulator(log, FULL_OUTPUT, { FAKE_CLAUDE_TOUCH: FLAG, FAKE_CLAUDE_TOUCH_ON_CALL: '1' }), ['--model', MODEL, '--effort', 'high']);

  const [event] = eventsOf(root).filter((record) => record.function === 'invocacao');
  assert.equal(event.agent, 'runner');
  assert.equal(event.model_requested, MODEL);
  assert.equal(event.model_effective, MODEL);
  assert.equal(event.effort_requested, 'high');
  assert.equal(typeof event.duration_ms, 'number');
  assert.deepEqual(event.tokens, { input: 10, output: 20, cache_creation_input: 30, cache_read_input: 40, scope: 'main_loop' });
  assert.equal(event.cost_usd, 0.1);
  assert.equal(event.cost_source, 'reported');
  assert.equal(event.stage, 'implement');
  assert.equal(typeof event.attempt, 'number');
  assert.equal(typeof event.execution_id, 'string');
  assert.equal(typeof event.invocation_id, 'string');
});

test('[CO-006] tarefa so com vinculo confiavel', () => {
  const root = project();
  sub(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();

  runCli(root, simulator(log, FULL_OUTPUT, { FAKE_CLAUDE_TOUCH: FLAG, FAKE_CLAUDE_TOUCH_ON_CALL: '1' }), ['--task', 'texto livre sem identificador']);

  const [event] = eventsOf(root).filter((record) => record.function === 'invocacao');
  assert.equal(event.task, null);
});

test('[CO-007] tokens ausentes ficam nulos', () => {
  const root = project();
  sub(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();

  runCli(root, simulator(log, NO_USAGE_OUTPUT, { FAKE_CLAUDE_TOUCH: FLAG, FAKE_CLAUDE_TOUCH_ON_CALL: '1' }));

  const [event] = eventsOf(root).filter((record) => record.function === 'invocacao');
  assert.equal(event.tokens, null);
});

test('[CO-008] nenhuma mensagem de consumo por etapa', () => {
  const root = project();
  sub(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();

  const result = runCli(root, simulator(log, FULL_OUTPUT, { FAKE_CLAUDE_TOUCH: FLAG, FAKE_CLAUDE_TOUCH_ON_CALL: '1' }));

  assert.equal(result.out.status, 'pass');
  assert.doesNotMatch(result.raw, /consumo|saldo|orçamento/i);
});

test('[CO-009] medicao sem chamada adicional ao modelo', () => {
  const root = project();
  writeEvents(root, [invocation({ cost_usd: 0.1, cost_source: 'reported' })]);
  const log = newCallLog();

  const child = spawnSync(process.execPath, [CLI, 'consumo', '--change', CHANGE, '--root', root], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ...simulator(log) },
  });

  assert.equal(child.status, 0, child.stdout);
  assert.equal(simulatorCalls(log).length, 0);
});

test('[CO-010] secao final unica e gravada com o arquivo', async () => {
  const root = project();
  writeEvents(root, [invocation({ cost_usd: 0.1, cost_source: 'reported', tokens: USAGE })]);
  // Pasta arquivada com cópia do contrato, como o arquivamento deixa.
  for (const file of ['proposal.md', 'design.md', 'tasks.md']) {
    writeText(root, `${ARCHIVE}/${file}`, readFileSync(join(root, CHANGE_DIR, file), 'utf8'));
  }
  writeText(root, `${ARCHIVE}/specs/harness-cli/spec.md`, readFileSync(join(root, CHANGE_DIR, 'specs/harness-cli/spec.md'), 'utf8'));
  const before = calculateContractHash(join(root, CHANGE_DIR));

  const result = await cli(root, 'consumo', ['--archived']);

  const written = readFileSync(join(root, ARCHIVE, SUMMARY_FILE), 'utf8');
  assert.equal(result.status, 'written');
  assert.equal(written.split(`## ${SECTION}`).length - 1, 1);
  assert.equal(calculateContractHash(join(root, CHANGE_DIR)), before);
  assert.equal(calculateContractHash(join(root, ARCHIVE)), before, 'a pasta arquivada mantém o mesmo contrato');
});

test('[CO-011] resumo corresponde aos registros e distingue desconhecidos', () => {
  const summary = consumptionSummary(fixtureRoot([
    invocation({ cost_usd: 0.2, cost_source: 'reported', tokens: USAGE }),
    invocation({ cost_usd: null, cost_source: 'unknown', tokens: USAGE }),
  ]), CHANGE);

  assert.equal(summary.cost.reported_usd, 0.2);
  assert.equal(summary.cost.unknown, 1);
  assert.equal(summary.status, 'parcial');
  assert.match(renderSummary(summary), /Desconhecido: 1 invocação\(ões\), sem valor \(não contado como zero\)/);
  assert.match(renderSummary(summary), /Total conhecido: US\$ 0\.2000 \(parcial/);
});

test('[CO-012] causa observada separada de hipotese', () => {
  const summary = consumptionSummary(fixtureRoot([invocation({ cost_usd: 0.1, cost_source: 'reported', tokens: USAGE })]), CHANGE);
  const text = renderSummary(summary);

  assert.match(text, /### Causas observadas\n- Sem evidência para explicar o gasto/);
  assert.match(text, /### Hipóteses\n- Nenhuma registrada/);
});

test('[CO-013] subagentes e sessoes interativas como nao medidos', () => {
  const text = renderSummary(consumptionSummary(fixtureRoot([invocation({ cost_usd: 0.1, cost_source: 'reported' })]), CHANGE));

  assert.match(text, /subagentes e sessões interativas: não medidos/);
  assert.doesNotMatch(text, /subagentes: 0/);
});

test('[CO-014] falha de coleta nao bloqueia a invocacao', () => {
  const root = fixtureRoot([]);

  const outcome = observeSafely(root, CHANGE, () => {
    throw new Error('disco cheio simulado');
  });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.warning, 'disco cheio simulado');
  assert.equal(eventsOf(root).find((record) => record.kind === 'observability').message, 'disco cheio simulado');
});

test('[CO-015] arquivamento nao e apresentado como falho por erro do relatorio', async () => {
  const root = project();
  writeEvents(root, [invocation({ cost_usd: 0.1, cost_source: 'reported' })]);
  const contractBefore = calculateContractHash(join(root, CHANGE_DIR));

  // Sem pasta arquivada, o relatório falha e o contrato fica como está.
  const failed = await cli(root, 'consumo', ['--archived']);
  assert.equal(failed.status, 'error');
  assert.equal(calculateContractHash(join(root, CHANGE_DIR)), contractBefore);

  // O arquivamento aparece depois, e o resumo sai de novo sem nova etapa.
  writeText(root, `${ARCHIVE}/proposal.md`, '# arquivada\n');
  const retried = await cli(root, 'consumo', ['--archived']);
  assert.equal(retried.status, 'written');
  assert.ok(existsSync(join(root, ARCHIVE, SUMMARY_FILE)));
});

test('[CO-016] consulta somente leitura', async () => {
  const root = project();
  writeEvents(root, [invocation({ cost_usd: 0.1, cost_source: 'reported' })]);
  const snapshot = listFiles(join(root, CHANGE_DIR)).concat(readFileSync(eventsPath(root, CHANGE), 'utf8'));

  const result = await cli(root, 'consumo');

  assert.equal(result.status, 'ok');
  assert.match(sectionOf(result), new RegExp(`## ${SECTION}`));
  assert.deepEqual(listFiles(join(root, CHANGE_DIR)).concat(readFileSync(eventsPath(root, CHANGE), 'utf8')), snapshot);
});

test('[CO-017] consulta nunca roda automaticamente', () => {
  const callers = ['runner.mjs', 'slice.mjs', 'cli-run.mjs', 'cli-actions.mjs'].map((name) => readFileSync(join(REPO_ROOT, 'scripts', 'harness', name), 'utf8'));

  for (const source of callers) {
    assert.doesNotMatch(source, /import \{[^}]*\bconsumo\b[^}]*\} from '\.\/observation\.mjs'/);
    assert.doesNotMatch(source, /writeArchivedSummary|consumptionSummary\(/);
  }
});

test('[CO-018] modo financeiro mantem a parada por autorizacao', () => {
  const root = project({ modo_financeiro: true });
  sub(root, 'start', ['--mode', 'runner']);
  const log = newCallLog();

  const result = runCli(root, simulator(log));

  assert.equal(result.out.stop_reason, 'authorization_required');
  assert.equal(simulatorCalls(log).length, 0);
});

test('[CO-019] nenhum envio de dados de consumo', () => {
  const sources = ['observation.mjs', 'telemetry.mjs'].map((name) => readFileSync(join(REPO_ROOT, 'scripts', 'harness', name), 'utf8'));

  for (const source of sources) {
    assert.doesNotMatch(source, /\bfetch\(|node:http|node:https|node:net|node:dns|child_process/);
  }
});

test('[CO-020] resumo traz todos os campos obrigatorios', () => {
  const text = renderSummary(consumptionSummary(fixtureRoot([invocation({ cost_usd: 0.1, cost_source: 'reported', tokens: USAGE })]), CHANGE));

  for (const heading of [
    '### Tokens por categoria', '### Custo informado ou estimado', '### Consumo por etapa e tentativa',
    '### Maiores consumidores', '### Correções e repetições', '### Causas observadas', '### Hipóteses', '### Lacunas de medição',
  ]) {
    assert.ok(text.includes(heading), `falta ${heading}`);
  }
});

// Raiz temporária com a change e os eventos dados, para as consultas que não precisam de execução.
function fixtureRoot(records) {
  const root = project();
  writeEvents(root, records);
  return root;
}

// Lista recursiva de caminhos com tamanho, para comparar antes e depois da consulta.
function listFiles(dir) {
  return readdirSync(dir, { recursive: true }).map((entry) => `${entry}:${statSync(join(dir, entry)).size}`).sort();
}
