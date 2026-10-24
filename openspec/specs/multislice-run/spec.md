# multislice-run Specification

## Purpose
TBD - created by archiving change add-multislice-run. Update Purpose after archive.

## Requirements

### Requirement: Fatias declaradas em tasks.md
O runner SHALL ler as fatias de `tasks.md` pelo cabeçalho `## Fatia: <nome>`, na ordem do arquivo, e SHALL manter o modo legado quando nenhuma fatia for declarada.

#### Scenario: fatias declaradas são lidas em ordem
- **ID:** MS-001
- **Revisão:** 1
- **WHEN** `tasks.md` tem `## Fatia: primeira` e depois `## Fatia: segunda`
- **THEN** a lista de fatias é `["primeira", "segunda"]`

#### Scenario: sem fatia declarada há uma fatia legada
- **ID:** MS-002
- **Revisão:** 1
- **WHEN** `tasks.md` não tem cabeçalho `## Fatia:`
- **THEN** a lista é vazia e o runner usa a fatia `implement`

### Requirement: Execução sequencial com aprovação por fatia
O runner SHALL executar uma fatia por vez, SHALL enviar a tarefa da fatia na invocação e SHALL gravar a aprovação com o nome da fatia.

#### Scenario: segunda fatia só começa depois da primeira aprovada
- **ID:** MS-003
- **Revisão:** 1
- **WHEN** a primeira fatia é aprovada pelo gate
- **THEN** a segunda fatia é invocada com `--task segunda` e a primeira não é invocada de novo

#### Scenario: fatia que falha recebe correção e passa
- **ID:** MS-004
- **Revisão:** 1
- **WHEN** a segunda fatia falha no gate na primeira tentativa
- **THEN** a correção é pedida à segunda fatia e a aprovação dela é gravada com `task: segunda`

### Requirement: Retomada sem repetir fatias aprovadas
O runner SHALL retomar a execução sem nova invocação das fatias já aprovadas.

#### Scenario: retomada pula a primeira fatia
- **ID:** MS-005
- **Revisão:** 1
- **WHEN** a execução é retomada com a primeira fatia aprovada e a segunda pendente
- **THEN** nenhuma invocação é feita para a primeira fatia e a segunda é a única invocada

### Requirement: Conclusão só com todas as fatias e validação final
A validação final SHALL recusar a conclusão enquanto houver fatia declarada sem aprovação.

#### Scenario: fatia pendente impede concluir
- **ID:** MS-006
- **Revisão:** 1
- **WHEN** a validação final é pedida com a segunda fatia sem aprovação
- **THEN** o resultado é `refused` com `pending_slices` contendo `segunda`, e a execução não é aprovada

#### Scenario: conclusão após todas as fatias
- **ID:** MS-007
- **Revisão:** 1
- **WHEN** todas as fatias declaradas estão aprovadas e a validação final passa
- **THEN** o resultado é `pass` e a execução é aprovada

### Requirement: Aprovação de fatia exige os cenários declarados
O gate de uma fatia SHALL exigir que os cenários declarados para ela passem, além da regra de casos antigos do gate de implementação.

#### Scenario: fatia só aprova com os próprios cenários
- **ID:** MS-008
- **Revisão:** 1
- **WHEN** a fatia declara `- Cenários: E2E-002` e o caso `[E2E-002]` ainda não passa
- **THEN** a fatia não é aprovada, mesmo com os casos antigos todos passando

### Requirement: Preflight antes da primeira chamada ao modelo
O runner SHALL verificar Git, identidade, adoção, perfil, checks, ferramenta e permissões antes de qualquer invocação, e SHALL recusar com a lista de itens bloqueados quando algum falhar.

#### Scenario: repositório sem commit base é bloqueado
- **ID:** MS-009
- **Revisão:** 1
- **WHEN** `run` é chamado num repositório sem commit
- **THEN** o resultado é `preflight_blocked` com o item `git_head` bloqueado, e nenhuma invocação é feita

### Requirement: Permissão negada é bloqueio operacional quando o gate reprova
O runner SHALL registrar negações de permissão da invocação só com o nome da ferramenta, e SHALL parar com `permission_denied`, sem correção, quando o gate reprovar uma fatia cuja invocação teve negações.

#### Scenario: negação com gate reprovado para sem correção
- **ID:** MS-010
- **Revisão:** 2
- **WHEN** a fatia reprova no gate e a invocação trouxe `permission_denials` não vazio
- **THEN** a parada é `permission_denied`, nenhuma correção é pedida e a fatia não é aprovada

