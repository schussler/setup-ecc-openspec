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

### Requirement: Preservação do histórico legado
A migração do estado de uma execução legada SHALL preservar cada tentativa antiga. A tabela de gates do `docs/agents/issue-tracker.md` SHALL ser importada como histórico com `source: "legacy-markdown"`, e NOT SHALL contar como aprovação. Nenhuma aprovação artificial SHALL ser criada. Antes de importar, a migração SHALL copiar o estado legado original para um diretório de cópia pré-migração.

#### Scenario: migracao preserva historico sem aprovacao artificial
- **ID:** PM-001
- **Revisão:** 1
- **WHEN** a migração importa uma linha da tabela de gates com veredito `pass`
- **THEN** a linha fica no histórico com `source: "legacy-markdown"` e a change não ganha aprovação válida

#### Scenario: migracao copia o estado legado antes de importar
- **ID:** PM-002
- **Revisão:** 1
- **WHEN** a migração começa numa execução legada
- **THEN** o estado original é copiado para o diretório de cópia pré-migração antes de qualquer gravação

### Requirement: Contagem conservadora de correções
Na migração, uma correção SHALL ser contada somente quando um `retry` é seguido de nova tentativa. Avaliação de gate SHALL NOT ser equiparada a correção. Quando os contadores não puderem ser reconstruídos, a migração SHALL registrar `counters_certain: false`.

#### Scenario: avaliacao de gate nao e contada como correcao na migracao
- **ID:** PM-003
- **Revisão:** 1
- **WHEN** o histórico tem três avaliações, dois `retry` e apenas um deles seguido de nova tentativa
- **THEN** a migração registra uma correção identificável e não três

### Requirement: Baseline da migração sem reconstrução histórica
A descoberta atual de casos de teste SHALL criar a baseline da migração. A migração SHALL NOT reconstruir a baseline histórica e SHALL NOT produzir aprovação retroativa.

#### Scenario: baseline da migracao nao reconstroi o historico
- **ID:** PM-004
- **Revisão:** 1
- **WHEN** a migração cria a baseline a partir dos casos atuais
- **THEN** a baseline registra a data da migração, e nenhuma aprovação anterior passa a valer

### Requirement: Change arquivada inalterada
A migração SHALL NOT alterar change arquivada.

#### Scenario: change arquivada permanece inalterada
- **ID:** PM-005
- **Revisão:** 1
- **WHEN** a migração roda com change arquivadas no repositório
- **THEN** os arquivos das change arquivadas não mudam

### Requirement: Evidência antiga exige revalidação
Evidência anterior à migração SHALL ser tratada como insuficiente para arquivamento. A change que a usa SHALL passar por nova validação final antes de arquivar.

#### Scenario: evidencia antiga exige revalidacao
- **ID:** PM-006
- **Revisão:** 1
- **WHEN** uma change ativa tem evidência anterior à migração
- **THEN** o `spec-archive` exige nova validação final antes de arquivar

### Requirement: Migração idempotente e interrompível
A migração do estado SHALL ser aditiva e idempotente. Se for interrompida, reexecutá-la SHALL completar o que faltou sem repetir efeitos já aplicados, e o relatório SHALL orientar a recuperação.

#### Scenario: migracao interrompida completa na reexecucao
- **ID:** PM-007
- **Revisão:** 1
- **WHEN** a migração é interrompida depois de importar metade do histórico e é reexecutada
- **THEN** o histórico final tem cada linha uma única vez e o relatório indica a recuperação

### Requirement: Modo não misturado
A migração SHALL mudar o modo da execução de `legacy` para `runner` em um único passo, depois de copiar a evidência, importar o histórico e gravar o checkpoint de migração. Uma execução SHALL NOT operar nos dois modos.

#### Scenario: execucao migrada nao aceita escrita legada
- **ID:** PM-008
- **Revisão:** 1
- **WHEN** a execução já está em modo `runner` e a CLI legada tenta escrever `gates.json`
- **THEN** a escrita é recusada com `mode_mismatch`

### Requirement: Recuperação sem rollback transparente
A recuperação de uma execução já migrada SHALL restaurar a partir da cópia pré-migração somente com autorização explícita e registro manual. A recuperação SHALL preservar evidências e consumo acumulado, e o relatório SHALL declarar que o rollback não é transparente.

#### Scenario: rollback de execucao migrada exige autorizacao explicita
- **ID:** PM-009
- **Revisão:** 1
- **WHEN** o humano pede a restauração da cópia pré-migração de uma execução migrada
- **THEN** a restauração só ocorre com autorização registrada, e o consumo acumulado continua no histórico

### Requirement: Migração de checks.test_report com preservação
A migração de `checks.test_report` em projeto existente SHALL converter `checks.test` em string para objeto com `suite`, SHALL preservar os valores já definidos localmente em `checks`, e SHALL recusar formato incompatível sem alterar arquivos. Esta regra é o critério de marcar a tarefa 12.3.

#### Scenario: migracao de checks.test_report preserva a configuracao local e recusa formato incompativel
- **ID:** PM-010
- **Revisão:** 1
- **WHEN** a migração roda em projeto existente com `checks.test` em string, ou em projeto que já define localmente valores de `checks`, ou com `checks.test_report.format` fora de `tap`
- **THEN** (a) `checks.test` em string é convertido para objeto com `suite`, e `checks.test_report` é criado com `format: tap`; (b) valores de `checks` já definidos localmente não são sobrescritos, e cada diferença preservada é reportada; (c) formato incompatível é recusado com `config_error` que nomeia `checks.test_report.format`, e nenhum arquivo é alterado

### Requirement: Restauração manual sem reversão transparente
A restauração manual de uma execução migrada SHALL seguir o procedimento `manual_rollback` de `design.md` (D32): pré-condição de hash, decisão humana com terminal interativo, restauração por comando humano, marca de restauração e reconciliação das reservas abertas antes de continuar. O histórico de consumo SHALL permanecer e o relatório SHALL declarar que a restauração não é transparente.

#### Scenario: restauracao manual marca o estado e reconcilia antes de continuar
- **ID:** PM-011
- **Revisão:** 1
- **WHEN** o humano executa a restauração manual, a partir da cópia pré-migração com hash conferido, de uma execução migrada que tem reservas abertas
- **THEN** o `run-state.json` traz o campo `restored` com origem, hash anterior e hash atual, o consumo acumulado continua no histórico, nenhuma chamada paga inicia antes da reconciliação das reservas abertas, e o relatório declara que a restauração não é transparente
