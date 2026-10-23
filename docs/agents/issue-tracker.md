# Issue tracker

Log de trabalho dos agentes no template. Toda sessão lê este arquivo primeiro e retoma do **Ponto de restauração**.

## Ponto de restauração

- **Change ativa:** nenhuma (`add-matt-skills-and-benchmark` arquivada em `openspec/changes/archive/2026-10-23-add-matt-skills-and-benchmark/`)
- **Branch:** `feat/add-matt-skills-and-benchmark`, a partir de `main` em `822f1cf`
- **Próximo passo:** revisão humana da branch `feat/pendencias-pipeline`. As três pendências foram aprovadas. A skill `pr` só roda sob pedido. A skill `pr` só roda sob pedido explícito. Pendências na entrada da Fatia 7 do Log
- **Bloqueios:** orçamento de `claude -p` esgotado (60/60). Medir o efeito da orientação de comando simples no headless exige uma rodada nova de legado
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
| 2026-10-23 | add-matt-skills-and-benchmark | implement (F6) | 1 | — | runner greenfield, orçamento, verificação independente, relatório | antigos 100% (73/73), novos 100% (11/11), lint 0, tipo 0 | pass |
| 2026-10-23 | add-matt-skills-and-benchmark | benchmark smoke 1 (N=1) | 1 | bootstrap: `rm -rf <target>/.git` negado com a regra `rm -rf <target>:*`; comando com variável de shell negado | regra com glob; `new-project` pede um comando simples por chamada | 0/1, 1 invocação, US$ 0,50 | retry |
| 2026-10-23 | add-matt-skills-and-benchmark | benchmark smoke 2 (N=1) | 2 | bootstrap: `rm -rf <target>/.git` negado também com glob (o Claude Code protege `.git`) | `new-project` monta o projeto com `git init`/`fetch`/`checkout FETCH_HEAD` e `git rm`, sem `rm`; `verifyBootstrap` ignora diretórios vazios; `walkFiles` aceita arquivo; `isMain` seguro | 0/1, 1 invocação, US$ 0,46 | retry |
| 2026-10-23 | add-matt-skills-and-benchmark | benchmark smoke 3 (N=1) | 3 | — | — | 1/1, 5 gates ok, 4 invocações, US$ 4,15 | pass |
| 2026-10-23 | add-matt-skills-and-benchmark | benchmark greenfield (N=5) | 1 | — (relatório gravava o caminho do scratchpad e o home: corrigido com placeholders, teste novo) | — | sucesso 5/5 (100%), gates 100%, fora do escopo 0, cobertura 100%, 20 invocações, US$ 20,70 | pass |
| 2026-10-23 | add-matt-skills-and-benchmark | saída F6 (`validate --all` + `template-check` 1–10) | 1 | — | — | 1/1 válida; READY | pass |
| 2026-10-23 | add-matt-skills-and-benchmark | implement (F7) | 1 | — | fixture, `lib/legacy.mjs`, comparação, `snapshotRepo` | antigos 100% (89/89), novos 100% (14/14), lint 0, tipo 0 | pass |
| 2026-10-23 | add-matt-skills-and-benchmark | benchmark legado, rodada 1 | 1 | o runner caiu: `spawn claude ENOENT` (binário trocado no meio da rodada) e `invokeClaude` não tratava o evento `error`; 13 invocações consumidas, sem relatório | `invokeClaude` resolve a falha de spawn como erro do passo; teste novo (RED visto: o processo travou) | 4 execuções completas reavaliadas a partir dos diretórios: as 4 aprovadas em implementação, arquivamento e escopo | retry |
| 2026-10-23 | add-matt-skills-and-benchmark | benchmark legado, rodada 2 (21 invocações restantes) | 2 | 2 execuções reprovaram no arquivamento: comandos compostos negados levaram o agente a concluir que o Bash estava indisponível | skills `spec-*`: um comando simples por chamada e nova tentativa após negação de comando composto (não medido: orçamento esgotado); `scrubPaths` para caminhos truncados | with_docs 2/3, without_docs 2/3, 0 p.p.; fora do escopo 0; status `budget_exhausted` | pass (parcial) |
| 2026-10-23 | add-matt-skills-and-benchmark | archive (change) | 1 | cenário sem teste: `upstream-sync-check cobre o terceiro upstream` (a skill não tinha sido atualizada) | — | 41/42 (97,62%), suíte verde | retry |
| 2026-10-23 | add-matt-skills-and-benchmark | archive (change) | 2 | — | `upstream-sync-check` compara `mattpocock/skills` desde o commit registrado; teste de contrato | 42/42 (100%), suíte verde; implement 107/107, lint 0, tipo 0 | pass |

