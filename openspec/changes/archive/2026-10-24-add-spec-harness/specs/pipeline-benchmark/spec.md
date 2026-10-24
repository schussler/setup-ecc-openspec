## ADDED Requirements

### Requirement: Três níveis de resultado
O benchmark SHALL reportar separadamente: execução concluída, gates do pipeline aprovados e aceitação funcional pelos testes de referência. Falha do runner, falha funcional e orçamento esgotado SHALL ser separados no relatório. Diagnósticos SHALL ser informativos e classificados.

#### Scenario: falha do runner nao conta como falha funcional
- **ID:** PB-001
- **Revisão:** 1
- **WHEN** uma execução para por erro do runner antes do passo de implementação
- **THEN** o relatório classifica como falha do runner e não como falha funcional

#### Scenario: execucao concluida com gates reprovados e separada
- **ID:** PB-002
- **Revisão:** 1
- **WHEN** uma execução termina sem erro, mas o gate de arquivamento reprova
- **THEN** o relatório mostra execução concluída e gates reprovados como níveis distintos

### Requirement: Perfil e calibração no relatório
Cada relatório de benchmark SHALL registrar a tarefa, a versão do harness, a configuração proposta efetiva com o marcador de candidato, as autorizações usadas, o contrato, o ambiente e o modelo solicitado e efetivo. Também SHALL trazer o plano de calibração.

#### Scenario: relatorio registra a configuracao efetiva e a calibracao
- **ID:** PB-003
- **Revisão:** 1
- **WHEN** um relatório de benchmark é gerado
- **THEN** ele inclui a configuração efetiva, os valores marcados como candidatos, as autorizações usadas e o plano de calibração

### Requirement: Regras de domínio na aceitação funcional
As regras obrigatórias de domínio da tarefa de referência SHALL participar da aceitação funcional. Uma regra obrigatória falha SHALL reprovar a aceitação funcional, mesmo com gates aprovados.

#### Scenario: regra de dominio obrigatoria falha reprova a aceitacao
- **ID:** PB-004
- **Revisão:** 1
- **WHEN** os gates passam, mas uma regra obrigatória de domínio falha
- **THEN** a aceitação funcional é reprovada e o relatório cita a regra

### Requirement: Máximo observado não é garantia
O relatório SHALL declarar que o máximo observado em execuções anteriores não é garantia de máximo futuro, e SHALL apresentar esse valor com a origem da medição.

#### Scenario: relatorio declara que o maximo observado nao e garantia
- **ID:** PB-005
- **Revisão:** 1
- **WHEN** o relatório cita o maior custo por chamada observado
- **THEN** ele traz a origem da medição e a declaração de que não é garantia

### Requirement: Avaliador de arquivamento no benchmark
O benchmark SHALL usar o avaliador legado (comparação normalizada por nome de cenário) somente em execuções identificadas como legacy: change sem nenhum `**ID:**` de cenário e sem `run-state.json` de modo `runner`. O avaliador usado SHALL aparecer no relatório, com suas limitações. Aprovação legada SHALL NOT equivaler à aceitação do novo harness. Execução de formato novo SHALL NOT fazer fallback para comparação por nome quando faltar ID.

#### Scenario: formato novo sem ID reprova sem fallback por nome
- **ID:** PB-007
- **Revisão:** 1
- **WHEN** uma change com `**ID:**` em cenários e casos de teste sem `[ID]` roda o arquivamento do benchmark
- **THEN** o cenário sem ID fica `missing`, o avaliador registrado é o de ID, e nenhuma comparação por nome é feita

#### Scenario: snapshot legado usa o avaliador legado e o relatorio declara isso
- **ID:** PB-008
- **Revisão:** 1
- **WHEN** um snapshot de change sem IDs de cenário é arquivado no benchmark
- **THEN** o relatório registra o avaliador legado, suas limitações (comparação por nome, com substring) e que a aprovação não equivale à aceitação do novo harness

### Requirement: Não determinismo registrado
Falha intermitente observada SHALL ser registrada como não determinismo, com a evidência disponível, sem causa atribuída. Passagens posteriores SHALL NOT apagar a falha. A evidência SHALL NOT ser usada para o marco de adoção enquanto não for investigada.

#### Scenario: PB-008 registrado como nao determinismo sem causa
- **ID:** PB-009
- **Revisão:** 1
- **WHEN** o relatório de benchmark registra a falha intermitente de PB-008
- **THEN** a ocorrência fica como não determinismo observado, sem causa identificada, e as passagens seguintes não a apagam; o marco de adoção fica bloqueado até a investigação

## MODIFIED Requirements

### Requirement: Testes ocultos
Uma tarefa SHALL poder declarar `hidden_tests`, um diretório de testes que o agente nunca vê. Depois do pipeline e da checagem de escopo, o runner SHALL copiar os testes para o diretório da execução e rodar cada arquivo como uma regra. O resultado entra no gate `hidden`, com o resultado por regra. "Oculto" descreve visibilidade, não obrigatoriedade: cada regra SHALL ter classificação declarada na tarefa, `obrigatória` ou `informativa`, e regra sem classificação declarada SHALL ser tratada como obrigatória. Uma regra obrigatória SHALL participar da aceitação funcional (PB-004). Um diagnóstico explicitamente classificado como informativo SHALL NOT mudar o status da execução.

#### Scenario: gate hidden roda os testes ocultos depois do pipeline
- **ID:** PB-010
- **Revisão:** 1
- **WHEN** uma execução de legado com `hidden_tests` termina com um `claude` simulado
- **THEN** o gate `hidden` traz o resultado de cada regra com a classificação declarada na tarefa, e a checagem de escopo não vê os arquivos ocultos

#### Scenario: gate hidden nao muda o status da execucao
- **ID:** PB-011
- **Revisão:** 1
- **WHEN** o gate `hidden` reprova e os demais gates passam
- **THEN** se a regra reprovada é obrigatória, a aceitação funcional é reprovada (PB-012); se o diagnóstico reprovado está classificado como informativo, o status da execução permanece `passed`

#### Scenario: regra obrigatoria do gate oculto reprova a aceitacao funcional
- **ID:** PB-012
- **Revisão:** 1
- **WHEN** o gate `hidden` reprova uma regra classificada como obrigatória e os demais gates passam
- **THEN** a aceitação funcional é reprovada, a execução não é classificada como aceita, e o relatório cita a regra obrigatória reprovada
