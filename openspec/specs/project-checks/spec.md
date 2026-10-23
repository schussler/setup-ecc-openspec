# project-checks Specification

## Purpose
Comandos de teste, lint e tipos de cada projeto, declarados em `template.json` → `checks` e lidos pelos gates, com falha explícita quando faltam.

## Requirements

### Requirement: Comandos de verificação no manifesto
O manifesto SHALL ter o campo `checks` com os comandos `test`, `lint` e `typecheck`. Os campos opcionais são `test_file`, um comando com `{file}` que roda um único arquivo de teste, e `coverage`. O template SHALL declarar os próprios comandos.

#### Scenario: template declara checks do proprio repo
- **WHEN** `template.json` do template é lido
- **THEN** `checks.test`, `checks.lint` e `checks.typecheck` são strings não vazias, e `checks.test_file` contém `{file}`

### Requirement: Gate falha sem comando
Quando um comando exigido por um gate estiver ausente ou vazio, o gate SHALL falhar com uma mensagem que nomeia o campo e explica como preenchê-lo.

#### Scenario: checks sem comando falha com mensagem clara
- **WHEN** um gate roda num projeto cujo `template.json` não tem `checks.lint`
- **THEN** o gate termina com erro e a mensagem cita `checks.lint` e `template.json`

### Requirement: Preenchimento no novo projeto
O `/new-project` SHALL preencher `checks` com os comandos informados. Comando não informado SHALL ficar vazio, e não com `TBD`, para que o gate falhe de forma explícita.

#### Scenario: new-project preenche checks
- **WHEN** a skill `new-project` é seguida
- **THEN** ela instrui gravar `checks.test`, `checks.lint` e `checks.typecheck` em `template.json`, e deixar vazio o que não foi informado