## Log

### 2026-10-23 — Correção: caminho da máquina no teste da migração

- O `template-check` reprovou no check 6, porque `scripts/test/template-migrate.test.mjs` tinha o caminho absoluto do `MN_Academy`. O "READY" registrado ao fechar a pendência 3 não valia: o check só olha arquivos rastreados, e o teste ainda não estava commitado naquele momento. O commit `913d75f` entrou com a falha.
- **Corrigido:** o teste monta o projeto derivado com `git archive 822f1cf`, a versão do template de onde o `MN_Academy` foi gerado, ou usa `MIGRATE_PILOT_PROJECT` quando definido. 17/17 nos dois modos; `template-check` READY.

### 2026-10-23 — Pendência 2: aprovada na rodada 2 de 10

- **A rodada 1 não valeu:** as 8 falhas vieram de "You've hit your session limit" (limite da conta), não da tarefa. O runner passou a tratar o limite como orçamento esgotado (`quota_exhausted`), sem contar falha de gate (commit `7bf7aa7`).
- **Rodada 2 (N=8 por variante, 46 invocações, US$ 1,71):**

  | Critério | Limiar | Resultado |
  |---|---|---|
  | Referência nas regras ocultas | 3/3 | 3/3 ✓ (teste do template) |
  | Ingênua falha em ≥ 2 regras | ≥ 2 | 2 ✓ (teste do template) |
  | Melhor variante nos gates normais | ≥ 75% | `without_docs` 87,5% ✓ (`with_docs` 62,5%) |
  | Diferença no gate `hidden` (conclusivo) | ≥ 25 p.p. | 62,5% vs. 0% = **62,5 p.p.**, conclusivo ✓ |
  | Fora de `scoped_paths` | — | 0 |

- **Ressalva de modelo:** a rodada 2 rodou com **`claude-haiku-5-5`**. O modelo padrão mudou depois que a conta saiu do limite; as rodadas anteriores usaram Opus. Isso se confirmou depois da rodada: um `claude -p` sem `--model` respondeu com Haiku, e o custo por passo caiu para ~US$ 0,02. O runner passou a registrar o modelo efetivo (`models`) em cada invocação e no relatório.
- **Falhas de `with_docs` (3):**
  - 2 com o `spec-implement` parado por "Bash denied" antes do baseline;
  - 1 em que o `spec-implement` apontou conflito entre "todas as faturas" (brief) e a isenção (docs) e não implementou;
  - 1 com a spec inválida.
- **Falha de `without_docs` (1):** o `spec-implement` também foi bloqueado no Bash.
- **Achado no runner:** a verificação de implementação aceita uma execução sem testes novos (`new_pct` vazio). O arquivamento pega o caso (cenários sem teste), mas o rótulo "implementação ✓" engana. Proposta: exigir pelo menos 1 teste novo quando a change tiver cenários. Não aplicado: muda a semântica do gate e precisa de aval.
- **Toolset enxuto** nos cenários de legado (commit `7e2712a`), pedido pelo usuário. Vale a partir da próxima rodada; a rodada 2 já usou o completo.
- **Gates da change:** implementação com antigos 165/165 e novos 13/13, lint 0, tipo 0; arquivamento 7/7. Change arquivada.

### 2026-10-23 — Pendência 2: tarefa legacy-billing (rodada 1 de 10: inválida por limite da conta)

