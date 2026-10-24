// Invalidação de dependentes, marcas no resumo e reaceitação (A.3, EV-007, EV-008, EV-014, HI-014).
// Os cenários dependentes são declarados em "Depende de"; interfaces (IF-), regras (RG-) e fatias (F<n>)
// vêm de design.md. A invalidação marca evidências, mas nunca aprova.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHANGE_DIR, caseEntry, caseIdOf, purposeRecord, readSummary, scenario, setAuthorizations, setSpec,
  setupRepo, tapOf, validate, writeManifest, writeTree,
} from './a-support.mjs';

const DESIGN = `${CHANGE_DIR}/design.md`;
const design = (text) => `# Design\n\n${text}\n`;
const shared = (lines) => `## Interfaces e regras compartilhadas\n\n${lines}\n`;
const slices = (rows) => `## Fatias\n\n| Fatia | Conteúdo | Depende de | Caminho preservado |\n|---|---|---|---|\n${rows}\n`;
const marksOf = (root) => Object.keys(readSummary(root).invalidated ?? {}).sort();

test('[EV-007] revisão de cenário invalida dependentes em cadeia de três níveis e não toca cenário independente', async () => {
  const scenarios = [scenario('AC-031'), scenario('AC-032', { dependsOn: 'AC-031' }), scenario('AC-033', { dependsOn: 'AC-032' }), scenario('AC-034')];
  const tap = tapOf(['ok 1 - [AC-031] a', 'ok 2 - [AC-032] b', 'ok 3 - [AC-033] c', 'ok 4 - [AC-034] d']);
  const root = setupRepo({ scenarios, tap });
  assert.equal((await validate(root)).approved, true);

  setSpec(root, [scenario('AC-031', { revision: 2, approval: 'auth:rev-031' }), scenarios[1], scenarios[2], scenarios[3]]);
  setAuthorizations(root, [purposeRecord('rev-031', 'scenario_change', { scenario: 'AC-031', revision: 2 })]);
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.deepEqual(marksOf(root), ['AC-031', 'AC-032', 'AC-033']);
});

test('[EV-007] mudança declarada de interface invalida os cenários que a citam e os dependentes deles', async () => {
  const scenarios = [scenario('AC-041', { dependsOn: 'IF-cliente' }), scenario('AC-042', { dependsOn: 'AC-041' }), scenario('AC-040')];
  const tap = tapOf(['ok 1 - [AC-041] a', 'ok 2 - [AC-042] b', 'ok 3 - [AC-040] c']);
  const root = setupRepo({ scenarios, tap });
  writeTree(root, { [DESIGN]: design(shared('- IF-cliente: contrato do cliente v1')) });
  assert.equal((await validate(root)).approved, true);

  writeTree(root, { [DESIGN]: design(shared('- IF-cliente: contrato do cliente v2')) });
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.deepEqual(marksOf(root), ['AC-041', 'AC-042']);
});

test('[EV-007] mudança declarada de regra compartilhada (RG-) invalida o cenário que a cita', async () => {
  const scenarios = [scenario('AC-043', { dependsOn: 'RG-prazo' }), scenario('AC-044')];
  const tap = tapOf(['ok 1 - [AC-043] a', 'ok 2 - [AC-044] b']);
  const root = setupRepo({ scenarios, tap });
  writeTree(root, { [DESIGN]: design(shared('- RG-prazo: prazo de 30 dias')) });
  assert.equal((await validate(root)).approved, true);

  writeTree(root, { [DESIGN]: design(shared('- RG-prazo: prazo de 45 dias')) });
  await validate(root);
  assert.deepEqual(marksOf(root), ['AC-043']);
});

test('[EV-007] fatia alterada invalida as fatias que dependem dela, em cadeia, e os cenários que dependem dessas fatias', async () => {
  const scenarios = [scenario('AC-051', { dependsOn: 'F2' }), scenario('AC-052', { dependsOn: 'F3' }), scenario('AC-053')];
  const tap = tapOf(['ok 1 - [AC-051] a', 'ok 2 - [AC-052] b', 'ok 3 - [AC-053] c']);
  const root = setupRepo({ scenarios, tap });
  const rows = (base) => `| F1 | ${base} | — | nada muda |\n| F2 | meio | F1 | depois |\n| F3 | fim | — | separado |`;
  writeTree(root, { [DESIGN]: design(slices(rows('base'))) });
  assert.equal((await validate(root)).approved, true);

  writeTree(root, { [DESIGN]: design(slices(rows('base v2'))) });
  await validate(root);
  assert.deepEqual(marksOf(root), ['AC-051', 'F1', 'F2']);
});

