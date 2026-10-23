# Spec Delta

## Purpose

Define as regras de desconto do pedido (desconto por volume na linha e cupons) e o efeito delas no subtotal, no desconto, no frete, no total e no rótulo do desconto na fatura, que o financeiro usa para conciliar.

## ADDED Requirements

### Requirement: Desconto por volume na linha
O sistema SHALL aplicar 10% de desconto na linha com 10 unidades ou mais, linha por linha. A linha com menos de 10 unidades MUST ficar sem desconto por volume. Na fatura, a linha com desconto por volume SHALL terminar com ` (volume -10%)`.

#### Scenario: linha com 10 unidades recebe 10 por cento de volume
- **WHEN** o pedido tem uma linha de 10 unidades a 3,00, sem cupom
- **THEN** o subtotal é 27,00
- **AND** a fatura mostra a linha `A x10: 27.00 (volume -10%)`

#### Scenario: linha com 9 unidades fica sem desconto por volume
- **WHEN** o pedido tem uma linha de 9 unidades a 3,00, sem cupom
- **THEN** o subtotal é 27,00
- **AND** a fatura mostra a linha `A x9: 27.00`, sem marca de volume

### Requirement: Cupom WELCOME10
O sistema SHALL descontar 10% do subtotal com o cupom `WELCOME10` só quando o cliente não tem pedidos anteriores (`orders` igual a 0). Aplicado, o rótulo do desconto na fatura SHALL ser `WELCOME10 -10%`; caso contrário o desconto MUST ser 0 e o rótulo `WELCOME10 não aplicável`.

#### Scenario: WELCOME10 da 10 por cento no primeiro pedido
- **WHEN** um cliente com 0 pedidos usa `WELCOME10` num pedido de 50,00
- **THEN** o desconto é 5,00, o frete 15,00 e o total 60,00
- **AND** a fatura mostra `Desconto (WELCOME10 -10%): -5.00`

#### Scenario: WELCOME10 nao vale para cliente com pedidos anteriores
- **WHEN** um cliente com 3 pedidos usa `WELCOME10` num pedido de 50,00
- **THEN** o desconto é 0,00 e o total 65,00
- **AND** a fatura mostra `Desconto (WELCOME10 não aplicável): -0.00`

#### Scenario: WELCOME10 sem cliente nao se aplica
- **WHEN** um pedido de 50,00 sem cliente usa `WELCOME10`
- **THEN** o desconto é 0,00 e o total 65,00
- **AND** a fatura mostra `Desconto (WELCOME10 não aplicável): -0.00`

### Requirement: Cupom VIP20
O sistema SHALL descontar 20% do subtotal com o cupom `VIP20` só quando o cliente tem `tier` igual a `vip`. Aplicado, o rótulo do desconto na fatura SHALL ser `VIP20 -20%`; caso contrário o desconto MUST ser 0 e o rótulo `VIP20 não aplicável`.

#### Scenario: VIP20 da 20 por cento para cliente vip
- **WHEN** um cliente `vip` usa `VIP20` num pedido de 260,00
- **THEN** o desconto é 52,00, o frete 0,00 e o total 208,00
- **AND** a fatura mostra `Desconto (VIP20 -20%): -52.00`

#### Scenario: VIP20 nao vale para cliente regular
- **WHEN** um cliente `regular` usa `VIP20` num pedido de 260,00
- **THEN** o desconto é 0,00, o frete 0,00 e o total 260,00
- **AND** a fatura mostra `Desconto (VIP20 não aplicável): -0.00`

### Requirement: Cupom nao acumula com volume
Quando qualquer linha do pedido recebe desconto por volume, o sistema SHALL ignorar o cupom informado, seja ele conhecido ou não: o desconto MUST ser 0 e o rótulo na fatura SHALL ser `<cupom> não acumula com volume`.

#### Scenario: cupom ignorado quando alguma linha tem volume
- **WHEN** um cliente `vip` usa `VIP20` num pedido com uma linha de 10 unidades a 10,00 e outra de 1 unidade a 50,00
- **THEN** o subtotal é 140,00, o desconto 0,00, o frete 15,00 e o total 155,00
- **AND** a fatura mostra `Desconto (VIP20 não acumula com volume): -0.00`