- **Smoke 1 (N=1 por variante, US$ 5,30):** a tarefa tinha três defeitos meus: os testes existentes contradiziam a taxa, o campo `legacyContract` vazava a isenção e "taxa sempre 0" passava no oculto. Corrigidos em commit próprio.
- **Smoke 2 (US$ 5,40):** gates normais 1/1 nas duas variantes; regras ocultas `with_docs` 3/3, `without_docs` 1/3.
- **Rodada 1 (N=8 por variante, 37 invocações, US$ 26,01):**
  - **diferença no gate `hidden`:** `with_docs` 50% e `without_docs` 0%, ou seja, 50 p.p., resultado **conclusivo** (limiar 25);
  - **reprovou na validade:** a melhor variante teve 50% de sucesso nos gates normais, contra o mínimo de 75%.
  - **Falhas `with_docs`:** 2 no `spec`, 2 no `archive`. **Falhas `without_docs`:** 3 no `spec`, 1 no `implement`.
  - Relatório em `scripts/benchmark/reports/2026-10-23/legacy-billing-r1/`.
- **Próximo passo:** investigar por que o gate `spec` reprovou (5 execuções; possivelmente faltou `## Premissas` ou a validação `--strict` falhou) e o `archive` em `with_docs` 5–6. Corrigir a causa e rodar a rodada 2. Restam 9 rodadas.

### 2026-10-23 — Pendência 1: comandos simples no headless (aprovada na rodada 1 de 10)

- **Change `measure-headless-compound`:** cenário `archive-only`. Parte do snapshot real `legacy-pricing.pre-archive` (de `with_docs-4`, com a implementação aprovada e o `spec-archive` nunca executado), reinstala o toolset atual e roda só o `spec-archive`. O relatório passa a contar `compound_denials` e `stopped_after_denial` e avalia `acceptance`.
- **Rodada 1 (N=10, 10 invocações, US$ 5,02, ~38 s por execução):**

  | Critério | Limiar | Resultado |
  |---|---|---|
  | Arquivamento | 10/10 | 10/10 ✓ |
  | `stopped_after_denial` | 0 | 0 ✓ |
  | Média de `compound_denials` | ≤ 1 | 0 ✓ |
  | Fora de `scoped_paths` | 0 | 0 ✓ |

  Antes da orientação de comando simples, 2 de 6 execuções falhavam nesse passo. Relatório em `scripts/benchmark/reports/2026-10-23/archive-only/`.
- **Gates da change:** implementação com antigos 126/126 e novos 47/47, lint 0, tipo 0; arquivamento 4/4.

### 2026-10-23 — Pendência 3: migração de projetos existentes (aprovada na rodada 1 de 10)

- **Change `add-template-migrate`:** skill `template-migrate` com `migrate.mjs` no diretório da skill. Ela chega pelo `/template-update` e roda localmente. `plan` só lê; `apply` aplica só os itens confirmados: `managed`, `docs-agents`, `checks`, `settings` e `claude-md`. O `CLAUDE.md` do template ganhou os marcadores `agents-context` e `pipeline`.
- **Achado:** o `/template-update` usa a lista `managed` do próprio projeto, então um caminho `managed` novo (como `scripts/gates`) nunca chegava a projetos antigos. O item `managed` da migração resolve isso.
- **Critérios (todos aprovados):**

  | Critério | Resultado |
  |---|---|
  | Nada perdido | Na cópia do `MN_Academy`, toda linha e toda chave original preservadas (teste `nada do projeto e perdido na migracao`) |
  | Idempotente | A 2ª aplicação não altera nenhum arquivo, e o `plan` mostra tudo `done` |
  | Gates funcionam | `implement-gate baseline` e `score` rodam sem `error` na cópia migrada |
  | Sem confirmação, sem escrita | `apply` sem itens: 0 arquivos alterados |
  | `template-check` | READY (1–10) |
  | Piloto | Cópia do `MN_Academy` → `/template-update` emulado → migração (14 arquivos) → `spec-create --headless` + `spec-implement` (`add-slugify`): spec válida, implementação com 12/12 testes novos, lint 0, tipo 0, 0 fora do escopo, 0 negações. 2 invocações, US$ 1,97 |

- **Gates da change:** implementação com antigos 109/109 e novos 56/56, lint 0, tipo 0; arquivamento 14/14.

### 2026-10-23 — Fatia 7 e entrega

