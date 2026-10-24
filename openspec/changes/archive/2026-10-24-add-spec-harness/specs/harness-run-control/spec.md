## ADDED Requirements

### Requirement: Máquina de estados
O runner SHALL manter um estado operacional entre `ready`, `invoking`, `awaiting_gate`, `correction_requested`, `approved`, `awaiting_decision`, `interrupted`, `config_blocked`, `diagnosing` e `forbidden_action_stopped`. Ele SHALL aceitar só as transições definidas em `policy.md`. O motivo da parada SHALL ficar em `stop_reason`, separado do estado, e SHALL estar preenchido somente nos estados de parada.

#### Scenario: transicao fora da tabela e recusada
- **ID:** RC-001
- **Revisão:** 1
- **WHEN** o runner recebe um pedido de `approved` a partir de `invoking`
- **THEN** a transição é recusada e o estado não muda

#### Scenario: motivo de parada so existe em estado de parada
- **ID:** RC-002
- **Revisão:** 1
- **WHEN** o estado é `ready`
- **THEN** `stop_reason` é nulo

### Requirement: Contadores separados
O runner SHALL manter separados: `attempt_id` global, que nunca reinicia; `round` local; e, por rodada, invocações do modelo, avaliações de gate, correções solicitadas e reexecuções de diagnóstico. Uma avaliação de gate SHALL NOT contar como invocação do modelo.

#### Scenario: avaliacao de gate nao conta como invocacao
- **ID:** RC-003
- **Revisão:** 1
- **WHEN** o gate de implementação é avaliado depois de uma invocação
- **THEN** as invocações do modelo continuam iguais e as avaliações de gate aumentam em uma unidade

#### Scenario: attempt_id nao reinicia com a rodada
- **ID:** RC-004
- **Revisão:** 1
- **WHEN** uma nova rodada local é aberta
- **THEN** `attempt_id` continua de onde parou e `round` aumenta em uma unidade

### Requirement: Correção consome o limite ao ser despachada
Uma correção SHALL consumir o limite de `max_corrections_per_gate` quando é despachada, mesmo que não produza alteração. A alteração produzida SHALL ser medida pelos hashes, e o resultado SHALL ser o veredito do gate. Esses três valores SHALL ser registrados separadamente.

#### Scenario: correcao sem alteracao consome o limite
- **ID:** RC-005
- **Revisão:** 1
- **WHEN** uma correção é despachada e os hashes antes e depois são iguais
- **THEN** as correções solicitadas aumentam em uma unidade e `produced_change` é falso

### Requirement: Teto de correções por gate
Cada gate SHALL ter no máximo `max_corrections_per_gate` correções por rodada local, conforme `policy.json`. Ao atingir o teto, o runner SHALL parar com `stop_reason: correction_limit`.

#### Scenario: quarta correcao e recusada
- **ID:** RC-007
- **Revisão:** 1
- **WHEN** três correções já foram despachadas para o mesmo gate na rodada e a quarta é pedida
- **THEN** a correção não é despachada e o estado vira `awaiting_decision` com `stop_reason: correction_limit`

### Requirement: Orçamento com limites independentes
O runner SHALL controlar, independentemente, invocações, turnos por chamada (somente quando o limite de turnos estiver comprovado), correções, diagnósticos, tempo por chamada e total, custo por chamada e total, e invocações por fatia. Cada limite efetivo SHALL ser o menor entre a política, a configuração proposta e a autorização vigente.

**Aplicação por modo:** no modo de observação, limites de custo e `budget` não se aplicam; os demais continuam.

#### Scenario: limite efetivo e o menor dos tres
- **ID:** RC-022
- **Revisão:** 1
- **WHEN** a política permite US$ 3,00 por chamada, a configuração proposta define US$ 2,00 e a autorização vigente cobre US$ 1,50
- **THEN** o limite efetivo por chamada é US$ 1,50

#### Scenario: configuracao proposta nao autoriza gasto
- **ID:** RC-021
- **Revisão:** 1
- **WHEN** a configuração proposta define US$ 30,00 por change e não existe autorização do tipo `budget` vigente
- **THEN** nenhuma chamada paga é iniciada e o estado vira `awaiting_decision` com `stop_reason: authorization_required`

