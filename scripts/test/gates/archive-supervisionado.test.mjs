// Testes do gate de arquivamento com conclusão supervisionada (change simplify-approval-and-execution,
// requisito "Aceite no gate de arquivamento" de supervised-completion). O nome de cada teste começa pelo ID do cenário.
// Usa repositórios temporários com suíte real (node --test) e o registro gravado pelo harness.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreArchive } from '../../gates/archive-gate.mjs';
import { recordSupervisedCompletion } from '../../harness/supervised-completion.mjs';
import { makeTempDir, writeTree } from '../helpers.mjs';

const CHANGE = 'c';
const SPEC = `## ADDED Requirements

### Requirement: Soma
O sistema SHALL somar.

#### Scenario: soma dois números
- **ID:** SOMA-1
- **Revisão:** 1
- **WHEN** a e b
- **THEN** a + b

#### Scenario: rejeita texto
- **ID:** SOMA-2
- **Revisão:** 1
- **WHEN** texto
- **THEN** erro
`;
const ONLY_FIRST = "import { test } from 'node:test';\ntest('[SOMA-1] soma dois numeros', () => {});\n";
const BOTH = `${ONLY_FIRST}test('[SOMA-2] rejeita texto', () => {});\n`;
const passing = async () => ({ code: 0, output: '' });

function project({ files = {}, implementVerdict = null } = {}) {
  const gates = implementVerdict ? { implement: { attempts: [{ verdict: implementVerdict }] } } : {};
  return writeTree(makeTempDir(), {
    'template.json': { checks: { test: 'node --test', lint: 'true', typecheck: 'true' } },
    [`openspec/changes/${CHANGE}/specs/soma/spec.md`]: SPEC,
    [`openspec/changes/${CHANGE}/proposal.md`]: '# Proposta\n',
    [`openspec/changes/${CHANGE}/design.md`]: '# Design\n\n- **Comportamento novo:** sim\n',
    [`openspec/changes/${CHANGE}/gates.json`]: gates,
    ...files,
  });
}

test('[SC-005] conclusão supervisionada não dispensa teste por cenário', async () => {
  const root = project({ files: { 'test/soma.test.mjs': ONLY_FIRST } });
  await recordSupervisedCompletion(root, CHANGE, { run: passing });
  const result = await scoreArchive({ root, change: CHANGE });
  assert.equal(result.passed, false);
  assert.notEqual(result.verdict, 'pass');
  assert.deepEqual(result.evidence.missing, ['SOMA-2']);
});

test('[SC-006] sem veredito e sem conclusão o arquivamento reprova', async () => {
  const root = project({ files: { 'test/soma.test.mjs': BOTH } });
  const result = await scoreArchive({ root, change: CHANGE });
  assert.equal(result.passed, false);
  assert.notEqual(result.verdict, 'pass');
  assert.match(result.evidence.reason, /spec-implement/);
  assert.equal(result.evidence.scenarios, undefined);
});

test('[SC-007] conclusão válida substitui o veredito de implementação', async () => {
  const root = project({ files: { 'test/soma.test.mjs': BOTH } });
  await recordSupervisedCompletion(root, CHANGE, { run: passing });
  const result = await scoreArchive({ root, change: CHANGE });
  assert.equal(result.passed, true);
  assert.equal(result.verdict, 'pass');
  assert.equal(result.evidence.suite_passed, true);
  assert.deepEqual(result.evidence.missing, []);
});
