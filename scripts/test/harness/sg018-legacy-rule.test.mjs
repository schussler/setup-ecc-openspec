// SG-018: parada por ausência de melhora é regra legada. Em execução legacy (sem run-state de modo
// runner), a avaliação reprovada sem queda de falhas dá `stop`; em execução runner a regra não se
// aplica (RC-041). Fixtures em diretório temporário e simulador do claude; nenhuma chamada ao modelo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { recordBaseline, scoreImplementation } from '../../gates/implement-gate.mjs';
import { legacyNoProgressStop, runMode } from '../../gates/gate-store.mjs';
import { loadState } from '../../harness/state.mjs';
import { CHANGE, makeRepo } from './fixture.mjs';
import { failed, grant, passed, scripted, slice, writeAuthorizations } from './f6-support.mjs';
import { newCallLog, simulatorCalls } from './simulator.mjs';
import { makeTempDir, writeTree } from '../helpers.mjs';

const FAILING = "import { test } from 'node:test';\nimport assert from 'node:assert';\ntest('quebra', () => assert.equal(1, 2));\n";

function legacyProject() {
  const root = writeTree(makeTempDir('sg018-'), {
    'template.json': { checks: { test: 'node --test', test_file: 'node --test {file}', lint: 'true', typecheck: 'true' } },
    'test/a.test.mjs': FAILING,
  });
  mkdirSync(join(root, 'openspec/changes/c'), { recursive: true });
  return root;
}

test('[SG-018] em execução legacy, avaliação reprovada sem queda de falhas dá stop pela regra legada; no runner não se aplica', async () => {
  // Legacy: a mesma falha nas duas avaliações; a segunda não tem menos falhas.
  const root = legacyProject();
  assert.equal(runMode(root, 'c'), 'legacy');
  await recordBaseline({ root, change: 'c', legacyWrite: true });
  const first = await scoreImplementation({ root, change: 'c', note: 'primeira', legacyWrite: true });
  const second = await scoreImplementation({ root, change: 'c', note: 'sem melhora', legacyWrite: true });
  assert.equal(first.verdict, 'retry');
  assert.equal(second.failures, first.failures);
  assert.equal(second.verdict, 'stop');
  // A parada vem da regra identificada como legada (gate-store.legacyNoProgressStop).
  assert.equal(legacyNoProgressStop(second.failures, first.failures), true);

  // Runner: falhas que não caem, com sintomas diferentes, não param a fatia (RC-041).
  const repo = makeRepo();
  writeAuthorizations(repo, [grant('budget-1', 30)]);
  const log = newCallLog();
  const evaluate = scripted([failed(['a', 'b']), failed(['c', 'd']), passed(), passed()]);
  const result = await slice(repo, log, { evaluate });
  assert.equal(loadState(repo, CHANGE).mode, 'runner');
  assert.equal(result.state, 'approved');
  assert.notEqual(result.stop_reason, 'stop');
  assert.equal(simulatorCalls(log).length, 3);
});