#### Scenario: authorization_required e distinto de budget_reserve_insufficient
- **ID:** RC-031
- **Revisão:** 1
- **WHEN** não existe autorização `budget` vigente, ou a existente foi revogada
- **THEN** o motivo é `authorization_required`; `budget_reserve_insufficient` só ocorre quando existe autorização vigente cujo saldo não comporta a reserva, e os testes e o relatório distinguem os dois casos
#### Scenario: orcamento esgotado para sem gastar alem do teto
- **ID:** RC-008
- **Revisão:** 1
- **WHEN** existe autorização `budget` vigente e a próxima reserva excede o saldo total (total autorizado menos consumo e reservas pendentes)
- **THEN** a invocação não é iniciada e o estado vira `awaiting_decision` com `stop_reason: budget_reserve_insufficient`

#### Scenario: esgotamento registra o consumo e nao zera o orcamento
- **ID:** RC-009
- **Revisão:** 1
- **WHEN** o orçamento autorizado se esgota
- **THEN** `stop_reason` é `budget_exhausted`, o consumo acumulado permanece no estado e o relatório marca `budget_exhausted` sem contar falha de gate

### Requirement: Reserva e custo
Cada chamada SHALL reservar `limite efetivo × (1 + reserve_margin_ratio)`. A reserva SHALL ser tratada como margem de segurança, não como garantia de teto. Custo desconhecido SHALL NOT ser tratado como zero. Uma reserva sem reconciliação SHALL permanecer aberta.

**Aplicação por modo:** reserva só no modo financeiro; custo desconhecido vale nos dois modos.

#### Scenario: custo desconhecido nao vira zero
- **ID:** RC-010
- **Revisão:** 1
- **WHEN** a CLI não informa o custo de uma chamada
- **THEN** o custo registrado é `unknown`, a contagem de chamadas com custo desconhecido aumenta em uma unidade e a reserva continua aberta

#### Scenario: reserva sem reconciliacao permanece comprometida
- **ID:** RC-011
- **Revisão:** 1
- **WHEN** uma invocação termina sem resultado reconciliado
- **THEN** a reserva continua somada ao comprometido e o restante do orçamento diminui

#### Scenario: reserva pendente reduz o saldo de novas reservas
- **ID:** RC-033
- **Revisão:** 1
- **WHEN** há uma reserva aberta de uma chamada interrompida e uma nova chamada é pedida
- **THEN** a reserva aberta entra no comprometido e reduz o saldo, e a nova reserva só é aceita se couber no saldo total
### Requirement: Reconciliação de reservas
Uma decisão humana de reconciliação SHALL registrar o custo observado ou estimado com sua origem, e a decisão sobre a reserva (`closed_observed`, `closed_unknown` ou `kept`). `closed_unknown` SHALL encerrar a reserva administrativamente sem converter o consumo desconhecido em zero: a contagem de chamadas com custo desconhecido permanece no estado, no checkpoint e no relatório.

**Aplicação por modo:** somente no modo financeiro.

#### Scenario: reserva encerrada com custo desconhecido preserva a incerteza
- **ID:** RC-024
- **Revisão:** 1
- **WHEN** o humano registra `closed_unknown` para uma reserva de uma chamada interrompida
- **THEN** a reserva deixa de ser reserva aberta, seu valor permanece no comprometido como exposição desconhecida (RC-055), a chamada continua contada como custo desconhecido e o relatório mostra essa contagem

#### Scenario: registro de reconciliacao identifica invocacao, reserva, evidencia e efeito no saldo
- **ID:** RC-045
- **Revisão:** 1
- **WHEN** um registro de reconciliação é gravado
- **THEN** ele contém `invocation_id`, `reserve_id`, evidência disponível, custo observado, estimado ou desconhecido, decisão humana e efeito no saldo (esquema aprovado pelo dono do projeto em 2026-10-24, registro formal pendente, design D26)
#### Scenario: revogacao e registro proprio que referencia a autorizacao revogada
- **ID:** RC-034
- **Revisão:** 1
- **WHEN** uma autorização `budget` precisa ser encerrada
- **THEN** um registro `revocation` referencia o id revogado; a autorização original permanece no arquivo, nenhum registro novo de orçamento é criado, e o saldo deixa de considerá-la

