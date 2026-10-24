# Spec Delta

## Purpose

Registra a conclusão de uma change implementada de forma supervisionada, fora do runner, com evidência reproduzível e sem editar vereditos de gate à mão.

## ADDED Requirements

### Requirement: Registro de conclusão supervisionada com evidência
Quando a implementação de uma change foi feita fora do runner, o agente SHALL registrar uma conclusão supervisionada com a evidência: resultado da suíte, lint, sintaxe, `openspec validate --strict`, `contract.mjs` e o hash do contrato verificado.

#### Scenario: registro completo
- **ID:** SC-001
- **Revisão:** 1
- **WHEN** a implementação de uma change está concluída fora do runner e as verificações passam
- **THEN** o agente grava o registro com cada item de evidência e o hash do contrato atual

### Requirement: Veredito de implementação preservado
O registro de conclusão supervisionada SHALL NOT alterar `gates.json` nem o último veredito do gate de implementação. O agente SHALL NOT editar vereditos de gate à mão.

#### Scenario: veredito anterior permanece
- **ID:** SC-002
- **Revisão:** 1
- **WHEN** o registro de conclusão supervisionada é gravado
- **THEN** `gates.json` e o último veredito do gate de implementação ficam inalterados

### Requirement: Registro inválido é recusado
Um registro de conclusão supervisionada SHALL ser recusado quando falta item de evidência, quando uma verificação falha, ou quando o hash do contrato não corresponde ao contrato atual.

#### Scenario: hash diferente é recusado
- **ID:** SC-003
- **Revisão:** 1
- **WHEN** o contrato é alterado depois que o registro foi gravado
- **THEN** o registro não vale para o contrato atual e o gate o trata como ausente

#### Scenario: evidência faltante é recusada
- **ID:** SC-004
- **Revisão:** 1
- **WHEN** o registro não tem o resultado de `contract.mjs`
- **THEN** o registro é recusado e nenhum registro válido é gravado

### Requirement: Aceite no gate de arquivamento
O gate de arquivamento SHALL aceitar o registro válido de conclusão supervisionada no lugar do veredito `pass` do gate de implementação. A conclusão SHALL NOT dispensar o teste por cenário nem a suíte. Sem veredito e sem conclusão válida, o gate SHALL reprovar sem avaliar cenários.

#### Scenario: conclusão supervisionada não dispensa teste por cenário
- **ID:** SC-005
- **Revisão:** 1
- **WHEN** a conclusão supervisionada é válida e um cenário da change não tem caso de teste com o seu ID
- **THEN** o gate de arquivamento reprova e lista o ID em `missing`

#### Scenario: sem veredito e sem conclusão o arquivamento reprova
- **ID:** SC-006
- **Revisão:** 1
- **WHEN** `gates.json` não tem veredito `pass` do gate de implementação e não há conclusão supervisionada válida
- **THEN** o gate de arquivamento reprova sem avaliar cenários

#### Scenario: conclusão válida substitui o veredito de implementação
- **ID:** SC-007
- **Revisão:** 1
- **WHEN** `gates.json` não tem veredito `pass` do gate de implementação, mas existe conclusão supervisionada válida para o hash atual do contrato
- **THEN** o gate de arquivamento avalia os cenários e a suíte, e aprova somente com 100%
