# Issue tracker

Log de trabalho dos agentes no template. Toda sessão lê este arquivo primeiro e retoma do **Ponto de restauração**.

## Ponto de restauração

- **Change ativa:** `add-matt-skills-and-benchmark`
- **Branch:** `feat/add-matt-skills-and-benchmark`, a partir de `main` em `822f1cf`
- **Próximo passo:** Fatia 6: confirmar o pré-requisito (`claude -p` e orçamento), depois o runner greenfield (orçamento, verificação independente, relatório) com testes por `claude` simulado, e por fim a execução real N=5. Começar com `implement-gate.mjs baseline`
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
| 2026-10-23 | add-matt-skills-and-benchmark | implement (F3) | 1 | 5 "testes novos" falhando: `.claude/skills/{skill-comply,continuous-learning-v2}/**/test_*.py` (testes vendorizados do ECC) | — (avaliação inicial) | old n/a, new 89,58% (43/48), lint 0, tipo 0 | retry |
| 2026-10-23 | add-matt-skills-and-benchmark | implement (F3) | 2 | — | `listTestFiles` ignora `.claude/` e `openspec/`; teste novo `listTestFiles ignora o toolset…` (RED visto antes) | new 100% (44/44), lint 0, tipo 0 | pass |
| 2026-10-23 | add-matt-skills-and-benchmark | implement (F3) | 3 | — | baseline novo preserva sessões em `implement.history` (teste e código no mesmo passo; RED não observado) | new 100% (45/45), lint 0, tipo 0 | pass |
| 2026-10-23 | add-matt-skills-and-benchmark | saída F3 (`validate --all` + `template-check` 1–10) | 1 | — | — | 1/1 válida; READY | pass |
| 2026-10-23 | add-matt-skills-and-benchmark | suíte (TDD F4, contratos) | 1 | 7 falhas RED esperadas; após as skills, 3: `spec-create` sem "cannot be skipped" (defeito real) e 2 testes de ordem que comparavam a 1ª ocorrência no arquivo inteiro | skill `spec-create` corrigida; **testes alterados com justificativa**: `/opsx:archive` e `gh pr create` aparecem na introdução e no frontmatter, que não são passos, então a ordem agora é medida só dentro de `## Steps` | 60/62 (faltava o `CLAUDE.md`) | retry |
| 2026-10-23 | add-matt-skills-and-benchmark | implement (F4) | 1 | — | gates de arquivamento, PR e escopo; skills `spec-archive`, `pr` e `handoff`; `CLAUDE.md`; README | antigos 100% (49/49), novos 100% (13/13), lint 0, tipo 0 | pass |
| 2026-10-23 | add-matt-skills-and-benchmark | saída F4 (`validate --all` + `template-check` 1–10) | 1 | — | — | 1/1 válida; READY | pass |
| 2026-10-23 | add-matt-skills-and-benchmark | pré-requisito F5 (`claude -p` + `allowedTools`) | 1 | `permissions.allow` do projeto ignorado: "workspace has not been trusted" (Write e `node` negados) | runner passa a lista do projeto por `--allowedTools`, sem editar a config global | sonda: skill nomeada roda, `touch` negado, 26 eventos de hook | pass |
| 2026-10-23 | add-matt-skills-and-benchmark | implement (F5) | 1 | — | `.claude/settings.json`, headless nas skills, `new-project --non-interactive`, `lib/claude.mjs` | antigos 100% (62/62), novos 100% (11/11), lint 0, tipo 0 | pass |
| 2026-10-23 | add-matt-skills-and-benchmark | saída F5 (`validate --all` + `template-check` 1–10) | 1 | — | — | 1/1 válida; READY | pass |

## Log

### 2026-10-23 — Fatia 5

- **Pré-requisito verificado (sonda em scratchpad, 5 invocações `claude -p --model haiku`, custo < US$ 0,03, fora do orçamento do benchmark):**
  - `/ping <arg>` executa a skill nomeada no prompt;
  - `--permission-mode dontAsk` nega o que não está na lista;
  - os hooks disparam no `-p`.
