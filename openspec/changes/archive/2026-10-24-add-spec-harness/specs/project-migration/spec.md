## ADDED Requirements

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
