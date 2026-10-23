# project-migration Specification

## Purpose
Migração explícita, confirmada item a item e só aditiva, dos caminhos `owned` e dos `managed` novos do template para projetos derivados que já existem.

## Requirements

### Requirement: Plano sem escrita
O comando `plan` SHALL listar cada item da migração com o estado (`needed`, `done` ou `conflict`) e os detalhes, sem escrever nenhum arquivo.

#### Scenario: plano de migracao nao escreve nada
- **WHEN** `plan` roda num projeto derivado antigo
- **THEN** ele lista os itens `managed`, `docs-agents`, `checks`, `settings` e `claude-md`, e nenhum arquivo do projeto muda

### Requirement: Escrita só com confirmação
O comando `apply` SHALL escrever somente os itens passados em `--items`. Sem itens, não escreve nada.

#### Scenario: migracao sem itens confirmados nao altera arquivos
- **WHEN** `apply` roda sem `--items`
- **THEN** nenhum arquivo do projeto muda

### Requirement: Itens só aditivos
Cada item SHALL apenas adicionar. `docs-agents` copia os modelos só se `docs/agents/` não existir. `checks` nunca sobrescreve um comando não vazio e grava vazio o que não foi confirmado. `settings` só acrescenta regras a `permissions.allow`. `claude-md` só insere ou atualiza o conteúdo entre os marcadores do bloco. `managed` acrescenta entradas aos manifestos e copia só caminhos ausentes.

#### Scenario: docs agents so e copiado quando nao existe
- **WHEN** o projeto já tem `docs/agents/`
- **THEN** o item `docs-agents` fica `done` e nenhum arquivo dele muda

#### Scenario: checks confirmados sao gravados e o resto fica vazio
- **WHEN** `apply` recebe `checks` com só o comando de teste confirmado
- **THEN** `checks.test` recebe o comando, e `checks.lint` e `checks.typecheck` ficam vazios

#### Scenario: checks existentes nao sao sobrescritos
- **WHEN** o projeto já tem `checks.test` preenchido
- **THEN** o valor existente é mantido

#### Scenario: settings recebe so adicoes
- **WHEN** o projeto já tem regras próprias em `permissions.allow`
- **THEN** todas continuam lá, na mesma ordem, seguidas das regras novas do template

#### Scenario: CLAUDE.md recebe blocos marcados preservando o resto
- **WHEN** `claude-md` é aplicado a um `CLAUDE.md` sem marcadores
- **THEN** os blocos `agents-context` e `pipeline` aparecem entre os marcadores, e toda linha original continua presente, na mesma ordem

#### Scenario: managed novos do template sao adicionados ao manifesto
- **WHEN** o template tem `scripts/gates` em `managed` e o projeto não
- **THEN** o manifesto do projeto passa a listar `scripts/gates`, e os arquivos são copiados

### Requirement: Detecção de checks
O `plan` SHALL propor comandos de verificação a partir de `package.json` (scripts), `pyproject.toml` e `go.mod`, sem gravá-los.

#### Scenario: checks detectados a partir do package json
- **WHEN** o projeto tem `package.json` com os scripts `test`, `lint` e `typecheck`
- **THEN** o plano propõe `npm test`, `npm run lint` e `npm run typecheck`

#### Scenario: checks detectados para python e go
- **WHEN** o projeto tem `pyproject.toml` ou `go.mod`
- **THEN** o plano propõe `pytest` ou `go test ./...` como teste

### Requirement: Idempotência e preservação
Aplicar a migração duas vezes SHALL deixar o projeto igual ao resultado da primeira vez. Nenhum conteúdo original do projeto SHALL ser perdido: cada linha original de arquivos de texto continua presente e em ordem, e cada chave e valor original de JSON continua presente.

#### Scenario: migracao e idempotente
- **WHEN** `apply` roda duas vezes com os mesmos itens
- **THEN** a segunda execução não altera nenhum arquivo

#### Scenario: nada do projeto e perdido na migracao
- **WHEN** todos os itens são aplicados numa cópia de um projeto derivado real
- **THEN** todo conteúdo original continua presente

#### Scenario: projeto migrado roda os gates sem erro de configuracao
- **WHEN** a cópia migrada tem os `checks` confirmados
- **THEN** `implement-gate.mjs baseline` e `score` rodam sem veredito `error`

### Requirement: Skill com confirmação por item
A skill `template-migrate` SHALL mostrar o plano, pedir confirmação para cada item (e para cada comando de `checks`) e chamar `apply` só com os itens confirmados. Ela nunca roda script do clone do template.

#### Scenario: template-migrate pede confirmacao por item
- **WHEN** a skill é lida
- **THEN** ela roda `plan`, pede confirmação por item, chama `apply --items` só com os confirmados e usa o script local da skill
