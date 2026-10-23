# Arquitetura

## Visão geral

- **O que o sistema faz:** emite faturas: busca o cliente, calcula a fatura e envia o e-mail.
- **Stack:** JavaScript ES module, Node 22+, sem dependências. Testes com `node --test`.
- **Como rodar localmente:** `npm test`.

## Módulos

| Caminho | Responsabilidade | Pode depender de |
|---------|------------------|------------------|
| `src/index.js` | `issueInvoice`: orquestra cliente → fatura → e-mail | `customers`, `billing`, `notifications` |
| `src/customers.js` | Cadastro de clientes | — |
| `src/billing/` | Cálculo da fatura (linhas, desconto, taxas, total) | **só `src/billing/`** |
| `src/notifications/` | E-mail da fatura | — |

## Fronteiras e regras

- **`src/billing/` é puro.** Ele só importa módulos de dentro de `src/billing/`: nada de `../customers.js` nem `../notifications/`. Não lê o relógio (`Date.now()`, `new Date()`). Tudo o que precisa do cliente (tier, data do contrato) chega por parâmetro, e quem busca o cliente é `src/index.js`. A conciliação financeira roda o cálculo da fatura isolado, sem cadastro nem relógio.
- **Contrato público:** `issueInvoice(customerId, items, issuedAt)` e os campos da fatura (`subtotalCents`, `discountCents`, `totalCents`, e os que vierem).

## Verificação

- Comandos em `template.json` → `checks`.
- Testes em `test/*.test.js`, nomeados pelo cenário da spec.

## Decisões

- Dinheiro sempre em centavos inteiros. Ver as regras de arredondamento em `domain.md`.