test('[HI-014] referência de fatia inexistente na coluna "Depende de" é recusada e a mensagem nomeia a referência', async () => {
  const root = setupRepo({ scenarios: [scenario('AC-061')], tap: tapOf(['ok 1 - [AC-061] a']) });
  writeTree(root, { [DESIGN]: design(slices('| F1 | base | F9 | nada |')) });
  const result = await validate(root);
  assert.equal(result.stop_reason, 'config_error');
  assert.match(result.message, /F9/);
});

test('[HI-014] Depende de com cenário inexistente é recusado pela validação com a referência nomeada', async () => {
  const root = setupRepo({ scenarios: [scenario('AC-061', { dependsOn: 'RC-099' })], tap: tapOf(['ok 1 - [AC-061] a']) });
  const result = await validate(root);
  assert.equal(result.stop_reason, 'config_error');
  assert.match(result.message, /RC-099/);
});

test('[EV-014] invalidação por interface não aprova: volta só com adequação, suficiência e execução pass, e as marcas somem', async () => {
  const FILE = 'tests/dependente.test.mjs';
  const NAME = '[AC-041] usa a interface';
  const cases = [caseIdOf(FILE, NAME)];
  const root = setupRepo({
    scenarios: [scenario('AC-041', { dependsOn: 'IF-cliente' })],
    tap: tapOf([`ok 1 - ${NAME}`]),
    files: { [FILE]: `test('${NAME}', () => {});\n` },
  });
  writeTree(root, { [DESIGN]: design(shared('- IF-cliente: contrato v1')) });
  writeManifest(root, [caseEntry(root, { file: FILE, name: NAME, scenarios: ['AC-041'] })]);
  assert.equal((await validate(root)).approved, true);

  writeTree(root, { [DESIGN]: design(shared('- IF-cliente: contrato v2')) });
  const none = await validate(root);
  assert.equal(none.approved, false);
  assert.ok(none.failures.some((failure) => failure.id === 'AC-041' && failure.code === 'adequacy_missing'), JSON.stringify(none.failures));

  setAuthorizations(root, [purposeRecord('adq-041', 'test_adequacy', { scenario: 'AC-041', revision: 1, cases })]);
  const onlyAdequacy = await validate(root);
  assert.equal(onlyAdequacy.approved, false, 'adequação sozinha não volta');
  assert.ok(onlyAdequacy.failures.some((failure) => failure.code === 'sufficiency_missing'), JSON.stringify(onlyAdequacy.failures));

  setAuthorizations(root, [
    purposeRecord('adq-041', 'test_adequacy', { scenario: 'AC-041', revision: 1, cases }),
    purposeRecord('suf-041', 'sufficiency', { scenario: 'AC-041', revision: 1, cases }),
  ]);
  const approved = await validate(root);
  assert.equal(approved.approved, true, JSON.stringify(approved.failures));
  assert.deepEqual(readSummary(root).invalidated ?? {}, {}, 'aprovação limpa as marcas');
});

test('[EV-008] texto de cenário alterado sem nova revisão vira forbidden_action_stopped com protected_change', async () => {
  const root = setupRepo();
  assert.equal((await validate(root)).approved, true);
  setSpec(root, [scenario('AC-011', { title: 'caso AC-011 reescrito' })]);
  const result = await validate(root);
  assert.equal(result.approved, false);
  assert.equal(result.state, 'forbidden_action_stopped');
  assert.equal(result.stop_reason, 'protected_change');
});

test('[EV-008] autorização test_adequacy não permite alterar o texto de um cenário', async () => {
  const root = setupRepo();
  assert.equal((await validate(root)).approved, true);
  setSpec(root, [scenario('AC-011', { revision: 2, approval: 'auth:adq-011', title: 'caso AC-011 reescrito' })]);
  setAuthorizations(root, [purposeRecord('adq-011', 'test_adequacy', { scenario: 'AC-011', revision: 2, cases: ['x'] })]);
  const result = await validate(root);
  assert.equal(result.stop_reason, 'protected_change', JSON.stringify(result));
});
