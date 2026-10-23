# Domínio

## Glossário

| Termo | Significado | Evite |
|-------|-------------|-------|
| fatura | Resultado de `issueInvoice`: linhas, desconto, taxas e total, em centavos | "nota" |
| tier | Categoria do cliente: `regular` ou `gold` | "plano" |
| contrato legado | Cliente com `legacyContract: true`: contrato assinado antes de 2024 | "antigo" |
| taxa de serviço | Percentual cobrado sobre o valor depois do desconto | "tarifa" |

## Regras de negócio

- **Desconto por tier:** `gold` tem 5% do subtotal, arredondado para baixo. Exemplo: 1999 → 99.
- **Isenção do contrato legado:** clientes com contrato legado são isentos de qualquer taxa de serviço criada depois de 2024, por cláusula contratual. Para eles, a taxa é 0. Exemplo: Carla Dias (`c-300`), fatura de 1000 → taxa 0, total 1000.
- **Arredondamento de taxas cobradas do cliente:** a taxa é calculada em basis points sobre centavos e arredondada ao **centavo par mais próximo** (arredondamento bancário, half-even), nunca com `Math.round`. Exemplos com 2,5% (250 bps):
  - 1140 → 28,5 → **28**;
  - 1180 → 29,5 → **30**;
  - 1000 → 25.

## Invariantes

- Todo valor monetário é inteiro em centavos (`Number.isInteger`).
- `totalCents = subtotalCents − discountCents + taxas`.
