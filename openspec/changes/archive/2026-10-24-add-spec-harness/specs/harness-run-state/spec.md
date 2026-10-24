## ADDED Requirements

### Requirement: Autoridade operacional única
O estado operacional de cada execução SHALL ficar em `.harness-local/<change>/run-state.json`, fora do Git. Somente o runner SHALL gravá-lo. Os gates, as skills e o agente SHALL NOT escrever nele. `gates.json`, `summary.md` e os relatórios locais SHALL ser visões derivadas com `derived_from_revision`.

#### Scenario: visao derivada desatualizada e regenerada
- **ID:** RS-002
- **Revisão:** 1
- **WHEN** `gates.json` tem `derived_from_revision` diferente da revisão do estado
- **THEN** o runner regenera a visão antes de usá-la

### Requirement: Esquema e revisão
O `run-state.json` SHALL ter `schema_version`, `policy_version`, `mode`, `revision` inteiro monotônico e a tripla de identidade. Cada gravação bem-sucedida SHALL incrementar `revision` em uma unidade.

#### Scenario: gravacao incrementa a revisao
- **ID:** RS-003
- **Revisão:** 1
- **WHEN** o runner grava uma transição válida
- **THEN** `revision` aumenta em uma unidade e o estado anterior fica em `run-state.json.prev`

### Requirement: Escrita atômica e recuperação
A gravação SHALL escrever num arquivo temporário do mesmo diretório, executar `fsync` e renomear sobre o destino. Se o estado principal estiver ilegível, o runner SHALL carregar `run-state.json.prev` e marcar `recovered: true`. Se nenhuma revisão for legível, o runner SHALL parar com `config_error` e SHALL NOT recriar o estado do zero.

#### Scenario: falha durante a escrita preserva a revisao anterior
- **ID:** RS-004
- **Revisão:** 1
- **WHEN** o processo é interrompido depois de gravar o temporário e antes do `rename`
- **THEN** o `run-state.json` continua com a revisão anterior íntegra

#### Scenario: interrupcao no meio da escrita recupera a revisao anterior
- **ID:** RS-005
- **Revisão:** 1
- **WHEN** `run-state.json` está truncado e `run-state.json.prev` está íntegro
- **THEN** o runner carrega `run-state.json.prev`, marca `recovered: true` e não cria estado novo

#### Scenario: estado ilegivel para com erro de configuracao
- **ID:** RS-006
- **Revisão:** 1
- **WHEN** `run-state.json` e `run-state.json.prev` são ilegíveis
- **THEN** o estado vira `config_blocked` com `stop_reason: config_error`, e nenhum arquivo de estado é recriado

### Requirement: Diário de reserva
Antes de iniciar uma invocação, o runner SHALL gravar a reserva e o `session_id` gerado por ele. Só depois SHALL iniciar o processo.

#### Scenario: reserva gravada antes do processo
- **ID:** RS-007
- **Revisão:** 1
- **WHEN** o runner prepara uma invocação
- **THEN** a revisão com a reserva e o `session_id` é gravada antes de qualquer processo `claude` ser criado

### Requirement: Identidade inequívoca
Cada estado, checkpoint, lock e diretório de evidência SHALL registrar `project_id`, `change`, `local_id` e `execution_id`. O `project_id` SHALL ser persistente, versionado em `.harness-project.json`, e independente do caminho absoluto. Divergência de `project_id` ou de `change` SHALL parar com `config_error`.

#### Scenario: identidade divergente para com erro de configuracao
- **ID:** RS-008
- **Revisão:** 1
- **WHEN** o checkpoint importado tem `change` diferente do estado local
- **THEN** o runner para com `config_error` e não grava nada

#### Scenario: clone ou worktree preserva a identidade do projeto
- **ID:** RS-018
- **Revisão:** 1
- **WHEN** o repositório é clonado ou movido para outro caminho, com o mesmo `.harness-project.json`
- **THEN** o `project_id` continua o mesmo, o `local_id` muda e a importação de checkpoint segue exigindo reconciliação

#### Scenario: projeto derivado recebe identidade nova
- **ID:** RS-019
- **Revisão:** 1
- **WHEN** um projeto derivado é criado pelo `new-project` a partir do template
- **THEN** o `.harness-project.json` recebe um `project_id` novo e o id do template não é herdado
### Requirement: Bloqueio contra dois runners
O runner SHALL criar o lock `<git-common-dir>/harness/locks/<change>.lock` de forma exclusiva antes de qualquer gravação. Se o lock válido existir, a partida SHALL ser bloqueada com o motivo `lock_held`, sem alterar o estado da change, em qualquer worktree do clone. O lock SHALL vencer somente por heartbeat (`lock_stale_seconds`), nunca por origem, e nunca SHALL ser removido automaticamente.

#### Scenario: segundo runner na mesma change e recusado
- **ID:** RS-009
- **Revisão:** 1
- **WHEN** um lock válido da mesma change existe e outro runner é iniciado em outro worktree
- **THEN** o segundo runner para com `lock_held` e não grava estado

#### Scenario: lock vencido exige decisao humana
- **ID:** RS-010
- **Revisão:** 1
- **WHEN** o heartbeat passou de `lock_stale_seconds`
- **THEN** o estado vira `awaiting_decision` com `stop_reason: stale_lock`, e o lock não é removido pelo runner