### Requirement: Registro de reconciliação idempotente e correspondido
Um registro de reconciliação SHALL ser idempotente, SHALL corresponder à invocação e à reserva que referencia, e SHALL ter efeito no saldo calculado pelo runner, não informado (D26, regras 1 a 7).

**Aplicação por modo:** somente no modo financeiro.

#### Scenario: reconciliacao so vale para invocacao e reserva que existem e se correspondem
- **ID:** RC-051
- **Revisão:** 1
- **WHEN** um registro de reconciliação referencia uma `invocation_id` que não existe na `execution_id` informada, ou uma `reserve_id` que não pertence a essa invocação
- **THEN** o registro é recusado e nenhuma reserva é encerrada nem nenhum custo é contabilizado

#### Scenario: repetir o mesmo registro de reconciliacao nao libera nem contabiliza de novo
- **ID:** RC-052
- **Revisão:** 1
- **WHEN** um registro de reconciliação idêntico, com o mesmo `reconciliation_id`, é gravado uma segunda vez, ou um registro com o mesmo `reconciliation_id` e conteúdo diferente é gravado
- **THEN** a repetição idêntica não altera o saldo nem o consumo, e o conteúdo diferente é recusado

#### Scenario: segunda reconciliacao de reserva ja encerrada nao libera de novo
- **ID:** RC-053
- **Revisão:** 1
- **WHEN** outro registro de reconciliação, com `reconciliation_id` distinto, tenta encerrar uma reserva que já está encerrada
- **THEN** a tentativa é recusada, a reserva não é liberada duas vezes e o custo não é somado duas vezes

#### Scenario: custo com status unknown exige valor nulo e valores conhecidos sao validos
- **ID:** RC-054
- **Revisão:** 1
- **WHEN** um registro de reconciliação traz `cost.status: unknown` com `cost.usd` diferente de `null`, ou `cost.status` `observed` ou `estimated` com valor ausente, negativo ou não finito
- **THEN** o registro é recusado com diagnóstico do campo `cost.usd`; com `unknown` e `null`, o registro é aceito e o custo permanece contado como desconhecido

#### Scenario: reserva encerrada com custo desconhecido continua no controle
- **ID:** RC-055
- **Revisão:** 1
- **WHEN** o humano registra `closed_unknown` com `unknown_treatment: counted_in_budget` para uma reserva
- **THEN** sem `unknown_treatment: counted_in_budget` o registro é recusado; com o campo presente, `reserve_released_usd` é zero, o valor da reserva permanece no comprometido como exposição desconhecida, a chamada continua em `unknown_calls_after`, e a continuidade só ocorre por decisão humana posterior

#### Scenario: correcao de reconciliacao e registro novo que substitui o anterior
- **ID:** RC-056
- **Revisão:** 1
- **WHEN** uma reconciliação gravada precisa ser corrigida
- **THEN** um registro novo é acrescentado com `supersedes` apontando o `reconciliation_id` original, o original permanece idêntico, e o efeito no saldo é recalculado a partir do registro novo
### Requirement: Extensão de orçamento com autorização
Ampliar o orçamento SHALL exigir uma autorização do tipo `budget` com limite novo, motivo, aprovador e data, registrada em `authorizations.json`. A orientação humana SHALL poder reiniciar contadores locais, mas SHALL NOT apagar consumo acumulado.

**Aplicação por modo:** somente no modo financeiro.

#### Scenario: extensao de orcamento exige autorizacao registrada
- **ID:** RC-012
- **Revisão:** 1
- **WHEN** o runner recebe um pedido de ampliação sem autorização com limite e motivo
- **THEN** o pedido é recusado e o estado vira `awaiting_decision`

