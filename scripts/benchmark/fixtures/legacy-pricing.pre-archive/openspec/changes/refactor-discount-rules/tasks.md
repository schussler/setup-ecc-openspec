# Tasks

## 1. Rede de segurança (caracterização)

- [x] 1.1 Criar `test/discounts.test.js` com um `test()` por cenário de `specs/order-discounts/spec.md`, com o nome exato do cenário, exercitando `calculateOrderTotal` e/ou `formatInvoice`; verificar com `npm test` que todos passam contra o código atual (19 cenários, 19 testes)
- [x] 1.2 Montar a comparação temporária fora do repositório (matriz de pedidos do design, Risks) que grava totais e texto da fatura do código de `HEAD`; verificar que o arquivo de referência foi gerado

## 2. Módulo `src/discounts.js`

- [x] 2.1 Criar `src/discounts.js` com `VOLUME_MIN_QUANTITY`, `VOLUME_RATE`, a tabela congelada de cupons, `priceLine`, `hasVolumeDiscount` e `resolveCoupon` (design D1, D4), com JSDoc; verificar com `node -e "import('./src/discounts.js').then(m => console.log(Object.keys(m)))"` que as exportações existem e que `npm test` segue verde

## 3. `pricing.js` usa o módulo

- [x] 3.1 Trocar em `calculateOrderTotal` o cálculo da linha, o flag de volume e a decisão do cupom por `priceLine`, `hasVolumeDiscount` e `resolveCoupon` (design D2), mantendo validação, frete e arredondamento; verificar `npm test` verde e a comparação do item 1.2 sem diferenças nos totais

## 4. `invoice.js` usa o módulo

- [x] 4.1 Trocar em `formatInvoice` o recálculo da linha e o bloco do rótulo por `priceLine` e `resolveCoupon` (design D3), mantendo `calculateOrderTotal` como primeira chamada; verificar `npm test` verde e a comparação do item 1.2 sem diferenças no texto
- [x] 4.2 Atualizar o comentário de topo de `src/invoice.js`, que hoje diz que o arquivo repete as regras; verificar que ele aponta para `src/discounts.js`

## 5. Documentação e integração

- [x] 5.1 Adicionar `src/discounts.js` à tabela de módulos de `docs/agents/architecture.md` e atualizar as dependências (`pricing.js` e `invoice.js` dependem de `discounts.js`); verificar a tabela renderizada
- [x] 5.2 Verificar que não há regra duplicada: busca por `WELCOME10`, `VIP20`, `0.1`, `0.2` e `>= 10` em `src/pricing.js` e `src/invoice.js` não retorna nada
- [x] 5.3 Verificar que `test/pricing.test.js`, `test/invoice.test.js` e `package.json` não mudaram (`git diff --stat` não os lista) e que `npm test` passa por inteiro; apagar a comparação temporária (pendente manual: `rm` bloqueado por permissão; ver Log de `issue-tracker.md`)

## Workflow follow-up

- `spec-archive refactor-discount-rules` depois do gate de implementação: cada cenário precisa de um teste com o mesmo nome em `test/discounts.test.js`.
- Registrar à parte a inconsistência entre `docs/agents/domain.md` e o código (cupom desconhecido com volume), se o negócio quiser decidir o texto correto.
