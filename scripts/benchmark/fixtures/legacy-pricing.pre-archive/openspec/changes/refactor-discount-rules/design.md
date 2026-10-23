# Design

## Context

Motivação em proposal.md (Why); requisitos em `specs/order-discounts/spec.md`.

Hoje:

- `calculateOrderTotal` (`src/pricing.js`) valida os itens, soma as linhas aplicando o volume (`line - line * 0.1` quando `quantity >= 10`), decide o cupom (`subtotal * 0.1` ou `subtotal * 0.2`), calcula o frete sobre `subtotal - discount` e arredonda `subtotal`, `discount` e `total` uma vez no resultado.
- `formatInvoice` (`src/invoice.js`) chama `calculateOrderTotal` para os totais, mas recalcula cada linha com volume para exibir (`toFixed(2)` sobre o valor sem arredondar) e repete a decisão do cupom para montar o rótulo.

Restrições: totais e texto idênticos (centavo e caractere), testes existentes intocados, `package.json` intocado, Node 22+ ES module sem dependências.

## Goals / Non-Goals

**Goals:**

- Um único lugar com a regra de volume e as regras de cupom (taxa, elegibilidade, não acumulação, rótulo).
- `pricing.js` e `invoice.js` sem nenhuma condição de volume ou de cupom própria.
- Mesma aritmética de ponto flutuante, na mesma ordem.

**Non-Goals:**

- Mudar frete, arredondamento ou validação de itens (ficam em `pricing.js`).
- Corrigir a inconsistência entre `docs/agents/domain.md` e o código para cupom desconhecido com volume (ver proposal, Premissas).
- Converter para TypeScript ou adicionar dependências.

## Decisions

### D1. API de `src/discounts.js`

Funções puras e exportadas, sem estado e sem mutar a entrada:

```js
export const VOLUME_MIN_QUANTITY = 10;
export const VOLUME_RATE = 0.1;

// { amount, volume } – amount = price * quantity, com volume aplicado
export function priceLine(item)

// true se alguma linha tem quantity >= VOLUME_MIN_QUANTITY
export function hasVolumeDiscount(items)

// { rate, label } – rate 0 quando o cupom não se aplica
export function resolveCoupon({ coupon, customer, volume })
```

Tabela interna de cupons, uma entrada por código: `{ rate, label, isEligible(customer) }`, com `WELCOME10` (`0.1`, `WELCOME10 -10%`, `customer.orders === 0`) e `VIP20` (`0.2`, `VIP20 -20%`, `customer.tier === 'vip'`). A tabela é congelada (`Object.freeze`).

`resolveCoupon` devolve, em ordem de precedência (a mesma do código atual):

1. cupom falsy (ausente ou vazio) → `{ rate: 0, label: 'sem cupom' }`;
2. `volume` verdadeiro → `{ rate: 0, label: '<cupom> não acumula com volume' }`;
3. cupom na tabela e cliente presente e elegível → `{ rate, label }` da tabela;
4. qualquer outro caso → `{ rate: 0, label: '<cupom> não aplicável' }`.

Alternativas: (a) uma função `applyDiscounts(order)` que devolve tudo de uma vez — rejeitada porque a fatura precisa do valor de cada linha e do rótulo, e a função acabaria misturando frete; (b) o rótulo formatado a partir da taxa (`-${rate * 100}%`) — rejeitada: o ganho é nulo e uma taxa futura como `0.07` geraria `7.000000000000001%`; rótulo literal na tabela.

### D2. Uso em `pricing.js`

```js
subtotal = subtotal + priceLine(item).amount   // ordem dos itens preservada
const volume = hasVolumeDiscount(order.items)
const { rate } = resolveCoupon({ coupon: order.coupon, customer: order.customer, volume })
const discount = subtotal * rate
```

Validação, frete e arredondamento ficam onde estão. `discount = subtotal * 0` dá `0`, igual ao `0` atual.

### D3. Uso em `invoice.js`

Cada linha usa `priceLine(item)` (`amount.toFixed(2)` e a nota ` (volume -10%)` quando `volume`). O rótulo vem de `resolveCoupon(...).label`. Totais continuam vindo de `calculateOrderTotal`, que segue sendo chamado primeiro (preserva os erros de validação antes de qualquer `map`).

### D4. Aritmética literal

`priceLine` calcula `line = price * quantity` e, com volume, `line - line * VOLUME_RATE` — não `line * 0.9`, que pode diferir no último bit. O desconto do cupom é `subtotal * rate`, como hoje. Nenhum arredondamento entra no módulo.

### D5. Testes

`test/discounts.test.js` tem um `test('<nome do cenário>')` por cenário da spec, exercitando `calculateOrderTotal` e/ou `formatInvoice`. Os testes são escritos e passam contra o código atual antes da extração (rede de segurança de caracterização) e continuam passando depois. Como o teste não muda durante a refatoração, ele prova que o comportamento não mudou.

## Risks / Trade-offs

- [Deriva de ponto flutuante ao reescrever a conta] → D4; além disso, uma comparação temporária (não versionada) entre o código de `HEAD` e o novo sobre uma matriz de pedidos (quantidades 1, 9, 10, 11; preços 0,125, 0,35, 3, 50, 240, 250, 260; cupons ausente, vazio, `WELCOME10`, `VIP20`, `vip20`, `BLACK50`; clientes ausente, novo, regular, vip) exige igualdade estrita de totais e texto.
- [Precedência do rótulo alterada sem querer, por exemplo cupom desconhecido com volume] → cenário `cupom desconhecido com volume mostra nao acumula` e a ordem explícita em D1.
- [Regra ainda duplicada após a refatoração] → verificação por busca: `src/pricing.js` e `src/invoice.js` não contêm `WELCOME10`, `VIP20`, `0.1`, `0.2` nem `>= 10`.
- [`customer` ausente] → `resolveCoupon` checa a presença do cliente antes de `isEligible`, como o código atual.

## Migration Plan

Refatoração interna, sem migração de dados nem de chamadores. Rollback: reverter o commit.
