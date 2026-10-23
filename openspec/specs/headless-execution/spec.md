# headless-execution Specification

## Purpose
Execução do pipeline por `claude -p`, sem intervenção humana, com permissões explícitas do projeto e sem desligar hooks.

## Requirements

### Requirement: Invocação headless
O runner SHALL invocar cada passo com `claude -p`, com a skill nomeada no prompt, um argumento de tarefa, `--output-format json` e `--permission-mode dontAsk`. Nunca SHALL usar `--dangerously-skip-permissions` nem `--bare`, para que os hooks do ECC continuem ativos.

#### Scenario: skill nomeada no prompt executa via claude -p
- **WHEN** o runner monta a invocação de um passo
- **THEN** os argumentos têm `-p`, um prompt com o nome da skill e o argumento de tarefa, e `--output-format json`

#### Scenario: headless nao usa dangerously-skip-permissions
- **WHEN** o runner monta qualquer invocação
- **THEN** os argumentos não contêm `--dangerously-skip-permissions` nem `--bare`, e contêm `--permission-mode dontAsk`

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
