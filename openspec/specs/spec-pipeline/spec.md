# spec-pipeline Specification

## Purpose
Pipeline de entrega em quatro passos (`spec-create` → `spec-implement` → `spec-archive` → `pr`) sobre os comandos `/opsx:*`, com gates que não podem ser pulados.

## Requirements

### Requirement: Pipeline de quatro passos
O pipeline SHALL ser `spec-create` → `spec-implement` → `spec-archive` → `pr`. Os passos `spec-*` SHALL ser wrappers sobre `/opsx:propose`, `/opsx:apply` e `/opsx:archive`, com fallback para a CLI `openspec`, sem duplicar a lógica desses comandos. Nenhum gate SHALL ser pulado, nem em modo headless.

#### Scenario: skills spec delegam ao opsx
- **WHEN** as skills `spec-create`, `spec-implement` e `spec-archive` são lidas
- **THEN** cada uma delega ao comando `/opsx:*` correspondente e declara que os gates não podem ser pulados

### Requirement: Criação de spec
O `spec-create` SHALL entrevistar o usuário com `grill-me`, quando disponível, ou com o roteiro embutido. Em `--headless`, SHALL assumir premissas sem aguardar resposta e registrar cada uma na seção `## Premissas` da proposta.

#### Scenario: spec-create headless registra premissas
- **WHEN** a skill `spec-create` é lida
- **THEN** ela define o modo `--headless` e exige a seção `## Premissas` na proposta

#### Scenario: spec-create usa fallback sem grill-me
- **WHEN** `grill-me` não está disponível
- **THEN** a skill aponta para o roteiro de perguntas embutido, que existe no diretório da skill

### Requirement: Implementação com TDD
O `spec-implement` SHALL implementar tarefa por tarefa em Red → Green → Refactor. Também SHALL registrar o baseline e rodar o gate de implementação, corrigindo e reavaliando até o veredito `pass` ou `stop`. Cada tentativa SHALL ser registrada em `docs/agents/issue-tracker.md`.

#### Scenario: spec-implement segue red green refactor
- **WHEN** a skill `spec-implement` é lida
- **THEN** ela exige teste falhando antes do código, registra o baseline e usa o gate de implementação

### Requirement: Arquivamento com gate
O `spec-archive` SHALL rodar o gate de arquivamento antes de arquivar. Depois SHALL arquivar em `openspec/changes/archive/` e atualizar as specs com `openspec-sync-specs`.

#### Scenario: spec-archive roda gate antes de arquivar
- **WHEN** a skill `spec-archive` é lida
- **THEN** o gate de arquivamento vem antes do arquivamento, e ela cita `openspec-sync-specs`

### Requirement: PR sob pedido
A skill `pr` SHALL rodar somente sob pedido explícito do usuário e nunca em modo headless. Antes de criar a PR, SHALL rodar o gate de PR e mostrar o commit, a branch de destino e o corpo da PR, e SHALL aguardar confirmação.

#### Scenario: pr so executa sob pedido explicito
- **WHEN** a skill `pr` é lida
- **THEN** ela exige pedido explícito, roda o gate de PR e aguarda confirmação antes de `gh pr create`

### Requirement: Handoff
A skill `handoff` SHALL resumir o estado, atualizar `docs/agents/issue-tracker.md` e gravar ali um ponto de restauração para a próxima sessão.

#### Scenario: handoff grava ponto de restauracao
- **WHEN** a skill `handoff` é lida
- **THEN** ela grava o ponto de restauração em `docs/agents/issue-tracker.md`
