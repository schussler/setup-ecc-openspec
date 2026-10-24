## MODIFIED Requirements

### Requirement: Pipeline de quatro passos
O pipeline SHALL ser `spec-create` → (`spec-accept`, pelo runner) → `spec-implement` → `spec-archive` → `pr`. Os passos `spec-*` SHALL ser conduzidos pelo runner quando executados de forma autônoma, e SHALL delegar aos comandos `/opsx:*` quando executados de forma supervisionada, sem duplicar a lógica desses comandos. Nenhum gate SHALL ser pulado, nem em modo headless. A política comum é `.claude/harness/policy.md`.

#### Scenario: skills spec delegam ao opsx
- **ID:** SP-001
- **Revisão:** 2
- **WHEN** as skills `spec-create`, `spec-implement` e `spec-archive` são lidas
- **THEN** cada uma delega ao comando `/opsx:*` correspondente, declara que o runner conduz a execução autônoma, e declara que os gates não podem ser pulados

#### Scenario: runner so assume execucoes apos o marco de adocao
- **ID:** SP-009
- **Revisão:** 1
- **WHEN** o marco de adoção do runner não está registrado no `issue-tracker.md` por decisão humana
- **THEN** as skills permanecem em modo `legacy` e nenhuma execução é atribuída ao runner
### Requirement: Criação de spec
O `spec-create` SHALL conduzir a entrevista de `harness-interview` e produzir o contrato da change. Em `--headless`, SHALL assumir premissas sem aguardar resposta e registrar cada uma na seção `## Premissas` da proposta, sem apresentá-las como decisões aprovadas. Quando `grill-me` não estiver disponível, SHALL usar o roteiro embutido, que existe no diretório da skill.

#### Scenario: spec-create headless registra premissas
- **ID:** SP-002
- **Revisão:** 2
- **WHEN** a skill `spec-create` é lida
- **THEN** ela define o modo `--headless` e exige a seção `## Premissas` na proposta, sem tratá-las como decisões aprovadas

#### Scenario: spec-create usa fallback sem grill-me
- **ID:** SP-003
- **Revisão:** 2
- **WHEN** `grill-me` não está disponível
- **THEN** a skill aponta para o roteiro de perguntas embutido, que existe no diretório da skill

### Requirement: Implementação com TDD
O `spec-implement` SHALL implementar tarefa por tarefa em Red → Green → Refactor, com RED válido conforme `harness-acceptance`. SHALL registrar o baseline de casos de teste e pedir ao runner a avaliação do gate de implementação, corrigindo até o veredito `pass` ou `stop`. SHALL NOT alterar contrato, testes de aceitação, gates ou política. Em execução `legacy`, SHALL usar a CLI do gate com `--legacy-write`.

#### Scenario: spec-implement segue red green refactor
- **ID:** SP-004
- **Revisão:** 2
- **WHEN** a skill `spec-implement` é lida
- **THEN** ela exige teste falhando por comportamento antes do código, registra o baseline de casos e pede ao runner a avaliação do gate

### Requirement: Arquivamento com gate
O `spec-archive` SHALL pedir ao runner a validação final antes de arquivar. Somente uma aprovação válida, conforme `harness-evidence`, SHALL permitir o arquivamento. Antes de mover a change, o runner SHALL gravar o resumo durável e o checkpoint de arquivamento dentro da própria change. Depois SHALL arquivar com `openspec archive` e sincronizar as specs com `openspec-sync-specs`. O diretório local da execução SHALL ser movido para `.harness-local/archive/`.

#### Scenario: spec-archive roda gate antes de arquivar
- **ID:** SP-005
- **Revisão:** 2
- **WHEN** a skill `spec-archive` é lida
- **THEN** a validação final do runner vem antes do arquivamento, e a skill cita `openspec-sync-specs`

#### Scenario: arquivamento grava o resumo antes de mover a change
- **ID:** SP-007
- **Revisão:** 1
- **WHEN** a validação final é aprovada
- **THEN** `evidence-summary.json` e o checkpoint de arquivamento são gravados dentro da change antes de `openspec archive`

### Requirement: Handoff
A skill `handoff` SHALL gerar a visão operacional a partir de `run-state.json` e SHALL acrescentar ao `docs/agents/issue-tracker.md` apenas o contexto narrativo do ponto de restauração. Contadores e vereditos SHALL NOT ser escritos à mão.

#### Scenario: handoff grava ponto de restauracao
- **ID:** SP-006
- **Revisão:** 2
- **WHEN** a skill `handoff` é lida
- **THEN** ela lê o estado para os contadores e vereditos, e grava no `issue-tracker.md` só o contexto e o próximo passo

#### Scenario: skills mantem o modo legado ate a migracao
- **ID:** SP-008
- **Revisão:** 1
- **WHEN** uma skill `spec-*` roda numa execução de modo `legacy`
- **THEN** ela usa as CLIs de gate com `--legacy-write`, e numa execução de modo `runner` ela pede ao runner

## ADDED Requirements

### Requirement: Percurso integrado com simulador
O percurso integrado do runner SHALL ser verificado com o simulador `claude`, sem chamada ao modelo, cobrindo iniciar, falhar, corrigir, parar, autorizar retomada, reconciliar interrupção, validar, gerar o checkpoint e o relatório de arquivamento. O relatório de arquivamento SHALL NOT ser gerado antes da validação aprovada.

#### Scenario: percurso integrado de sucesso gera checkpoint e relatório de arquivamento
- **ID:** SP-010
- **Revisão:** 1
- **WHEN** o percurso integrado roda com o simulador: a execução inicia, a primeira avaliação falha, a correção é feita e a validação final passa
- **THEN** a execução chega a aprovada, o checkpoint de arquivamento e o relatório de arquivamento são gravados antes de arquivar, e nenhuma chamada ao modelo ocorre

#### Scenario: percurso integrado retoma apos interrupcao com reconciliacao
- **ID:** SP-011
- **Revisão:** 1
- **WHEN** o percurso integrado roda com o simulador: a execução para em `awaiting_decision`, uma invocação simulada é interrompida, o humano autoriza a retomada, a interrupção é reconciliada, e depois a correção, a validação e a geração do checkpoint e do relatório acontecem
- **THEN** a reserva interrompida permanece aberta até a reconciliação, a retomada preserva o `execution_id` e o consumo acumulado, e o relatório de arquivamento só é gerado depois da validação aprovada