#### Scenario: reinicio de contadores locais preserva o consumo
- **ID:** RC-013
- **Revisão:** 1
- **WHEN** o humano autoriza uma nova rodada local, com autorização do tipo `round`
- **THEN** os contadores locais zeram, e o consumo acumulado e as autorizações anteriores continuam no estado

#### Scenario: nova execucao referencia a anterior sem reiniciar o consumo
- **ID:** RC-035
- **Revisão:** 1
- **WHEN** uma nova execução é criada para a mesma change
- **THEN** ela recebe `execution_id` próprio, registra `previous_execution_id`, e o consumo, as reservas e os limites acumulados da change continuam os mesmos
### Requirement: Repetição e assinatura de sintoma
O runner SHALL calcular a assinatura de um sintoma a partir do gate, dos casos que falharam ou faltaram e da classe do erro. Três ocorrências consecutivas da mesma assinatura na rodada SHALL parar com `stop_reason: repeated_symptom`. Reescrever a hipótese SHALL NOT reiniciar o contador. Ações duplicadas SHALL ser detectadas antes da execução e exigir justificativa registrada.

#### Scenario: tres ocorrencias do mesmo sintoma param a rodada
- **ID:** RC-014
- **Revisão:** 1
- **WHEN** a mesma assinatura de sintoma ocorre em três tentativas consecutivas na rodada, com hipóteses diferentes
- **THEN** o estado vira `awaiting_decision` com `stop_reason: repeated_symptom`. Resolver uma falha e revelar outra com assinatura diferente não conta como ocorrência repetida

#### Scenario: nova runner nao para por contagem de falhas
- **ID:** RC-041
- **Revisão:** 1
- **WHEN** o número de falhas não cai entre duas avaliações, mas os sintomas são diferentes
- **THEN** o runner não para por esse motivo; as paradas são limite de correções, sintoma repetido, orçamento, tempo ou decisão humana. A regra de contagem (SG-018) só vale no modo legado, identificada como tal
#### Scenario: acao duplicada exige justificativa
- **ID:** RC-015
- **Revisão:** 1
- **WHEN** uma ação tem o mesmo descritor de uma ação já executada na rodada
- **THEN** o runner não executa sem justificativa registrada

### Requirement: Diagnóstico e não determinismo
Reexecuções de diagnóstico SHALL consumir seus próprios limites. Uma reexecução que diverge com o mesmo código SHALL levar o estado a `diagnosing`. Uma reexecução favorável SHALL NOT aprovar a change sem tratar a divergência.

#### Scenario: divergencia com o mesmo codigo vai para diagnostico
- **ID:** RC-016
- **Revisão:** 1
- **WHEN** duas execuções do mesmo código dão resultados diferentes
- **THEN** o estado vira `diagnosing`, com motivo opcional, e a aprovação não é concedida

#### Scenario: timeout nao e classificado como infraestrutura automaticamente
- **ID:** RC-023
- **Revisão:** 1
- **WHEN** uma invocação passa do tempo limite
- **THEN** o estado vira `awaiting_decision` com `stop_reason: timeout_unclassified`, e o diagnóstico exige saída parcial, tempo e comando

### Requirement: Relatório de parada
Ao parar, o runner SHALL preservar o estado e gerar o relatório de parada com objetivo da fatia, tentativas e evidências, bloqueio atual, até três hipóteses (com evidência ou suspeita claramente distinguidas), recomendação principal, decisão necessária e próximo passo.

#### Scenario: parada sem hipoteses inventadas
- **ID:** RC-019
- **Revisão:** 1
- **WHEN** há uma única hipótese plausível
- **THEN** o relatório traz uma hipótese, sem completar a lista com hipóteses inventadas

### Requirement: Retomada
Na retomada, o runner SHALL ler e validar o estado, identificar chamadas interrompidas, manter reservas abertas até reconciliação, comparar o estado atual ao último registrado, tratar alterações encontradas como pendentes de validação, contar a nova invocação como nova execução e abrir rodada local somente com autorização do tipo `round`.

