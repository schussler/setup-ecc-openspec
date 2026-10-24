# Design

## Context

O harness já grava em `.harness-local/<change>/events.jsonl` um evento por invocação, com custo de `total_cost_usd` (origem `reported`), tokens de `usage` (escopo `main_loop`) e modelo solicitado e efetivo (`telemetry.mjs`, `claude.mjs`). A execução padrão, porém, só inicia chamada paga com autorização `budget` cobrindo a reserva (`add-spec-harness`, HE-005 e RC-031, agora restritos ao modo financeiro). O relatório atual (`report.mjs`) mostra total de custo, mas não separa etapa e tentativa de forma consolidada, não aponta maiores consumidores e não tem resumo após arquivamento.

Ver `proposal.md` para a motivação.

## Goals / Non-Goals

**Goals**
- Modo padrão sem autorização de orçamento, reserva ou bloqueio por custo.
- Coleta por invocação com vínculos de etapa e tentativa, reutilizando `events.jsonl`.
- Resumo final após arquivamento, com lacunas de medição explícitas.
- Consulta sob demanda, somente leitura.

**Non-Goals**
- Serviço externo, dashboard ou envio de dados.
- Multifatia, atribuição perfeita por tarefa ou otimização de desempenho.
- Alteração do mecanismo de conclusão supervisionada, dos gates ou da política.
- Mudança na sonda de `--max-turns`. Ela continua sendo ação paga explícita, com autorização `probe`.
- Nova chamada ao modelo para medir ou explicar consumo.

## Decisions

### D1. Modo por perfil da execução
- `modo_financeiro` é uma chave do perfil da execução (`--profile`, padrão `.claude/harness/profiles/default.json`). O padrão é `false`: ausente ou `false` significa modo de observação. Valor que não seja booleano é erro de configuração.
- O perfil efetivo entra na impressão da evidência (sha256 e conteúdo, EV-001). Mudar o modo invalida a validação e exige nova validação. O hash do contrato não muda, porque o perfil não é arquivo do contrato.
- Ativar o modo financeiro não concede gasto: a autorização `budget` continua obrigatória (CO-018).

### D2. Campos de atribuição no registro existente
- O registro de invocação de `events.jsonl` ganha `stage` (passo do pipeline ou gate, por exemplo `implement`) e `attempt` (o `attempt_id` do runner, que nunca reinicia).
- `task` é preenchido somente quando o runner identifica a tarefa de forma determinística. Sem isso, é nulo (CO-006).
- Os campos existentes (`tokens`, `cost_usd`, `cost_source`, `model_requested`, `model_effective`, `effort_requested`, `effort_effective`, `duration_ms`) são reutilizados. Nada é renomeado.

### D3. Modo de observação no runner
- No modo de observação, `runHarnessStep` não chama `checkReserve`, não prepara reserva, não passa `--max-budget-usd` e não para por `authorization_required` nem por `budget_*`.
- Os controles não financeiros (correções, sintoma repetido, caminho protegido, tempo, número de invocações, contrato e integridade) seguem o caminho atual, sem alteração (CO-003).
- Custo desconhecido grava `cost_source: unknown` e segue (CO-004).

### D4. Resumo após arquivamento
- O resumo é gerado somente depois do arquivamento bem-sucedido, a partir de `events.jsonl`, e gravado como `consumo-e-observacoes-finais.md` na pasta arquivada.
- O arquivo fica fora dos arquivos do contrato (`proposal.md`, `design.md`, `specs/`), então não altera o hash da aprovação. Um teste verifica isso (CO-010).
- Falha na geração não reverte o arquivamento. A saída informa a falha do relatório em separado (CO-015).

### D5. Consulta sob demanda
- Comando `node scripts/harness/cli.mjs consumo --change <change>`. Lê `events.jsonl` e imprime o resumo no terminal, sem gravar nada (CO-016).
- Vale para change aberta ou concluída sem arquivamento. Não é chamado por nenhum passo do pipeline (CO-017).

### D6. Totais parciais
- Totais somam só valores conhecidos. Quando há custo desconhecido ou não medido, o total é rotulado como parcial e a quantidade de desconhecidos aparece separada (CO-011).
- Nunca é apresentado "total completo" quando há lacuna.

### D7. Causas e hipóteses
- O resumo tem duas seções distintas: "causas observadas", com fatos registrados (por exemplo, número de correções e motivos de parada), e "hipóteses", sem fato registrado que as sustente.
- Quando nenhum registro explica o gasto, o resumo diz isso (CO-012).