- **Achado:** o Claude Code ignora o `permissions.allow` do projeto em workspace não confiável. A decisão foi passar a lista do `.claude/settings.json` por `--allowedTools`, em vez de marcar diretórios como confiáveis no `.claude.json` global (registrado no design, D12).
- **`.claude/settings.json`** (`owned`): ferramentas do pipeline, git sem `push`/`-C`, sem `gh`, sem `rm`. `rm` e `git -C` foram tirados porque a lista também vale nas sessões interativas. O `new-project` do benchmark recebe essas regras só para o destino.
- **Skills:** `spec-create --headless` (premissas em `## Premissas`); `spec-implement` e `spec-archive` sem perguntas, com linha final de status; `new-project --non-interactive` com `--template-source` local.
- **`scripts/benchmark/lib/claude.mjs`:** argumentos (`-p`, `--output-format json`, `dontAsk`, `--allowedTools`, nunca `--dangerously-skip-permissions`/`--bare`), timeout com SIGTERM→SIGKILL e leitura de custo, turnos e negações.

### 2026-10-23 — Fatia 4

- **Gates:**
  - `archive-gate.mjs`: pré-condição de implementação `pass`, suíte verde e cenário↔teste pelo nome normalizado.
  - `pr-gate.mjs`: nenhuma change ativa, árvore limpa e testes passando.
  - `scope-check.mjs`: arquivos fora de `scoped_paths` desde uma referência git.

  O ciclo (`decideVerdict`, constantes) foi movido para `gate-store.mjs`, compartilhado pelos gates.
- **Skills:**
  - `spec-archive`: gate → `/opsx:archive` ou `openspec archive --yes` → `openspec-sync-specs`.
  - `pr`: só sob pedido explícito, nunca headless, com confirmação antes de `gh pr create`; `NOTICE.md` MIT.
  - `handoff`: ponto de restauração em `docs/agents/issue-tracker.md`; `NOTICE.md` MIT.
- **Verificado na prática:** `openspec archive <c> --yes` move a change para `openspec/changes/archive/<AAAA-MM-DD>-<c>/` com o `gates.json` e aplica os deltas em `openspec/specs/`.
- **`CLAUDE.md`:**
  - leitura obrigatória de `docs/agents/`;
  - pipeline de 4 passos, com gates que não podem ser pulados;
  - modo headless (`dontAsk`, sem `--dangerously-skip-permissions`, sem `--bare`, hooks do ECC ativos);
  - a nota de que ele é `owned`.

  O README ganhou a seção "Pipeline com gates".

### 2026-10-23 — Fatia 3

- **`scripts/gates/implement-gate.mjs`:** `baseline` e `score`. Separa testes novos e antigos pela lista de arquivos do baseline, e um teste removido conta como falha. Lint e tipos entram por código de saída. Os vereditos `pass`/`retry`/`stop` são impostos por constantes (`MAX_CORRECTIONS = 3`, `REQUIRED_PCT = 100`, `MAX_ERRORS = 0`). `gate-store.mjs` grava `gates.json` na change.
- **Correção encontrada pelo próprio gate:** os testes do ECC em `.claude/` contavam como testes do projeto. Ver a tabela Gates, tentativas 1 e 2.
- **`runCommand`:** remove `NODE_TEST_CONTEXT`. Sem isso, um `node --test` aninhado não imprime o resumo e a contagem falha.
- **Skills:** `spec-create` (wrapper de `/opsx:propose`, `grill-me` ou o roteiro embutido `interview.md`) e `spec-implement` (wrapper de `/opsx:apply`, TDD e ciclo do gate). Cada uma tem `NOTICE.md` MIT.
- **Gate aplicado a esta change:** o baseline retroativo é `test_files: []`, porque `822f1cf` não tinha testes. Ver `openspec/changes/add-matt-skills-and-benchmark/gates.json`.

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
