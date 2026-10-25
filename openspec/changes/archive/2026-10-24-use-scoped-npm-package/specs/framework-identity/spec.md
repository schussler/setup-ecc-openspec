# Spec Delta

## MODIFIED Requirements

### Requirement: Posicionamento e créditos
O README SHALL apresentar o SpecLoop como framework, documentar a instalação só por `npx @k0d3r/specloop` e ter uma seção de créditos com link para `affaan-m/everything-claude-code`, `Fission-AI/OpenSpec` e `mattpocock/skills`.

#### Scenario: README credita os tres upstreams
- **ID:** SL-004
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** o README é lido
- **THEN** ele tem uma seção de créditos com os links dos três repositórios e se apresenta como framework

#### Scenario: README documenta so o npx
- **ID:** SL-005
- **Revisão:** 2
- **Verificação:** teste
- **Aprovação:** auth:22fb82b1-ed1e-4bd0-924e-84ffdafd4b9d
- **WHEN** o README é lido
- **THEN** ele documenta `npx @k0d3r/specloop install`, `init`, `adopt` e `update`, e não documenta `git fetch` do repositório para instalar

## ADDED Requirements

### Requirement: Instalação sempre com o escopo
README, skills e `docs/agents` SHALL NOT instruir a instalação por `npx specloop` sem o escopo `@k0d3r`.

#### Scenario: nenhum documento instala sem o escopo
- **ID:** SL-019
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** `README.md`, os `SKILL.md` de `.claude/skills/` e os arquivos de `docs/agents/` são lidos
- **THEN** nenhum contém `npx specloop` sem o escopo `@k0d3r/` imediatamente antes de `specloop`