### D8. Falhas de observabilidade
- Toda gravação de observação é envolvida em tratamento de erro. Falha vira aviso em `events.jsonl` (`kind: observability`) quando possível e nunca altera o veredito de gate ou o resultado do passo (CO-014).

## Interfaces e regras compartilhadas

- IF-001: campos de atribuição do registro de invocação: `stage` (texto ou nulo), `attempt` (inteiro ou nulo), `task` (texto ou nulo, somente com vínculo confiável).
- IF-002: `node scripts/harness/cli.mjs consumo --change <change>`, somente leitura, saída em texto.
- IF-003: `consumo-e-observacoes-finais.md` na pasta arquivada, com o título exato "Consumo e observações finais".
- RG-001: no modo de observação, nenhuma reserva é criada e nenhum argumento de custo é passado à CLI.
- RG-002: valor desconhecido nunca vira zero, em registro, total ou resumo.
- RG-003: falha de observabilidade nunca altera gate, aprovação ou arquivamento.
- RG-004: nenhum dado de consumo sai da máquina.
- RG-005: `modo_financeiro` ausente ou falso é o padrão.

## Fatias

- F1 (`implement`): `scripts/harness/` (coleta por invocação, modo de observação no runner, resumo, consulta), `cli.mjs` (comando `consumo`), ajuste da skill `spec-archive` para chamar o resumo depois do arquivamento, e testes em `scripts/test/harness/`. Dependências: nenhuma dentro desta change. Depende de a revisão de `add-spec-harness` ser aprovada antes da execução supervisionada.

Só existe uma fatia. Multifatia está fora do escopo.

## Revisão de compatibilidade

- Referência: `openspec/changes/add-spec-harness` (nota de revisão de 2026-10-24 em `design.md`).
- Requisitos alterados lá: "Invocação headless" (`headless-execution`); "Orçamento com limites independentes", "Reserva e custo", "Reconciliação de reservas", "Registro de reconciliação idempotente e correspondido" e "Extensão de orçamento com autorização" (`harness-run-control`). Esses requisitos valem somente no modo financeiro.
- Nenhum cenário de `add-spec-harness` mudou de texto ou de revisão.
- A aprovação anterior (`336249d1-e8e3-43e3-ac57-a35f8147f22d`) permanece como registro histórico. Não aprova o contrato revisado nem esta change.
- Esta change não repete esses requisitos. O comportamento de orçamento no modo financeiro é o definido lá.

## Comportamento preservado

- Gates, política, caminhos protegidos, conclusão supervisionada e sonda de `--max-turns` não mudam.
- Os eventos existentes (`lifecycle`, `lock`, `transition_refused`, `restore`) continuam como estão.
- A autorização `budget` continua obrigatória quando o modo financeiro está ativo.

## Testes obrigatórios

Cada cenário de `specs/harness-consumption-observation/spec.md` tem um teste com o mesmo ID no nome, como `[CO-001] execução padrão sem autorização de orçamento`. Testes usam o simulador de `claude` e não fazem chamada real ao modelo. Cobertura mínima:

- CO-001 a CO-004: runner em modo de observação, com e sem `modo_financeiro`.
- CO-005 a CO-007: registro com atribuição, tarefa nula e tokens nulos.
- CO-008 e CO-009: saída do passo sem mensagens de consumo; contagem zero de invocações.
- CO-010 a CO-013 e CO-020: entrega do resumo, totais parciais, causa e hipótese, subagentes não medidos, campos obrigatórios.
- CO-014 e CO-015: falha de coleta e de relatório depois do arquivamento.
- CO-016 e CO-017: consulta somente leitura e fora do pipeline.
- CO-018: modo financeiro mantém a parada por autorização.
- CO-019: nenhuma conexão externa.

## Ambiente e sandbox

- Node 24.21.0, macOS. Node 22 não verificado.
- Testes com simulador. Nenhuma chamada paga nesta etapa.

## Riscos

- Ativação do modo financeiro por edição sem nova validação: mitigada pela impressão da evidência, que inclui o perfil (D1).
- Consumo de subagentes e de sessões interativas fora da telemetria: declarado como não medido (CO-013).
- Atribuição de tarefa imprecisa: evitada, porque o vínculo é nulo quando não é confiável (CO-006).

## Perguntas abertas

Nenhuma bloqueante. Premissas assumidas, a confirmar na aprovação:
1. Limites não financeiros (invocações, tempo, correções) continuam ativos no modo de observação.
2. No modo de observação, nenhum `--max-budget-usd` é passado, porque ele seria um controle de custo.
3. O resumo fica no diretório arquivado, fora do hash do contrato.
