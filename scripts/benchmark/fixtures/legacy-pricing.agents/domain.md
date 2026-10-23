# Domínio

## Glossário

| Termo | Significado | Evite |
|-------|-------------|-------|
| linha | Um item do pedido: `preço × quantidade` | "produto" |
| desconto por volume | 10% na linha com 10 unidades ou mais | "atacado" |
| cupom | Código de desconto sobre o subtotal: `WELCOME10` ou `VIP20` | "voucher" |
| subtotal | Soma das linhas, já com desconto por volume | "valor bruto" |
| frete | 15,00, grátis quando subtotal − cupom ≥ 200 | — |

## Regras de negócio

- **Volume:** a linha com `quantity >= 10` recebe 10% de desconto. Exemplo: 10 × 3,00 = 27,00.
- **WELCOME10:** 10% do subtotal, só no primeiro pedido do cliente (`customer.orders === 0`).
- **VIP20:** 20% do subtotal, só para `customer.tier === 'vip'`.
- **Cupom não acumula com volume:** se qualquer linha do pedido teve desconto por volume, o cupom é ignorado (desconto 0) e a fatura mostra `<cupom> não acumula com volume`.
- **Frete grátis** compara o valor **depois** do cupom: 240 com VIP20 → 192 → frete 15.
- **Cupom desconhecido ou não elegível:** desconto 0, e a fatura mostra `<cupom> não aplicável`.

## Invariantes

- Totais e texto da fatura idênticos antes e depois de qualquer refatoração.
- Um único ponto de arredondamento: 2 casas, no resultado.