#### Scenario: cupom desconhecido com volume mostra nao acumula
- **WHEN** um pedido com uma linha de 10 unidades a 10,00 usa o cupom `BLACK50`
- **THEN** o desconto é 0,00 e o total 105,00
- **AND** a fatura mostra `Desconto (BLACK50 não acumula com volume): -0.00`

### Requirement: Cupom desconhecido ou ausente
Um código de cupom que não é exatamente `WELCOME10` nem `VIP20` (com maiúsculas) SHALL resultar em desconto 0 e rótulo `<cupom> não aplicável`, quando nenhuma linha tem volume. Sem cupom, ou com cupom vazio, o desconto MUST ser 0 e o rótulo `sem cupom`.

#### Scenario: cupom desconhecido nao da desconto
- **WHEN** um pedido de 50,00 sem volume usa o cupom `BLACK50`
- **THEN** o desconto é 0,00 e o total 65,00
- **AND** a fatura mostra `Desconto (BLACK50 não aplicável): -0.00`

#### Scenario: codigo de cupom diferencia maiusculas
- **WHEN** um cliente `vip` usa `vip20` num pedido de 260,00
- **THEN** o desconto é 0,00 e o total 260,00
- **AND** a fatura mostra `Desconto (vip20 não aplicável): -0.00`

#### Scenario: pedido sem cupom mostra sem cupom
- **WHEN** um pedido de 50,00 não informa cupom
- **THEN** o desconto é 0,00 e o total 65,00
- **AND** a fatura mostra `Desconto (sem cupom): -0.00`

#### Scenario: cupom vazio e tratado como sem cupom
- **WHEN** um pedido de 50,00 informa o cupom como texto vazio
- **THEN** o desconto é 0,00 e o total 65,00
- **AND** a fatura mostra `Desconto (sem cupom): -0.00`

### Requirement: Frete depois do cupom
O sistema SHALL cobrar frete de 15,00 quando o subtotal menos o desconto do cupom fica abaixo de 200,00, e frete 0,00 quando fica em 200,00 ou mais.

#### Scenario: frete cobrado quando o cupom deixa o valor abaixo de 200
- **WHEN** um cliente `vip` usa `VIP20` num pedido de 240,00
- **THEN** o desconto é 48,00, o frete 15,00 e o total 207,00

#### Scenario: frete gratis quando o cupom deixa o valor em 200
- **WHEN** um cliente `vip` usa `VIP20` num pedido de 250,00
- **THEN** o desconto é 50,00, o frete 0,00 e o total 200,00

### Requirement: Arredondamento unico no resultado
O sistema SHALL calcular linhas, subtotal, desconto e total sem arredondar etapas intermediárias, e arredondar `subtotal`, `discount` e `total` a 2 casas uma única vez, no resultado.

#### Scenario: subtotal arredondado uma vez e nao por linha
- **WHEN** o pedido tem duas linhas de 1 unidade a 0,125, sem cupom
- **THEN** o subtotal é 0,25 (e não 0,26), o frete 15,00 e o total 15,25

### Requirement: Formato da fatura preservado
A fatura SHALL listar uma linha por item (`<sku> x<quantidade>: <valor>`), depois `Subtotal`, `Desconto (<rótulo>): -<valor>`, `Frete` e `Total`, com valores em 2 casas, separados por quebra de linha, e com os totais iguais aos do cálculo do pedido.

#### Scenario: fatura completa com volume e sem cupom
- **WHEN** a fatura é gerada para um pedido sem cupom com 10 unidades de `A` a 3,00 e 1 unidade de `B` a 5,00
- **THEN** o texto é exatamente `A x10: 27.00 (volume -10%)`, `B x1: 5.00`, `Subtotal: 32.00`, `Desconto (sem cupom): -0.00`, `Frete: 15.00`, `Total: 47.00`, unidos por `\n`

### Requirement: Pedido invalido rejeitado
O cálculo do pedido e a fatura SHALL rejeitar um pedido sem itens com o erro `order must have items`, e um item com quantidade menor ou igual a 0 ou preço negativo com o erro `invalid item <sku>`.

#### Scenario: fatura rejeita pedido sem itens
- **WHEN** a fatura é gerada para um pedido com lista de itens vazia
- **THEN** a geração falha com o erro `order must have items`

#### Scenario: fatura rejeita item com preco negativo
- **WHEN** a fatura é gerada para um pedido com o item `Z` de preço -1,00
- **THEN** a geração falha com o erro `invalid item Z`
