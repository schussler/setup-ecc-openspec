# Issue tracker

Log de trabalho dos agentes no template. Toda sessão lê este arquivo primeiro e retoma do **Ponto de restauração**.

## Ponto de restauração

- **Marco de adoção registrado:** 2026-10-24 — aprovador: Douglas. Escopo restrito: uso experimental supervisionado em Node 24.21.0/macOS, uma única fatia (`implement`). Base: aprovação do contrato `336249d1-e8e3-43e3-ac57-a35f8147f22d` (hash `9fc8fe2b…751f7a`, versão 1) e validação final aprovada em 2026-10-24T14:12:58.827Z (828 casos). Limitações mantidas: multifatia, Ctrl+C durante a invocação e caminhos com espaço em `--claude-bin` pendentes; limite de turnos não comprovado (P.2 não autorizada); PB-009 aberto; Node 22 não verificado; isolamento advisory. `--legacy-write` preservado; adoção em projetos reais não autorizada. Não é conformidade integral com o desenho original.
- **Change ativa:** `add-proportional-change-flow` (implementação supervisionada concluída; arquivamento bloqueado pelo fluxo atual: o gate de implementação do runner não está em pass; change mantida aberta). `add-spec-harness` continua aberta e também bloqueia o `pr-gate`, porque o gate reprova qualquer diretório fora de `archive/`. Estado de `add-spec-harness`: (F1 a F12, A, B.1 a B.8, C, P.1 e 12.5 concluídos; 13.2, 10.3, 12.4b, B.9, P.2 e P.3 pendentes)
- **Branch:** `rorqual` (worktree), a partir de `main` em `8401fa1`; sem commit
- **Próximo passo (2026-10-24, `add-silent-consumption-observability`):** change `add-silent-consumption-observability` com implementação supervisionada concluída e arquivamento bloqueado pelo gate de implementação (não passou por `spec-implement`). Para arquivar, decidir como concluir esse gate (execução headless paga do `spec-implement`, ou outro caminho aprovado) e depois rodar `spec-archive`. Aprovações registradas: `add-spec-harness` v3 e `add-silent-consumption-observability` v2. Anterior: decisão sobre como fechar o gate de implementação de `add-proportional-change-flow` pelo runner (a execução está em `awaiting_decision`); arquivamento depende disso. Pendências documentais do log de 2026-10-24. Separadamente, decisão do dono sobre o ajuste mínimo de escopo para arquivar `add-spec-harness` (spec-gates F10, pipeline-benchmark PB-009, run-control limite por fatia). v1 experimental (harness v1.2 `39d7fcac…`) commitada sem arquivar. Trabalho futuro listado no log de 2026-10-24. Evidências do experimento: `~/dev/setup-ecc-openspec-experimentos/2026-10-24-add-kebab-case-helper`.
- **Bloqueios:** orçamento de `claude -p` esgotado (60/60). Medir o efeito da orientação de comando simples no headless exige uma rodada nova de legado
- **Pendente de autorização:** sonda paga de `--max-turns` (tarefa P.2 de `tasks.md`), com orçamento pretendido de US$ 0,05, sem teto exato. Não autorizada e não executada. Sem ela, o limite de turnos não é comprovado.
- **Change ativa (simplify-approval-and-execution, 2026-10-24):** implementada e testada (suíte 924/924 após o ajuste). O ajuste de consolidação foi feito, mas o contrato mudou e a aprovação anterior (versão 1) não vale mais. Próximo passo: confirmação única do usuário para registrar a versão 2 pela conversa (caminho 3, frase "aprovado"); depois regerar `supervised-completion.json` e arquivar. Itens de saída preservada e interrupção não fazem parte desta change (são de `add-spec-harness`, já arquivada). Sem commit, push ou PR.
- **Arquivadas em 2026-10-24 (conclusão supervisionada e gate pass):** `add-proportional-change-flow` (2 tarefas REFACTOR sem caixa marcada); `add-silent-consumption-observability`; `add-spec-harness` (5 tarefas abertas, incluindo P.2, a sonda paga não autorizada, e 10.3 pendente). Ponto de atenção: o registro anterior dizia que arquivar `add-spec-harness` dependia de decisão do dono sobre escopo mínimo; arquivei com base no contrato e no gate, e isso precisa de confirmação.
- **Atualizado em:** 2026-10-24

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
| 2026-10-23 | add-spec-harness | implement (F1–F4) | 1 | 5 arquivos de teste do benchmark (archive-only, greenfield, hidden, legacy, run-cli) falham: replayam snapshots legados sem ID de cenário, exigidos por AC-003 e SG-009 | F1 policy/profile, F2 estado/lock, F3 gates (sem escrita, TAP, identidade), F4 spec-create | antigos 81,48%, novos 100%, lint 0, tipo 0, 5 falhas de saída | retry |
| 2026-10-23 | add-spec-harness | implement (correções aprovadas) | 2 | — | benchmark com avaliador legado isolado (PB-007, PB-008); identidade por project_id e lock revisado (RS-008 a RS-021); 4.3 validação do contrato; revisões voltam a 1 antes da aprovação | antigos 100%, novos 100%, lint 0, tipo 0, 0 falhas de saída | pass |
| 2026-10-23 | add-matt-skills-and-benchmark | archive (change) | 2 | — | `upstream-sync-check` compara `mattpocock/skills` desde o commit registrado; teste de contrato | 42/42 (100%), suíte verde; implement 107/107, lint 0, tipo 0 | pass |
| 2026-10-24 | add-spec-harness | archive (12.5, fluxo legado, `--legacy-write`) | 1 | — | C.1 a C.3 aplicados; nenhuma alteração de código nesta avaliação | cenários 218/218 (100%), suíte verde, `openspec validate --strict` válido | pass |

## Log

### 2026-10-24 — simplify-approval-and-execution: implementação supervisionada e conclusão registrada

- **Estado:** change implementada e validada localmente, sem commit, push ou PR. Arquivamento não feito (aguarda decisão do usuário).
- **Aprovação do contrato:** registrada pela conversa com `scripts/harness/authorize.mjs conversa`, caminho 3, frase "Aprovado o escopo e as premissas.", aprovador Douglas. Registro com `procedure: conversa`, `contract_hash` `8b4bab3b…616ca4`, versão 1. Não usa TTY, e não alega autenticação forte.
- **Premissas assumidas (não aprovadas além da frase):** diagnóstico reaproveita `stop_reason` e `symptoms`; registro de conversa reaproveita `contract_approval`; conclusão supervisionada não depende do runner; cenários MODIFIED de `spec-gates` começam na revisão 1.
- **Implementado:** `recordConversationApproval` e o CLI `conversa` em `scripts/harness/authorize.mjs`; `scripts/harness/supervised-completion.mjs` (grava e lê `supervised-completion.json`); `scripts/gates/archive-gate.mjs` aceita a conclusão válida; `diagnoseStop` em `scripts/harness/stop-report.mjs`; seções nas skills `change-flow`, `spec-create`, `spec-implement` e `spec-archive`; seção em `.claude/harness/policy.md`.
- **Conclusão supervisionada gravada:** suíte, lint, sintaxe, `openspec validate --strict` e contrato passaram agora; hash do contrato igual ao da aprovação. O arquivo `supervised-completion.json` fica na change, fora do git até o commit.
- **Gate de arquivamento (pontuado, não gravado):** veredito `pass`, 21/21 cenários cobertos, avaliador `id`.
- **Testes:** suíte completa 921/921; lint 0 erro; sintaxe 0 erro. Testes novos: `aprovacao-conversa` (8), `conclusao-supervisionada` (4), `execucao-excecao` (7), `archive-supervisionado` (3).
- **Desvio em teste existente (justificado):** `scripts/test/harness/runner-gates.test.mjs` ([RC-029]). O invariante "skills e runner não citam `authorize.mjs`" ganhou uma exceção única: o comando `authorize.mjs conversa` em `spec-create`. `recordAuthorization` e `authorize.mjs record` continuam proibidos em todo lugar. Motivo: AP-006 exige que a aprovação da conversa seja registrada pelo agente. A asserção foi estreitada, não removida.
- **Vereditos não alterados:** `gates.json` e `authorizations.json` de `add-spec-harness`, `add-silent-consumption-observability` e `add-proportional-change-flow` permanecem como estavam. O diff dessas pastas está vazio.
- **Próximo passo:** decidir (1) se `spec-archive simplify-approval-and-execution` deve rodar agora e (2) se a conclusão supervisionada deve ser gerada para as três changes abertas. Cada uma depende do próprio contrato e da própria evidência; nada foi feito nelas.
- **Não feito:** commit, push, PR, chamada paga, execução headless, arquivamento, alteração de orçamento ou de limites.

### 2026-10-24 — add-silent-consumption-observability: implementação supervisionada concluída; arquivamento bloqueado

- **Estado:** change mantida aberta. Implementação concluída localmente, sem `spec-implement` (sem execução paga do runner).
- **Aprovações registradas (TTY, Douglas):** `add-spec-harness` versão 3 (`a687ab69-a30f-4494-a2a4-4e9e7f945fef`, hash `9309f657…68b8`); `add-silent-consumption-observability` versão 2 (`c15a88c9-b7ec-426e-afde-95f07caf36ad`, hash `0bfec198…7777f`). A versão 1 da nova change (`41b7c66c`, hash `4c8adb62…`) e a v2 de `add-spec-harness` (`236094ec…`) ficam como histórico.
- **Verificações locais:** suíte 899/899; lint 0; sintaxe 0; `openspec validate --all` ok; `openspec validate --strict` e `contract.mjs` sem erro nas duas changes.
- **Arquivamento:** `archive-gate.mjs --legacy-write` reprovou (tentativa 1, `stop`): "o gate de implementação não está em pass; rode spec-implement antes de arquivar". Registrado em `gates.json`. O gate não foi contornado.
- **Pendência:** decidir como concluir o gate de implementação (execução headless paga do `spec-implement`, ou outro caminho aprovado) antes de `spec-archive`.
- **Não feito:** chamadas pagas, push, PR, nova implementação. Commit local feito na entrega desta etapa.

### 2026-10-24 — add-silent-consumption-observability: implementação local e testes

