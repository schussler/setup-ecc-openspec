# Issue tracker

Log de trabalho dos agentes no template. Toda sessão lê este arquivo primeiro e retoma do **Ponto de restauração**.

## Ponto de restauração

- **Change ativa:** `add-matt-skills-and-benchmark`
- **Branch:** `feat/add-matt-skills-and-benchmark`, a partir de `main` em `822f1cf`
- **Próximo passo:** Fatia 2: campo `checks`, `/new-project` e a suíte mínima dos scripts
- **Bloqueios:** nenhum
- **Atualizado em:** 2026-10-23

## Gates

| Data | Change | Gate | Tentativa | O que falhou | O que mudou | Pontuação | Veredito |
|------|--------|------|-----------|--------------|-------------|-----------|----------|
| 2026-10-23 | add-matt-skills-and-benchmark | entrada F1 (`openspec validate --all` + `template-check`) | 1 | — | — | validate: sem itens; template-check: 8/8 PASS, 2 NOTE | pass |
| 2026-10-23 | add-matt-skills-and-benchmark | saída F1 | 1 | — | — | ver Log | pass |

## Log

### 2026-10-23 — Fatia 1

- **Pré-requisitos:**
  - `openspec --version` = 1.14.3.
  - `template-check` READY. As 2 NOTEs: a menção a `/private/tmp/claude-` está no próprio texto do check, e os `opsx/*.md` não têm `generatedBy`, que é o formato do upstream.
- **Perfil do OpenSpec (registrado, não alterado):** `profile: custom`, `delivery: both`, workflows `propose, explore, apply, sync, archive`. `/opsx:archive` está disponível.
- **Licença de `mattpocock/skills`:** MIT, confirmada no commit `5beb35b040e3de97e54fa9e386d7e42d15c295c2` (v1.3.1). Registrada no design (D11) e em `template.json`.
- **`grill-me`:** `anthropic-skills:grill-me` não está disponível nesta máquina. O `spec-create` usa o roteiro embutido.
- **Entregue:** a change `add-matt-skills-and-benchmark`, os modelos `templates/docs/agents/`, o `docs/agents/` do template, `docs/agents` em `owned` e `templates` em `template_only`.
- **Inconsistência apontada:** o pedido cita `openspec/changes/archive/<feature>/`, mas a CLI 1.14.3 arquiva em `openspec/changes/archive/<AAAA-MM-DD>-<feature>/`. O design (D8) segue a CLI.

## Paradas

Nenhuma.
