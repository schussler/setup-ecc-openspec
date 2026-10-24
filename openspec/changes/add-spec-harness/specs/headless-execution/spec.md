## MODIFIED Requirements

### Requirement: Invocação headless
O runner SHALL invocar cada passo autônomo com `claude -p`, com a skill nomeada no prompt, um argumento de tarefa, `--output-format json`, `--permission-mode dontAsk`, `--allowedTools` com a lista de `.claude/settings.json`, e `--session-id` gerado pelo runner. Nunca SHALL usar `--dangerously-skip-permissions` nem `--bare`, para que os hooks do ECC continuem ativos. O runner SHALL NOT passar `--fallback-model`. Quando houver teto de custo por chamada, SHALL passar `--max-budget-usd` com o limite efetivo, e SHALL controlar o total entre chamadas por conta própria.

#### Scenario: skill nomeada no prompt executa via claude -p
- **ID:** HE-001
- **Revisão:** 2
- **WHEN** o runner monta a invocação de um passo
- **THEN** os argumentos têm `-p`, um prompt com o nome da skill e o argumento de tarefa, `--output-format json` e `--session-id`

#### Scenario: headless nao usa dangerously-skip-permissions
- **ID:** HE-002
- **Revisão:** 2
- **WHEN** o runner monta qualquer invocação
- **THEN** os argumentos não contêm `--dangerously-skip-permissions` nem `--bare`, e contêm `--permission-mode dontAsk`

#### Scenario: invocacao nao usa fallback de modelo
- **ID:** HE-003
- **Revisão:** 1
- **WHEN** o runner monta qualquer invocação
- **THEN** os argumentos não contêm `--fallback-model`

#### Scenario: teto de custo por chamada vai no argumento
- **ID:** HE-004
- **Revisão:** 1
- **WHEN** o limite efetivo por chamada é definido
- **THEN** os argumentos contêm `--max-budget-usd` com esse valor, e o total continua sendo controlado pelo runner

#### Scenario: chamada paga exige autorizacao que cubra a reserva
- **ID:** HE-005
- **Revisão:** 1
- **WHEN** não há autorização do tipo `budget` cobrindo a reserva da chamada
- **THEN** a invocação não inicia

#### Scenario: resultado da CLI e classificado pela causa identificada
- **ID:** HE-006
- **Revisão:** 1
- **WHEN** a saída JSON traz `is_error: true` sem motivo identificado
- **THEN** o passo é registrado como `error` sem causa classificada, e não como limite de turnos
