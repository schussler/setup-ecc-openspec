// Vínculos de cenário por caso (A.3, item B, AC-026): tags, scenario_ids, revisões e adaptador TAP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTapCases } from '../../harness/test-report.mjs';
import { caseEntry, scenario, setupRepo, tapOf, validate, writeManifest } from './a-support.mjs';

const OTHER = 'tests/vinculos.test.mjs';

test('[AC-026] nome de caso com tags de dois cenários exige que scenario_ids liste os dois', async () => {
  const NAME = '[AC-024] e [AC-025] comum';
  const root = setupRepo({
    scenarios: [scenario('AC-024'), scenario('AC-025')],
    tap: tapOf([`ok 1 - ${NAME}`]),
    files: { [OTHER]: `test('${NAME}', () => {});\n` },
  });
  writeManifest(root, [caseEntry(root, { file: OTHER, name: NAME, scenarios: ['AC-024'] })]);
  const result = await validate(root);
  assert.equal(result.stop_reason, 'config_error', JSON.stringify(result));
  assert.match(result.message, /AC-025/);
});

test('[AC-026] tag de cenário não declarado na change é vínculo ambíguo e reprova citando a tag', async () => {
  const NAME = '[AC-024] e [AC-099] fantasma';
  const root = setupRepo({
    scenarios: [scenario('AC-024')],
    tap: tapOf([`ok 1 - ${NAME}`]),
    files: { [OTHER]: `test('${NAME}', () => {});\n` },
  });
  writeManifest(root, [caseEntry(root, { file: OTHER, name: NAME, scenarios: ['AC-024', 'AC-099'] })]);
  const result = await validate(root);
  assert.equal(result.approved, false, JSON.stringify(result));
  assert.ok(result.failures.some((failure) => failure.id === 'AC-099' && failure.code === 'ambiguous_link'), JSON.stringify(result.failures));
  assert.match(JSON.stringify(result.failures), /AC-099/);
});

test('[AC-026] cenário com duas revisões no manifesto é vínculo ambíguo e recusado como configuração', async () => {
  const ONE = '[AC-024] primeiro';
  const TWO = '[AC-024] segundo';
  const root = setupRepo({
    scenarios: [scenario('AC-024')],
    tap: tapOf([`ok 1 - ${ONE}`, `ok 2 - ${TWO}`]),
    files: { [OTHER]: `test('${ONE}', () => {});\ntest('${TWO}', () => {});\n` },
  });
  const first = caseEntry(root, { file: OTHER, name: ONE, scenarios: ['AC-024'] });
  const second = caseEntry(root, { file: OTHER, name: TWO, scenarios: ['AC-024'], revision: 2 });
  writeManifest(root, [first, second]);
  const result = await validate(root);
  assert.equal(result.stop_reason, 'config_error', JSON.stringify(result));
  assert.match(result.message, /AC-024/);
  assert.match(result.message, /revis/i);
});

test('[AC-026] o adaptador TAP captura todos os cenários citados no nome do caso', () => {
  const [item] = parseTapCases('TAP version 13\nok 1 - [AC-024] e [AC-025] comum\n');
  assert.deepEqual(item.scenarios, ['AC-024', 'AC-025']);
});
