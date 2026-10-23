# Proposal

## Why

As regras de desconto por volume e de cupom (`WELCOME10`, `VIP20`) estão escritas em `calculateOrderTotal` (`src/pricing.js`) e repetidas em `formatInvoice` (`src/invoice.js`). A fatura já divergiu do total uma vez em produção (rótulo de cupom errado), e o financeiro concilia faturas pelo texto e pelos totais: as regras precisam ter um único dono.

## What Changes

- Novo módulo `src/discounts.js` com as regras de desconto por volume e de cupom em funções puras e exportadas.
- `src/pricing.js` e `src/invoice.js` passam a usar esse módulo; nenhuma regra de desconto fica duplicada nos dois arquivos.
- Novo `test/discounts.test.js` com um teste por cenário desta spec, com o nome do cenário.
- `docs/agents/architecture.md` passa a listar `src/discounts.js` na tabela de módulos.
- Nenhuma mudança de comportamento observável: totais idênticos centavo por centavo e texto da fatura idêntico caractere por caractere. Os testes existentes em `test/` não mudam. Nada é **BREAKING**.

## Capabilities

### New Capabilities

- `order-discounts`: regras de desconto do pedido (volume por linha, cupons `WELCOME10` e `VIP20`, não acumulação com volume) e seus efeitos observáveis no total, no frete e no rótulo do desconto na fatura. Documenta o contrato atual, que esta refatoração precisa preservar.

### Modified Capabilities

Nenhuma (não há specs em `openspec/specs/`).

## Impact

- Código: `src/pricing.js`, `src/invoice.js`, novo `src/discounts.js`.
- Testes: novo `test/discounts.test.js`; `test/pricing.test.js` e `test/invoice.test.js` intocados.
- API pública: `calculateOrderTotal(order)` e `formatInvoice(order)` mantêm assinatura, resultado e mensagens de erro. `src/discounts.js` é uma API interna nova.
- Dependências: nenhuma; `package.json` intocado.
- Docs: `docs/agents/architecture.md` (tabela de módulos).

## Premissas

Change criada em modo headless; nenhuma pergunta foi feita ao usuário.

- **Spec nova vs. `skip_specs`.** Premissa: criar a capability `order-discounts` descrevendo o comportamento atual, em vez de marcar `skip_specs: true`. Por quê: o brief pede um teste por cenário da spec e o gate de archive casa cenário com teste; a spec registra o contrato que a refatoração não pode quebrar, sem inventar comportamento. Se errada: a change vira `skip_specs: true` e `test/discounts.test.js` perde a referência de cenários.
- **Cupom desconhecido em pedido com volume.** Premissa: preservar o código, que mostra `<cupom> não acumula com volume` (a checagem de volume vem antes da validação do código do cupom). Por quê: o brief proíbe mudar o texto da fatura. **Inconsistência apontada:** `docs/agents/domain.md` diz que cupom desconhecido mostra `<cupom> não aplicável`, sem tratar esse caso combinado. Se errada: corrigir o texto é uma mudança de comportamento e pede uma change própria.
- **Escopo do módulo.** Premissa: `src/discounts.js` contém só volume e cupom (regra, taxa, elegibilidade, rótulo). Frete, arredondamento e validação de itens ficam em `src/pricing.js`. Por quê: o brief fala de regras de desconto; frete não é desconto e o arredondamento tem ponto único documentado no resultado. Se errada: o design ganha mais funções e a tabela de módulos muda, mas a spec não.
- **Aritmética preservada literalmente.** Premissa: o módulo reproduz as expressões atuais (`line - line * 0.1`, `subtotal * taxa`, soma na ordem dos itens). Por quê: `line * 0.9` ou outra reordenação pode mudar o último bit do ponto flutuante e, na borda, um centavo. Se errada: nada muda na spec; só relaxaria o design.
- **Nomes de cenário.** Premissa: em português sem acento, no estilo dos testes existentes, e diferentes dos nomes já usados em `test/`. Por quê: o gate casa cenário com teste pelo nome, e nomes repetidos entre arquivos tornam o casamento ambíguo. Se errada: renomear cenários e testes juntos.
- **Como os testes provam os cenários.** Premissa: cada teste de `test/discounts.test.js` exercita o contrato público (`calculateOrderTotal` e/ou `formatInvoice`), que é o que o financeiro observa; as funções de `src/discounts.js` são cobertas por esse caminho. Por quê: o cenário descreve comportamento observável, e o teste precisa passar antes e depois da refatoração (rede de segurança). Se errada: acrescentar asserções diretas sobre `src/discounts.js` nos mesmos testes.
- **Entrada das funções puras.** Premissa: as funções de `src/discounts.js` recebem dados já validados por `calculateOrderTotal` e não validam de novo. Por quê: evita duplicar a validação e manter duas mensagens de erro. Se errada: o módulo ganha validação própria, com as mesmas mensagens.
