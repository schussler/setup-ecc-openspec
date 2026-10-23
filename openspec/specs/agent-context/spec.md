# agent-context Specification

## Purpose
Contexto de engenharia que os agentes leem antes de agir (`docs/agents/`): os modelos do template, a cópia para projetos novos e a proteção como arquivos do projeto.

## Requirements

### Requirement: Modelos de contexto para agentes
O template SHALL manter em `templates/docs/agents/` os modelos `architecture.md`, `domain.md` e `issue-tracker.md`. Cada campo ainda não preenchido SHALL conter o marcador `TBD`.

#### Scenario: modelos de contexto tem campos TBD
- **WHEN** os modelos em `templates/docs/agents/` são lidos
- **THEN** existem os três arquivos e cada um contém ao menos um campo `TBD`

### Requirement: Contexto é próprio do projeto
O manifesto `template.json` SHALL listar `docs/agents` e `CLAUDE.md` em `owned`, para que o `/template-update` nunca os sobrescreva.

#### Scenario: docs agents e CLAUDE.md sao owned
- **WHEN** `template.json` é lido
- **THEN** `owned` contém `docs/agents` e `CLAUDE.md`, e nenhum dos dois aparece em `managed`

### Requirement: Cópia dos modelos no novo projeto
O `/new-project` SHALL copiar `templates/docs/agents/*` para `docs/agents/` do projeto gerado, substituindo o contexto do próprio template. Também SHALL remover do projeto gerado cada caminho listado em `template_only`.

#### Scenario: new-project copia modelos para docs agents
- **WHEN** a skill `new-project` é seguida
- **THEN** ela instrui copiar `templates/docs/agents/` para `docs/agents/` do destino

#### Scenario: new-project remove caminhos template_only
- **WHEN** a skill `new-project` é seguida
- **THEN** ela instrui remover do destino cada caminho de `template_only`, e `template_only` inclui `templates` e `scripts/benchmark`