- **Aprovações conferidas:** `add-spec-harness` versão 2 (`4d2453e8-ee18-47e8-8523-a77bcef8345f`, hash `236094ecdd4930859ea1205dbe1b51355012f8a9f89e03e217cf42ac20a8b830`) e `add-silent-consumption-observability` versão 1 (`41b7c66c-582e-42d6-ae35-c8a71da2451a`, hash `4c8adb62a618e5d52939bf93e2ca5f1e03b3fe6b628bd946c6973194baff0bb4`), ambas `contract_approval`, aprovador Douglas. A aprovação `336249d1` segue como histórico.
- **Implementado:** `scripts/harness/observation.mjs` (modo, aviso não bloqueante, consolidação, resumo e subcomando `consumo`); `runner.mjs` (reserva, autorização, liquidação e `--max-budget-usd` só no modo financeiro; evento com `stage` e `attempt`; aviso não bloqueante); `telemetry.mjs` (campos `stage` e `task`); `cli.mjs` (`consumo`); `cli-run.mjs` (`stage`); skill `spec-archive` (passo 8, depois do arquivamento).
- **Testes:** `scripts/test/harness/observacao-consumo.test.mjs`, 20 testes, um por CO-001 a CO-020. Suíte 899/899, lint 0, sintaxe 0. Mutação do modo (padrão financeiro) derruba 8 dos 20.
- **Testes existentes alterados (asserções inalteradas):** o modo financeiro passou a ser declarado nos testes que exercitam reserva, autorização, saldo ou reconciliação: `cli-run.test.mjs` (perfil do projeto), `f6-limits.test.mjs`, `runner-gates.test.mjs`, `f5-adjust.test.mjs`, `f6-resume.test.mjs`, `f6-interrupt.test.mjs`, `b5-restore.test.mjs`, `integração-reconciliacao.test.mjs` e o fixture `fixtures/runner-child.mjs`. Justificativa: na revisão de `add-spec-harness`, esses requisitos valem só com `modo_financeiro: true`.
- **Decisão do dono (2026-10-24):** `modo_financeiro` fica no perfil da execução, com padrão `false`. D1 de `add-silent-consumption-observability` foi atualizado, e as frases "configuração da change" de proposal e spec da mesma change foram alinhadas ao perfil. Mudar o modo invalida a validação (a impressão inclui o perfil), mas não o hash do contrato. O hash do contrato da nova change mudou por causa dessa edição: novo hash `0bfec198d30f34102611d583c0dde97965f02f7293f9d3d57195e2c25794777f`. A aprovação `41b7c66c` (hash `4c8adb62…`) não vale mais, e uma nova aprovação `contract_approval` precisa ser registrada em TTY.
- **`add-spec-harness` alinhado (2026-10-24):** o requisito "Invocação headless" e a nota de revisão do `design.md` dizem agora que `modo_financeiro` fica no perfil da execução, com padrão `false`. Hash atual: `9309f6572beee0c106ac379b13917280cc63b2b2d0fd166c4ced017a85e768b8`. A versão 2 (`236094ec…`) não vale mais: precisa de aprovação `contract_approval` versão 3, em TTY, antes do arquivamento e da execução.
- **Aprovações pendentes (humano, TTY):** (1) `add-spec-harness`, hash `9309f657…68b8`; (2) `add-silent-consumption-observability`, hash `0bfec198…7777f`. Nenhuma foi registrada nesta etapa.
- **Limites declarados:** CO-003 cobre o limite de invocações; correções, sintoma repetido e caminho protegido no modo de observação não têm teste próprio. CO-014 é teste de unidade do aviso, sem falha injetada no runner. O RED não foi observado item a item.
- **Não feito:** commit, push, PR, arquivamento, chamada paga, autorização financeira.

### 2026-10-24 — add-silent-consumption-observability: spec criada (rascunho, sem implementação)

- **Decisão do dono:** opção A. Orçamento, autorização `budget`, reserva e reconciliação financeira passam a valer só com `modo_financeiro: true` na configuração da change. Modo padrão: observação silenciosa, sem autorização de orçamento nem bloqueio por custo.
- **Revisão em `add-spec-harness`:** só os requisitos conflitantes ("Invocação headless"; "Orçamento com limites independentes", "Reserva e custo", "Reconciliação de reservas", "Registro de reconciliação idempotente e correspondido" e "Extensão de orçamento com autorização"). Nenhum cenário mudou de texto nem de revisão. Nota de revisão em `design.md`.
- **Aprovação anterior preservada:** `336249d1-e8e3-43e3-ac57-a35f8147f22d` (hash `9fc8fe2b…751f7a`) fica como registro histórico em `authorizations.json`, intacta, e não aprova o contrato revisado. Hash atual de `add-spec-harness`: `236094ec…30b8a830`.
- **Nova change:** `openspec/changes/add-silent-consumption-observability/` (proposal, design, specs `harness-consumption-observation` com CO-001 a CO-020, tasks). Estado do contrato: rascunho. Hash atual: `4c8adb62…4bb0bb4`. Referencia a revisão de compatibilidade sem repetir requisitos.
- **Validação:** `openspec validate --strict` válido nas duas changes; `contract.mjs` 0 erro nas duas.
- **Pendente, humano (TTY, `authorize.mjs`):** registro da aprovação do contrato revisado de `add-spec-harness` e da aprovação da nova change. Nenhuma foi registrada nem reutilizada. Sem essas aprovações, a execução supervisionada não começa.
- **Não feito:** implementação, testes, autorização financeira, chamada paga, commit, push ou PR.
- **Premissas a confirmar na aprovação:** limites não financeiros ativos no modo de observação; nenhum `--max-budget-usd` nesse modo; resumo fora do hash do contrato.

### 2026-10-24 — add-proportional-change-flow: implementação supervisionada concluída; arquivamento bloqueado pelo fluxo atual

- **Estado:** change mantida aberta. Implementação supervisionada concluída fora do runner, na cópia candidata (base `bb90790`, commit `0738bd6` só na cópia) e incorporada ao worktree principal sem commit. Arquivamento bloqueado pelo fluxo atual: `archive-gate` reprova com "o gate de implementação não está em pass; rode spec-implement antes de arquivar". O veredito de implementação não foi alterado à mão, e o gate de arquivamento não foi contornado.
- **Runner:** execução `229724cc` em `awaiting_decision` (`human_decision_needed`) após 2 invocações pagas e 2 avaliações do gate, ambas reprovadas por módulo ausente. Não aprovou a fatia nem a execução.
- **Consumo:** 2 invocações com `claude-sonnet-5-5`: US$ 0,5342 e US$ 0,3010, total reportado US$ 0,8352 de US$ 3,00 autorizados. O saldo não usado (US$ 2,1648) não foi gasto. O consumo da conclusão manual não passa pelo runner e não está medido, então o total pode estar incompleto.
- **Limitação do harness:** mudanças em caminhos que a ferramenta protege (`.claude/`, em `dontAsk`) não são concluídas pelo runner headless, e a regra `permissions.allow` não as libera. Esses casos precisam de encaminhamento para execução supervisionada, em vez de novas tentativas de correção.
- **`changes_produced`:** não medido. O runner não preenche o campo, e `[]` não significa ausência de alterações.
- **Verificação local (não é aprovação do runner):** suíte 879/879 no worktree principal; testes change-flow 35/35; lint 0 erro; sintaxe 0 erro; `openspec validate --strict` válido; `contract.mjs` 0 erro. Contrato inalterado (`9438f705…c88`).
- **Nomes de testes:** cada cenário CF-001 a CF-014 tem um teste com `[ID] <nome exato do cenário>` (14 de 14). Asserções preservadas.
- **Pendências documentais (não corrigidas nesta rodada):**
  1. `spec-create/SKILL.md` diz que o gate de arquivamento casa cenário com teste "com o mesmo nome". O código casa pelo `[ID]` no nome do caso (`archive-gate.mjs:76`). O nome exato é compatível com o gate, mas a documentação precisa ser corrigida.
  2. `change-flow/SKILL.md`, regra 5: a skill diz `investigar` só quando o fato desconhecido decide a descida. `change-flow.mjs` devolve `investigar` para qualquer fato de risco desconhecido. Os dois levam a perguntar ou investigar; alinhar o texto numa mudança futura.
- **Evidências:** `~/dev/setup-ecc-openspec-experimentos/2026-10-24-add-proportional-change-flow/`, com autorização (`authorizations.json`, não reutilizada), estado e eventos do runner, transcrições das duas invocações, testes, patch da cópia e manifesto SHA-256.
- **Não feito:** commit, push, PR, arquivamento, nova chamada headless.

### 2026-10-24 — add-proportional-change-flow: spec criada (sem implementação)

- **Entendimento aprovado:** três caminhos por risco (não por diff); caminho 1 sem change, com registro curto no tracker; caminho 2 com contrato curto e confirmação das decisões faltantes; caminho 3 com aprovação formal; ponto de entrada `change-flow`; detecção da regra "Zero código sem spec" antiga; fixture de classificação; sem caminhos protegidos; comportamento novo declarado.
- **Artefatos:** `openspec/changes/add-proportional-change-flow/` (proposal, specs `change-flow` com CF-001 a CF-012, design com fatia única F1, tasks 1 a 7). `openspec validate --strict` válido; `contract.mjs` 0 erro.
- **Premissas assumidas:** a classificação é feita por fatos declarados e uma função pura (D1 do design), que é uma escolha minha; os testes são estáticos e de função pura, sem provar classificação real do agente.
- **Contrato curto de caminho 2:** validado em cópia descartável fora do repositório. Passa em `openspec validate --strict` e `contract.mjs`; cenário sem ID é reprovado (`HI-003`). Resultado registrado no design.
- **Correção de premissa:** a versão anterior desta entrada assumia que trocar a "Change ativa" liberava o `pr-gate`. Isso é falso: o gate reprova qualquer diretório fora de `archive/`.
- **Não feito:** implementação (tasks 1 a 7 pendentes), chamada ao modelo, orçamento, `authorize.mjs`, commit, PR. Lacuna declarada: avaliação visual real não executada.

### 2026-10-24 — revisão final do diff, trabalho futuro e arquivamento retido

- **Revisão do diff (208 arquivos):** sem segredos (o único achado é o padrão de teste em `f9-export.test.mjs`); sem arquivos temporários; `console.log` só nos pontos de entrada das CLIs. Saneados caminhos da máquina: `scripts/test/harness/fixtures/tap-node22-mixed.tap` (4 caminhos do scratchpad em linhas YAML de diagnóstico, trocados por `/tmp/tapgen`; o parser ignora essas linhas e `f7-suite.test.mjs` segue 11/11) e este tracker (scratchpad e diretório pessoal trocados por `<scratchpad da sessão>` e `~/dev/`). Alterações rastreadas revisadas: pertencem à entrega.
- **Concluído no escopo da v1 experimental:** F1 a F12 (exceto 10.3 e 12.4b), A.1 a A.15, B.1 a B.8, C.1 a C.4, P.1, 12.5, 13.1, 13.2 (marco restrito); correções da rodada 1 e de medição (v1.1, v1.2); experimento com uma rodada aprovada (1b).
- **Trabalho futuro (não entregue):**
  1. Remoção de `--legacy-write` (10.3), após a decisão de migração.
  2. Adoção em projetos derivados reais (12.4b).
  3. Reavaliação de PB-009 (B.9) com log da falha original.
  4. Sonda paga de `--max-turns` (P.2) e controle condicional (P.3); sem ela, o limite de turnos não é anunciado.
  5. Execução multifatia: `REQUIRED_SLICES` só tem `implement`; sem encadeamento de fatias por dependência na execução.
  6. Limite de invocações por fatia (`candidate_invocations_per_slice`): declarado, não aplicado pelo runner.
  7. Ctrl+C durante a invocação no `run`.
  8. Caminhos com espaço em `--claude-bin`.
  9. Node 22 (Docker indisponível) e rodadas 2 e 3 do experimento.
- **Arquivamento retido:** o contrato ainda exige itens adiados: `spec-gates` (remoção de `--legacy-write` na F10), `pipeline-benchmark` (marco bloqueado por PB-009, em conflito com o marco restrito decidido pelo dono) e `harness-run-control` (limite por fatia). Ajuste mínimo de escopo apresentado ao dono; sem aprovação, a change continua ativa. Sem conformidade integral com o desenho original.

### 2026-10-24 — evidências do experimento preservadas em diretório persistente

