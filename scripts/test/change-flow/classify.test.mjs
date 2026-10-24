import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { REPO_ROOT } from '../helpers.mjs';

const { classifyRequest } = await import(
  pathToFileURL(join(REPO_ROOT, '.claude/skills/change-flow/change-flow.mjs')).href
);

const EVIDENCE = 'pedido: "exemplo"';
const sim = (evidence = EVIDENCE) => ({ value: 'sim', evidence });
const nao = (evidence = EVIDENCE) => ({ value: 'não', evidence });
const FATOS_DE_RISCO = [
  'impactoAcessibilidade',
  'comportamentoLocal',
  'contratoExterno',
  'regraNegocio',
  'areaSensivel',
  'arquitetural',
];

// Todos os fatos de risco confirmados como `não`; cada teste sobrescreve o que importa.
function fatos(overrides = {}) {
  const base = { ambiguidadeEscopo: nao(), apenasAparencia: nao() };
  for (const nome of FATOS_DE_RISCO) base[nome] = nao();
  return { ...base, ...overrides };
}

test('R1: ambiguidade de escopo leva a esclarecer', () => {
  const out = classifyRequest(fatos({ ambiguidadeEscopo: sim() }));
  assert.equal(out.path, 'esclarecer');
});

test('R1: contrato externo, regra de negócio, área sensível ou arquitetura levam ao caminho 3', () => {
  for (const nome of ['contratoExterno', 'regraNegocio', 'areaSensivel', 'arquitetural']) {
    const out = classifyRequest(fatos({ [nome]: sim() }));
    assert.equal(out.path, 3, nome);
  }
});

test('R1: um fato do caminho 3 vence o caminho 2', () => {
  const out = classifyRequest(fatos({ comportamentoLocal: sim(), contratoExterno: sim() }));
  assert.equal(out.path, 3);
});

test('R2: acessibilidade ou comportamento local, sem risco maior, levam ao caminho 2', () => {
  for (const nome of ['impactoAcessibilidade', 'comportamentoLocal']) {
    const out = classifyRequest(fatos({ [nome]: sim() }));
    assert.equal(out.path, 2, nome);
  }
});

test('R3: só aparência com os demais fatos confirmados como não leva ao caminho 1', () => {
  const out = classifyRequest(fatos({ apenasAparencia: sim() }));
  assert.equal(out.path, 1);
});

test('R4: fato de risco desconhecido com só aparência leva a investigar', () => {
  const out = classifyRequest(fatos({ apenasAparencia: sim(), impactoAcessibilidade: { value: 'desconhecido' } }));
  assert.equal(out.path, 'investigar');
});

test('R5: sem fato sim e sem aparência confirmada leva a esclarecer', () => {
  const out = classifyRequest(fatos());
  assert.equal(out.path, 'esclarecer');
});

test('troca de cor com contraste medido acima do limite vai ao caminho 1', () => {
  const out = classifyRequest(
    fatos({
      apenasAparencia: sim('Button.css:12 altera só background-color'),
      impactoAcessibilidade: nao('contraste medido 7,1:1 com #fff sobre #0B5'),
    }),
  );
  assert.equal(out.path, 1);
});

test('troca de cor sem medição de contraste vai a investigar', () => {
  const out = classifyRequest(fatos({ apenasAparencia: sim('Button.css:12'), impactoAcessibilidade: {} }));
  assert.equal(out.path, 'investigar');
});

test('troca de cor com contraste abaixo do limite sobe ao caminho 2', () => {
  const out = classifyRequest(
    fatos({
      apenasAparencia: sim('Button.css:12'),
      impactoAcessibilidade: sim('contraste medido 2,1:1'),
    }),
  );
  assert.equal(out.path, 2);
});

test('mudança localizada de comportamento vai ao caminho 2', () => {
  const out = classifyRequest(
    fatos({
      comportamentoLocal: sim('SaveButton.tsx:20'),
      contratoExterno: nao('props e chamada de API lidas, sem mudança de endpoint'),
    }),
  );
  assert.equal(out.path, 2);
});

test('regra de negócio relevante vai ao caminho 3', () => {
  const out = classifyRequest(fatos({ regraNegocio: sim('"desconto de 10% para pedidos acima de R$ 500"') }));
  assert.equal(out.path, 3);
});

test('pedido ambíguo vai a esclarecer, não ao caminho 3', () => {
  const out = classifyRequest(
    fatos({ ambiguidadeEscopo: sim('"melhore o botão"'), apenasAparencia: { value: 'desconhecido' } }),
  );
  assert.equal(out.path, 'esclarecer');
});

test('[CF-013] desconhecido não desce de caminho', () => {
  for (const nome of FATOS_DE_RISCO) {
    const out = classifyRequest(fatos({ apenasAparencia: sim(), [nome]: { value: 'desconhecido' } }));
    assert.equal(out.path, 'investigar', nome);
    assert.notEqual(out.path, 1);
    assert.notEqual(out.path, 2);
  }
});

test('fato ausente conta como desconhecido', () => {
  const entrada = fatos({ apenasAparencia: sim() });
  delete entrada.areaSensivel;
  assert.equal(classifyRequest(entrada).path, 'investigar');
});

test('[CF-014] fato sem evidência é desconhecido', () => {
  const out = classifyRequest(fatos({ apenasAparencia: sim(), regraNegocio: { value: 'não' } }));
  assert.equal(out.path, 'investigar');
  const semEvidenciaSim = classifyRequest(fatos({ regraNegocio: { value: 'sim' } }));
  assert.notEqual(semEvidenciaSim.path, 3);
});

test('a saída traz motivo e evidência', () => {
  const out = classifyRequest(fatos({ regraNegocio: sim('"desconto de 10%"') }));
  assert.equal(typeof out.reason, 'string');
  assert.ok(out.reason.length > 0);
  assert.match(JSON.stringify(out.evidence), /desconto de 10%/);
});

test('o tamanho do diff não entra na classificação', () => {
  const a = classifyRequest(fatos({ apenasAparencia: sim() }));
  const b = classifyRequest({ ...fatos({ apenasAparencia: sim() }), diffLines: 5000 });
  assert.deepEqual(a, b);
});