#### Scenario: negação já recuperada pelo modelo não para a execução
- **ID:** MS-014
- **Revisão:** 1
- **WHEN** a invocação trouxe negações e o gate da fatia passa
- **THEN** a fatia é aprovada e a negação fica registrada como diagnóstico

#### Scenario: registro de negação sem conteúdo do comando
- **ID:** MS-022
- **Revisão:** 1
- **WHEN** a negação é registrada
- **THEN** o registro traz só o nome da ferramenta, sem nenhum trecho do comando

### Requirement: Aprovação de fatia não é reutilizada depois de mudança
O runner SHALL reavaliar uma fatia aprovada quando a impressão mudou, sem chamada ao modelo, e SHALL retirar a aprovação quando o cenário deixar de passar.

#### Scenario: mudança com cenário ainda válido mantém a aprovação
- **ID:** MS-011
- **Revisão:** 1
- **WHEN** a impressão mudou depois da aprovação e o cenário da fatia ainda passa
- **THEN** a aprovação é mantida com `revalidated_at`, sem invocação

#### Scenario: mudança que quebra o cenário retira a aprovação
- **ID:** MS-012
- **Revisão:** 1
- **WHEN** a impressão mudou e o cenário da fatia falha na reavaliação
- **THEN** a aprovação vai para `invalidated_slices` e a fatia é executada de novo

### Requirement: Conciliação de invocações e consumo
O runner SHALL conciliar invocações e custo entre fontes reais (estado, eventos e medição do relatório) antes de concluir, e SHALL impedir a conclusão quando houver divergência.

#### Scenario: contagens divergentes impedem a conclusão
- **ID:** MS-013
- **Revisão:** 2
- **WHEN** o contador ou a lista de invocações do estado diferem do número de eventos de invocação
- **THEN** a conclusão para com `reconciliation_mismatch`

#### Scenario: fontes de custo são conferidas por evento
- **ID:** MS-021
- **Revisão:** 1
- **WHEN** um evento de invocação paga não tem fonte de custo
- **THEN** a conciliação é divergente, sem comparar o relatório com os próprios eventos

### Requirement: Aprovação de fatia atômica e válida só para a impressão atual
O runner SHALL gravar a aprovação de fatia com a identidade da tarefa numa única escrita, e a validação final SHALL recusar aprovação cuja impressão não seja a atual.

#### Scenario: aprovação grava tarefa e impressão na mesma escrita
- **ID:** MS-016
- **Revisão:** 1
- **WHEN** uma fatia é aprovada
- **THEN** o registro traz `task` e a impressão no mesmo registro, sem escrita separada

### Requirement: Revalidação interrompida tem motivo explícito e é recuperável
O runner SHALL devolver `revalidation_interrupted` quando a revalidação não conclui, SHALL manter a aprovação antiga intocada, e SHALL retomar na execução seguinte.

#### Scenario: revalidação interrompida pelo prazo
- **ID:** MS-017
- **Revisão:** 1
- **WHEN** a revalidação de uma fatia passa do prazo do gate
- **THEN** o resultado traz `revalidation_interrupted`, nenhuma invalidação é gravada e nenhuma chamada ao modelo é feita

### Requirement: Correções contadas por fatia e gate
O runner SHALL contar as correções por fatia e gate, e SHALL acumular o total do change.

#### Scenario: uma fatia não consome o limite de outra
- **ID:** MS-018
- **Revisão:** 1
- **WHEN** a segunda fatia recebe uma correção
- **THEN** a contagem fica em `segunda:implement` e o total do change é acumulado em `corrections_total`

### Requirement: Identidade de cenário por igualdade exata
O runner SHALL casar um cenário com um caso só por igualdade exata do identificador entre colchetes.

#### Scenario: identificador quase igual não cumpre o cenário
- **ID:** MS-019
- **Revisão:** 1
- **WHEN** o caso se chama `[E2E-0010]` e o cenário é `E2E-001`
- **THEN** o cenário não é cumprido e a fatia não é aprovada

### Requirement: Negação e falha são medidas separadamente
O relatório SHALL separar invocações com negação de invocações que falharam, sem tratar negação recuperada como falha.

#### Scenario: negação recuperada não é falha
- **ID:** MS-020
- **Revisão:** 1
- **WHEN** uma invocação tem negação e termina com sucesso
- **THEN** o relatório conta a negação e a invocação como recuperada, sem contar falha
