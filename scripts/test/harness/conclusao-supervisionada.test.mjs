// Testes da conclusão supervisionada (change simplify-approval-and-execution, capacidade
// supervised-completion). O nome de cada teste começa pelo ID do cenário. As evidências de suíte,
// lint, sintaxe e validação são injetadas (run), para que a suíte não rode dentro de si mesma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateContractHash } from '../../harness/identification.mjs';
import { readSupervisedCompletion, recordSupervisedCompletion } from '../../harness/supervised-completion.mjs';
import { ConfigError } from '../../harness/policy.mjs';
import { makeRepo } from './fixture.mjs';
import { writeTree } from '../helpers.mjs';

const CHANGE = 'simplify-approval-and-execution';
const FIXED_NOW = new Date('2026-10-24T19:00:00.000Z');
const SPEC = [
  '## ADDED Requirements', '', '### Requirement: Exemplo', 'O sistema SHALL existir.', '',
  '#### Scenario: exemplo existe', '- **ID:** EX-1', '- **Revisão:** 1', '- **WHEN** o exemplo é lido', '- **THEN** ele existe', '',
].join('\n');
const DESIGN = '# Design\n\n- **Comportamento novo:** sim\n';
const passing = async () => ({ code: 0, output: '' });
const failing = (name) => async (command) => ({ code: command.includes(name) ? 1 : 0, output: 'falhou' });

function makeChange() {
  const root = makeRepo();
  const dir = join(root, 'openspec', 'changes', CHANGE);
  writeTree(root, {
    'template.json': { checks: { test: 'node --test', lint: 'node scripts/gates/lint.mjs', typecheck: 'node scripts/gates/syntax-check.mjs scripts' } },
  });
  writeTree(dir, { 'proposal.md': '# Proposta\n', 'design.md': DESIGN, 'specs/exemplo/spec.md': SPEC });
  return { root, dir };
}

function recordPath(dir) {
  return join(dir, 'supervised-completion.json');
}

test('[SC-001] registro completo', async () => {
  const { root, dir } = makeChange();
  const record = await recordSupervisedCompletion(root, CHANGE, { run: passing, now: FIXED_NOW });
  assert.equal(record.contract_hash, calculateContractHash(dir));
  assert.deepEqual(record.evidence.map((item) => item.name), ['suite', 'lint', 'syntax', 'validate_strict', 'contract']);
  assert.ok(record.evidence.every((item) => item.result === 'pass'));
  assert.equal(record.recorded_at, FIXED_NOW.toISOString());
  assert.deepEqual(JSON.parse(readFileSync(recordPath(dir), 'utf8')), record);
});

test('[SC-002] veredito anterior permanece', async () => {
  const { root, dir } = makeChange();
  const gates = `${JSON.stringify({ implement: { attempts: [{ verdict: 'retry' }] } }, null, 2)}\n`;
  writeFileSync(join(dir, 'gates.json'), gates);
  await recordSupervisedCompletion(root, CHANGE, { run: passing, now: FIXED_NOW });
  assert.equal(readFileSync(join(dir, 'gates.json'), 'utf8'), gates);
  assert.equal(existsSync(join(dir, 'gates.json.prev')), false);
});

test('[SC-003] hash diferente é recusado', async () => {
  const { root, dir } = makeChange();
  await recordSupervisedCompletion(root, CHANGE, { run: passing, now: FIXED_NOW });
  assert.equal(readSupervisedCompletion(dir).valid, true);
  writeFileSync(join(dir, 'proposal.md'), '# Proposta alterada\n');
  const result = readSupervisedCompletion(dir);
  assert.equal(result.valid, false);
  assert.match(result.reason, /hash/);
});

test('[SC-004] evidência faltante é recusada', async () => {
  const { root, dir } = makeChange();
  // Uma evidência reprovada impede o registro: nada é gravado.
  await assert.rejects(
    recordSupervisedCompletion(root, CHANGE, { run: failing('lint'), now: FIXED_NOW }),
    (err) => err instanceof ConfigError && /lint/.test(err.message),
  );
  assert.equal(existsSync(recordPath(dir)), false);
  // Um registro com item de evidência faltando não vale, mesmo com hash atual.
  await recordSupervisedCompletion(root, CHANGE, { run: passing, now: FIXED_NOW });
  const record = JSON.parse(readFileSync(recordPath(dir), 'utf8'));
  record.evidence = record.evidence.filter((item) => item.name !== 'contract');
  writeFileSync(recordPath(dir), JSON.stringify(record, null, 2));
  const result = readSupervisedCompletion(dir);
  assert.equal(result.valid, false);
  assert.match(result.reason, /contract/);
});
