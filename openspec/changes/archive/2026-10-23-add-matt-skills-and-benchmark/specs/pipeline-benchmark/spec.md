## ADDED Requirements

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