- **Local:** `~/dev/setup-ecc-openspec-experimentos/2026-10-24-add-kebab-case-helper` (fora de qualquer repositório; não entra na impressão da evidência). Índice em `README.md`; hashes de todos os arquivos em `MANIFEST.sha256` (47 arquivos, 2,6 MB).
- **Conteúdo:** contrato e perfil do experimento; testes de referência e oráculo; por rodada (rodada-1, harness original `0471c916…`; rodada-1b, v1.1 `e59e653d…`): relatório, saída do run, tempos, suítes antes e depois, run-state, eventos, report.md/json da versão da rodada, autorizações, resumo durável e checkpoint (1b), entrega do executor e diff da cópia.
- **Sem segredos:** varredura de padrões de chave, token, senha e e-mail sem achados; só aprovador (Douglas) e usuário local (schussler).
- **Versões e limitações preservadas no índice:** nenhuma rodada com a v1.2 (`39d7fcac…`); os report.md das rodadas refletem as versões delas. O scratchpad da sessão não é persistente.

### 2026-10-24 — defeitos de medição corrigidos (harness v1.2) e encerramento da v1 experimental

- **Aprovação final e entregas (TE-004, TE-005):** `validateFinal` grava o evento `validacao_final` (`accepted` com a entrega da execução quando aprovada; `failed` caso contrário) com o resultado por cenário do resumo durável. O relatório separa: "Aprovação final do runner" (aprovada, não aprovada ou não medida), "Aceitação interna do runner (cenários obrigatórios)" (N de M, ou não medida sem cenários) e "Avaliação externa de referência: não medida (fora do runner)". `metrics.acceptance` manteve a forma.
- **Tempo da validação final (RC-026, RC-036):** a duração entra no tempo ativo, na categoria nova `validacao`. Com o limite total já atingido, a validação não roda; se a validação o ultrapassa, a execução não é aprovada, `execution_approval` fica nulo e a parada é `time_limit` (de `approved` passa por `ready`, pela tabela). Limite: menor entre a política e o perfil gravado no estado.
- **Testes:** `scripts/test/harness/medicao-final.test.mjs` (5, relógio controlado). Suíte 844/844, lint 0, sintaxe 0, `contract.mjs` 0, `openspec validate --strict` válido. Revalidação `add-spec-harness` pass às 15:20:13Z, aprovação `336249d1` mantida. Nenhum teste antigo alterado. Sem chamada paga.
- **Versões:** harness v1.2 = sha256 `39d7fcac8e9cf313177486970dcee8e88a6d145436202a7e6b6d2cdf4222f943` (mesma regra). A rodada-1b segue como evidência da v1.1 (`e59e653d…`, conferido na cópia, árvore inalterada); a rodada 1, da versão original (`0471c916…`). Nenhuma rodada foi executada com a v1.2.
- **Encerramento da v1 experimental:** pronta para uso experimental supervisionado em Node 24.21.0/macOS, uma única fatia. Rodadas 2 e 3 adiadas. Pendências conhecidas: multifatia, Ctrl+C durante a invocação, caminhos com espaço em `--claude-bin`; P.2/P.3 (limite de turnos não comprovado); PB-009 aberto; Node 22 não verificado; isolamento advisory; 10.3 e 12.4b adiadas.

### 2026-10-24 — experimento add-kebab-case-helper, rodada 1b (harness v1.1, paga, autorizada)

- **Execução:** `9eb2bc0e` na rodada-1b, orçamento `c7883913`, `claude-sonnet-5-5` (efetivo igual). Resultado: pass, fatia e execução aprovadas, validação final 845/845 às 15:05:28Z, perfil `experimento.json` na impressão.
- **Entrega:** referência 11/11 (fora da cópia), executor 6/6, regressões 0, aprovação incorreta não, intervenção humana 0. Escopo restrito à change e aos dois arquivos novos.
- **Consumo:** 1 invocação, 0 correções, 2 avaliações do gate; US$ 0,428784 informado pela CLI; tokens entrada 16, saída 4.176, cache criado 81.199, cache lido 621.963; 665 s de relógio (ativo 429,6 s).
- **Achados não corrigidos:** `report.md` mostra aceitação 0 de 0 e entregas 0 com execução aprovada (lê só eventos); validação final fora do tempo ativo.
- **Relatório:** `<scratchpad da sessão>/experimento/rodada-1b-relatorio.md`. Harness não alterado durante a rodada. Rodadas 2 e 3 não autorizadas.

### 2026-10-24 — revalidação do harness v1.1 e preparação da rodada-1b

- **Revalidação:** `validate.mjs add-spec-harness` pass às 14:42:30Z, 839/839, aprovação `336249d1` mantida (hash do contrato inalterado); o resumo registra `profile_path` e `profile_content`.
- **Versão do harness:** v1.1 = sha256 `e59e653d60fc2f3ce95bdc03943cee6a35dd5b38638def63a742db8afddb873c` sobre `scripts/harness`, `scripts/gates`, `.claude/harness` e `.claude/skills/spec-implement` (arquivos ordenados, sem o perfil do experimento). A base original da rodada 1 tem `0471c916…5bde` pela mesma regra. Resultados das rodadas 1 e 1b pertencem a versões diferentes.
- **base-1b:** cópia nova da versão corrigida, commit `4ac7d66` só na cópia descartável, com a change `add-kebab-case-helper` da base original (contrato `4864b4c3…cb151`, inalterado; aprovação `7d52fe7e`, orçamento revogado e revogação no histórico), o perfil do experimento e a tag `origem-822f1cf`. A base e a rodada 1 originais não foram alteradas.
- **rodada-1b:** clone de `4ac7d66`; harness `e59e653d…`; nenhum orçamento ativo; suíte 839/839 sem skip; gate de implementação em seco na cópia intocada: pass, 839 casos lidos por TAP, AC-005 e AC-017 aprovados.
- **Pendente:** orçamento da rodada 1b registrado pelo dono em `rodada-1b`. Rodadas 2 e 3 não autorizadas.

### 2026-10-24 — encerramento da rodada 1 e correções autorizadas (harness v1.1 do experimento)

- **Rodada 1 encerrada** pelo dono, com resultado, custo (US$ 0,785662) e evidências preservados em `rodada-1` e `rodada-1-relatorio.md`. Saldo do orçamento `39420094` não será usado.
- **Gate estruturado (SG-001, SG-006, AC-016):** com `checks.test_report`, `implement-gate.mjs` executa cada arquivo de `test_report.files` com `file_command` (ou a suíte com `command`, sem `file_command`) e lê só TAP com `parseTapCases`, o mesmo leitor da validação final. `checks.test_file` (saída legível) não é usado nesse modo. Formato incompatível segue recusado por `validateChecksSchema` com erro de configuração. Sem `test_report`, o modo legado compatível (AC-023) não mudou. Testes: `scripts/test/gates/implement-gate-structured.test.mjs` (5).
- **Relatório (TE-004):** correções pedidas usam os contadores do estado como piso; paradas por tipo usam o maior entre eventos e `stop_history`; a parada da fatia (`slice.mjs`) passou a gravar `stop_history`. "Total completo" traz `(escopo: execução automatizada medida; preparação interativa não mensurada)` e `cost.total_scope` no JSON.
- **Impressão (EV-001):** `run` grava `profile` (caminho, sha256, conteúdo) no estado antes da primeira chamada; `fingerprint` usa esse perfil (lido do arquivo bruto, sem validar o estado, para manter EV-002) e registra `profile_path`, `profile_sha256` e `profile_content`; o resumo durável também.
- **Expectativas de testes novos ajustadas antes do GREEN, com justificativa:** a TAP escapa `#` como `\#` no nome (a identidade segue o leitor da validação final); o perfil padrão é arquivo do projeto e continua na árvore de código da impressão; o total do relatório vem dos eventos. Nenhum teste antigo alterado: a linha do total manteve o prefixo `Total completo: sim|não`.
- **Verificação:** suíte 839/839, lint 0, sintaxe 0, `contract.mjs` 0, `openspec validate --strict` válido. Hash do contrato inalterado (`9fc8fe2b…751f7a`). Sem chamada paga.

### 2026-10-24 — experimento add-kebab-case-helper, rodada 1 (paga, autorizada)

- **Execução:** `a0a5ebfc` na rodada-1, orçamento `39420094`, `claude-sonnet-5-5` (efetivo igual), Claude Code 2.1.310. Parada: `awaiting_decision`, `human_decision_needed` (RC-015) após 2 invocações, 2 avaliações do gate e 1 correção sem alteração.
- **Entrega:** referência 11/11 (fora da cópia), testes do executor 6/6, suíte 834/834 sem regressão. Aprovação incorreta: não. **Rejeição indevida por defeito do harness:** o gate por arquivo usa `checks.test_file` (reporter spec), e dois testes antigos com `# SKIP` literal no nome viram `skip`.
- **Consumo:** US$ 0,785662 informado pela CLI; tokens (main loop) entrada 26, saída 7.391, cache criado 154.330, cache lido 943.801; 453 s (gate 370,6 s).
- **Achados não corrigidos:** gate ignora `test_report.file_command`; `report.md` não conta correção nem parada; "total completo" sem a preparação interativa; impressão com o perfil padrão.
- **Relatório:** `<scratchpad da sessão>/experimento/rodada-1-relatorio.md`. Harness não alterado durante a rodada.

### 2026-10-24 — base do experimento fixada e rodada-1 preparada

- **Revogação conferida:** `5507c3d6-fc9c-4401-ac1b-1c3276bcaf35` revoga `55881231`; nenhum orçamento ativo na base; integridade de `authorizations.json` confere.
- **Base:** commit `5b9f74a` só na cópia descartável (autorizado pelo dono), com a aprovação `7d52fe7e`, o orçamento revogado e a revogação no histórico. Tag `origem-822f1cf` trazida do template: os 3 testes de `template-migrate.test.mjs` que dependem desse commit eram pulados na base de histórico novo, e o gate reprova caso antigo pulado. Nenhum teste ou harness alterado.
- **rodada-1:** `git clone` da base em `5b9f74a`; contrato `4864b4c3…cb151`, marco reconhecido, nenhum orçamento ativo, árvore limpa. Suíte antes da execução: 828/828, sem skip (`rodada-1-suite-antes.tap`). Perfil do experimento sha256 `cad1ba969865b679cbd3315269388391c57ae80cadcff8ac99ddc46e89aa19f9` (a impressão da evidência registra só o perfil padrão; limitação declarada, harness não alterado).
- **Pendente:** orçamento da rodada 1 registrado pelo dono em `rodada-1`.

### 2026-10-24 — aprovação registrada, revalidação e marco restrito

- **Aprovações conferidas:** `336249d1-e8e3-43e3-ac57-a35f8147f22d` (`add-spec-harness`, hash `9fc8fe2b…751f7a`, versão 1) e, na base do experimento, `7d52fe7e-57f1-46ce-939d-113628b20db2` (`add-kebab-case-helper`, hash `4864b4c3…cb151`, versão 1). Ambas `origin: human`, `procedure: tty`, aprovador Douglas.
- **Revalidação:** `validate.mjs add-spec-harness` pass às 14:12:58Z, 828/828, autorização `336249d1` na impressão. 219 s.
- **Marco 13.2:** registrado no ponto de restauração, com escopo restrito e limitações.
- **Orçamento gravado no destino errado:** `55881231-c1d0-4b70-9c9b-5f9a9c0af52e` (US$ 3,00 / US$ 1,00) foi gravado na base do experimento porque o `cd` para `rodada-1` falhou (a cópia ainda não existia). Preservado no histórico; revogação pendente pelo dono. A base só recebe commit e `rodada-1` só é criada depois da revogação, para nenhuma cópia herdar orçamento ativo.

