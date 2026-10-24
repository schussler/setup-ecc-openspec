# harness-acceptance Specification

## Purpose
TBD - created by archiving change add-spec-harness. Update Purpose after archive.

## Requirements

### Requirement: Agente de aceitação
A skill `spec-accept` SHALL ser executada pelo runner, com entradas explícitas: contrato, interfaces aprovadas e convenções de teste. Ela SHALL produzir testes vinculados aos IDs de cenário. Ela SHALL NOT alterar o contrato para acomodar os testes. Alterações posteriores nos testes de aceitação SHALL exigir procedimento explícito com justificativa e registro. A separação entre aceitação e implementação é regra do fluxo, não isolamento técnico.

#### Scenario: spec-accept nao altera o contrato
- **ID:** AC-001
- **Revisão:** 1
- **WHEN** um teste de aceitação não consegue ser escrito como o cenário descreve
- **THEN** a skill para e registra a divergência, sem editar `specs/`

#### Scenario: alteracao de teste de aceitacao exige registro
- **ID:** AC-002
- **Revisão:** 1
- **WHEN** um teste de aceitação muda depois de aprovado
- **THEN** o runner exige justificativa registrada, e sem o registro o estado vira `forbidden_action_stopped`

### Requirement: Vínculo por ID de cenário
Cada teste de aceitação SHALL conter o ID do cenário no nome, no formato `[ID]`. Os resultados SHALL ser coletados por caso executado, a partir da saída TAP capturada pelo runner. Testes sem ID de cenário SHALL NOT satisfazer critério. Busca por substring em arquivos ou por nome de arquivo SHALL NOT ser usada.

#### Scenario: caso sem ID nao satisfaz cenario
- **ID:** AC-003
- **Revisão:** 1
- **WHEN** o nome de um teste contém o título do cenário mas não o seu ID
- **THEN** o cenário fica como `missing`

### Requirement: Casos ignorados e não executados
Casos `skip`, `todo`, filtrados ou não executados SHALL NOT satisfazer critério obrigatório. Um cenário obrigatório sem caso `pass` SHALL reprovar a validação.

#### Scenario: teste obrigatorio ignorado nao satisfaz criterio
- **ID:** AC-005
- **Revisão:** 1
- **WHEN** o único caso de um cenário obrigatório tem `# SKIP` no TAP
- **THEN** o cenário fica como `skip` e a validação final reprova

### Requirement: Filtro detectado por identidade
A validação SHALL comparar o conjunto de IDs esperados (cenários com forma `teste` aplicáveis e IDs do manifesto de aceitação) com o conjunto de IDs executados, e NOT SHALL usar apenas a contagem total. Um ID esperado ausente da saída reprova, mesmo que a contagem total seja igual à esperada.

#### Scenario: contagem igual com identidade diferente reprova
- **ID:** AC-015
- **Revisão:** 1
- **WHEN** a saída tem o mesmo número de casos que o esperado, mas `[AC-012]` não aparece e `[AC-099]` aparece
- **THEN** a validação reprova com `missing` para `AC-012`

### Requirement: Relatório de testes com comando declarado
O projeto SHALL declarar `checks.test_report` com `command`, `format` e `suite` (identificador da suíte obrigatória). `checks.test` SHALL referenciar a mesma `suite`. O runner SHALL executar somente `checks.test_report.command`, capturar a saída e o código de saída, e registrar o hash do comando. O runner SHALL NOT acrescentar flags de relatório por detecção de stack.

#### Scenario: formato sem suporte bloqueia com diagnostico
- **ID:** AC-016
- **Revisão:** 1
- **WHEN** `checks.test_report.format` é `junit` na v1
- **THEN** o runner para com `config_error` e a mensagem nomeia `checks.test_report.format`, lista os formatos suportados e mostra um exemplo

#### Scenario: identidade de suite divergente para com erro de configuracao
- **ID:** AC-014
- **Revisão:** 1
- **WHEN** `checks.test` e `checks.test_report` declaram `suite` diferentes
- **THEN** o runner para com `config_error` e não executa a suíte

#### Scenario: saida TAP do node e reconhecida por caso
- **ID:** AC-017
- **Revisão:** 1
- **WHEN** a saída TAP de uma suíte do Node 22 ou superior traz casos `ok`, `not ok` e `# SKIP`
- **THEN** cada caso recebe o status `pass`, `fail` ou `skip` correspondente, com a fonte `tap`

### Requirement: Verificação por check declarado
Um cenário com forma `check:<nome>` SHALL ser satisfeito pelo resultado do check `<nome>` declarado em `checks`, executado com código de saída zero na validação final. A forma SHALL exigir justificativa e aprovação humana registradas.

