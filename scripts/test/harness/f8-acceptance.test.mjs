// Vínculo da skill spec-accept e alteração de teste de aceitação aprovado (F8, AC-001 e AC-002).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, readRepoFile, writeTree } from '../helpers.mjs';
import { checkAcceptanceChange } from '../../harness/red.mjs';
import { loadAcceptanceManifest } from '../../harness/acceptance.mjs';
import { STATE_FORBIDDEN } from '../../harness/machine.mjs';
import { CHANGE, makeRepo } from './fixture.mjs';
import { CHANGE_DIR, caseEntry, purposeRecord, writeManifest } from './a-support.mjs';

const SKILL = '.claude/skills/spec-accept/SKILL.md';
const TEST_FILE = 'scripts/test/harness/f8-exemplo.test.mjs';
const CASE_NAME = '[AC-002] soma aprovada';
const CASE_ID = `${TEST_FILE}::${CASE_NAME}`;
const APPROVED = `test('${CASE_NAME}', () => {});\n`;
const ALTERED = "test('[AC-002] soma aprovada', () => { throw new Error('alterado'); });\n";

// Repositório temporário com um caso aprovado: o manifesto guarda o case_body_hash atual.
function approvedRepo() {
  const root = makeRepo();
  writeTree(root, { [TEST_FILE]: APPROVED });
  writeManifest(root, [caseEntry(root, { file: TEST_FILE, name: CASE_NAME, scenarios: ['AC-002'] })]);
  return root;
}

const entriesOf = (root) => loadAcceptanceManifest(join(root, CHANGE_DIR)).entries;
const skillText = () => (existsSync(join(REPO_ROOT, SKILL)) ? readRepoFile(SKILL) : '');

test('[AC-001] a skill declara que não edita specs/', () => {
  assert.match(skillText(), /não edita `?specs\/`?/);
});

test('[AC-001] a seção de arquivos escritos pela skill não inclui specs/', () => {
  const section = skillText().match(/## Arquivos que a skill escreve([\s\S]*?)(\n## |$)/);
  assert.ok(section, 'seção "Arquivos que a skill escreve" ausente');
  assert.doesNotMatch(section[1], /specs\//);
});

test('[AC-001] divergência entre teste e cenário faz a skill parar e registrar', () => {
  assert.match(skillText(), /divergência[^\n]*para e registra/i);
});

test('[AC-001] a skill existe e não contém instrução de commit nem de PR', () => {
  const text = skillText();
  assert.ok(text.length > 0, `${SKILL} ausente`);
  assert.doesNotMatch(text, /\bcommit\b|pull request|\bPR\b|git push/i);
});

test('[AC-002] alteração de teste aprovado sem registro vai a forbidden_action_stopped', () => {
  const root = approvedRepo();
  writeTree(root, { [TEST_FILE]: ALTERED });
  const result = checkAcceptanceChange({ root, change: CHANGE, entries: entriesOf(root), records: [] });
  assert.equal(result.state, STATE_FORBIDDEN);
  assert.equal(result.stop_reason, 'protected_change');
  assert.deepEqual(result.protected_changes, [TEST_FILE]);
});

test('[AC-002] alteração com registro test_adequacy do caso é permitida', () => {
  const root = approvedRepo();
  writeTree(root, { [TEST_FILE]: ALTERED });
  const records = [purposeRecord('adq-002', 'test_adequacy', { scenario: 'AC-002', cases: [CASE_ID] })];
  const result = checkAcceptanceChange({ root, change: CHANGE, entries: entriesOf(root), records });
  assert.equal(result.state, null);
  assert.deepEqual(result.authorized_changes, [TEST_FILE]);
  assert.deepEqual(result.protected_changes, []);
});

test('[AC-002] registro de outra finalidade não autoriza a alteração', () => {
  const root = approvedRepo();
  writeTree(root, { [TEST_FILE]: ALTERED });
  const records = [purposeRecord('suf-002', 'sufficiency', { scenario: 'AC-002', cases: [CASE_ID] })];
  const result = checkAcceptanceChange({ root, change: CHANGE, entries: entriesOf(root), records });
  assert.equal(result.state, STATE_FORBIDDEN);
});