### 2026-10-24 — captura de tokens (TE-001) e preparação do experimento

- **Correção autorizada pelo dono (TE-001):** `classify` em `claude.mjs` lê `usage` da saída JSON (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`) com `scope: main_loop`, porque `usage` não inclui subagentes (documentação do Claude Code). Sem `usage`, ou com contagem inválida, `tokens` fica nulo. `eventFromInvocation` repassa o campo. RED→GREEN: 2 testes em `f9-telemetry.test.mjs`. Suíte 828/828, lint 0, sintaxe 0. Nenhuma outra melhoria. Hash do contrato inalterado.
- **Experimento (base, sem commit ainda):** cópia descartável em `<scratchpad da sessão>/experimento/base`, com repositório git próprio. Change `add-kebab-case-helper` (contrato aprovado pelo dono na conversa; registro formal pendente), hash `4864b4c34b874ea80dd42d4d14e697ce6b8a5d71afde45ca8dfb1bc7fe4cb151`, `openspec validate --strict` e `contract.mjs` sem erros. Perfil `.claude/harness/profiles/experimento.json` (4 invocações, US$ 1,00 por chamada, US$ 3,00 no total, 900 s por chamada, 2700 s no total), validado contra a política.
- **Testes de referência fora da cópia:** `<scratchpad da sessão>/experimento/referencia/kebab-case.reference.test.mjs` (11 casos, sha256 `37137f4df88f82524f32e25255f89f4949fed3852c51885949a69f11347cf8d5`), satisfazíveis por uma implementação de controle (`oraculo.mjs`), também fora da cópia.
- **Pendente:** registro da aprovação de `add-spec-harness` pelo dono; depois revalidação, marco e commit da base.

### 2026-10-24 — encerramento da rodada e pendências conhecidas do uso experimental

- **Decisão do dono:** encerrar a rodada sem novos ajustes. Uso experimental supervisionado com uma change pequena, tratada como uma única fatia (`implement`). Isso não é conformidade integral com o desenho original.
- **Pendências conhecidas (não implementadas):**
  1. **Execução multifatia:** `REQUIRED_SLICES` contém só `implement`; cada invocação do `run` recebe todas as tarefas abertas da change, sem divisão por fatia nem dependências entre fatias na execução.
  2. **Ctrl+C durante a invocação:** o `run` não trata o sinal; o processo morre, o lock fica e a retomada exige lock vencido (`lock_stale_seconds`), `lock_release` humano e reconciliação da reserva. Durante o gate, o sinal já é tratado (D8).
  3. **Caminhos com espaços em `--claude-bin`:** o comando é dividido por espaço; caminho com espaço não é aceito.
- **Sem alteração de contrato, código ou testes nesta entrada.** Hash do contrato para aprovação: `9fc8fe2b46abac559642481ccb2a1bb4d6321cd8430ee0d9dd680fe97f751f7a`.

### 2026-10-24 — entrada pública da execução headless (C.4)

- **Lacuna:** o ciclo executar → avaliar → corrigir → parar ou concluir existia só como função interna (`runSlice`, usada nos testes). Nenhuma CLI nem skill o expunha.
- **Entregue:** `node scripts/harness/cli.mjs run --change <change>` (`scripts/harness/cli-run.mjs`). Liga `runSlice` ao gate de implementação real e à validação final. Prompt `/spec-implement <change> --runner-step`; correção com `--correction` e os casos que falharam. `spec-implement` documenta `run` e o passo `--runner-step`. Decisão reversível registrada no design. Sem arquitetura nova.
- **Ajustes em código existente:** `runSlice` aceita prompt de correção como função do veredito e grava impressão, casos e tentativa na aprovação da fatia, quando a avaliação os traz. `withLock` exportado de `cli-actions.mjs`.
- **Bug corrigido (RC-021):** a parada `authorization_required` (e `config_error` da sonda) não era gravada no estado, porque `runHarnessStep` recusa antes do lock. O `run` grava a parada com o lock.
- **Teste novo com expectativa corrigida antes do GREEN:** eu esperava `repeated_symptom` para a correção sem efeito, mas a RC-015 para antes, na segunda correção com o mesmo descritor (`human_decision_needed`). O código segue o contrato; mudou só a expectativa do teste novo.
- **Simulador:** `fake-claude.mjs` ganhou `FAKE_CLAUDE_TOUCH` e `FAKE_CLAUDE_TOUCH_ON_CALL`, que criam um arquivo na n-ésima chamada (correção simulada).
- **Verificação:** `cli-run.test.mjs` (7 testes, pelo mesmo comando do usuário, simulador em `--claude-bin`). Suíte 826/826, lint 0, sintaxe 0, `contract.mjs` 0, `openspec validate --strict` válido. `validate.mjs add-spec-harness`: pass às 12:57:06Z, 826 casos, autorizações 0. Sem chamada paga.
- **Hash do contrato mudou** (design.md): `9fc8fe2b46abac559642481ccb2a1bb4d6321cd8430ee0d9dd680fe97f751f7a`. A aprovação pendente do dono deve conferir este hash.

### 2026-10-24 — conferência da aprovação, validação legada 12.5 e classificação das tarefas

- **Registro de aprovação do contrato: não encontrado.** `openspec/changes/add-spec-harness/authorizations.json` não existe neste worktree nem no checkout principal; nenhum outro `authorizations.json` recente fora das fixtures do scratchpad. `evidence-summary.json` continua com `authorizations: []` (validação de 05:14:44Z). Hipóteses: o comando rodou em outro diretório, ou foi encerrado antes da confirmação por código. Sem o registro, a revalidação com autorizações não foi feita.
- **12.5 (validação pelo fluxo atual):** `archive-gate.mjs --change add-spec-harness` sem gravar: pass, 218/218, 42 s; depois com `--legacy-write`: tentativa 1 de archive em `gates.json`, pass. `openspec validate add-spec-harness --strict`: válido. Cópia anterior de `gates.json` no scratchpad. Local, sem custo.
- **Classificação:** concluídas 2.9 (RS-019 e RS-023 testados: renew-id, new-project, clone, template-update), 12.5 e 13.1 (819/819 com simuladores, sem chamada real). Bloqueada 13.2 (marco autorizado pelo dono só como "pronto para uso experimental supervisionado em Node 24.21.0/macOS", mas depende do registro de aprovação do contrato, ausente). Adiadas pelo dono: 10.3 (remoção de `--legacy-write`) e 12.4b (adoção real). Bloqueadas: P.2 (sonda paga não autorizada) e P.3 (condicional a P.2). Aberta: B.9 (PB-009 sem log da falha original; não marcar por passagens posteriores).
- **Change não concluída:** 13.2, 10.3, 12.4b, B.9, P.2 e P.3 pendentes. Runner não declarado operacional; `--legacy-write` preservado.

### 2026-10-24 — ajustes finais da v1 para uso experimental supervisionado

- **Tracker fora da impressão:** docs/agents/issue-tracker.md em excluded_paths (autorização do dono). Requisitos e decisões que afetam a execução ficam no contrato ou em configuração versionada; o tracker é narrativa (D14).
- **Identidade dos testes:** checks.test_report.file_command e files declarados pelo projeto; identidade "<arquivo>::<nome>"; soma por arquivo confere com a suíte; sem file_command e com nomes repetidos, inventory_ambiguous. Nenhuma colisão silenciosa.
- **Interrupção em gate:** awaiting_gate ↔ interrupted; timeout encerra a árvore; término não confirmado bloqueia; parcial descartado; retomada reexecuta o gate do início.
- **Lock nos testes:** relógio injetado; nenhuma espera real.
- **Ambiente verificado:** Node 24.21.0, macOS. Node 22 não verificado e não bloqueia a v1.
- **PB-009:** ocorrência e incerteza preservadas; impede declarar confiabilidade comprovada; permite avaliar uso experimental supervisionado limitado.
- **Sonda P.2:** não autorizada; perfis que exigem limite de turnos comprovado continuam bloqueados.
- **--legacy-write:** preservado até a decisão de migração.


### 2026-10-24 — resumo durável corrigido (inventário completo); revalidação final em seguida

- **Defeito encontrado na aprovação anterior:** o resumo tinha 212 entradas, uma por cenário, enquanto a suíte capturada tinha 795 casos. Faltavam 583 regressões sem vínculo, e o ID do cenário estava no lugar da identidade do caso. Isso descumpria EV-012 e a decisão do dono. O "212 de 212 casos" relatado antes eram cenários, não casos.
- **Suspeita retirada:** a captura TAP não era reaproveitada. Cada validação gera execution_id e captura próprios; a da aprovação batia com approved_at.
- **Correção:** cases = inventário completo {case_id, name, status, scenario_ids}; scenarios por cenário; case_counts com total, tap_total, por status, com e sem vínculo. Inventário divergente da TAP → inventory_mismatch, sem aprovação. Limitação: case_id fora do manifesto usa o caminho de subteste, e nomes iguais em arquivos diferentes podem colidir.
- **Suíte:** 797/797; lint, sintaxe, contrato e openspec em 0.
- **Próximo:** revalidação final da change, que regrava o resumo.


### 2026-10-24 — B.5, B.6 e B.8 concluídos; validação final da change aprovada pelo caminho novo

- **B.6:** gate oculto com classificação declarada por regra (obrigatória ou informativa); sem classificação = obrigatória; só obrigatória reprovada reprova a aceitação.
- **B.5:** manual_rollback via legacy-run.mjs restore: TTY, hash da cópia pré-migração, evento restore, campo restored com hashes, consumo e reservas preservados, reconciliação exigida com reserva aberta. Sem reversão transparente. Design atualizado para citar o comando.
- **Vínculos:** PM-010 e SG-015 por tag em teste existente que já provava o cenário; SG-018 por teste de caracterização (passou de primeira); SP-001 por teste novo com RED (as skills ganharam a declaração do runner).
- **B.8:** tentativas 1 e 2 reprovaram por regressão do agente (skill citava authorize.mjs, RC-029); corrigida no código. Tentativas 3 e 4 aprovaram com 212/212 casos. evidence-summary.json gravado.
- **Achado:** docs/agents/issue-tracker.md entra na impressão da evidência. Cada entrada nova no tracker invalida a aprovação até nova validação. Não alterei a política (policy.json é protegido); decisão do dono.
- **Esta entrada** é seguida de nova rodada da suíte e da validação, para que o resumo reflita o estado final.


### 2026-10-24 — add-spec-harness: B.5 (manual_rollback), B.6 (gate oculto classificado), vínculos e B.8

- **B.6:** cada regra oculta tem classificação declarada na tarefa (`hidden_rules` em `task.json`, `obrigatória` ou `informativa`); regra sem classificação é obrigatória; classificação inválida ou de regra inexistente é recusada. O gate `hidden` traz `results` (regra, resultado, classificação), `failed_mandatory` e `failed_informative`. Só regra obrigatória reprovada reprova a aceitação; diagnóstico informativo reprovado mantém `passed` (PB-010, PB-011, PB-012). `legacy-billing` declara as três regras como obrigatórias (comportamento anterior preservado).
- **Teste antigo alterado por B.6 (justificativa):** `gate hidden roda os testes ocultos depois do pipeline` ganhou a tag `[PB-010]` e uma asserção de classificação por regra, porque o THEN revisado de PB-010 exige "o resultado de cada regra com a classificação declarada na tarefa". As asserções antigas ficaram. A regra não foi alterada para passar.
- **B.5:** `rollbackLegacyRun` implementa D32 nesta ordem: terminal interativo (sem TTY recusa sem alterar arquivos), aprovador e motivo, pré-condição de hash (`pre_migration_sha256` gravado agora no checkpoint de migração; hash divergente ou ausente recusa sem alterar arquivos), confirmação por código, lock da change, evento `kind: "restore"` em `events.jsonl`, restauração de `gates.json` e `issue-tracker.md`, campo `restored` (origem, hash anterior, hash restaurado, `transparent: false`) com consumo e reservas preservados, e `awaiting_decision` + `reconciliation_required` quando há reserva aberta. O relatório declara que a restauração não é transparente. Comando humano: `legacy-run.mjs restore --change <c> --approver <n> --reason <m>`. Nada em `authorizations.json`.
- **Interpretações (sem mudar o contrato):** (1) o `run-state.json` legado da cópia não volta, porque o modo é imutável (RS-008) e a reconciliação D26 só existe no modo runner; (2) D32 pede "comando humano", então `legacy-run.mjs` ganhou o subcomando `restore`; a nota de design.md "A recuperação não tem comando" e a questão aberta 10 ficaram desatualizadas e não foram editadas (o contrato não foi tocado); (3) a skill não importa `authorize.mjs` (RC-029): a confirmação por TTY é local, no mesmo padrão.
- **Testes antigos alterados por B.5:** PM-005 e os dois PM-009 de `migration-legacy.test.mjs` passaram a chamar a nova assinatura (decisão humana em TTY simulado, em vez de registro `kind: manual_rollback`, que contradizia D32).
- **Vínculos:** SG-015 e PM-010 (5 casos) receberam a tag no nome, sem mudar comportamento; SG-018 tem teste novo de caracterização (passou de primeira); SP-001 tem teste novo (RED: as skills não declaravam o runner na execução autônoma) e as três skills `spec-*` ganharam uma frase.
- **B.8:** tentativas 1 e 2 reprovaram em RC-029 por regressão minha (a skill citava `authorize.mjs`); corrigida no código, sem mudar o teste. Tentativa 3 aprovada: 212/212 casos, `evidence-summary.json` gravado. Esta entrada foi escrita depois da tentativa 3 e exige nova validação para o resumo continuar válido.
- **Não feito:** commit, push, PR, chamada ao modelo, sonda, benchmark pago, adoção. B.9, P.2, 10.3, 12.4b, 12.5 e 13.x continuam abertos. Não declarado operacional.

### 2026-10-24 — percurso integrado (execução 2) aprovado na fixture; validação final da change reprovada (B.8)

- **Correções:** C1 (gate pass aprova a fatia; a execução só aprova com todas as fatias e a validação final); C2 (evento de interrupção só após transição aceita e persistida; recusa grava transition_refused). Extras: liberação de lock vencido agora chamada pela CLI e pelo runner com lock_release humano; relatório passa a contar chamada morta e exposição pelo estado.
- **Interrupção durante gate:** não implementada; o design não prevê awaiting_gate → interrupted. RC-046 coberto por interrupção sem reserva a partir de invoking.
- **Percurso 2 (fixture, simulador, CLIs das skills):** start, falha, retry, correção, pass (fatia aprovada, execução não), runner morto com reserva 2,50 de custo desconhecido, lock_held, espera de 900 s, stale_lock, lock_release em pty (TTY simulado, não prova autoria), interrupt com reconciliation_required, reconcile closed_unknown (balance_effect conferido), reconcile repetido = duplicate, resume com mesmo execution_id, validate-final pass, checkpoint archived, report. Execução da fixture aprovada.
- **Evidência:** scratchpad/e2e-run1 (preservada) e scratchpad/e2e-run2.
- **Suíte:** 779/779; lint, sintaxe, contrato e openspec em 0.
- **B.8 (validação final da change real), tentativa 1:** reprovada em 34753 ms. 7 cenários sem caso [ID]: PB-010, PB-011, PB-012, PM-010, SG-015, SG-018, SP-001. Nenhum resumo gravado. Não há run-state persistido para a change real; nenhuma execução atribuída ao runner.
- **Em andamento:** B.5 (manual_rollback), B.6 (classificação do gate oculto), vínculo dos 4 cenários restantes, e nova tentativa de B.8. B.9 permanece pendente.


### 2026-10-24 — add-spec-harness: CLI do runner, reconciliação D26 e conexão das skills

- **Entregue:** `scripts/harness/cli.mjs` (subcomandos start, gate-implement, gate-archive, validate-final, checkpoint, fail, interrupt, resume, reconcile, report, summary) sobre `cli-actions.mjs`, que só chama funções existentes e não importa o adaptador do claude. Reconciliação D26 integrada ao runner: saldo calculado com os nove campos, sem truncamento, `closed_unknown` mantém a exposição. Reserva de chamada interrompida ou de checkpoint importado sem registro D26 bloqueia a próxima chamada paga. P.1: classificador puro da sonda (`scripts/harness/probe.mjs`), sem chamada.
- **Decisões reversíveis** (design.md, "Decisões reversíveis da CLI do runner"): `kept` não contabiliza custo; custo acima da reserva gera efeito negativo com aviso; evento de restauração como `kind: "restore"` em `events.jsonl`; legacy-run ganhou o ponto de entrada `migrate` (a dependência não foi eliminada, pois as funções têm testes PM-001 a PM-009); recuperação não tem comando, é o procedimento `manual_rollback`.
- **Registro formal D26:** continua pendente em `authorizations.json`. Enquanto isso, a CLI guarda os registros em `run-state.json` (`reconciliations`, `reconciliation_base`).
- **Marco de adoção:** `start --mode runner` exige a linha `Marco de adoção registrado: <data> — aprovador: <nome>` nesta página. Ela ainda não existe; por isso nenhuma execução foi atribuída ao runner.
- **Testes antigos alterados:** ver o registro em `scratchpad/cli-test-changes.md` (d26-reconciliation, f6-fixes, skills-runner). Nenhum teste foi removido.
- **Verificado:** suíte 767/767 (Node 24.21.0); lint 0; sintaxe 0; contrato 0; `openspec validate add-spec-harness --strict` válido.
- **Itens marcados em tasks.md:** B.1, B.2, B.3, B.4 e P.1. Abertos: B.5 (código de restauração), B.6, B.7 (faltam validação, checkpoint e relatório no percurso), B.8, B.9, P.2, 10.3, 12.4b, 12.5 e 13.x.
- **Não feito nesta etapa:** nenhuma chamada ao modelo, sonda paga, benchmark, commit, push ou PR.

### 2026-10-24 — decisões do dono do projeto: fechamento das lacunas da v1 (sem marco)

- **Marco de adoção:** NÃO autorizado ainda.
- **Node 22:** pendente até Docker estar disponível. Validação vale só para Node 24.21.0.
- **closed_unknown:** exposição no comprometido, reserve_released_usd 0; continuidade exige extensão explícita; não é custo conhecido.
- **Gate oculto:** regras obrigatórias de domínio participam da aceitação funcional; "oculto" é visibilidade. Diagnósticos classificados podem ser informativos.
- **D26:** aprovado pelo dono em 2026-10-24. Registro formal em authorizations.json pendente do comando authorize.mjs record com TTY, a executar pelo dono. Efeitos separados: valor reservado, reserva encerrada, custo contabilizado, saldo disponível. Exemplo: reserva 2,50 e custo 0,42 → liberação 2,50, custo 0,42, efeito líquido 2,08.
- **Pedidos de implementação:** CLI dos gates e checkpoint de arquivamento; reconciliação integrada ao runner; P.1 com fixtures; identidade owned e migração/recuperação; legacy-run; manual_rollback com procedimento real; percurso integrado com simulador; validação final desta change pelo caminho novo; avaliação do PB-009.
- **--legacy-write:** preservado até o marco e a confirmação de ausência de execução legada ativa.


### 2026-10-24 — add-spec-harness: revisão de prontidão para o marco de adoção

- **Estado verificado:** suíte 705/705 (Node 24.21.0); lint 0; sintaxe 0; contrato 0; openspec válida. 95 itens marcados, 10 abertos.
- **Pronto:** estado e lock; identidade (project_id, local_id, execution_id); gates sem escrita; invocação com reservas e autorização; invalidação transitiva; validação final e resumo durável; manifesto e CLI; distribuição com módulos do harness; telemetria ligada ao runner; retenção por datas registradas; skills para o runner; benchmark em três níveis; fixtures de migração (12.4a).
- **Bloqueios para o marco:** (1) PB-008/PB-009 sem causa; 18 reexecuções sem reprodução; a ocorrência original segue aberta. (2) Node 22 não verificado: Docker sem daemon; Homebrew não autorizado. (3) D26 pendente; conflito de closed_unknown entre o pedido e o contrato. (4) Hidden: PB-004 contradiz a regra "informativo" da spec original; dois testes foram alterados. (5) P.1 (classificador da sonda com fixtures) não implementado; P.2 não autorizada. (6) 2.9 (identidade owned) pendente. (7) 10.3 depende do marco. (8) 12.4b sem projetos identificados. (9) 12.5 não executada. (10) 13.1 e 13.2 dependem dos anteriores.
- **Lacunas de implementação:** CLI do runner para gate de implementação e checkpoint archived ainda não existe; legacy-run.mjs sem ponto de entrada; manual_rollback não existe em D32; reconcileRecord não integrado ao runner.
- **Não declarado operacional.**


### 2026-10-24 — Node 22: verificação via Docker indisponível (pendência mantida)

- **Verificado:** o cliente Docker existe, mas o daemon não responde (socket do Colima ausente). Nenhuma imagem baixada.
- **Decisão aplicada:** a pendência do Node 22 permanece. Não instalei Homebrew nem iniciei serviço. Quando o daemon estiver disponível, a autorização aprovada cobre: imagem oficial node:22, testes sem credenciais, repositório de origem preservado, escrita em cópia temporária, registro de versão e digest. A comprovação vale só para o ambiente Linux testado.
- **Até lá:** a declaração de compatibilidade com Node 22 fica bloqueada.


### 2026-10-24 — add-spec-harness: F9 entregue; parada para decisões

- **F9 (9.1 a 9.3):** telemetria append-only em .harness-local (custo unknown nunca zero), retenção sem apagar estado, report.json/report.md com custo separado e declarações de independência e isolamento, exportação sem segredos, marcação de Node >= 22 não verificado. Gitignore com .harness-local/.
- **Verificado por mim:** 614/614; lint 0; sintaxe 0; contrato 0; openspec válida. 82 itens [x], 21 [ ] (pendências de adoção e marco).
- **Dúvidas da F9:** (1) eventos de diagnóstico do lock no mesmo events.jsonl; (2) ligação ao runner não listada no 9.3; (3) retenção de relatórios por mtime não está na spec.
- **Pendências:** Node 22 (aguarda método escolhido); D26 (aguarda aprovação, esquema colado na resposta); 12.3 e 12.4a/b; PB-008/PB-009 com risco residual; sonda P.2 não autorizada.
- **Runner:** não declarado operacional. Próxima fatia: F10 (skills), depois F11, F12 e marco.


### 2026-10-24 — add-spec-harness: pendências F7/F8 fechadas; F9 iniciada

- **A.3 (EV-007, HI-014):** invalidação transitiva por cenário, interface, regra e fatia; referência inválida recusada; marcas no resumo; validação final completa continua obrigatória. Itens A.8 a A.15 marcados.
- **Vínculos por caso, hash de arquivo, mock como aviso, finalidades de autorização:** implementados conforme aprovação. Nome do campo no contrato alterado de case_body_hash para file_hash (design e spec).
- **CLI do manifesto:** generate (candidato, nunca aprovação; recusa sobrescrever) e validate (sem escrita).
- **Distribuição:** new-project e template-update copiam scripts/harness e .claude/harness; migrate e check-update recusam destino sem os módulos; template-check reconhece os dois formatos de checks.
- **Node 22:** não verificado. Nenhum Node 22 instalado; opções (Homebrew node@22 keg-only ou Docker) aguardam aprovação.
- **Suíte:** 592/592; lint 0; sintaxe 0; contrato 0; openspec válida (Node 24.21.0).
- **Pendentes:** 12.3 (inclui test_report na migração) e 12.4a/b; D26 pendente de aprovação; PB-008/PB-009 aberto com risco residual; sonda P.2 não autorizada.


### 2026-10-24 — PB-008/PB-009: 18 reexecuções sem reprodução (risco residual)

- **Reexecuções:** 15 sequenciais e 3 paralelas do arquivo de teste indicado. Total 18. Todas passaram pelo conteúdo da saída (o código de saída da espera paralela falhou no script; a evidência é o conteúdo).
- **Resultado:** não reproduzida. A ocorrência original (PB-009) não tem mensagem de erro registrada e permanece aberta. Não é encerrada por verde.
- **Hipóteses não testadas:** carga alta durante a suíte completa; edição concorrente do fixture durante cópia; variáveis de ambiente diferentes da sessão original; subprocesso encerrado por sinal reportado como saída 1; nested node --test sem timeout.
- **Risco residual para a revisão de adoção:** uma falha intermitente sem causa pode voltar e reprovar ou aprovar indevidamente. Antes do marco de adoção, a evidência deve ser apresentada com este risco explícito.
- **Relatório:** scratchpad/pb008/relatorio.md.


### 2026-10-24 — add-spec-harness: F8 entregue (spec-accept e RED); parada autorizada

- **Entregue:** `scripts/harness/red.mjs` (classificação behavioral × environment; mock inválido; pré-existente); skill `.claude/skills/spec-accept/SKILL.md` (não edita specs; gera testes com [ID]); testes f8-*. Itens 8.1 a 8.4 marcados.
- **Verificado por mim:** 524/524; lint 0; sintaxe 0; contrato 0; openspec válida.
- **RED:** a primeira rodada teve RED inválido (módulo ausente = environment); corrigido antes de seguir. Três testes de AC-008 passaram no stub (âncoras de regressão).
- **Dúvidas abertas:** (1) caminhos protegidos de policy.json não cobrem testes de aceitação de projetos; checkAcceptanceChange usa os hashes de D28; (2) nenhum módulo grava acceptance-manifest.json (falta CLI de escrita); (3) classificação de mock é heurística (mensagem "of undefined" ou marcador mock: true), sem marcador definido no contrato.
- **Não resolvido por verde:** A.3 (propagação para fatias, EV-007); PB-008/PB-009; D26 pendente; Node 22 pendente; sonda P.2 não autorizada.
- **Próximo passo:** decidir o que segue da lista acima. F9 a F12 e marco 13 ficam para nova autorização. O runner não está declarado operacional.


### 2026-10-24 — add-spec-harness: caminho novo do contrato (A.1–A.7), A.3 aberta

- **Aprovado e implementado:** checks.test como {command, suite} (string legada mantida); checks.test_report {command, suite, format} com tap; manifesto de aceitação (D28) com identidade do caso, hash com helpers, 1..n casos por cenário; reaceitação em três verificações; condições suportadas (formato, chamada paga) e "condição não avaliada" explícita; impressão com derivados e checkbox operacional; template.json com o caminho novo.
- **Suíte:** 505/505; lint 0; sintaxe 0; contrato 0; openspec válida.
- **Aberto:** A.3 (propagação de invalidação para fatias, EV-007): sem teste nem implementação.
- **Escolhas técnicas sem decisão explícita (revisar):** purpose das autorizações revision (test_adequacy, sufficiency, exception); tag [ID] por cenário em casos com vários cenários; case_body_hash no nível de arquivo; carimbo de autorizações como confiança no primeiro uso; invalidação de dependentes exige test_adequacy.
- **Pendências:** Node 22 (decisão sua, sem comprovação aqui); D26 pendente de aprovação; PB-008/PB-009 aberto; sonda P.2 não autorizada; skill template-check ainda exige checks.test string; authorize record --data substitui scope.
- **Investigação PB-008:** não reproduzida (15/15 sequencial, paralela ok); PB-009 segue aberto.


### 2026-10-24 — PB-008 investigado: não reproduzido, PB-009 continua aberto

- **Repetição sequencial:** 15/15 passaram (3 testes por execução). **Paralela:** 3 processos, todos com 3 passes pelo conteúdo da saída (o registro de código de saída falhou no script de espera, então a evidência é o conteúdo).
- **Hipóteses não testadas:** carga alta durante a suíte completa; edição concorrente do fixture durante cpSync; variáveis de ambiente diferentes da sessão original; subprocesso morto por sinal reportado como saída 1. O teste aninha node --test sem timeout, ponto plausível para lentidão sob carga. Hipótese, não achado.
- **Estado:** PB-008 e PB-009 permanecem abertos. A falha original não tem mensagem de erro registrada. Passar a suíte não fecha o não determinismo.
- **Relatório:** scratchpad/pb008/relatorio.md.


### 2026-10-24 — add-spec-harness: F7 entregue (validade e validação final), dúvidas de contrato

- **Entregue:** `evidence.mjs` (impressão, caminhos protegidos, [ ]→[x]), `test-report.mjs` (TAP por caso, captura em .harness-local), `validate.mjs` (validação final, resumo durável, archiveApproval). Opção `protect` no runner e no slice (protected_change). 36 testes novos.
- **Verificado por mim:** 465/465, lint 0, sintaxe 0, contrato 0, openspec válida. Itens 5.5 e 7.1 a 7.9 marcados.
- **Limitações declaradas:** fixtures TAP foram capturadas no Node 24, não no 22. Não há checks.test_report no template.json: a própria change para com config_error ao validar até a decisão 1.
- **Dúvidas de contrato (decisão pendente):**
  1. `checks.test` precisa ser objeto `{command, suite}` para carregar a suíte; hoje o loadChecks legado aceita só string.
  2. Manifesto de aceitação (`acceptance-manifest.json`) não está definido na spec; usado `{entries: [{id, file, scenario_revision, case_body_hash}]}`, a ser gerado na F8.
  3. EV-007 fala em dependências, mas D21b não tem campo para isso; usado `Depende de:` opcional.
  4. EV-011 fala em gravar o resumo no arquivamento; D16 diz nos marcos. Gravado na aprovação da validação final.
  5. Revisão invalida a evidência até reaceitação confirmada no manifesto: concilia EV-007 e AC-020, precisa de aprovação.
  6. Só "quando houver formato X" e "quando houver chamada paga" são avaliadas; outras condições são tratadas como exigidas.
  7. A impressão exclui tasks.md, evidence-summary.json e checkpoint.json; authorizations.json tem hash próprio.
- **Não resolvido por verde:** PB-008 (PB-009); esquema de reconciliação (D26, pendente); sonda P.2 (não autorizada); distribuição de scripts/harness pelo new-project (F12).


### 2026-10-24 — add-spec-harness: regressão do benchmark, causa e correção

- **Sintoma:** 7 falhas no benchmark (greenfield x2, archive-only, hidden, legado, runner report, execução após negação, orçamento esgotado) depois da correção da F6.
- **Controle:** clone limpo do HEAD passou 9 de 9 no greenfield. A regressão era da sessão, não pré-existente.
- **Causa:** os gates passaram a importar `scripts/harness/process-group.mjs` e `scripts/harness/identity.mjs`. O simulador de `new-project` e o instalador do toolset copiavam só `scripts/gates`. No alvo, o gate não conseguia importar o módulo.
- **Ponto de adoção (F12):** `scripts/harness` é `managed` no template.json, então o `new-project` real e o `template-update` também precisam copiá-lo. Sem isso, um projeto derivado recebe gates que não importam. Pendente para F12.
- **Correção:** simuladores espelham `scripts/harness` como o manifesto declara; `verifyBootstrap` reprova alvo sem `process-group.mjs`; fixture de bootstrap ganhou o arquivo. Testes de benchmark não foram enfraquecidos.
- **Resultado:** suíte 429/429, lint 0, sintaxe 0, contrato 0, openspec válida.
- **Não resolvido por verde:** PB-008 (PB-009) continua aberto; pendências contratuais continuam abertas; sonda P.2 não autorizada; origem `human` + `procedure: tty` aprovada.


### 2026-10-24 — add-spec-harness: decisões aprovadas (RC-014, estados, reconciliação, tempo, origem)

- **Aprovado:** runner novo sem parada por contagem de falhas (RC-041); SG-018 só no legado; três ocorrências seguidas da mesma assinatura continuam param (RC-014); `diagnosing` com motivo opcional; `reconciliation_required` só com consumo ou reserva a reconciliar (RC-046); `lock_sha256` como identificação do conteúdo, não prova de autoria; tempo ativo por categoria, gates com timeout `max_seconds_per_gate` (1500, provisório); `origin: human` com `procedure: tty`.
- **Pendente de aprovação:** esquema de registro de reconciliação (D26), com exemplo sem dados sensíveis. Implementado só como proposta; não considerado aprovado.
- **Incidente das tentativas 3 e 4:** causa observada em D25. O comando de avaliação excedeu o tempo da ferramenta de shell, que o moveu para segundo plano em vez de encerrá-lo; o `score` continuou e registrou a tentativa 3. O script do gate não tinha timeout próprio. Não é causa confirmada de outra natureza. Tentativas 3 e 4 preservadas.
- **Não resolvido por verde:** PB-008 (não determinismo, PB-009) continua aberto. Pendências contratuais continuam abertas até decisão humana registrada. Sonda P.2 continua não autorizada.


### 2026-10-23 — add-spec-harness: F5 ajustes e F6 entregues; parada por contrato (6.2)

- **Gate:** tentativas 3 e 4 registradas com `pass` sobre o mesmo código. A tentativa 3 saiu de um comando com tempo estourado que também chegou ao `score`; a 4 foi registrada de propósito. Nenhuma foi apagada. Antigos 100%, novos 100%, lint 0, tipo 0. Baseline original preservada.
- **Suíte:** 413/413. Lint 0, sintaxe 0, `contract.mjs` 0, `openspec validate --strict` válida.
- **F5 ajustes:** orçamento em `total_usd` e `per_call_usd`; revogação própria; `probe_result` com referência; preservação de registros; regra de rascunho; motivos distintos. 15 testes antigos alterados com registro.
- **F6:** máquina de estados (tabela em `machine.mjs`), contadores, sintomas, relatório de parada, retomada, checkpoint nos marcos, limites de invocação e tempo ativo, identidade de execução e invocação, lock ilegível. Itens 2.8, 6.1, 6.3 a 6.9 marcados. 6.2 aberto.
- **Pendências de decisão:**
  1. **RC-014 × SG-018 (6.2):** RC-014 para com `repeated_symptom` após três ocorrências seguidas do mesmo sintoma. SG-018 para após a segunda avaliação sem queda de falhas. As duas regras valem ao mesmo tempo? Recomendo: SG-018 vale para a correção (sem melhora), RC-014 para o sintoma repetido, com a ordem de precedência escrita no contrato.
  2. **Motivos não definidos em D8:** `diagnosing` não tem motivo (propõe-se `null`); `interrupted` usa `reconciliation_required`. Confirmar.
  3. **Registro de reconciliação de chamada interrompida e `lock_sha256`:** definidos pelo agente, sem contrato. Confirmar o formato.
  4. **Gate fora do tempo ativo:** o tempo das avaliações de gate não entra no tempo ativo. Confirmar se é execução ativa do runner.
  5. **`origin: human-tty` (5.12):** opção (a) manter `origin: human` com `procedure: tty`. Recomendo (a).
- **Bloqueios para declarar o runner operacional:** F7 a F12, marco 13, decisões 1 a 5, pendência 2.9 e sonda P.2 (não autorizada).
- **Próximo passo:** decidir 1 a 5. Depois F7 (validade e `test_report`), F8, F9, F10, F11 (incluindo PB-009, não determinismo), F12.


### 2026-10-23 — add-spec-harness: não determinismo registrado (PB-008) e contrato de orçamento

- **PB-008 (não determinismo observado, sem causa identificada):** na suíte de 2026-10-23 a falha de `PB-008` (`benchmark-evaluator.test.mjs`) apareceu uma vez e passou nas execuções seguintes. Registrada como PB-009. Passagens posteriores não apagam a falha. Investigação pendente: sem ela, esta evidência não serve ao marco de adoção.
- **Contrato:** orçamento em `total_usd` e `per_call_usd` (D23); revogação como registro próprio; `probe_result` referenciando sonda e evidência; TTY como condição do procedimento, não prova de autoria; motivos `authorization_required` e `budget_reserve_insufficient` distintos; tempo total conta só execução ativa; limite de invocações por change; execução retomada preserva `execution_id`, nova referencia a anterior; `invocation_id` por invocação; lock ilegível preservado com hash de diagnóstico (D24).
- **Revisões de cenário:** os 21 cenários que tinham `Revisão: 2` voltaram a 2, conforme pedido. O contrato está `rascunho` (proposal.md), então essas revisões não exigem autorização. Quando o contrato for aprovado, qualquer mudança semântica exige autorização `revision`.
- **Identidade:** `.harness-project.json` agora em `owned` no `template.json`.
- **Contagens:** 174 cenários com IDs únicos.

### 2026-10-23 — add-spec-harness: F5 entregue, parada por decisão de contrato

- **F5 (5.1 a 5.4, 5.6, 5.7):** `claude.mjs` (argumentos sem fallback nem --bare, classificação por causa), `budget.mjs` (reserva, comprometido, reconciliação), `runner.mjs` (portões na ordem PO-013, lock, modo, orçamento, reserva antes da invocação), `authorize.mjs record` (exige TTY, confirmação por código curto, gravação atômica), simulador `fake-claude.mjs`. 328/328 na suíte, lint 0, sintaxe 0, contrato 0.
- **5.5 aberta:** detecção de alteração protegida (EV-003) é da F7.
- **Parada para decisão** (sem avançar para F6):
  1. **Semântica de `amount_usd` em `budget`:** o agente usou o mesmo campo como total da change e como teto por chamada. O RC-022 do contrato usa a autorização como teto por chamada. Recomendação: campos separados `per_call_usd` e `total_usd`, com o limite efetivo por chamada = min(política, candidato, per_call_usd) e o total = min(política, candidato, total_usd).
  2. **Formato de `authorizations.json`:** lista JSON canônica; `probe_result` com `result`; revogação como registro `budget` com `revokes`. Aprovar ou ajustar.
  3. **Tarefa 5.6:** dizia "estender `scripts/benchmark/lib/claude.mjs`", mas a restrição de não tocar o benchmark valia para esta fatia. Foi feito um módulo novo e independente. Recomendação: manter e reescrever o texto da 5.6.
  4. **Motivo para RC-021 (sem autorização):** foi usado `budget_reserve_insufficient`. Recomendação: manter.
  5. **`execution_id`:** o runner reaproveita o id do estado existente, porque `saveState` exige identidade fixa. Revisar na F6.
  6. **Limites de invocações e de tempo total** não entraram na F5. Ficam para a F6.
- **Próximo passo:** decidir 1 a 6. Depois F6 (estados, paradas, repetição, retomada, checkpoint), com simuladores.

### 2026-10-23 — add-spec-harness: correções aprovadas, gate passa (tentativa 2)

- **Benchmark (3.9, PB-007, PB-008):** avaliador legado (nome normalizado) só para change sem nenhum `**ID:**` e sem run-state de modo runner. Formato novo sem ID reprova sem fallback. Relatório registra `archive_evaluator` e limitações. Snapshots e testes antigos intactos. 3 testes novos.
- **Identidade e lock (2.7, RS-008 a RS-021):** `project_id` em `.harness-project.json` (versionado, template com id próprio); `local_id` em `<git-common-dir>/harness/local-id`; `execution_id` por execução. `lock_held` é motivo, sem estado novo. Vencimento só por heartbeat. Liberação em etapas com conferência de conteúdo antes da remoção.
- **Contrato (4.3, D21b):** `contract.mjs` valida `Aprovação` como `auth:<id>` referenciando autorização `revision` humana. Validação completa = `openspec validate --strict` + `contract.mjs`. 19 testes novos, 4 testes antigos de `spec-create` atualizados com registro.
- **Revisões de cenário:** 21 cenários estavam em `Revisão: 2` sem autorização, o que o validador recusou. Voltaram a `1`, conforme a premissa da proposta (o contrato ainda não foi aprovado). Declarado `**Comportamento novo:** sim` na proposta.
- **Testes antigos alterados (identidade):** dois testes de `project_key` por caminho foram removidos e um de lock por host foi substituído, pelos cenários aprovados. Registro: `scratchpad/identity-test-changes.md`.
- **Gate:** tentativa 1 `retry` (81,48%); tentativa 2 `pass` (100%/100%). Baseline original preservada, sem reinício de contadores. Suíte: 280/280, lint 0, sintaxe 0, `contract.mjs` 0, `openspec validate --strict` válida.
- **Observação:** `PB-008` falhou uma vez numa execução da suíte e passou nas duas seguintes. Não reproduzido; registrar se voltar.
- **Pendências de contrato:** formato de `authorizations.json` (a definir na F5, com `authorize.mjs`); `.harness-project.json` ainda não está em `managed`/`owned` (checar na F1.4/F12); lock ilegível tratado como `lock_held` sem caminho de liberação ainda.
- **Próximo passo:** F5 (invocação, orçamento, autorização com TTY, reconciliação), somente com simuladores.

### 2026-10-23 — add-spec-harness: implementação F1 a F4 e parada

- **F1 (política e perfil):** `.claude/harness/policy.json`, `policy.md`, `profiles/default.json`, `scripts/harness/policy.mjs`. 149/149 na suíte. Tetos `max_*` iguais aos candidatos, provisórios e sem autorizar gasto (registrado em `policy.md`). Tarefas 1.1 a 1.4.
- **F2 (estado, lock, checkpoint):** `scripts/harness/{identity,state,lock,views,checkpoint}.mjs`. 38/38 nas suítes da fatia. Tarefas 2.1 a 2.6.
- **F3 (gates):** gates retornam resultado estruturado e não gravam sem `--legacy-write`. Falsos positivos corrigidos. Testes antigos alterados com prova no commit de implementação: `implement-gate`, `archive-gate`, `template-migrate`. Tarefas 3.1 a 3.8.
- **F4 (spec-create):** skill ampliada e `scripts/harness/contract.mjs`. 19/19. Tarefa 4.1 e 4.2 marcadas; **4.3 aberta**: pede que `openspec validate` recuse `check:` sem justificativa, o que o OpenSpec não faz.
- **Parada:** a suíte completa tem 5 arquivos de teste do benchmark falhando (`archive-only`, `greenfield`, `hidden`, `legacy`, `run-cli`). Causa: os snapshots replayados vêm de execuções legadas sem `**ID:**` nem `[ID]`, e o gate de arquivamento novo (AC-003, SG-009) os reprova. Não alterei snapshots nem testes antigos sem decisão.
- **Decisões pendentes:**
  1. Comportamento do arquivamento em modo `legacy`: manter a comparação por nome até o marco (D20), o que preserva a substring como falso positivo conhecido nesse modo, ou exigir ID já agora e aceitar a reprovação dos snapshots?
  2. Identidade de checkpoint (D19 × D1): `project_key` deriva do caminho absoluto do diretório comum do Git, então um checkpoint de outra máquina nunca bate. Recomendação: identidade estável gravada no contrato.
  3. Tarefa 4.3: reescrever para apontar para `contract.mjs`, ou manter e aceitar que o OpenSpec não cobre essa regra.
  4. Campos do contrato usados por `contract.mjs` (`Verificação`, `Justificativa`, `Aprovação`, `Condição de disparo`): confirmar nomes.
- **Próximo passo:** aguardar as decisões 1 a 4. F5 e F6 dependem de identidade (decisão 2) e de F3 verde. F7 depende de F3 e de F4 (decisão 3). Nenhuma implementação do runner novo foi declarada operacional; o marco de adoção (tarefa 13) não foi atingido.

### 2026-10-23 — add-spec-harness: contagem de cenários e ajustes finais de contrato

- **Contagem corrigida:** 158 cenários antes da revisão → 153 depois. Removidos efetivos: 11 (AC-004, AC-006, RC-006, RS-001, PO-004, PO-010, PB-006, HI-006, HI-012, EV-009, EV-014). Restaurado: TE-002 (removido por engano e restabelecido; efeito líquido zero). Acrescentados: 6 (RC-029, RC-030, RS-016, RS-017, PO-013, SP-009). Reescritos: 5 (AC-014, AC-017, PO-002, PO-007, EV-012). Conta: 158 − 11 + 6 = 153. O resumo anterior dizia "reescritos (4)"; o correto é 5.
- **Resumo durável:** inventário completo dos casos da suíte obrigatória (ID, nome, resultado e cenário vinculado quando existir, incluindo regressões sem vínculo). Sem TAP bruto no Git.
- **Autorizações:** persistidas somente pelo comando `authorize.mjs record`, com TTY e confirmação. Skills e runner não concedem autorização.
- **HI-001 e HI-002:** verificações estáticas de conteúdo, identificadas como tal. A avaliação comportamental da entrevista fica para validação posterior.
- **Baseline do gate de implementação** registrada para add-spec-harness (legado): 130 testes existentes, lint 0, sintaxe 0.

### 2026-10-23 — add-spec-harness: revisão aplicada (D-A a D-H)

- **Aplicado:** `design.md` reescrito com D1–D22 e configuração proposta separada de autorização; `proposal.md` atualizado com BREAKING 1 e 2, recuperação e premissas; specs revisadas (158 cenários, IDs únicos, todos cobertos por tarefa); `tasks.md` com 12 fatias e a seção P (sonda, separada).
- **Sonda:** nenhuma chamada paga. `--version` não distingue flag reconhecida de inventada. O binário contém a definição `--max-turns <turns>`; isso prova reconhecimento, não funcionamento.
- **Validação:** `openspec validate add-spec-harness --strict` válida, sem avisos.
- **Bloqueios reais:** (1) autorização da sonda P.2, que não bloqueia as fatias. (2) Adoção nos projetos derivados (tarefa 12.4b): a lista de projetos e o stack de teste ainda não foram identificados. Não bloqueia o núcleo nem significa adoção concluída.

### 2026-10-23 — spec-create: add-spec-harness

- **Insumo:** o pedido consolida as decisões aprovadas. Não houve rodada de entrevista: o agente verificou o repositório e a documentação (`openspec` 1.14.3, specs existentes, gates, skills) e levou só as lacunas ao design.
- **Evidência de falso positivo (sonda local, sem API):** com a suíte saindo com código `1` e a saída `# pass 3` / `# fail 0`, `measureImplementation` retornou `passed: true`. Outros casos no código atual: contagem antes do código de saída (`scoreWholeSuite`, `runTestFile`); `skip` invisível; `new_pct` nulo aprova; cenário por substring no arquivo inteiro; change sem cenário aprova no arquivamento.
- **Verificação da CLI:** `--max-budget-usd` existe em 2.1.309 (estimativa do cliente; pode passar do teto; totais de `--resume` não contam). `--max-turns` está na documentação, mas não na `--help` local: tratado como não garantido. `--effort`, `--model`, `--fallback-model`, `--session-id` existem. Node 24.21.0 com TAP por caso (`# SKIP`) e JUnit.
- **Incompatibilidades com o estado atual (intencionais, não reabrem decisão):** gates gravam `gates.json` hoje; a tabela de gates do `issue-tracker.md` é manual; o gate de implementação exige arquivos novos de teste. Tudo isso muda na v1, marcado como BREAKING em `proposal.md`.
- **Premissas (não são decisões aprovadas):** `.harness-local/` fora do Git; `run-state.json` versionado dentro da change; skill `spec-accept`; valores do perfil padrão provisórios (60 invocações, US$ 2,00 por chamada, margem 25%, US$ 30,00 por change).
- **Validação:** `openspec validate add-spec-harness --strict` válida, sem avisos.
- **Pendências para o humano:** (1) confirmar as premissas acima; (2) autorizar a sonda de `--max-turns`; (3) aprovar o contrato antes de `spec-implement`.
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

### 2026-10-24 — Escopo incompleto: execução multifatia e validação no piloto (não iniciada)

- **Estado:** dois ajustes locais, sem commit, sem change: `--claude-bin` com espaços (executável existente, array JSON ou comando separado) e intenções de aprovação por caminho com recusa de negação. Suíte 931/931, lint e sintaxe 0. Patch em `ajustes-aprovacao-e-claude-bin.patch` na pasta de scratchpad da sessão.
- **Não feito:** execução multifatia sequencial (`REQUIRED_SLICES = ['implement']` ainda é único); preflight; reutilização de autorização vigente; negação de permissão como bloqueio operacional; percurso integrado com duas fatias, falha simulada e retomada; registro de verificações humanas; conciliação de contagens e consumo; validação real no piloto.
- **Piloto:** `/Users/schussler/dev/harness-pilot` não foi alterado. Não tem commits; todo o conteúdo está como não rastreado, e precisa ser preservado antes de qualquer atualização.
- **Processo:** os ajustes foram feitos sem contrato de change; não foram commitados. Antes de virar marco, precisam entrar numa change com contrato validado.
- **Sem:** chamadas de modelo, push, PR, merge ou deploy nesta rodada.

### 2026-10-24 — add-multislice-run: percurso multifatia validado localmente; piloto bloqueado

- **Change:** `openspec/changes/add-multislice-run`, válida no `openspec validate`. Os dois ajustes anteriores estão registrados como feitos antes do contrato, sem RED retroativo.
- **Implementado:** fatias declaradas em `tasks.md` (`## Fatia: <nome>`, com `- Cenários: <IDs>`); execução sequencial com retomada pelas aprovações; aprovação exige os cenários da fatia; validação final recusa com pendência antes da suíte.
- **Testes:** 5 novos (`multislice-slices`, `multislice-run`), com RED observado antes da implementação. Suíte 936/936, lint 0, sintaxe 0. O percurso integrado usa o CLI com raiz em caminho com espaço, `--claude-bin` em JSON e o simulador.
- **Não feito:** conciliação de consumo entre estado, eventos e relatório; preflight; bloqueios operacionais; invalidação de fatias; execução real no piloto.
- **Bloqueio do piloto:** falta a aprovação de contrato pela conversa (frase do usuário) e o valor do orçamento para chamadas reais. Não foram fabricados.
- **Piloto preservado:** `harness-pilot-preservado-antes-multifatia.tar.gz` (sha256 `978d9f6a…c654`) na pasta de scratchpad da sessão. Nenhuma alteração no piloto.
- **Sem:** commit, push, PR ou merge nesta rodada.

### 2026-10-24 — add-multislice-run: validação real multifatia no piloto concluída

- **Piloto:** `add-pending-summary` (duas fatias dependentes: filtro de pendentes e contagem por prioridade), `claude -p` 2.1.310 pela assinatura, modo observação, sem orçamento financeiro e sem API paga. Execução aprovada, validação final `pass`.
- **Invocações:** 3 (duas com sucesso, US$ 0,023862 e US$ 0,017355; uma negada, US$ 0,023007). Custo conhecido US$ 0,064225, igual à soma dos eventos, ao relatório e ao contador do estado. Conciliação `reconciled`.
- **Permissão:** a primeira invocação teve uma negação de comando composto (`cat … && find … -exec`). O modelo repetiu os comandos separadamente e concluiu a fatia. Por isso a negação só é registrada; vira parada `permission_denied` quando o gate reprova a fatia (MS-010 revisado e MS-014).
- **Contrato do piloto:** a primeira validação final parou por falta da declaração `Comportamento novo` (HI-010) no `proposal.md`. Corrigido com nova versão de aprovação. As duas fatias foram revalidadas pelo gate, sem chamada ao modelo, e mantiveram a aprovação.
- **Correção no relatório:** `failed_attempts` contava só eventos `failed` (validações finais), e a invocação negada ficava de fora. Agora conta invocações pagas sem sucesso. Teste em `multislice-conciliation`.
- **Verificação:** suíte do harness 960/960, lint 0, sintaxe 0. Suíte do piloto 35/35 (31 + 4 novos), lint 0, check 0.
- **Preparos locais:** commit base `df1f284` no piloto, criado para o git do runner (reversível). Backup persistente em `/Users/schussler/dev/harness-pilot-backups/2026-10-24-pre-multifatia/` (sha256 do tar `08459d5a…c654`).
- **Limitações:** o piloto está em caminho sem espaço (o caminho com espaço ficou só no teste integrado com simulador); a change do piloto não foi arquivada; revalidação roda o gate sem a proteção de prazo do guarda; interrupção durante o real não foi testada; nada commitado, sem push, PR ou merge.

### 2026-10-24 — Correção de registros: revisão da validação multifatia

Esta entrada corrige afirmações das entradas anteriores sobre `add-multislice-run` e a validação do piloto. As entradas anteriores ficam como estão.

**Versão executada no piloto (execução `de2c1761-d5d5-4ea8-967f-d5ddbabf99a3`).** Não há hash de código gravado nos registros do piloto, então a versão é reconstruída: árvore do harness em `0f5178d`, sem três trechos que vieram depois da execução:
1. revalidação de fatia sem o guarda de prazo (`revalidateApprovals` chamava `implementEvaluation` direto);
2. `conclude` sem o campo `conciliation` no retorno de sucesso (cosmético, a conferência já rodava);
3. `failed_attempts` contando eventos `failed` (validações finais), e não invocações sem sucesso.
A lógica de gate, aprovação, preflight, classificação de negação e conclusão é a mesma. Não atribua ao piloto nenhuma validação de código posterior a `0f5178d`.

**Afirmações corrigidas:**
- "Conciliação `reconciled`" (entrada de 2026-10-24, validação real): a checagem comparava o contador do estado com a medição do relatório, que lia o mesmo estado, e o custo era comparado com a soma dos mesmos eventos. Não era uma conferência entre fontes independentes. Substituída em `381bb22`. Com a conferência corrigida, os dados do piloto dão `reconciled` em cinco checagens: lista e contador do estado, eventos, medição do relatório e fonte de custo por evento.
- "Tentativas malsucedidas: 2" (entrada de 2026-10-24, correção do relatório): a conta era de validações finais reprovadas, não de invocações. Agora a conta é de invocações sem sucesso. O piloto dá `failed: 1`.
- "Negação recuperada": o registro da invocação `708c4506…` tem `status: permission_denied`, gravado pela regra que a validação real corrigiu. O transcript mostra que o modelo concluiu a fatia depois da negação. O registro antigo é mantido como está. O relatório atual o lê como falha com negação, porque é o que o registro diz, e não há campo que mostre a recuperação.
- "Revalidação sem chamada ao modelo": verdadeiro na execução, mas sem controle de prazo. Corrigido em `381bb22` (MS-017).
- "Aprovação por intenção": a checagem anterior casava substring e aceitava palavras contidas em outras. Corrigida em `381bb22` (AP-014, AP-015).

**Validações que valem para a versão executada:** execução multifatia com duas fatias, aprovações, validação final `pass`, três invocações com custo conhecido de US$ 0,064225 (soma dos eventos). Nenhum desses resultados depende dos trechos corrigidos depois.

**Validações feitas depois, na versão candidata `381bb22`, sem chamada ao modelo:**
- Suíte do harness: 970/970, lint 0, sintaxe 0.
- Testes afetados pela CLI (62/62): `multislice-run`, `multislice-preflight`, `multislice-conciliation`, `aprovacao-conversa`, `medicao-final`, `cli-run`. Com simulador como binário.
- Relatório do piloto regenerado pela versão candidata, sem alterar o estado.

**Não verificado com modelo real:** revalidação interrompida pelo prazo, caminho com espaço no piloto, interrupção durante a chamada, e os comportamentos novos de aprovação e medição. Todos são comprovados só por simulador ou por testes locais.

**Pendente:** a change `fix-multislice-review` (contrato corretivo) não tem aprovação de conversa, porque a frase do usuário dessa rodada não é uma das frases de aprovação aceitas. Sem ela, a change não é arquivada.

### 2026-10-24 — fix-multislice-review: aprovado, gates e arquivamento

- **Aprovação:** "Aprovado fix-multislice-review." pela conversa, caminho 3 (registro `43980501…`). O contrato não foi alterado depois dessa aprovação.
- **Gate de implementação:** linha de base do commit anterior à correção (`0f5178d`), numa worktree temporária. A primeira pontuação reprovou (`old_pct` 99,79) por dois casos antigos que sumiram. Causas: nome de teste alterado por mim (MS-010) e teste de MS-013 removido. Corrigido: o nome original de MS-010 foi restaurado, e o teste de MS-013 voltou com o mesmo nome, exercendo a fonte financeira. A linha de base não foi refeita. Segunda pontuação: 100%, sem falhas.
- **Gate de arquivamento:** 12 de 12 cenários cobertos. O cenário MS-016 ganhou um teste de gravação atômica, com o mesmo ID; o teste de recusa de impressão antiga continua no mesmo ID, porque o requisito tem o título "válida só para a impressão atual".
- **Arquivamento:** `openspec archive fix-multislice-review --yes` em `2026-10-24-fix-multislice-review`. Specs principais: 5 requisitos adicionados e 2 modificados em `multislice-run`.
- **Ajuste de teste registrado:** o teste MS-013 de custo com relatório foi retirado da forma antiga, porque o relatório lê os mesmos eventos. A intenção (custo diferente dos eventos é divergência) passou a ser exercida pelo consumo do estado contra os eventos no modo financeiro.
