# Tasks

## 1. Fatia 1 — change, licença, modelos de contexto, `owned`

- [x] 1.1 Criar proposal, specs, design e tasks desta change; verificar com `openspec validate add-matt-skills-and-benchmark --strict`
- [x] 1.2 Registrar a licença MIT e o commit `5beb35b` de `mattpocock/skills` no design (D11) e em `upstreams.mattpocock-skills` do `template.json`; verificar com `node -e` lendo o campo
- [x] 1.3 Criar `templates/docs/agents/{architecture,domain,issue-tracker}.md` com campos `TBD`; verificar que os três existem e contêm `TBD`
- [x] 1.4 Criar `docs/agents/` do próprio template (preenchido; `issue-tracker.md` com o log desta change); verificar que o tracker tem o ponto de restauração
- [x] 1.5 Adicionar `docs/agents` a `owned` e `templates` a `template_only` em `template.json`; verificar com `template-check` (checks 1–3)

## 2. Fatia 2 — `checks`, `/new-project`, suíte mínima

- [ ] 2.1 Escrever testes (RED) para `scripts/gates/checks.mjs` (carregar checks, falha clara sem comando, contagem de testes por formato) e implementar até passar
- [ ] 2.2 Escrever testes (RED) e implementar `lint.mjs` e `syntax-check.mjs`; verificar com `node --test`
- [ ] 2.3 Adicionar `checks`, `template_only` completo e `scripts/gates` em `managed` no `template.json`; verificar com o teste de manifesto
- [ ] 2.4 Atualizar `new-project` (copiar modelos, remover `template_only`, preencher `checks`, limpar `openspec/specs` e `archive`); verificar com os testes de contrato da skill
- [ ] 2.5 Atualizar `template-check` (validar `checks`, `template_only`, rodar a suíte) e `template-update` (aviso sobre migração de `owned`); verificar com os testes de contrato
- [ ] 2.6 Confirmar que `openspec validate --all` aceita `gates.json` dentro da change; verificar rodando o validate com um `gates.json` presente

## 3. Fatia 3 — `spec-create` e `spec-implement`

- [ ] 3.1 Testes (RED) e implementação de `implement-gate.mjs` (baseline, score, novos vs antigos, vereditos `pass`/`retry`/`stop`); verificar com `node --test`
- [ ] 3.2 Criar a skill `spec-create` (wrapper de `/opsx:propose`, `grill-me` com roteiro embutido, `NOTICE.md`); verificar com os testes de contrato
- [ ] 3.3 Criar a skill `spec-implement` (wrapper de `/opsx:apply`, TDD, ciclo do gate, registro no tracker, `NOTICE.md`); verificar com os testes de contrato

## 4. Fatia 4 — `spec-archive`, `pr`, `handoff`, `CLAUDE.md`

- [ ] 4.1 Testes (RED) e implementação de `archive-gate.mjs`, `pr-gate.mjs` e `scope-check.mjs`; verificar com `node --test`
- [ ] 4.2 Criar as skills `spec-archive`, `pr` (sob pedido, com confirmação) e `handoff`; verificar com os testes de contrato
- [ ] 4.3 Atualizar `CLAUDE.md` (leitura de `docs/agents/`, pipeline de 4 passos, gates não puláveis, hooks no headless) e o README; verificar com o teste de contrato do `CLAUDE.md`

## 5. Fatia 5 — modo headless

- [ ] 5.1 Verificar que `claude -p` executa uma skill nomeada no prompt com permissões de `.claude/settings.json` e `--permission-mode dontAsk`; registrar o resultado no tracker
- [ ] 5.2 Criar `.claude/settings.json` com `permissions.allow` e o modo `--headless` nas skills; verificar com os testes de contrato
- [ ] 5.3 Adicionar `--non-interactive` e `--template-source` ao `new-project`; verificar com o teste de contrato
- [ ] 5.4 Testes (RED) e implementação de `scripts/benchmark/lib/claude.mjs` (argumentos, timeout, leitura do JSON); verificar com um `claude` simulado

## 6. Fatia 6 — runner de benchmark (greenfield)

- [ ] 6.1 Registrar no design a tarefa de referência e N (D13, D14); criar `scripts/benchmark/tasks/greenfield-duration/`
- [ ] 6.2 Testes (RED) e implementação do orçamento, do cenário greenfield e da verificação independente com `claude` simulado
- [ ] 6.3 Rodar o greenfield real (N=5) e salvar o relatório

## 7. Fatia 7 — legado e relatório

- [ ] 7.1 Criar a fixture `legacy-pricing` (sem OpenSpec e sem `CLAUDE.md`, com suíte própria), o `docs/agents` da variante e a tarefa; verificar que a suíte da fixture passa
- [ ] 7.2 Testes (RED) e implementação do cenário de legado (instalação do toolset, variantes `with_docs`/`without_docs`) e do relatório JSON/Markdown
- [ ] 7.3 Rodar o legado real (N=5 por variante), salvar o relatório e registrar o resumo final no tracker

## Workflow follow-up

- Arquivar a change com `spec-archive` depois do gate de implementação.
- PR somente sob pedido explícito, com a skill `pr`.
