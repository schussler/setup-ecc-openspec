# Issue tracker

Log de trabalho dos agentes no template. Toda sessão lê este arquivo primeiro e retoma do **Ponto de restauração**.

## Ponto de restauração

- **Change ativa:** `add-matt-skills-and-benchmark`
- **Branch:** `feat/add-matt-skills-and-benchmark`, a partir de `main` em `822f1cf`
- **Próximo passo:** Fatia 3: `implement-gate.mjs`, skills `spec-create` e `spec-implement`
- **Bloqueios:** nenhum
- **Atualizado em:** 2026-10-23

## Gates

| Data | Change | Gate | Tentativa | O que falhou | O que mudou | Pontuação | Veredito |
|------|--------|------|-----------|--------------|-------------|-----------|----------|
| 2026-10-23 | add-matt-skills-and-benchmark | entrada F1 (`openspec validate --all` + `template-check`) | 1 | — | — | validate: sem itens; template-check: 8/8 PASS, 2 NOTE | pass |
| 2026-10-23 | add-matt-skills-and-benchmark | saída F1 | 1 | — | — | ver Log | pass |
| 2026-10-23 | add-matt-skills-and-benchmark | suíte do template (TDD F2) | 1 | 15/18 testes falhando (RED esperado) | implementação de checks/lint/syntax-check, manifesto, skills | 19/28 | retry |
| 2026-10-23 | add-matt-skills-and-benchmark | suíte do template (TDD F2) | 2 | 1 teste: `syntax-check` não ignorava `node_modules` passado como argumento | `walkFiles` ignora segmentos ignorados no caminho de entrada; o teste estava certo e não foi alterado | 28/28, lint 0, sintaxe 0 | pass |
| 2026-10-23 | add-matt-skills-and-benchmark | saída F2 (`validate --all` + `template-check` 1–10) | 1 | — | — | 1/1 válida; READY | pass |

## Log

### 2026-10-23 — Fatia 2

- **`scripts/gates/`:** `checks.mjs` (carrega `checks`, roda comandos, conta testes em node/jest/vitest/pytest), `lint.mjs` (frontmatter das 295 skills e JSON) e `syntax-check.mjs` (`node --check`).
- **Suíte do template:** `scripts/test/` (28 testes, `node --test`, sem dependências).
- **`template.json`:** `checks`, `template_only` completo e `scripts/gates` em `managed`.
- **Skills de manutenção:** `new-project` instala `docs/agents`, remove `template_only` e grava `checks` (vazio quando não informado, nunca `TBD`). `template-check` ganhou os checks 9 e 10. `template-update` lista as mudanças em caminhos `owned` que exigem migração explícita.
- **Verificado:** `openspec validate` aceita `gates.json` dentro da change (D-risco no design).

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
