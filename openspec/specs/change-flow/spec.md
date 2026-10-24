# change-flow Specification

## Purpose
TBD - created by archiving change add-proportional-change-flow. Update Purpose after archive.

## Requirements

### Requirement: Classificação por risco
O agente SHALL classificar cada pedido em um dos três caminhos por condições de risco, com os critérios de cada caminho declarados na skill. O tamanho do diff SHALL NOT ser critério, e a expressão "é só UI" SHALL NOT bastar para escolher o caminho 1.

#### Scenario: classificação não usa tamanho do diff
- **ID:** CF-001
- **Revisão:** 1
- **WHEN** a skill `change-flow` é lida
- **THEN** os critérios de cada caminho estão declarados por risco, e o tamanho do diff não aparece como critério

#### Scenario: interface qualificada
- **ID:** CF-002
- **Revisão:** 1
- **WHEN** a skill `change-flow` define o que é interface
- **THEN** ela separa aparência de componente de contrato de API, e declara que só a mudança de contrato externo leva ao caminho 3

### Requirement: Ambiguidade proporcional
Uma dúvida SHALL pedir esclarecimento proporcional ao seu efeito. Ela SHALL NOT subir automaticamente o pedido para o caminho 3. Quando a dúvida não altera escopo, comportamento observável, compatibilidade ou critério de aceite, o agente SHALL assumir a opção mais conservadora, registrá-la e informá-la.

#### Scenario: dúvida menor não sobe de caminho
- **ID:** CF-003
- **Revisão:** 1
- **WHEN** a skill `change-flow` trata uma dúvida que não altera escopo, comportamento, compatibilidade nem aceite
- **THEN** ela declara que a dúvida é registrada como premissa e não muda o caminho

### Requirement: Execução do caminho 1
No caminho 1 o agente SHALL executar a mudança dentro do pedido explícito, informar a classificação e registrar uma entrada curta em `docs/agents/issue-tracker.md`, sem criar change OpenSpec. Uma escalada que amplie escopo ou custo SHALL exigir confirmação antes de continuar.

#### Scenario: caminho 1 sem change OpenSpec
- **ID:** CF-004
- **Revisão:** 1
- **WHEN** a skill `change-flow` classifica um pedido como caminho 1
- **THEN** ela declara a classificação, a entrada no `issue-tracker.md` e a ausência de change OpenSpec, e exige confirmação para escalada que amplie escopo ou custo

### Requirement: Contrato curto no caminho 2
No caminho 2 o agente SHALL apresentar um contrato curto com objetivo, escopo, critérios de aceite e testes, e SHALL confirmar as decisões que faltarem antes de implementar. Essa execução SHALL ser declarada como supervisionada nesta versão, sem que isso signifique custo zero.

#### Scenario: caminho 2 confirma decisões faltantes
- **ID:** CF-005
- **Revisão:** 1
- **WHEN** a skill `change-flow` trata um pedido classificado como caminho 2
- **THEN** ela exige contrato curto com objetivo, escopo, aceite e testes, confirmação das decisões faltantes e a declaração de execução supervisionada

### Requirement: Aprovação formal no caminho 3
No caminho 3 o fluxo SHALL ser o completo existente, com `spec-create`, aprovação formal do contrato e os gates atuais.

#### Scenario: caminho 3 usa fluxo completo
- **ID:** CF-006
- **Revisão:** 1
- **WHEN** a skill `change-flow` classifica um pedido como caminho 3
- **THEN** ela encaminha para `spec-create` e declara que a aprovação formal e os gates não são pulados

### Requirement: Verificação proporcional com lacunas declaradas
A verificação SHALL ser proporcional aos arquivos e riscos afetados, usando os checks pertinentes de `template.json` → `checks`. A suíte completa e a captura de tela SHALL NOT ser exigidas em toda alteração textual ou visual. Quando uma verificação necessária não puder ser feita, o registro SHALL declarar a lacuna.