#### Scenario: retomada mantem reservas comprometidas
- **ID:** RC-017
- **Revisão:** 1
- **WHEN** o runner retoma um estado com uma chamada interrompida e sem reconciliação
- **THEN** a reserva continua aberta e a chamada aparece como `interrupted` no relatório

#### Scenario: interrupcao preserva o evento e so exige reconciliacao com consumo ou reserva
- **ID:** RC-046
- **Revisão:** 1
- **WHEN** a execução é interrompida, e não há consumo nem reserva a reconciliar
- **THEN** o evento de interrupção fica registrado separadamente, e o estado não exige reconciliação financeira

#### Scenario: alteracao encontrada na retomada fica pendente de validacao
- **ID:** RC-018
- **Revisão:** 1
- **WHEN** a retomada encontra hashes diferentes dos registrados
- **THEN** as alterações ficam marcadas como pendentes de validação e a aprovação anterior não vale

### Requirement: Paradas por quota, tempo e decisão humana
O runner SHALL parar com `quota_unavailable` quando a conta atingir limite de uso, com `time_limit` quando o tempo total autorizado acabar, e com `human_decision_needed` quando houver ambiguidade ou mudança de escopo. Em todos os casos, nenhuma chamada paga adicional SHALL iniciar.

#### Scenario: quota esgotada para sem gastar mais
- **ID:** RC-025
- **Revisão:** 1
- **WHEN** a CLI responde com limite de uso da conta
- **THEN** o estado vira `awaiting_decision` com `stop_reason: quota_unavailable`, e a contagem não é tratada como falha de gate

#### Scenario: tempo total esgotado para a execucao
- **ID:** RC-026
- **Revisão:** 1
- **WHEN** o tempo total autorizado para a change é atingido
- **THEN** o estado vira `awaiting_decision` com `stop_reason: time_limit`

#### Scenario: tempo total conta apenas execucao ativa
- **ID:** RC-036
- **Revisão:** 1
- **WHEN** o tempo total da change é verificado contra o limite
- **THEN** somam-se os intervalos de execução ativa do runner (invocações, gates, diagnósticos e ferramentas executadas pelo runner), com duração registrada por categoria; a espera humana e os períodos sem execução não contam, e o limite é aplicado sobre o tempo ativo acumulado

#### Scenario: gate travado e encerrado por timeout
- **ID:** RC-042
- **Revisão:** 1
- **WHEN** um gate excede `max_seconds_per_gate`
- **THEN** o processo do gate é encerrado com a árvore de processos, o gate registra falha de tempo, e o tempo gasto conta no tempo ativo

#### Scenario: timeout sem confirmacao de encerramento bloqueia novas execucoes
- **ID:** RC-043
- **Revisão:** 1
- **WHEN** um comando excede o timeout e o encerramento da árvore de processos não é confirmado
- **THEN** o estado registra término não confirmado, bloqueia novas execuções conflitantes da mesma change, e nenhuma avaliação nova inicia até confirmação humana

#### Scenario: avaliacao nova nao inicia enquanto a anterior pode estar ativa
- **ID:** RC-044
- **Revisão:** 1
- **WHEN** uma avaliação anterior da change ainda está ativa ou tem término não confirmado
- **THEN** a nova avaliação não inicia, e o motivo é registrado

#### Scenario: limite de invocacoes por change para a execucao
- **ID:** RC-037
- **Revisão:** 1
- **WHEN** o número de invocações da change atinge o limite de invocações autorizado
- **THEN** o runner para com `budget_exhausted` antes de iniciar a próxima invocação, e o consumo acumulado é preservado

#### Scenario: cada invocacao tem identificador proprio
- **ID:** RC-038
- **Revisão:** 1
- **WHEN** duas invocações são feitas na mesma execução
- **THEN** cada uma recebe `invocation_id` próprio, distinto de `execution_id` e de `session_id`

#### Scenario: TTY e condicao do procedimento e nao prova autoria
- **ID:** RC-039
- **Revisão:** 1
- **WHEN** o comando `authorize.mjs record` é executado em terminal interativo
- **THEN** o registro é gravado com `origin: human` e `procedure: tty`; a documentação declara que TTY descreve o procedimento e não comprova sozinho identidade ou autorização