- **Legado:**
  - fixture `legacy-pricing` (sem OpenSpec e sem `CLAUDE.md`, 12 testes, cobertura 98,77%);
  - variante `with_docs` com o `docs/agents/` preenchido (regras de cupom e volume, invariantes);
  - tarefa `legacy-pricing`: extrair as regras para `src/discounts.js` sem mudar totais nem a fatura.
- **Rodada 1 (derrubada):** 13 invocações. As 4 execuções completas, reavaliadas com os verificadores do runner, passaram: with_docs 2/2 e without_docs 2/2.
- **Rodada 2 (21 invocações, `budget_exhausted`):**
  - with_docs 2/3 e without_docs 2/3, diferença de 0 p.p.;
  - em todas as execuções completas, a implementação manteve 100% dos testes antigos (regressão zero) e ficou com 0 arquivos fora de `scoped_paths`;
  - as 2 falhas foram atrito de permissão no arquivamento, não erro de refatoração.

  Relatório em `scripts/benchmark/reports/2026-10-23/legacy/`.
- **Somando as duas rodadas:** with_docs 4/5 e without_docs 4/5. Com essa amostra, não há evidência de que `docs/agents/` mude a taxa de sucesso nesta tarefa. A fixture é pequena e as regras são legíveis no código, então a tarefa não discrimina bem.
- **Orçamento total:** 60/60 invocações (smoke 6, greenfield 20, legado 13 + 21). Custo medido: US$ 50,11 (smoke 5,11 + greenfield 20,70 + legado rodada 2 24,30). O custo da rodada 1 do legado se perdeu com o relatório; a estimativa é ~US$ 13–14 (13 invocações × ~US$ 1,05), o que dá ~US$ 63–64 no total. Fora do orçamento: 8 sondas haiku de permissão (< US$ 0,05).
- **Pendências:**
  1. Medir o efeito da orientação de comando simples nas skills headless (precisa de orçamento novo).
  2. Uma tarefa de legado mais difícil, ou com regra de domínio que não esteja explícita no código, para que a comparação com/sem `docs/agents/` discrimine.
  3. Os projetos derivados existentes só recebem `CLAUDE.md`, `docs/agents/`, `.claude/settings.json` e `checks` por migração explícita, porque são `owned`.
  4. PR somente sob pedido, com a skill `pr`.
- **Change arquivada** com `openspec archive --yes` depois do gate de arquivamento (42/42).

### 2026-10-23 — Fatia 6

- **Runner** (`scripts/benchmark/run.mjs`, `lib/{budget,claude,pipeline,greenfield,report}.mjs`):
  - cada execução clona o template da branch (estado commitado);
  - roda `new-project --non-interactive` → `spec-create --headless` → `spec-implement` → `spec-archive`, sem `pr`;
  - reavalia os gates no diretório da execução: bootstrap, spec válida com Premissas, implementação (antigos, novos, lint, tipo), arquivamento (cenários 100% e specs sincronizadas) e escopo.
- **Tarefa de referência:** `greenfield-duration` (D14), N=5, registrada antes da execução.
- **Execução real:** 5/5 aprovadas, 20–25 testes novos por execução, cobertura de 100%, 0 arquivos fora de `scoped_paths`, ~7–9 min e ~US$ 4,14 por execução. Relatório em `scripts/benchmark/reports/2026-10-23/greenfield/`.
- **Smoke tests antes do N=5:** 6 invocações, US$ 5,11. Encontraram duas restrições do Claude Code no modo headless: `:*` exige fronteira de palavra, e `.git` é protegido de `rm`. O `new-project` passou a usar só git.
- **Negações que não impediram gates:**
  - comandos compostos (`cd …;`, `node …; echo $?`, `for`): 23 nas 20 invocações;
  - `rmdir`: 5.

  Os agentes contornaram as negações com comandos simples.
- **Observado:** em execuções do `spec-create`, o agente deixou restos de marcação de ferramenta (`</content>`) nos artefatos. O `openspec validate --strict` aceitou, e o `spec-archive` limpou antes de arquivar. Vale observar em execuções futuras.
- **Orçamento acumulado:** 26/60 invocações (smoke 6 + greenfield 20). Fora do orçamento: 8 sondas haiku de permissão (< US$ 0,05).

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
