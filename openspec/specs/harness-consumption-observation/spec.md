# harness-consumption-observation Specification

## Purpose
TBD - created by archiving change add-silent-consumption-observability. Update Purpose after archive.

## Requirements

### Requirement: Modo padrão de observação
O runner SHALL operar em modo de observação quando `modo_financeiro` não estiver ativo no perfil da execução. Nesse modo, o runner SHALL NOT exigir autorização `budget`, SHALL NOT criar reserva, SHALL NOT exigir reconciliação financeira e SHALL NOT bloquear por custo. Os controles não financeiros SHALL continuar ativos: aprovação do contrato, escopo, integridade, tentativas, correções e erro repetido.

#### Scenario: execução padrão sem autorização de orçamento
- **ID:** CO-001
- **Revisão:** 1
- **WHEN** o perfil da execução não define `modo_financeiro` e não há autorização `budget`
- **THEN** a invocação inicia, nenhuma parada `authorization_required` ocorre e nenhuma reserva é criada

#### Scenario: modo financeiro exige ativacao explicita
- **ID:** CO-002
- **Revisão:** 1
- **WHEN** o perfil da execução define `modo_financeiro` como ausente ou falso
- **THEN** o runner não cria reserva, não passa `--max-budget-usd` e não aplica limite de custo

#### Scenario: controles nao financeiros continuam no modo de observacao
- **ID:** CO-003
- **Revisão:** 1
- **WHEN** o modo de observação está ativo e um gate atinge o limite de correções, um sintoma se repete ou um caminho protegido muda durante a invocação
- **THEN** o runner para com o mesmo motivo de parada que teria no modo financeiro

#### Scenario: custo desconhecido nao bloqueia a observacao
- **ID:** CO-004
- **Revisão:** 1
- **WHEN** no modo de observação a CLI não informa o custo de uma invocação
- **THEN** o evento registra `cost_source: unknown`, nenhuma parada ocorre e nenhuma reserva fica aberta

### Requirement: Coleta silenciosa por invocação
Cada invocação SHALL gerar um registro em `events.jsonl` com agente ou função, modelo solicitado e efetivo, esforço quando disponível, duração, tokens de entrada, saída e cache (criação e leitura), custo com origem e vínculos com change, execução, invocação, etapa e tentativa. Campos sem valor confiável SHALL ser nulos, nunca zero. O vínculo com tarefa SHALL existir somente quando for confiável; caso contrário, SHALL ser nulo e o consumo SHALL ser contado como não atribuído a tarefa.

#### Scenario: registro completo por invocacao
- **ID:** CO-005
- **Revisão:** 1
- **WHEN** uma invocação termina com saída JSON que traz custo e uso
- **THEN** o registro contém agente, função, modelos, esforço, duração, tokens por categoria, custo com origem, change, execução, invocação, etapa e tentativa

#### Scenario: tarefa so com vinculo confiavel
- **ID:** CO-006
- **Revisão:** 1
- **WHEN** a invocação não identifica uma tarefa de forma determinística
- **THEN** o campo de tarefa é nulo e o resumo lista esse consumo como não atribuído a tarefa

#### Scenario: tokens ausentes ficam nulos
- **ID:** CO-007
- **Revisão:** 1
- **WHEN** a saída JSON da CLI não traz `usage` válido
- **THEN** os tokens do registro são nulos, e nenhum valor é gravado como zero

### Requirement: Silêncio durante a execução
Durante a execução, o runner SHALL NOT mostrar consumo, saldo ou orçamento a cada etapa, SHALL NOT emitir mensagens recorrentes de consumo, e SHALL NOT fazer chamada adicional ao modelo para medir ou explicar consumo.

#### Scenario: nenhuma mensagem de consumo por etapa
- **ID:** CO-008
- **Revisão:** 1
- **WHEN** um passo termina no modo de observação
- **THEN** a saída do passo não contém linhas de consumo, saldo ou orçamento

#### Scenario: medicao sem chamada adicional ao modelo
- **ID:** CO-009
- **Revisão:** 1
- **WHEN** a coleta e a consolidação do consumo são executadas
- **THEN** nenhuma invocação de `claude` é iniciada, o que o simulador confirma por contagem zero

### Requirement: Entrega do resumo final
Após um arquivamento bem-sucedido, o sistema SHALL apresentar uma única seção com o título "Consumo e observações finais" e SHALL gravar o mesmo resumo junto dos artefatos arquivados, sem alterar a evidência de aprovação.

