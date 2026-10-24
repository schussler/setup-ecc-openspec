# Spec Delta

## Purpose

Pacote npm `specloop` e o CLI único de instalação e atualização: `install`, `init`, `adopt` e `update`.

## ADDED Requirements

### Requirement: Install só com o toolset
`specloop install` SHALL copiar os caminhos `managed` do pacote para o repositório atual e SHALL NOT escrever em caminho `owned`. Rodar de novo sem mudança no pacote SHALL não alterar arquivos.

#### Scenario: install copia os managed
- **ID:** SL-006
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** `specloop install --yes` roda num repositório git sem o framework
- **THEN** os caminhos `managed` existem com o conteúdo do pacote, e `CLAUDE.md`, `docs/agents` e `.claude/settings.json` existentes não mudam

#### Scenario: install repetido nao altera nada
- **ID:** SL-007
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** `specloop install --yes` roda duas vezes com o mesmo pacote
- **THEN** a segunda execução não altera nenhum arquivo

### Requirement: Init de projeto novo
`specloop init <dir>` SHALL criar um projeto novo equivalente ao do `/new-project`, com `template.json` registrando `framework.package` e `framework.version`, sem specs nem changes do framework. SHALL recusar `<dir>` existente e não vazio.

#### Scenario: init cria projeto valido
- **ID:** SL-008
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** `specloop init <dir> --yes --name demo --languages typescript` roda num diretório vazio
- **THEN** `<dir>` é um repositório git com um commit, `template.json` tem `framework`, `openspec/specs` e `openspec/changes` estão vazios, `scripts/test` e `scripts/benchmark` não existem, e `openspec validate --all` passa

#### Scenario: init recusa diretorio nao vazio
- **ID:** SL-011
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** `specloop init <dir> --yes` roda com `<dir>` contendo um arquivo
- **THEN** o comando sai com código 1, diz o motivo e não altera `<dir>`

### Requirement: Adopt de projeto existente
`specloop adopt` SHALL usar `migrate.mjs` com o pacote como template: mostrar o plano, pedir confirmação por item e aplicar só os itens confirmados, sem remover nada.

#### Scenario: adopt sem confirmacao nao escreve
- **ID:** SL-012
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** `specloop adopt` roda num projeto existente e nenhum item é confirmado
- **THEN** o plano é mostrado e nenhum arquivo do projeto muda

#### Scenario: adopt aplica itens confirmados
- **ID:** SL-013
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** `specloop adopt --yes` roda num projeto existente sem o framework
- **THEN** os itens do plano ficam `done` num novo `plan`, e nenhum arquivo pré-existente é removido

### Requirement: Update dos managed
`specloop update` SHALL comparar os `managed` do projeto com o pacote, mostrar o que muda e aplicar só após confirmação, gravando `framework.version`. SHALL aceitar projeto com `template.repo` antigo e converter o manifesto. SHALL recusar quando não houver `template.json`.

#### Scenario: update converte manifesto antigo
- **ID:** SL-009
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** `specloop update --yes` roda num projeto cujo `template.json` só tem `template.repo`
- **THEN** os `managed` ficam iguais aos do pacote, `template.json` tem `framework` com a versão do pacote e não tem mais `template.repo`

#### Scenario: update sem confirmacao nao escreve
- **ID:** SL-014
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** `specloop update` roda sem `--yes` e a resposta não é afirmativa
- **THEN** a lista do que mudaria é mostrada e nenhum arquivo muda

#### Scenario: update nunca escreve em owned
- **ID:** SL-015
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** `specloop update --yes` roda num projeto com `CLAUDE.md`, `docs/agents`, `.claude/settings.json` e `.harness-project.json` próprios
- **THEN** esses arquivos não mudam

#### Scenario: update recusa projeto sem manifesto
- **ID:** SL-016
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** `specloop update --yes` roda num diretório sem `template.json`
- **THEN** o comando sai com código 1, diz o motivo e não escreve nada

### Requirement: Conteúdo do pacote
O pacote `specloop` SHALL conter `bin/specloop.mjs`, o CLI, os caminhos `managed` e os modelos de `docs/agents`, e SHALL NOT conter `scripts/test`, `scripts/benchmark`, `openspec/specs` nem `openspec/changes`. SHALL não ter dependências.

#### Scenario: pacote contem so o permitido
- **ID:** SL-010
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** `npm pack --dry-run --json` roda na raiz
- **THEN** a lista tem `bin/specloop.mjs` e todos os `managed`, não tem nenhum caminho de `scripts/test`, `scripts/benchmark`, `openspec/specs` ou `openspec/changes`, e `package.json` não declara `dependencies`

### Requirement: Uma forma de instalar e atualizar
As skills `new-project`, `template-update` e `template-migrate` SHALL delegar ao CLI (`init`, `update` e `adopt`) e SHALL NOT fazer `git fetch` nem clone do repositório do framework.

#### Scenario: skills delegam ao CLI
- **ID:** SL-017
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** as skills `new-project`, `template-update` e `template-migrate` são lidas
- **THEN** cada uma chama o comando correspondente de `specloop` e nenhuma contém `git fetch` ou `git clone` do framework