#### Scenario: cenario verificado por check passa com saida zero
- **ID:** AC-018
- **Revisão:** 1
- **WHEN** um cenário declara `check:lint` e o lint termina com código zero na validação final
- **THEN** o cenário fica como `pass` com a fonte `check:lint`

### Requirement: Revisão de cenário e suficiência
Cada caso SHALL registrar o `scenario_revision` e o `file_hash` da execução. A aprovação SHALL exigir `scenario_revision` igual à revisão atual do cenário. Se a revisão mudou e o `file_hash` não mudou, a aprovação SHALL exigir justificativa de suficiência aprovada por humano. A aprovação SHALL voltar somente após as verificações de D29 (EV-014).

#### Scenario: caso executado em revisao antiga reprova
- **ID:** AC-019
- **Revisão:** 1
- **WHEN** o cenário está na revisão 2 e o caso foi executado com a revisão 1
- **THEN** o cenário fica como `invalid_evidence`, o caso não conta como evidência, e a validação não aprova até a reexecução e a reaceitação (EV-014)

#### Scenario: teste inalterado exige justificativa de suficiencia
- **ID:** AC-020
- **Revisão:** 1
- **WHEN** um cenário muda de revisão e o `file_hash` do caso continua igual, sem justificativa
- **THEN** a validação não aprova até que a justificativa de suficiência seja registrada por autorização `revision` (D29) e o caso seja reexecutado com `pass` na revisão atual

### Requirement: Condição de não aplicabilidade avaliada pelo runner
Um cenário com condição de disparo SHALL ser não aplicável somente quando o runner avaliar a condição como falsa. Quando a condição for verdadeira, o cenário SHALL ser exigido normalmente. As condições suportadas são `quando houver formato <X>` e `quando houver chamada paga`, conforme D30.

#### Scenario: condicao verdadeira torna o cenario obrigatorio
- **ID:** AC-021
- **Revisão:** 1
- **WHEN** a condição "quando houver formato tap" é verdadeira porque o projeto declara `format: tap`
- **THEN** o cenário é obrigatório e sua ausência reprova a validação

### Requirement: RED com classificação de falha
Antes de implementar comportamento novo, o runner SHALL registrar a falha esperada. A falha SHALL ser classificada como `behavioral` (asserção) ou `environment` (módulo não encontrado, erro de sintaxe, erro de importação ou de configuração). Só falha `behavioral` SHALL contar como RED válido.

#### Scenario: erro de modulo nao conta como RED
- **ID:** AC-007
- **Revisão:** 1
- **WHEN** um teste novo falha com `Cannot find module`
- **THEN** a falha é classificada como `environment` e o RED não é aceito

#### Scenario: asserção falhando conta como RED
- **ID:** AC-008
- **Revisão:** 1
- **WHEN** um teste novo falha com uma asserção de valor esperado
- **THEN** a falha é classificada como `behavioral` e o RED é aceito

### Requirement: Comportamento pré-existente
Antes de qualquer alteração em código existente, o runner SHALL executar os testes relevantes e registrar os que já passam como `preexisting_pass`. Quando não houver teste adequado, o `spec-accept` SHALL criar teste de caracterização que passe no código atual. Falha NÃO SHALL ser fabricada para cumprir o RED.

#### Scenario: caracterizacao passa no codigo atual
- **ID:** AC-009
- **Revisão:** 1
- **WHEN** o código existente não tem teste para um comportamento pré-existente
- **THEN** o teste de caracterização é criado e passa antes de qualquer alteração

#### Scenario: falha fabricada e recusada
- **ID:** AC-010
- **Revisão:** 1
- **WHEN** um teste de comportamento pré-existente falha por causa de um mock sem comportamento real
- **THEN** o runner não aceita o caso como RED e marca o cenário como `invalid_evidence`

### Requirement: Validação final
Antes do arquivamento, o runner SHALL executar a suíte obrigatória (`checks.test_report`) e os demais checks obrigatórios. Código de saída diferente de zero SHALL reprovar, mesmo com contagens favoráveis. Falta ou inconsistência de resultado obrigatório SHALL reprovar.

#### Scenario: falha de teste reprova a validacao final
- **ID:** AC-011
- **Revisão:** 1
- **WHEN** a suíte obrigatória tem um caso `fail`
- **THEN** a validação final reprova e o `spec-archive` não arquiva

#### Scenario: saida nao zero reprova mesmo com contagem favoravel
- **ID:** AC-012
- **Revisão:** 1
- **WHEN** a suíte sai com código `1` e a saída traz `# pass 3` e `# fail 0`
- **THEN** a validação final reprova

#### Scenario: validacao final aceita testes acrescentados a arquivos existentes
- **ID:** AC-013
- **Revisão:** 1
- **WHEN** um cenário novo é coberto por um teste acrescentado a um arquivo que já existia
- **THEN** o cenário conta como coberto, sem exigir arquivo novo

