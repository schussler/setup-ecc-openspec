# harness-telemetry Specification

## Purpose
TBD - created by archiving change add-spec-harness. Update Purpose after archive.

## Requirements

### Requirement: Eventos locais fora do Git
O runner SHALL registrar eventos em `.harness-local/<change>/events.jsonl`, append-only, um evento por passo. O diretório `.harness-local/` SHALL estar no `.gitignore`.

#### Scenario: custo sem origem conhecida e marcado como unknown
- **ID:** TE-002
- **Revisão:** 1
- **WHEN** a CLI não informa custo
- **THEN** o evento registra `cost_source: unknown` e não registra zero

### Requirement: Escrita serializada e diagnóstico de lock
A escrita em `events.jsonl` SHALL ser serializada: somente o processo que detém o lock da change, ou o procedimento de liberação executado sob esse lock, acrescenta linhas. Diagnósticos de lock SHALL usar `kind: "lock"` e identificação própria, sem criar segundo escritor concorrente.

#### Scenario: partida recusada por lock nao escreve em events.jsonl
- **ID:** TE-009
- **Revisão:** 1
- **WHEN** uma partida é recusada com `lock_held` ou `lock_unreadable` enquanto outro processo detém o lock da change
- **THEN** a partida não acrescenta linha a `events.jsonl`, o diagnóstico (com `project_id`, `change`, `local_id` e, quando aplicável, `lock_sha256`) é mostrado na saída do comando, e o detentor do lock é o único que grava eventos `kind: "lock"` da change

### Requirement: Eventos de ciclo de vida
O runner SHALL gravar em `events.jsonl` eventos de início, conclusão, falha, interrupção e retomada, cada um com `execution_id` e data registrada.

#### Scenario: ciclo de vida da execucao e registrado por evento
- **ID:** TE-010
- **Revisão:** 1
- **WHEN** uma execução é iniciada, concluída, falha, é interrompida e depois retomada
- **THEN** `events.jsonl` contém um evento para cada uma dessas etapas, na ordem em que ocorreram, com o mesmo `execution_id` e com `at` preenchido

### Requirement: Campos do evento
Cada evento SHALL registrar agente e função, provedor, modelo solicitado e efetivo quando disponível, esforço solicitado e efetivo quando verificável, duração, tokens, custo com origem (`reported`, `estimated`, `unknown` ou `unmeasured`), status, casos e checks executados, resultados e hashes, correções solicitadas e alterações produzidas, paradas, interrupções, decisões humanas, consumo e reservas.

#### Scenario: evento registra modelo solicitado e efetivo
- **ID:** TE-001
- **Revisão:** 1
- **WHEN** uma invocação responde com um modelo diferente do solicitado
- **THEN** o evento traz os dois valores e marca a divergência

### Requirement: Retenção sem perda de auditoria
Eventos brutos, saídas capturadas e relatórios locais SHALL ser mantidos por `log_retention_days` (90 dias, em `policy.json`). A idade SHALL ser calculada pela data registrada (`at` nos eventos, `recorded_at` nos relatórios), nunca pelo mtime do arquivo. A limpeza SHALL NOT remover `run-state.json`, checkpoints, autorizações, resumo durável nem decisões de reconciliação.

#### Scenario: limpeza remove eventos antigos e preserva o resumo durável
- **ID:** TE-003
- **Revisão:** 1
- **WHEN** a limpeza roda sobre eventos com mais de 90 dias
- **THEN** os eventos antigos são removidos e `evidence-summary.json`, o checkpoint e as autorizações permanecem

#### Scenario: data registrada ausente ou invalida preserva o registro com aviso
- **ID:** TE-011
- **Revisão:** 1
- **WHEN** a limpeza encontra um evento ou relatório sem data registrada, ou com data inválida, mesmo que o mtime do arquivo seja antigo
- **THEN** o registro é preservado, a limpeza emite um aviso que nomeia o arquivo e a linha, e a idade não é inferida pelo mtime

### Requirement: Relatórios de qualidade, agentes, modelos, esforço e custo
O runner SHALL gerar `report.json` e `report.md` derivados dos eventos e do estado, separando custo conhecido, custo estimado, contagem de chamadas com custo desconhecido e etapas não mensuradas. O relatório SHALL NOT apresentar custo como total completo quando houver custo desconhecido ou etapa não mensurada, e SHALL trazer as métricas de aceitação, regressão, retrabalho, intervenção humana, paradas e não determinismo.

#### Scenario: relatorio separa custo conhecido de etapas nao medidas
- **ID:** TE-004
- **Revisão:** 1
- **WHEN** uma change tem uma etapa interativa sem telemetria
- **THEN** o relatório lista a etapa como `unmeasured` e o total não se diz completo

#### Scenario: custo por entrega inclui tentativas malsucedidas
- **ID:** TE-005
- **Revisão:** 1
- **WHEN** a change teve duas tentativas que falharam e uma aprovada
- **THEN** o custo por entrega aceita soma as três tentativas

#### Scenario: custo desconhecido aparece como contagem e nao como zero
- **ID:** TE-008
- **Revisão:** 1
- **WHEN** duas chamadas não informaram custo
- **THEN** o relatório mostra "2 chamadas com custo desconhecido" ao lado do custo conhecido, sem somá-las como zero

### Requirement: Separação de agentes não é prova de independência
O relatório SHALL declarar que a separação entre agentes de implementação e de aceitação não prova independência técnica do avaliador.

#### Scenario: relatorio nao trata separacao de agentes como independencia
- **ID:** TE-006
- **Revisão:** 1
- **WHEN** o relatório de qualidade é gerado
- **THEN** a seção de métricas inclui a declaração de que a separação de agentes não comprova independência técnica

### Requirement: Exportação do relatório
O runner SHALL poder exportar o relatório resumido em um único arquivo, sem incluir segredos nem o conteúdo bruto dos eventos.

#### Scenario: exportacao nao inclui segredos
- **ID:** TE-007
- **Revisão:** 1
- **WHEN** o relatório é exportado
- **THEN** o arquivo não contém valores de segredos nem eventos brutos
