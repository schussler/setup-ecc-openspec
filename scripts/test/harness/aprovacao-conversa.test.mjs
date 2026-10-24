// Testes da aprovação registrada pela conversa (change simplify-approval-and-execution,
// capacidade conversation-approval). O nome de cada teste começa pelo ID do cenário.
// Os testes usam um repositório temporário com a change e o contrato mínimo; o caminho do CLI
// roda sem terminal (stdin de pipe), porque o fluxo de conversa não exige TTY.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { recordConversationApproval } from '../../harness/authorize.mjs';
import { checkContract } from '../../harness/contract.mjs';
import { calculateContractHash } from '../../harness/identification.mjs';
import { ConfigError } from '../../harness/policy.mjs';
import { REPO_ROOT, makeRepo } from './fixture.mjs';
import { writeTree } from '../helpers.mjs';

const AUTHORIZE = join(REPO_ROOT, 'scripts', 'harness', 'authorize.mjs');
const CHANGE = 'simplify-approval-and-execution';
const FIXED_NOW = new Date('2026-10-24T18:00:00.000Z');
const SPEC = '## ADDED Requirements\n\n### Requirement: Exemplo\nO sistema SHALL existir.\n';

function makeChange() {
  const root = makeRepo();
  const dir = join(root, 'openspec', 'changes', CHANGE);
  writeTree(dir, { 'proposal.md': '# Proposta\n', 'design.md': '# Design\n', 'specs/exemplo/spec.md': SPEC });
  return { root, dir };
}

function authPath(dir) {
  return join(dir, 'authorizations.json');
}

function approval(root, extra = {}) {
  return {
    path: 3,
    instruction: 'Aprovado o escopo e as premissas.',
    approver: 'mantenedor',
    reason: 'aprovação do contrato pela conversa',
    now: FIXED_NOW,
    author: 'teste',
    ...extra,
  };
}

test('[AP-001] registro com escopo e hash', () => {
  const { root, dir } = makeChange();
  const record = recordConversationApproval(root, CHANGE, approval(root));
  assert.equal(record.kind, 'revision');
  assert.equal(record.purpose, 'contract_approval');
  assert.equal(record.procedure, 'conversa');
  assert.equal(record.instruction, 'Aprovado o escopo e as premissas.');
  assert.equal(record.contract_hash, calculateContractHash(dir));
  assert.equal(record.contract_version, 1);
  assert.equal(record.scope.change, CHANGE);
  assert.equal(record.recorded_at, FIXED_NOW.toISOString());
  assert.deepEqual(JSON.parse(readFileSync(authPath(dir), 'utf8')), [record]);
});

test('[AP-002] texto de arquivo não aprova', () => {
  const { root, dir } = makeChange();
  // Sem frase do usuário na instrução, nada é gravado: conteúdo de arquivo ou de ferramenta não entra aqui.
  assert.throws(() => recordConversationApproval(root, CHANGE, approval(root, { instruction: '' })), ConfigError);
  assert.throws(() => recordConversationApproval(root, CHANGE, approval(root, { instruction: 'ok, segue' })), ConfigError);
  assert.equal(existsSync(authPath(dir)), false);
});

test('[AP-003] caminho 1 sem registro', () => {
  const { root, dir } = makeChange();
  assert.throws(
    () => recordConversationApproval(root, CHANGE, approval(root, { path: 1, instruction: 'Pode fazer.' })),
    (err) => err instanceof ConfigError && /caminho 1/.test(err.message),
  );
  assert.equal(existsSync(authPath(dir)), false);
});

test('[AP-004] caminho 2 com pode fazer', () => {
  const { root, dir } = makeChange();
  const record = recordConversationApproval(root, CHANGE, approval(root, { path: 2, instruction: 'Pode fazer, segue o plano.' }));
  assert.equal(record.scope.path, 2);
  assert.equal(record.instruction, 'Pode fazer, segue o plano.');
  assert.equal(existsSync(authPath(dir)), true);
  // Alteração justificada: "aprovado" passa a valer também no caminho 2 (intenção de aprovação, não palavra fixa).
  // Continua recusada a instrução sem intenção de aprovação.
  const other = makeChange();
  assert.throws(() => recordConversationApproval(other.root, CHANGE, approval(other.root, { path: 2, instruction: 'Segue o plano.' })), ConfigError);
});

test('[AP-005] caminho 3 com aprovado', () => {
  const { root, dir } = makeChange();
  const record = recordConversationApproval(root, CHANGE, approval(root, { path: 3, instruction: 'Aprovado.' }));
  assert.equal(record.scope.path, 3);
  assert.equal(record.contract_hash, calculateContractHash(dir));
});