### Requirement: Esquema de checks.test e checks.test_report
O projeto SHALL declarar `checks.test` como string (modo legado compatível, sem identidade de suíte) ou como objeto `{command, suite}`. Quando `checks.test_report` estiver presente, `checks.test` SHALL ser objeto com a mesma `suite`. A ausência de `checks.test_report` mantém o modo legado compatível até a migração explícita (D27).

#### Scenario: checks.test em string com test_report e recusado
- **ID:** AC-022
- **Revisão:** 1
- **WHEN** `checks.test` é a string legada e `checks.test_report` está declarado
- **THEN** o runner para com `config_error` antes de executar a suíte, e a mensagem indica que `checks.test` deve ser objeto com a mesma `suite`

#### Scenario: projeto sem test_report segue no modo legado compatível
- **ID:** AC-023
- **Revisão:** 1
- **WHEN** `checks.test` é a string legada e não há `checks.test_report`
- **THEN** a suíte roda no modo legado compatível, sem identidade de suíte, e o relatório declara esse modo

### Requirement: Manifesto de aceitação com identidade do caso e hash
O vínculo entre cenários e casos SHALL ser registrado em `acceptance-manifest.json`, com `case_id` = `<arquivo>::<nome normalizado com a tag [ID]>`, `scenario_ids` com um ou mais IDs, e `file_hash` que inclui os hashes dos helpers declarados pelo arquivo. A identidade do caso SHALL ser distinta do ID do cenário. A granularidade do hash é o arquivo (D28).

#### Scenario: identidade do caso separa arquivos e normaliza espacos
- **ID:** AC-024
- **Revisão:** 1
- **WHEN** dois casos têm o mesmo nome em arquivos diferentes, ou um nome tem espaços extras no início, no fim ou entre palavras
- **THEN** os casos têm `case_id` distintos quando o arquivo difere, e o nome com espaços extras é normalizado antes de compor o `case_id`

#### Scenario: alteracao em helper compartilhado muda o hash dos arquivos que o declaram
- **ID:** AC-025
- **Revisão:** 1
- **WHEN** um helper listado em `helpers` de um arquivo muda de conteúdo
- **THEN** o `file_hash` de cada caso desse arquivo muda, e a validação exige reexecução dos casos desse arquivo

#### Scenario: cenario com dois casos exige os dois, e um caso com duas tags conta para ambos
- **ID:** AC-026
- **Revisão:** 1
- **WHEN** o cenário `AC-024` tem dois casos, um com `pass` e outro ausente da saída, e um terceiro caso traz as tags `[AC-024]` e `[AC-025]` com `pass`
- **THEN** `AC-024` fica como `missing` por falta de um caso, e o terceiro caso conta como evidência para `AC-024` e para `AC-025`

### Requirement: Identidade dos casos executados
Com `checks.test_report.file_command` declarado (marcador `{file}`), cada caso executado SHALL ter a identidade `<arquivo>::<nome completo>`, e a soma por arquivo SHALL bater com a suíte, que é a autoridade do código de saída e das contagens. Sem `file_command`, nomes repetidos SHALL reprovar com `inventory_ambiguous`. Nenhuma colisão SHALL ser silenciosa (D27, D28).

#### Scenario: execucao por arquivo distingue casos homonimos e confere a soma com a suite
- **ID:** AC-028
- **Revisão:** 1
- **WHEN** dois arquivos têm um caso com o mesmo nome e `file_command` está declarado, ou a soma das execuções por arquivo diverge da suíte em total ou em resultado
- **THEN** os casos têm identidades `<arquivo>::<nome completo>` distintas e o cenário usa o caso do arquivo do manifesto; com soma divergente, a validação reprova com `inventory_mismatch`

#### Scenario: nome repetido sem execucao por arquivo reprova como ambiguo
- **ID:** AC-029
- **Revisão:** 1
- **WHEN** a suíte tem dois casos com o mesmo nome completo e `file_command` não está declarado
- **THEN** a validação reprova com `inventory_ambiguous`, e a falha lista os nomes repetidos

### Requirement: Condição não suportada tratada como obrigatória
Uma condição de disparo fora das condições suportadas de D30 SHALL ser tratada como obrigatória, e o relatório SHALL informar `condição não avaliada: <texto>`. Nenhuma condição SHALL ser interpretada silenciosamente.

#### Scenario: condicao nao reconhecida vira obrigatoria com aviso no relatorio
- **ID:** AC-027
- **Revisão:** 1
- **WHEN** o runner avalia um cenário cuja `Condição de disparo` é "quando o time estiver disponível", texto fora de D30
- **THEN** o cenário é tratado como obrigatório, e o relatório traz `condição não avaliada: quando o time estiver disponível`
