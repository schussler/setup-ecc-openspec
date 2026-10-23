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
Uma tarefa SHALL poder declarar `hidden_tests`, um diretório de testes que o agente nunca vê. Depois do pipeline e da checagem de escopo, o runner SHALL copiar os testes para o diretório da execução e rodar cada arquivo como uma regra. O resultado entra no gate `hidden`, com o resultado por regra. O gate `hidden` SHALL ser informativo: não muda o status da execução.

#### Scenario: gate hidden roda os testes ocultos depois do pipeline
- **WHEN** uma execução de legado com `hidden_tests` termina com um `claude` simulado
- **THEN** o gate `hidden` traz o resultado de cada regra, e a checagem de escopo não vê os arquivos ocultos

#### Scenario: gate hidden nao muda o status da execucao
- **WHEN** o gate `hidden` reprova e os demais gates passam
- **THEN** o status da execução é `passed`

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