#### Scenario: lista de autorizacoes preserva os registros anteriores
- **ID:** RC-040
- **Revisão:** 1
- **WHEN** um novo registro é gravado em `authorizations.json`
- **THEN** o arquivo é relido e validado, os registros anteriores permanecem idênticos, e uma divergência entre a leitura e a gravação recusa a gravação
#### Scenario: ambiguidade de escopo exige decisao humana
- **ID:** RC-027
- **Revisão:** 1
- **WHEN** o agente identifica que o pedido contradiz o contrato aprovado
- **THEN** o estado vira `awaiting_decision` com `stop_reason: human_decision_needed` e nenhuma alteração de contrato é feita

### Requirement: Interrupção durante a avaliação de gate
Timeout, sinal ou interrupção externa durante `awaiting_gate` SHALL encerrar a árvore de processos do gate e levar a `interrupted` pela tabela de transições. O resultado parcial SHALL ser descartado e registrado como descartado. A retomada da mesma execução SHALL voltar a `awaiting_gate` e reexecutar o gate do início (D8).

#### Scenario: gate interrompido por timeout vai a interrupted sem reconciliacao financeira
- **ID:** RC-059
- **Revisão:** 1
- **WHEN** a avaliação de gate em `awaiting_gate` excede `max_seconds_per_gate`
- **THEN** a árvore de processos do gate é encerrada; com encerramento confirmado, o estado vai a `interrupted` com evento de interrupção próprio, sem reserva e sem reconciliação financeira; com encerramento não confirmado, o estado registra término não confirmado e nenhuma avaliação nova inicia; o resultado parcial é descartado e registrado como descartado

#### Scenario: sinal externo durante o gate segue a regra do timeout
- **ID:** RC-060
- **Revisão:** 1
- **WHEN** a execução recebe SIGINT ou SIGTERM, ou é registrada como interrompida, durante a avaliação de gate
- **THEN** a árvore de processos do gate é encerrada e vale a mesma regra do timeout: `interrupted` com término confirmado, ou término não confirmado que bloqueia nova avaliação

#### Scenario: retomada de gate interrompido reexecuta o gate do inicio
- **ID:** RC-061
- **Revisão:** 1
- **WHEN** a mesma execução é retomada depois de uma interrupção durante o gate
- **THEN** o estado volta a `awaiting_gate` e o gate é reexecutado do início, sem nova invocação; o resultado parcial do gate interrompido permanece registrado como descartado, e nenhum veredito parcial vale como aprovação

### Requirement: Contadores legados incertos
Ao migrar contadores de uma execução legada, o runner SHALL marcar `counters_certain: false` quando não puder reconstruí-los. Nesse caso, iniciar uma rodada reconciliada SHALL exigir autorização do tipo `round`.

#### Scenario: contadores incertos exigem autorizacao para nova rodada
- **ID:** RC-028
- **Revisão:** 1
- **WHEN** a migração encontra tentativas sem correções identificáveis
- **THEN** `counters_certain` é falso, e a nova rodada só começa com autorização `round`

### Requirement: Replanejamento simples
Duas rodadas locais na mesma change, ou três paradas no mesmo limite, SHALL gerar uma recomendação de replanejamento. Nenhuma heurística adicional SHALL ser aplicada na v1.

#### Scenario: duas rodadas locais geram recomendacao de replanejamento
- **ID:** RC-020
- **Revisão:** 1
- **WHEN** a change abre a segunda rodada local
- **THEN** o relatório inclui a recomendação de replanejamento

### Requirement: Registro de autorizações
Autorizações SHALL ser registros versionados e somente de acréscimo em `authorizations.json`, persistidos apenas pelo comando `authorize.mjs record` a partir de decisão humana explícita. Skills e runner SHALL NOT conceder autorização. Revogação e substituição SHALL ser novos registros que referenciam o original. A regra de somente acréscimo é verificada pelo fluxo (EV-003), não garante resistência a adulteração pela mesma conta.

