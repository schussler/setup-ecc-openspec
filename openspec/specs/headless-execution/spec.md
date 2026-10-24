# headless-execution Specification

## Purpose
Execução do pipeline por `claude -p`, sem intervenção humana, com permissões explícitas do projeto e sem desligar hooks.

## Requirements

### Requirement: Invocação headless
O runner SHALL invocar cada passo autônomo com `claude -p`, com a skill nomeada no prompt, um argumento de tarefa, `--output-format json`, `--permission-mode dontAsk`, `--allowedTools` com a lista de `.claude/settings.json`, e `--session-id` gerado pelo runner. Nunca SHALL usar `--dangerously-skip-permissions` nem `--bare`, para que os hooks do ECC continuem ativos. O runner SHALL NOT passar `--fallback-model`. Quando o modo financeiro estiver ativo (`modo_financeiro: true` no perfil da execução, com padrão `false`; ausente ou falsa, o modo é de observação) e houver teto de custo por chamada, SHALL passar `--max-budget-usd` com o limite efetivo, e SHALL controlar o total entre chamadas por conta própria. No modo de observação, o runner SHALL NOT passar `--max-budget-usd` e SHALL NOT exigir autorização `budget`, reserva ou reconciliação financeira, conforme `harness-consumption-observation`. Os cenários HE-004 e HE-005 valem somente no modo financeiro.

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

### Requirement: Permissões no projeto
O template SHALL ter `.claude/settings.json` com `permissions.allow`, listando as ferramentas que o pipeline usa. Essa é a única fonte de permissão no modo headless.

#### Scenario: permissoes definidas em settings do projeto
- **WHEN** `.claude/settings.json` é lido
- **THEN** `permissions.allow` libera `openspec`, os gates em `scripts/gates/`, `git` sem push e a edição de arquivos

### Requirement: New-project não interativo
O `/new-project` SHALL aceitar o modo não interativo. Nele, todas as entradas vêm dos argumentos, não há perguntas, o commit inicial é feito sem confirmação e a origem do template pode ser um caminho local.

#### Scenario: new-project aceita modo nao interativo
- **WHEN** a skill `new-project` é lida
- **THEN** ela define `--non-interactive`, sem perguntas, e aceita a origem do template por argumento
