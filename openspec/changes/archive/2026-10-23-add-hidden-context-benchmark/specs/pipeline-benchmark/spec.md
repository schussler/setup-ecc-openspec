## ADDED Requirements

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
