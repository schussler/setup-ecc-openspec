// CLI do manifesto de aceitação (A.3, item G, D28): generate gera candidato e validate só confere.
// Nenhum dos dois converte geração em aprovação humana, e nenhum altera evidência sem registro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './fixture.mjs';
import {
  CHANGE, CHANGE_DIR, caseEntry, purposeRecord, scenario, setAuthorizations, setupRepo, tapOf, writeManifest,
} from './a-support.mjs';

const CLI = join(REPO_ROOT, 'scripts', 'harness', 'manifest-cli.mjs');
const FILE = 'tests/cli.test.mjs';
const SOURCE = "import { test } from 'node:test';\ntest('[AC-081] primeiro caso', () => {});\ntest('[AC-082] segundo caso', () => {});\n";
const SOURCE_UNDECLARED = "import { test } from 'node:test';\ntest('[AC-081] primeiro caso', () => {});\ntest('[AC-099] fantasma', () => {});\n";
const SCENARIOS = [scenario('AC-081'), scenario('AC-082')];

const dirOf = (root) => join(root, 'openspec', 'changes', CHANGE);
const manifestOf = (root) => join(root, CHANGE_DIR, 'acceptance-manifest.json');
const bytesOf = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
const cli = (root, args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8' });
const output = (result) => `${result.stdout}${result.stderr}`;

function projectWith(source = SOURCE) {
  return setupRepo({ scenarios: SCENARIOS, tap: tapOf(['ok 1 - [AC-081] primeiro caso']), files: { [FILE]: source } });
}

test('[AC-025] generate grava candidato com status proposto, file_hash e sem registrar autorização', () => {
  const root = projectWith();
  const result = cli(root, ['generate', dirOf(root), '--tests', FILE]);
  assert.equal(result.status, 0, output(result));
  const manifest = JSON.parse(readFileSync(manifestOf(root), 'utf8'));
  assert.equal(manifest.status, 'proposto');
  assert.equal(manifest.entries.length, 2);
  assert.match(manifest.entries[0].file_hash, /^[0-9a-f]{64}$/);
  assert.equal(existsSync(join(dirOf(root), 'authorizations.json')), false, 'geração não cria autorização');
});

test('[AC-025] generate recusa sobrescrever manifesto existente e mostra a diferença', () => {
  const root = projectWith();
  writeManifest(root, [caseEntry(root, { file: FILE, name: '[AC-081] primeiro caso', scenarios: ['AC-081'] })]);
  const before = bytesOf(manifestOf(root));
  const result = cli(root, ['generate', dirOf(root), '--tests', FILE]);
  assert.equal(result.status, 1, output(result));
  assert.match(output(result), /tests\/cli\.test\.mjs::\[AC-082\] segundo caso/);
  assert.equal(bytesOf(manifestOf(root)), before, 'o manifesto existente não muda');
});

test('[AC-025] generate --replace sem autorização test_adequacy é recusado', () => {
  const root = projectWith();
  writeManifest(root, [caseEntry(root, { file: FILE, name: '[AC-081] primeiro caso', scenarios: ['AC-081'] })]);
  const before = bytesOf(manifestOf(root));
  const result = cli(root, ['generate', dirOf(root), '--tests', FILE, '--replace']);
  assert.equal(result.status, 1, output(result));
  assert.match(output(result), /--auth/);
  assert.equal(bytesOf(manifestOf(root)), before);
});

test('[AC-025] generate --replace com autorização de outra finalidade é recusado', () => {
  const root = projectWith();
  writeManifest(root, [caseEntry(root, { file: FILE, name: '[AC-081] primeiro caso', scenarios: ['AC-081'] })]);
  setAuthorizations(root, [purposeRecord('chg-cli', 'scenario_change', { scenario: 'AC-081', revision: 1 })]);
  const before = bytesOf(manifestOf(root));
  const result = cli(root, ['generate', dirOf(root), '--tests', FILE, '--replace', '--auth', 'chg-cli']);
  assert.equal(result.status, 1, output(result));
  assert.match(output(result), /test_adequacy/);
  assert.equal(bytesOf(manifestOf(root)), before);
});

test('[AC-025] generate --replace com test_adequacy cobrindo os casos grava o candidato', () => {
  const root = projectWith();
  writeManifest(root, [caseEntry(root, { file: FILE, name: '[AC-081] primeiro caso', scenarios: ['AC-081'] })]);
  const cases = [`${FILE}::[AC-081] primeiro caso`, `${FILE}::[AC-082] segundo caso`];
  setAuthorizations(root, [purposeRecord('adq-cli', 'test_adequacy', { cases })]);
  const result = cli(root, ['generate', dirOf(root), '--tests', FILE, '--replace', '--auth', 'adq-cli']);
  assert.equal(result.status, 0, output(result));
  assert.equal(JSON.parse(readFileSync(manifestOf(root), 'utf8')).entries.length, 2);
});

test('[AC-024] generate recusa tag de cenário não declarado na change e não grava nada', () => {
  const root = projectWith(SOURCE_UNDECLARED);
  const result = cli(root, ['generate', dirOf(root), '--tests', FILE]);
  assert.equal(result.status, 1, output(result));
  assert.match(output(result), /AC-099/);
  assert.equal(existsSync(manifestOf(root)), false);
});

test('[AC-025] validate confere um manifesto válido sem alterar nenhum arquivo', () => {
  const root = projectWith();
  assert.equal(cli(root, ['generate', dirOf(root), '--tests', FILE]).status, 0);
  const manifest = bytesOf(manifestOf(root));
  const source = bytesOf(join(root, FILE));
  const result = cli(root, ['validate', dirOf(root)]);
  assert.equal(result.status, 0, output(result));
  assert.equal(bytesOf(manifestOf(root)), manifest);
  assert.equal(bytesOf(join(root, FILE)), source);
});

test('[AC-025] validate reporta file_hash divergente do arquivo de teste, com o caso citado', () => {
  const root = projectWith();
  assert.equal(cli(root, ['generate', dirOf(root), '--tests', FILE]).status, 0);
  writeFileSync(join(root, FILE), `${SOURCE}// alteração\n`);
  const result = cli(root, ['validate', dirOf(root)]);
  assert.equal(result.status, 1, output(result));
  assert.match(output(result), /file_hash/);
  assert.match(output(result), /tests\/cli\.test\.mjs::\[AC-081\] primeiro caso/);
});

test('[AC-026] validate reprova tag de cenário não declarado no manifesto, citando a tag', () => {
  const root = projectWith();
  writeManifest(root, [caseEntry(root, { file: FILE, name: '[AC-081] e [AC-099] x', scenarios: ['AC-081', 'AC-099'] })]);
  const result = cli(root, ['validate', dirOf(root)]);
  assert.equal(result.status, 1, output(result));
  assert.match(output(result), /AC-099/);
});

test('[AC-026] validate reprova cenário com duas revisões no manifesto', () => {
  const root = projectWith();
  const first = caseEntry(root, { file: FILE, name: '[AC-081] primeiro caso', scenarios: ['AC-081'] });
  const second = caseEntry(root, { file: FILE, name: '[AC-081] segundo caso', scenarios: ['AC-081'], revision: 2 });
  writeManifest(root, [first, second]);
  const result = cli(root, ['validate', dirOf(root)]);
  assert.equal(result.status, 1, output(result));
  assert.match(output(result), /AC-081/);
});