#### Scenario: lock de outro host com heartbeat recente continua valendo
- **ID:** RS-021
- **Revisão:** 1
- **WHEN** o lock foi criado por outro host e o heartbeat está dentro de `lock_stale_seconds`
- **THEN** o lock é válido, a partida é bloqueada com `lock_held` e o estado não muda

#### Scenario: lock ilegivel e bloqueado e preservado para diagnostico
- **ID:** RS-022
- **Revisão:** 1
- **WHEN** o arquivo do lock existe mas não pode ser lido, ou não tem heartbeat válido
- **THEN** a partida é bloqueada com `lock_held` e `stop_reason: lock_unreadable`, o arquivo é preservado para diagnóstico, e nenhuma liberação ocorre sem confirmar que o arquivo não mudou desde a leitura. O `lock_sha256` identifica o conteúdo observado e não é prova de autoria

#### Scenario: template nao sobrescreve a identidade do projeto
- **ID:** RS-023
- **Revisão:** 1
- **WHEN** o template é atualizado com `template-update`
- **THEN** `.harness-project.json` não é sobrescrito, e o `project_id` do projeto permanece o mesmo

#### Scenario: retomada da mesma execucao preserva o execution_id
- **ID:** RS-024
- **Revisão:** 1
- **WHEN** o runner retoma a mesma execução interrompida
- **THEN** o `execution_id` é o mesmo do estado anterior e o `invocation_id` das invocações passadas não é reutilizado
#### Scenario: lock de outra change nao bloqueia esta execucao
- **ID:** RS-016
- **Revisão:** 1
- **WHEN** outra change do mesmo repositório tem lock válido
- **THEN** esta execução prossegue, porque o lock é por change e não por repositório

#### Scenario: liberacao de lock vencido exige registro humano
- **ID:** RS-017
- **Revisão:** 1
- **WHEN** o lock vencido precisa ser liberado
- **THEN** um humano registra `lock_release` em `authorizations.json` citando o `execution_id` do lock; o runner valida identidade, vencimento pela política e a autorização, relê o arquivo e só então remove o lock; se houver reserva aberta, a execução vai a `reconciliation_required`

#### Scenario: lock substituido antes da remocao nao e removido
- **ID:** RS-020
- **Revisão:** 1
- **WHEN** o humano registrou `lock_release` para um lock vencido, mas o arquivo foi renovado ou substituído entre a validação e a remoção
- **THEN** o runner relê o lock, detecta a diferença de conteúdo, recusa a remoção e mantém o lock atual
### Requirement: Checkpoint somente nos marcos
O runner SHALL gravar `openspec/changes/<change>/checkpoint.json` somente nos marcos `contract_approved`, `slice_approved` (uma vez por fatia) e `archived`. Nenhuma invocação, correção ou gate SHALL gerar checkpoint.

#### Scenario: checkpoint nao gera diff por invocacao
- **ID:** RS-011
- **Revisão:** 1
- **WHEN** o runner executa três invocações dentro de uma fatia
- **THEN** o `checkpoint.json` não muda entre elas

### Requirement: Conteúdo do checkpoint
O checkpoint SHALL conter `checkpoint_seq`, a tripla de identidade, o hash do contrato, a rodada atual, os contadores locais por gate, o consumo acumulado (gasto conhecido, gasto estimado e número de chamadas com custo desconhecido), as reservas abertas, o `attempt_id`, os ids das autorizações vigentes e o hash da evidência aprovada. Evidência parcial de fatia SHALL ser marcada `parcial, não aprovada` (D16).

#### Scenario: checkpoint preserva consumo, reservas e rodada
- **ID:** RS-012
- **Revisão:** 1
- **WHEN** um checkpoint de fatia é gravado com uma reserva aberta e duas chamadas de custo desconhecido
- **THEN** o checkpoint registra a reserva aberta, o número 2 de chamadas com custo desconhecido e a rodada atual

### Requirement: Importação exige reconciliação
Importar um checkpoint SHALL levar a execução a `awaiting_decision` com `stop_reason: reconciliation_required`. Nenhuma chamada paga SHALL iniciar antes de um registro de reconciliação com consumo observado, decisão sobre cada reserva aberta, evidências a revalidar, aprovador e data.

#### Scenario: troca de maquina nao reinicia limites
- **ID:** RS-013
- **Revisão:** 1
- **WHEN** o checkpoint de outra máquina é importado com consumo acumulado de US$ 10
- **THEN** o consumo de US$ 10 continua no estado, e a execução para em `reconciliation_required`

#### Scenario: chamada paga bloqueada sem reconciliacao
- **ID:** RS-014
- **Revisão:** 1
- **WHEN** uma execução importada tenta iniciar uma invocação sem registro de reconciliação
- **THEN** a invocação não inicia e nenhum custo é reservado

### Requirement: Modo imutável
Cada execução SHALL ter `mode` definido na criação, `legacy` ou `runner`, que não muda. O runner SHALL recusar com `mode_mismatch` uma execução cujo `gates.json` tenha sido escrito pela CLI legada.

#### Scenario: campo de modo alterado depois da criacao e recusado
- **ID:** RS-015
- **Revisão:** 1
- **WHEN** o campo `mode` de uma execução existente é alterado
- **THEN** o runner para com `config_error` e não grava o estado
