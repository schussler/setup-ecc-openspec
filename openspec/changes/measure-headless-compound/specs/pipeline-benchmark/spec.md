## ADDED Requirements

### Requirement: Cenário a partir do arquivamento
O runner SHALL ter o cenário `archive-only`. Ele parte de um snapshot com a change implementada e o gate de implementação aprovado, instala o toolset atual do template e roda só o passo `spec-archive`. Depois verifica a implementação, o arquivamento e o escopo.

#### Scenario: archive-only roda so o spec-archive
- **WHEN** o cenário `archive-only` roda com um `claude` simulado
- **THEN** a única skill invocada em cada execução é `spec-archive`, e a skill instalada é a do template atual

### Requirement: Métricas de negação
Cada passo SHALL registrar `compound_denials`: o número de comandos negados que usam `;`, `&&`, `||`, `$?`, `$(`, crase ou `cd`. Cada execução SHALL registrar `stopped_after_denial`: verdadeiro quando houve negação e o gate do passo não passou. O resumo SHALL trazer a média de `compound_denials` por execução e a contagem de `stopped_after_denial`.

#### Scenario: negacoes de comando composto sao contadas
- **WHEN** um passo tem negações de `node a; echo $?`, `cd x && ls` e `touch y`
- **THEN** `compound_denials` é 2

#### Scenario: execucao que para apos negacao e marcada
- **WHEN** uma execução teve negação e o gate de arquivamento não passou
- **THEN** `stopped_after_denial` é verdadeiro e entra na contagem do resumo

### Requirement: Critérios de aceite da tarefa
Uma tarefa SHALL poder declarar `acceptance`, com os campos opcionais `gate_pass_count`, `max_stopped_after_denial`, `max_compound_denials_mean` e `max_out_of_scope`. O relatório SHALL avaliar cada critério, com valor, limiar e resultado, e trazer um veredito `accepted` verdadeiro somente se todos passarem.

#### Scenario: relatorio avalia os criterios de aceite
- **WHEN** a tarefa exige o arquivamento aprovado em 10 execuções e só 9 passaram
- **THEN** o critério `gate_pass_count.archive` reprova e `accepted` é falso
