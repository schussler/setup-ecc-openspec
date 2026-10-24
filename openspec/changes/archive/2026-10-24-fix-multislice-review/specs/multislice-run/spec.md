## MODIFIED Requirements

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

## ADDED Requirements

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
