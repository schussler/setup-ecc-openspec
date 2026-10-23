# Issue tracker

## Ponto de restauração

- **Change ativa:** refactor-discount-rules
- **Branch:** main
- **Próximo passo:** `spec-archive refactor-discount-rules`
- **Bloqueios:** nenhum
- **Atualizado em:** 2026-10-23

## Gates

| Data | Change | Gate | Tentativa | O que falhou | O que mudou | Pontuação | Veredito |
|------|--------|------|-----------|--------------|-------------|-----------|----------|
| 2026-10-23 | refactor-discount-rules | implement | 1 | nada (0 testes falhando, 0 lint, 0 tipo) | `src/discounts.js` criado; `pricing.js` e `invoice.js` usam o módulo; 19 testes em `test/discounts.test.js` | old 100% (12/12), new 100% (19/19), lint 0, type 0 | pass |

## Log

### 2026-10-23

- As regras de cupom e volume estão duplicadas em `src/pricing.js` e `src/invoice.js`. A fatura já divergiu uma vez em produção (rótulo de cupom errado).
- `spec-create` (headless) criou `refactor-discount-rules` via `/opsx:propose`; `openspec validate --strict` passou na 1ª tentativa. Sem interview: as decisões são premissas em `proposal.md` → `## Premissas`:
  - capability nova `order-discounts` documentando o comportamento atual (não `skip_specs`), com 19 cenários, um teste por cenário em `test/discounts.test.js` via `calculateOrderTotal`/`formatInvoice`;
  - `src/discounts.js` só com volume e cupom (`priceLine`, `hasVolumeDiscount`, `resolveCoupon`); frete, arredondamento e validação ficam em `pricing.js`;
  - aritmética literal preservada (`line - line * 0.1`, `subtotal * rate`);
  - nomes de cenário em português sem acento, diferentes dos testes já existentes.
- **Inconsistência apontada:** `domain.md` diz que cupom desconhecido mostra `<cupom> não aplicável`, mas com volume o código mostra `<cupom> não acumula com volume`. A change preserva o código (cenário `cupom desconhecido com volume mostra nao acumula`); corrigir o texto pede uma change própria.
- `spec-implement` (headless) de `refactor-discount-rules`: baseline do gate gravada (`test/invoice.test.js`, `test/pricing.test.js`); tarefas 1.1–5.3 feitas; gate de implementação `pass` na 1ª tentativa. Premissas:
  - **Sem fase Red na tarefa 1.1.** Os 19 testes são de caracterização de uma refatoração sem mudança de comportamento: passam contra o código atual por definição (design D5). A prova de que não mudou nada é o teste ficar intacto do início ao fim.
  - **Desvio de D2 (`discount = subtotal * rate`).** Com um item malformado que a validação deixa passar (por exemplo `price` ausente → subtotal `NaN`), `NaN * 0` dá `NaN`, e o código antigo dava `discount: 0`. `pricing.js` usa `rate === 0 ? 0 : subtotal * rate` para preservar o resultado.
  - **`resolveCoupon` usa `Object.hasOwn` na tabela de cupons**, para que códigos como `toString` continuem caindo em `não aplicável` (o código antigo comparava com `===`).
  - **Comparação temporária (1.2):** matriz do design (19.488 pedidos) com o código de `HEAD` em `../cmp-refactor-discount-rules/` (fora do repo); 0 diferenças em totais e texto depois das tarefas 3.1 e 4.1. **Pendente manual:** apagar esse diretório (`rm -r ../cmp-refactor-discount-rules`); o `rm` foi bloqueado por permissão nesta sessão.

## Paradas

Nenhuma.
