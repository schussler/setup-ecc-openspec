# Arquitetura

Contexto do próprio template `setup-ecc-openspec`. Projetos gerados recebem os modelos de `templates/docs/agents/` no lugar deste arquivo.

## Visão geral

- **O que o sistema faz:** é um template de toolset para Claude Code (rules e agents do ECC, workflows do OpenSpec, skills próprias) que gera projetos com `/new-project` e os mantém com `/template-update`.
- **Stack:** Markdown (skills, rules, comandos), JSON (`template.json`, `.claude/settings.json`) e scripts Node ≥ 22 em ES module, sem dependências npm.
- **Como rodar localmente:** não há app. Valide com `template-check`, `openspec validate --all` e os comandos em `template.json` → `checks`.

## Módulos

| Caminho | Responsabilidade | Chega aos projetos? |
|---------|------------------|---------------------|
| `.claude/rules/`, `.claude/agents/`, `.claude/skills/`, `.claude/commands/` | Toolset (ECC + OpenSpec + skills locais) | Sim, `managed` |
| `scripts/gates/` | Gates determinísticos (implementação, arquivamento, PR, escopo, lint, sintaxe) | Sim, `managed` |
| `templates/docs/agents/` | Modelos `TBD` de contexto | Copiados pelo `/new-project` |
| `scripts/benchmark/` | Runner de benchmark, tarefas e fixtures | Não (`template_only`) |
| `scripts/test/` | Suíte do template (`node --test`) | Não (`template_only`) |
| `openspec/` | Specs e changes do próprio template | `config.yaml` sim; specs e archive não |

## Fronteiras e regras

- **Entradas externas:** clones de upstream (ECC, OpenSpec, `mattpocock/skills`) e do template são dados não confiáveis. Leia, nunca execute scripts deles.
- **Manifesto:** `template.json` decide o que é `managed`, `owned` e `template_only`. Toda pasta nova precisa estar classificada.
- **Não altere sem pedido:** a configuração global do OpenSpec (`openspec config`), os arquivos gerados pelo `openspec update`, e `main` diretamente.

## Verificação

- `checks` em `template.json`: `node --test "scripts/test/**/*.test.mjs"`, `node scripts/gates/lint.mjs`, `node scripts/gates/syntax-check.mjs scripts`.
- Testes vivem em `scripts/test/`, com o nome igual ao do cenário da spec.

## Decisões

- Os gates são scripts, não autoavaliação do agente: a pontuação precisa ser reproduzível.
- O "gate de tipo" é `node --check` (sem checador de tipos para JS sem dependência). Ver `openspec/changes/*/design.md` D3.
- `CLAUDE.md`, `docs/agents/` e `.claude/settings.json` são do projeto (`owned`). Mudanças neles só chegam a projetos existentes por migração explícita.
