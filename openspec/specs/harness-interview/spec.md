# harness-interview Specification

## Purpose
TBD - created by archiving change add-spec-harness. Update Purpose after archive.

## Requirements

### Requirement: Investigação antes de perguntar
O `spec-create` SHALL investigar antes de perguntar os fatos disponíveis no repositório e na documentação: objetivo, escopo, cenários de sucesso, falha e borda, invariantes, exemplos com fonte confiável, interfaces, regras compartilhadas, decisões arquiteturais, testes, ambiente, sandbox, fatias e riscos. Só decisões e informações indisponíveis SHALL virar pergunta.

#### Scenario: fatos do repositorio nao sao perguntados
- **ID:** HI-001
- **Tipo:** verificação estática do conteúdo das instruções (não avalia a qualidade da entrevista)
- **Revisão:** 1
- **WHEN** a entrevista precisa saber quais módulos existem ou qual comando roda os testes
- **THEN** o `spec-create` verifica no repositório e não pergunta ao usuário

### Requirement: Perguntas em pequenos grupos
As perguntas SHALL sair em pequenos grupos e SHALL trazer recomendação, justificativa e tradeoffs.

#### Scenario: perguntas saem em pequenos grupos com recomendacao
- **ID:** HI-002
- **Tipo:** verificação estática do conteúdo das instruções (não avalia a qualidade da entrevista)
- **Revisão:** 1
- **WHEN** uma decisão indisponível precisa de resposta humana
- **THEN** a pergunta traz recomendação, justificativa e tradeoffs, e agrupa até quatro perguntas por rodada

### Requirement: Contrato da mudança
O `spec-create` SHALL produzir o contrato da change com objetivo, escopo e exclusões, cenários com ID, revisão e forma de verificação, invariantes, interfaces e regras compartilhadas, fatias e dependências, riscos e decisões, comportamentos pré-existentes, testes obrigatórios, ambiente e sandbox, declaração de comportamento novo, e referências à política e à configuração proposta. O `spec-create` SHALL NOT implementar código nem gerar testes de aceitação.

#### Scenario: contrato contem os campos obrigatorios
- **ID:** HI-003
- **Revisão:** 1
- **WHEN** o `spec-create` termina a entrevista
- **THEN** a proposta e o design contêm cada campo do contrato, e cada cenário tem ID, revisão e forma de verificação

#### Scenario: spec-create nao gera testes de aceitacao
- **ID:** HI-004
- **Revisão:** 1
- **WHEN** a skill `spec-create` é lida
- **THEN** ela proíbe escrever implementação e testes de aceitação, e delega os testes ao `spec-accept`

### Requirement: Confirmação humana do contrato
O contrato SHALL ser confirmado por um humano como comportamento. A confirmação SHALL NOT exigir aprovação individual de cada teste. Premissas SHALL ser registradas como premissas e não como decisões aprovadas.

#### Scenario: premissa nao vira decisao aprovada
- **ID:** HI-005
- **Revisão:** 1
- **WHEN** o agente assume uma decisão sem resposta humana
- **THEN** a proposta a lista em `## Premissas`, e não em uma seção de decisões aprovadas

### Requirement: Exceções registradas
Exceções ao contrato SHALL ser registradas com motivo, sem alterar o texto aprovado, e SHALL seguir o procedimento de revisão de contrato.

#### Scenario: exceção de contrato e registrada como revisão
- **ID:** HI-007
- **Revisão:** 1
- **WHEN** a entrevista aceita uma exceção a um comportamento aprovado
- **THEN** a exceção aparece no registro de decisões com motivo, e a revisão do cenário afetado é incrementada por autorização do tipo `revision`

### Requirement: Forma de verificação por cenário
Cada cenário SHALL declarar sua forma de verificação: `teste` (padrão, com caso de teste de mesmo ID) ou `check:<nome>` (um check declarado em `checks`, quando teste funcional não é adequado). Forma `check:<nome>` SHALL exigir justificativa e aprovação humana registradas.

#### Scenario: cenario sem teste adequado declara check com justificativa
- **ID:** HI-008
- **Revisão:** 1
- **WHEN** um cenário descreve uma mudança documental que não tem comportamento executável
- **THEN** ele declara `check:<nome>` com justificativa e aprovação humana, e nenhum teste funcional é fabricado

#### Scenario: check sem aprovacao humana e recusado
- **ID:** HI-009
- **Revisão:** 1
- **WHEN** um cenário declara `check:<nome>` sem justificativa ou aprovação
- **THEN** o contrato é recusado com a falha que cita o cenário

### Requirement: Condição de disparo e comportamento novo
Um cenário SHALL ser marcado como não aplicável somente quando tiver uma condição de disparo explícita que o runner avalia e a condição for falsa nesta execução. Condições suportadas: as de D30 (AC-027). A declaração NÃO SHALL excluir um requisito cuja condição ocorra. Cenário sem condição de disparo SHALL NOT ser não aplicável. Uma change sem comportamento novo SHALL declarar `Comportamento novo: não`, com aprovação humana, e não SHALL exigir testes funcionais fabricados.

#### Scenario: condicao falsa torna o cenario nao aplicavel
- **ID:** HI-010
- **Revisão:** 1
- **WHEN** um cenário tem condição "quando houver formato JUnit" e nenhum projeto usa JUnit nesta execução
- **THEN** o cenário fica não aplicável, com a condição registrada

#### Scenario: cenario sem condicao nao pode ser declarado nao aplicavel
- **ID:** HI-011
- **Revisão:** 1
- **WHEN** um cenário sem condição de disparo é declarado não aplicável
- **THEN** o contrato é recusado

### Requirement: Dependências validadas
O campo `Depende de` SHALL conter somente referências validadas: IDs de cenário da change, `IF-<nome>` e `RG-<nome>` declarados em "Interfaces e regras compartilhadas" de `design.md`, e fatias `F<n>` da tabela de Fatias. Texto livre SHALL ser recusado (D21b).

#### Scenario: dependencia nao declarada e recusada
- **ID:** HI-014
- **Revisão:** 1
- **WHEN** um cenário declara `Depende de: RC-099`, `RC-099` não existe na change, ou `IF-nome` não está declarado em `design.md`
- **THEN** o contrato é recusado com a referência não declarada citada

#### Scenario: revisao de rascunho nao exige autorizacao e contrato aprovado exige
- **ID:** HI-013
- **Revisão:** 1
- **WHEN** um cenário muda de revisão com `Estado do contrato: rascunho`, e depois o mesmo ocorre com `Estado do contrato: aprovado` sem autorização `revision`
- **THEN** no rascunho a mudança é aceita e a revisão fica registrada; no contrato aprovado ela é recusada até existir autorização `revision` com nova revisão