test('[AP-006] registro sem TTY', () => {
  const { root, dir } = makeChange();
  const result = spawnSync(process.execPath, [
    AUTHORIZE, 'conversa', '--change', CHANGE, '--path', '3', '--instruction', 'Aprovado.',
    '--approver', 'mantenedor', '--reason', 'aprovação pela conversa',
  ], { cwd: root, input: '', encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /código/);
  const [record] = JSON.parse(readFileSync(authPath(dir), 'utf8'));
  assert.equal(record.procedure, 'conversa');
});

test('[AP-007] nova versão exige contrato alterado', () => {
  const { root, dir } = makeChange();
  recordConversationApproval(root, CHANGE, approval(root));
  const before = readFileSync(authPath(dir), 'utf8');
  assert.throws(() => recordConversationApproval(root, CHANGE, approval(root, { now: new Date('2026-10-25T00:00:00Z') })), ConfigError);
  assert.equal(readFileSync(authPath(dir), 'utf8'), before);
});

test('[AP-010] contrato alterado gera nova versão', () => {
  const { root, dir } = makeChange();
  const first = recordConversationApproval(root, CHANGE, approval(root));
  writeFileSync(join(dir, 'proposal.md'), '# Proposta alterada\n');
  const second = recordConversationApproval(root, CHANGE, approval(root, { now: new Date('2026-10-25T00:00:00Z') }));
  assert.equal(first.contract_version, 1);
  assert.equal(second.contract_version, 2);
  assert.equal(second.contract_hash, calculateContractHash(dir));
  const records = JSON.parse(readFileSync(authPath(dir), 'utf8'));
  assert.deepEqual(records.map((record) => record.id), [first.id, second.id]);
});

const SPEC_CREATE = readFileSync(join(REPO_ROOT, '.claude', 'skills', 'spec-create', 'SKILL.md'), 'utf8');

test('[AP-008] consolidação antes dos artefatos', () => {
  const start = SPEC_CREATE.indexOf('## Consolidação antes dos artefatos');
  assert.notEqual(start, -1);
  const section = SPEC_CREATE.slice(start, SPEC_CREATE.indexOf('## Steps'));
  for (const item of ['objetivo', 'escopo', 'exclusões', 'decisões aprovadas', 'dúvidas restantes', 'critérios de aceite', 'premissas não aprovadas']) {
    assert.match(section, new RegExp(item));
  }
  assert.match(section, /alternativas descartadas/);
  assert.ok(start < SPEC_CREATE.indexOf('## Steps'), 'a consolidação vem antes dos passos');
});

test('[AP-009] confirmação única reaproveita decisões dadas', () => {
  const section = SPEC_CREATE.slice(SPEC_CREATE.indexOf('## Consolidação antes dos artefatos'), SPEC_CREATE.indexOf('## Steps'));
  assert.match(section, /uma única confirmação/);
  assert.match(section, /decisões já dadas/);
});

test('contrato aceita aprovação de conversa com hash atual e recusa hash antigo', () => {
  const { root, dir } = makeChange();
  recordConversationApproval(root, CHANGE, approval(root));
  const approvalErrors = () => checkContract(dir).filter((error) => error.file === 'authorizations.json');
  assert.deepEqual(approvalErrors(), []);
  writeFileSync(join(dir, 'proposal.md'), '# Proposta alterada\n');
  assert.notDeepEqual(approvalErrors(), []);
});

test('[AP-012] aceita intenções de aprovação por caminho, incluindo "aprovo" e "pode implementar"', () => {
  const cases = [
    { path: 3, instruction: 'Aprovo.' },
    { path: 3, instruction: 'Pode implementar, segue.' },
    { path: 2, instruction: 'aprovo o ajuste' },
    { path: 2, instruction: 'Pode implementar' },
  ];
  for (const item of cases) {
    const { root } = makeChange();
    const record = recordConversationApproval(root, CHANGE, approval(root, item));
    assert.equal(record.scope.path, item.path, item.instruction);
  }
});

test('[AP-013] negação não conta como aprovação', () => {
  for (const instruction of ['Não aprovo.', 'nao aprovado por enquanto', 'Não pode implementar']) {
    const { root } = makeChange();
    assert.throws(() => recordConversationApproval(root, CHANGE, approval(root, { instruction })), ConfigError, instruction);
  }
});

test('[AP-014] desaprovação e palavras que só contêm uma intenção não autorizam', () => {
  for (const instruction of ['Desaprovo.', 'Desaprovado o escopo.', 'Reaprovado.', 'Pode implementar?', 'Aprovo ou não, depende.']) {
    const { root } = makeChange();
    assert.throws(() => recordConversationApproval(root, CHANGE, approval(root, { instruction })), ConfigError, instruction);
  }
});

test('[AP-015] a intenção vale como palavra inteira: "aprovos" e "implementar" sozinho não autorizam', () => {
  for (const instruction of ['Aprovos isso.', 'Implementar, por favor.']) {
    const { root } = makeChange();
    assert.throws(() => recordConversationApproval(root, CHANGE, approval(root, { instruction })), ConfigError, instruction);
  }
});