#### Scenario: agente nao cria autorizacao propria
- **ID:** RC-029
- **Revisão:** 1
- **WHEN** o runner ou uma skill tenta gravar uma autorização sem decisão humana registrada
- **THEN** a gravação é recusada e nenhum registro é criado

#### Scenario: revogacao e substituicao sao novos registros
- **ID:** RC-030
- **Revisão:** 1
- **WHEN** uma autorização precisa ser revogada ou substituída
- **THEN** um novo registro com `revokes` ou `supersedes` é acrescentado, o original permanece, e a alteração ou remoção de linha existente é tratada como alteração protegida
### Requirement: Finalidade e identificação de autorização
Toda autorização SHALL identificar projeto e change. Uma autorização `revision` SHALL ter finalidade (`purpose`) entre as de D32, e cada finalidade SHALL limitar-se ao que D32 permite.

#### Scenario: aprovacao de contrato vale somente para o hash e a versao exatos
- **ID:** RC-047
- **Revisão:** 1
- **WHEN** o contrato é alterado em proposal, design ou specs depois de uma autorização `contract_approval`, ou uma autorização de outra `contract_version` é apresentada
- **THEN** a aprovação anterior não vale: a aprovação só é aceita quando `contract_hash` e `contract_version` coincidem com o contrato atual, e a alteração exige nova autorização `contract_approval` com nova versão

#### Scenario: adequacao de teste e suficiencia nao dispensam a execucao
- **ID:** RC-048
- **Revisão:** 1
- **WHEN** uma autorização `test_adequacy` ou `sufficiency` existe para um cenário cujos casos não foram executados com `pass` na suíte atual
- **THEN** a aprovação do cenário é recusada, porque a finalidade registra decisão humana e não substitui a execução válida no estado atual (D29c)

#### Scenario: excecao so vale quando a politica a preve por chave
- **ID:** RC-049
- **Revisão:** 1
- **WHEN** uma autorização `exception` é gravada sem `policy_key`, ou com uma chave que não está em `policy.json` nem em `policy.md`
- **THEN** o registro é recusado, e o cenário obrigatório continua obrigatório; uma chave prevista não dispensa regra genérica

#### Scenario: registro de autorizacao sem projeto ou change e recusado
- **ID:** RC-050
- **Revisão:** 1
- **WHEN** um registro de autorização não traz `project_id` e `scope.change`, ou traz valores diferentes do contexto validado
- **THEN** o registro é recusado e nenhuma linha é acrescentada a `authorizations.json`

### Requirement: Efeito da reconciliação no saldo
O efeito de um registro de reconciliação SHALL separar valor reservado, reserva encerrada, custo contabilizado e saldo disponível, e SHALL ser calculado pelo runner conforme a decisão (D26, regra 1). Exposição desconhecida SHALL NOT ser tratada como custo conhecido.

#### Scenario: campos de efeito separam os conceitos nos tres tratamentos
- **ID:** RC-057
- **Revisão:** 1
- **WHEN** um registro de reconciliação é calculado com `closed_observed`, `closed_unknown` ou `kept`
- **THEN** `reserved_usd`, `reserve_closed`, `cost_accounted_usd`, `exposure_unknown_usd` e `available_after_usd` seguem D26: em `closed_observed` a reserva é liberada e o custo observado é contabilizado; em `closed_unknown` `reserve_released_usd` é zero, `cost_accounted_usd` é zero, `exposure_unknown_usd` é o valor reservado e `net_available_effect_usd` é zero; em `kept` a reserva segue aberta e nenhum efeito no saldo ocorre

#### Scenario: reconciliacao observada com reserva de 2,50 e custo de 0,42 libera 2,08 de saldo
- **ID:** RC-058
- **Revisão:** 1
- **WHEN** uma reserva de 2,50 é encerrada como `closed_observed` com custo observado de 0,42, com saldo disponível antes de 10,00
- **THEN** `reserve_released_usd` é 2,50, `cost_accounted_usd` é 0,42, `net_available_effect_usd` é 2,08 e `available_after_usd` é 12,08
