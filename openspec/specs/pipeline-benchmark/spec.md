# pipeline-benchmark Specification

## Purpose
Medição do pipeline em N execuções sem intervenção humana (greenfield e legado), com verificação independente dos gates, orçamento e relatório.

## Requirements

### Requirement: Cenário greenfield
O runner SHALL, a cada execução:
- criar um diretório vazio;
- rodar `/new-project` em modo não interativo;
- executar `spec-create --headless` → `spec-implement` → `spec-archive`;
- verificar os gates de forma independente.

O cenário não SHALL incluir `pr`.

#### Scenario: greenfield executa create implement archive sem pr
- **WHEN** uma execução greenfield roda com um `claude` simulado
- **THEN** os passos invocados são `new-project`, `spec-create`, `spec-implement` e `spec-archive`, nessa ordem, e nenhum é `pr`

### Requirement: Cenário de legado
O runner SHALL partir de uma fixture sem OpenSpec e sem `CLAUDE.md`, com suíte de testes própria. SHALL instalar o toolset, executar a refatoração definida pela tarefa e validar a regressão. Também SHALL comparar a taxa de sucesso das variantes com e sem `docs/agents/` em N execuções.

#### Scenario: fixture de legado nao tem openspec nem claude md
- **WHEN** a fixture de legado é inspecionada
- **THEN** ela não tem `openspec/` nem `CLAUDE.md`, e sua suíte passa

#### Scenario: legado compara com e sem docs agents
- **WHEN** o cenário de legado roda com N execuções
- **THEN** o relatório tem as variantes `with_docs` e `without_docs`, cada uma com N execuções e taxa de sucesso

### Requirement: Verificação independente
O runner SHALL reavaliar os gates no diretório da execução, sem confiar no que o agente relatou. Os gates reavaliados são a suíte completa, lint, typecheck, o arquivamento da change e a checagem de escopo.

#### Scenario: verificacao independente dos gates
- **WHEN** o agente relata sucesso mas a suíte do diretório falha
- **THEN** a execução é marcada com o gate de implementação reprovado

### Requirement: Orçamento
O runner SHALL limitar o total de invocações de `claude -p` (padrão 60) e o tempo de cada invocação (padrão 25 minutos). Ao atingir o limite de invocações, SHALL parar o cenário e gerar relatório parcial com status `budget_exhausted`, sem marcar falha de gate. Uma invocação que estoura o tempo SHALL ser registrada como falha daquele passo.

#### Scenario: orcamento esgotado gera relatorio parcial
- **WHEN** o limite de invocações é atingido no meio de um cenário
- **THEN** o status é `budget_exhausted`, e as execuções não iniciadas não contam como falha de gate

#### Scenario: invocacao excede tempo limite
- **WHEN** uma invocação passa do tempo limite
- **THEN** o processo é encerrado e o passo é registrado como falha com motivo `timeout`

### Requirement: Relatório
O runner SHALL gravar `report.json` e `report.md` com:
- pass/fail de cada gate;
- tempo por etapa;
- cobertura antes e depois;
- arquivos fora de `scoped_paths`;
- custo;
- número de invocações de `claude -p`;
- status (`complete`, `partial` ou `budget_exhausted`).

#### Scenario: relatorio contem gates tempos custo e status
- **WHEN** um cenário termina
- **THEN** `report.json` e `report.md` contêm cada um dos campos listados

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

### Requirement: Validade da tarefa
A tarefa `legacy-billing` SHALL ter uma solução de referência que passa em todas as regras ocultas e mantém a suíte da fixture verde, e uma solução ingênua (sem ler `docs/agents/`) que falha em pelo menos 2 das 3 regras.

#### Scenario: solucao de referencia passa nos testes ocultos
- **WHEN** a solução de referência é aplicada sobre a fixture
- **THEN** as 3 regras ocultas e a suíte da fixture passam

#### Scenario: solucao ingenua falha em pelo menos duas regras
- **WHEN** a solução ingênua é aplicada sobre a fixture
- **THEN** pelo menos 2 das 3 regras ocultas falham

#### Scenario: fixture legacy-billing nao tem openspec nem claude md
- **WHEN** a fixture é inspecionada
- **THEN** ela não tem `openspec/`, `CLAUDE.md` nem `docs/`, e sua suíte passa

### Requirement: Comparação e critério de validade
O relatório SHALL comparar, entre `with_docs` e `without_docs`, a taxa de aprovação do gate `hidden`, com a diferença em p.p., e marcar `conclusive` quando a diferença atingir `conclusive_min_pp` da tarefa. O critério `min_best_group_success_rate` SHALL exigir que pelo menos um grupo atinja a taxa de sucesso mínima nos gates normais.

#### Scenario: relatorio compara o gate hidden entre as variantes
- **WHEN** `with_docs` passa no `hidden` em 6 de 8 execuções e `without_docs` em 1 de 8
- **THEN** a diferença é 62,5 p.p. e `conclusive` é verdadeiro com limiar 25

#### Scenario: acceptance avalia a melhor taxa de sucesso entre grupos
- **WHEN** os grupos têm 50% e 75% de sucesso e o mínimo é 75
- **THEN** o critério passa

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
