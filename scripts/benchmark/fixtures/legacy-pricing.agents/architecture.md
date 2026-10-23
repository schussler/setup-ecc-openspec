# Arquitetura

## Visão geral

- **O que o sistema faz:** calcula o total de pedidos da loja (subtotal, descontos, frete) e gera a fatura em texto.
- **Stack:** JavaScript ES module, Node 22+, sem dependências. Testes com `node --test`.
- **Como rodar localmente:** `npm test`.

## Módulos

| Caminho | Responsabilidade | Pode depender de |
|---------|------------------|------------------|
| `src/pricing.js` | `calculateOrderTotal(order)`: subtotal, desconto, frete e total | — |
| `src/invoice.js` | `formatInvoice(order)`: fatura em texto, explica o desconto | `src/pricing.js` |

## Fronteiras e regras

- **Entradas externas:** o objeto `order` vem da API de checkout. Valide itens (quantidade > 0, preço ≥ 0) antes de calcular.
- **Contrato público:** `calculateOrderTotal` e `formatInvoice`, e o formato exato da fatura. O financeiro concilia faturas pelo texto e pelos totais. Nenhuma refatoração pode mudar um centavo nem um caractere.
- **Não altere sem pedido:** `package.json` e os testes existentes em `test/`.

## Verificação

- Comandos em `template.json` → `checks`.
- Testes em `test/*.test.js`, nomeados pelo cenário da spec.

## Decisões

- O arredondamento acontece uma vez, no resultado (`subtotal`, `discount`, `total`). Arredondar por linha muda centavos (ver o teste `arredonda centavos so no resultado`).
- A fatura recalcula a linha com volume só para exibição. O total exibido vem sempre de `calculateOrderTotal`.
