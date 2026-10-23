## ADDED Requirements

### Requirement: Terceiro upstream
O manifesto SHALL registrar `mattpocock-skills` em `upstreams`, com o commit de onde o conteúdo foi adaptado. Cada skill adaptada SHALL levar um `NOTICE.md` com a licença MIT do upstream.

#### Scenario: template.json registra upstream mattpocock-skills
- **WHEN** `template.json` é lido
- **THEN** `upstreams.mattpocock-skills` é um hash de commit com 40 caracteres

#### Scenario: skills adaptadas levam a licenca do upstream
- **WHEN** as skills adaptadas são inspecionadas
- **THEN** cada uma tem `NOTICE.md` com o texto da licença MIT e o commit de origem

### Requirement: Checagens cobrem o novo upstream
O `upstream-sync-check` SHALL comparar o conteúdo adaptado com `mattpocock/skills` a partir do commit registrado. O `template-check` SHALL validar `checks` e `template_only`, e rodar a suíte do template.

#### Scenario: upstream-sync-check cobre o terceiro upstream
- **WHEN** a skill `upstream-sync-check` é lida
- **THEN** ela clona `mattpocock/skills` e compara as mudanças desde o commit registrado

#### Scenario: template-check valida checks e suite
- **WHEN** a skill `template-check` é lida
- **THEN** ela valida `checks` e `template_only` e roda `checks.test`, `checks.lint` e `checks.typecheck`