#### Scenario: secao final unica e gravada com o arquivo
- **ID:** CO-010
- **Revisão:** 1
- **WHEN** o arquivamento termina com sucesso
- **THEN** a seção "Consumo e observações finais" aparece uma vez e o mesmo texto é gravado na pasta arquivada, fora dos arquivos do contrato

### Requirement: Conteúdo do resumo final
O resumo SHALL informar tokens por categoria, custo informado ou estimado, consumo por etapa e tentativa, maiores consumidores, consumo de correções e repetições e lacunas de medição. Causas observadas SHALL ficar separadas de hipóteses, e o resumo SHALL declarar quando não há evidência para explicar o gasto.

#### Scenario: resumo corresponde aos registros e distingue desconhecidos
- **ID:** CO-011
- **Revisão:** 1
- **WHEN** os registros da change contêm custos informados e custos desconhecidos
- **THEN** o total soma somente os valores conhecidos, a quantidade de desconhecidos aparece separada e o total é marcado como parcial

#### Scenario: causa observada separada de hipotese
- **ID:** CO-012
- **Revisão:** 1
- **WHEN** nenhum registro explica o gasto de uma etapa
- **THEN** o resumo declara que não há evidência para explicar o gasto e nenhuma hipótese aparece como causa observada

#### Scenario: subagentes e sessoes interativas como nao medidos
- **ID:** CO-013
- **Revisão:** 1
- **WHEN** a change tem subagentes ou etapas interativas sem telemetria
- **THEN** o resumo os identifica como não medidos, e nunca como zero

#### Scenario: resumo traz todos os campos obrigatorios
- **ID:** CO-020
- **Revisão:** 1
- **WHEN** o resumo final é gerado para uma change arquivada
- **THEN** ele traz tokens por categoria, custo informado ou estimado, consumo por etapa e tentativa, maiores consumidores, consumo de correções e repetições e lacunas de medição

### Requirement: Falhas de observabilidade nao alteram o resultado
Falha de coleta, consolidação, gravação do resumo ou exibição SHALL NOT alterar o veredito de gate, a aprovação, nem o resultado de implementação ou arquivamento. Quando possível, a falha SHALL ser registrada como aviso para o relatório final. Se o relatório falhar depois do arquivamento, o arquivamento SHALL ser preservado e o resumo SHALL poder ser gerado de novo.

#### Scenario: falha de coleta nao bloqueia a invocacao
- **ID:** CO-014
- **Revisão:** 1
- **WHEN** a gravação de um registro de telemetria falha durante uma invocação
- **THEN** o passo mantém o mesmo resultado funcional e o aviso de observabilidade é registrado

#### Scenario: arquivamento nao e apresentado como falho por erro do relatorio
- **ID:** CO-015
- **Revisão:** 1
- **WHEN** a gravação do resumo falha depois de o arquivamento ser concluído
- **THEN** o arquivamento permanece concluído, a saída informa a falha do relatório separadamente, e o comando de consulta gera o resumo depois

### Requirement: Consulta sob demanda
O sistema SHALL oferecer um comando de consulta do consumo de uma change aberta ou concluída sem arquivamento. A consulta SHALL ser somente leitura e SHALL NOT ser executada automaticamente em nenhuma etapa do pipeline.

#### Scenario: consulta somente leitura
- **ID:** CO-016
- **Revisão:** 1
- **WHEN** o comando de consulta é executado para uma change aberta
- **THEN** nenhum arquivo do contrato, do estado ou dos registros é alterado

#### Scenario: consulta nunca roda automaticamente
- **ID:** CO-017
- **Revisão:** 1
- **WHEN** um passo do pipeline é executado
- **THEN** o comando de consulta não é chamado

### Requirement: Modo financeiro opcional preservado
Quando `modo_financeiro` estiver ativo, as regras de orçamento, autorização, reserva e reconciliação SHALL valer como definidas na revisão de `add-spec-harness`, sem redefinição nesta change.

#### Scenario: modo financeiro mantem a parada por autorizacao
- **ID:** CO-018
- **Revisão:** 1
- **WHEN** `modo_financeiro` está ativo e não há autorização `budget` vigente
- **THEN** o motivo de parada é `authorization_required`, como definido na revisão de `add-spec-harness`

### Requirement: Processamento local
A coleta, a consolidação, o resumo e a consulta SHALL ser locais. Nenhum dado de consumo SHALL ser enviado a serviço externo, dashboard ou endpoint.

#### Scenario: nenhum envio de dados de consumo
- **ID:** CO-019
- **Revisão:** 1
- **WHEN** a coleta, o resumo e a consulta são executados com rede indisponível
- **THEN** nenhuma operação falha por rede e nenhuma conexão externa é aberta pelo módulo de observação