#### Scenario: lacuna de verificação é declarada
- **ID:** CF-007
- **Revisão:** 1
- **WHEN** a skill `change-flow` define o registro de um caminho com verificação impossível
- **THEN** o registro exige a declaração da lacuna, e a suíte completa não é exigida por padrão para alteração textual ou visual

### Requirement: Guardrails em todos os caminhos
Em todos os caminhos o agente SHALL proteger segredos, respeitar permissões e autenticação, limitar a mudança aos arquivos declarados e não fazer push, abrir PR ou publicar sem pedido explícito. Mudança que toque autenticação, permissões ou dados sensíveis SHALL levar ao caminho 3.

#### Scenario: guardrails presentes em todos os caminhos
- **ID:** CF-008
- **Revisão:** 1
- **WHEN** a skill `change-flow` declara os guardrails
- **THEN** segredos, permissões, escopo declarado e publicação aparecem como obrigatórios nos três caminhos

### Requirement: Ponto de entrada para pedidos comuns
A skill `change-flow` SHALL aceitar pedidos comuns sem que o usuário nomeie uma skill, como "troque a cor do botão", e SHALL classificar e encaminhar o pedido.

#### Scenario: pedido comum sem nomear skill
- **ID:** CF-009
- **Revisão:** 1
- **WHEN** a descrição da skill `change-flow` é lida
- **THEN** ela inclui pedidos comuns de ajuste visual e textual como gatilhos, sem exigir o nome de outra skill

### Requirement: Detecção de regra antiga em conflito
Antes de agir, a skill `change-flow` SHALL verificar se o `CLAUDE.md` do projeto mantém a regra "Zero código sem spec" de forma incondicional. Se mantiver, a skill SHALL reportar o conflito e SHALL NOT aplicar os caminhos novos até a migração explícita.

#### Scenario: regra antiga incondicional é reportada
- **ID:** CF-010
- **Revisão:** 1
- **WHEN** o detector recebe um `CLAUDE.md` com "Zero código sem spec" sem referência aos caminhos
- **THEN** ele retorna conflito com a linha encontrada

#### Scenario: regra atualizada não gera conflito
- **ID:** CF-011
- **Revisão:** 1
- **WHEN** o detector recebe um `CLAUDE.md` que referencia `change-flow`
- **THEN** ele não retorna conflito

### Requirement: Migração explícita de projetos existentes
A mudança em `CLAUDE.md` SHALL chegar a projetos existentes somente por migração explícita. O `template.json` SHALL continuar classificando `CLAUDE.md` como `owned`, e o `template-update` SHALL NOT sobrescrevê-lo.

#### Scenario: CLAUDE.md segue owned
- **ID:** CF-012
- **Revisão:** 1
- **WHEN** o `template.json` é lido
- **THEN** `CLAUDE.md` está em `owned` e não está em `managed`

### Requirement: Fato desconhecido não é ausência de risco
Um fato sem evidência SHALL ser tratado como desconhecido. Um fato desconhecido SHALL NOT ser tratado como `não` para descer o pedido de caminho. Nesse caso o agente SHALL investigar ou perguntar antes de classificar.

#### Scenario: desconhecido não desce de caminho
- **ID:** CF-013
- **Revisão:** 1
- **WHEN** um fato que decidiria o caminho para baixo está desconhecido
- **THEN** a saída é `investigar`, e o pedido não é classificado como caminho 1 nem como caminho 2

### Requirement: Evidência por fato
Cada fato usado na classificação SHALL registrar o valor e a evidência que o sustenta, como citação do pedido, `arquivo:linha`, resultado de medição ou resposta do usuário. Um fato sem evidência SHALL ser desconhecido.

#### Scenario: fato sem evidência é desconhecido
- **ID:** CF-014
- **Revisão:** 1
- **WHEN** um fato é declarado `sim` ou `não` sem evidência
- **THEN** o classificador trata o fato como `desconhecido`
