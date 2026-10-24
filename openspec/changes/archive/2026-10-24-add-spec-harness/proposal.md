# Proposal

## Why

O pipeline atual (`spec-create` → `spec-implement` → `spec-archive` → `pr`) já tem gates com pontuação, mas a pontuação ainda não sustenta execução autônoma com segurança. Uma verificação de `scripts/gates/` reproduziu o problema: com a suíte saindo com código `1` e a saída `# pass 3` / `# fail 0`, `measureImplementation` retorna `passed: true`. Outros falsos positivos conhecidos:

- as contagens da saída têm precedência sobre o código de saída (`scoreWholeSuite` e `runTestFile`);
- testes ignorados (`skip`, `todo`) não são lidos pelos padrões de contagem;
- uma change sem teste novo passa, porque `meets(null)` é verdadeiro;
- o gate de arquivamento confirma cenários por substring no texto inteiro dos arquivos de teste, e aprova quando a change não tem cenário (`pct === null`);
- os gates gravam `gates.json` diretamente, e o `issue-tracker.md` mantém vereditos e contadores à mão. Eles podem divergir.

Sem estado único, validade das evidências, orçamento controlado e retomada confiável, a execução autônoma não tem como provar o que aprovou nem quanto gastou.

## What Changes

- **Entrevista ampliada no `spec-create`:** investiga arquitetura, invariantes, sandbox, exemplos com fonte confiável e fatias. Declara a forma de verificação de cada cenário (teste, check declarado ou condição de disparo) e se a mudança tem comportamento novo. Produz o contrato com confirmação humana.
- **Runner (`scripts/harness/`):** único escritor de `run-state.json` por execução, protegido por bloqueio contra dois runners na mesma change. Valida transições, controla contadores, reservas e orçamento, invoca `claude -p`, executa gates e gera as visões derivadas.
- **Estado local e checkpoints:** o estado operacional fica em `.harness-local/`, fora do Git. Checkpoints versionados são gravados somente nos marcos (contrato aprovado, fatia aprovada, arquivamento), com consumo, reservas, rodada e contadores. Importar um checkpoint exige reconciliação explícita antes de qualquer chamada paga.
- **Resumo durável de evidências:** `evidence-summary.json`, versionado nos marcos, com o resultado mínimo por cenário para auditoria. Evidência local ausente exige revalidação.
- **Gates sem escrita de estado:** retornam resultado estruturado ao runner e corrigem os falsos positivos acima. Código de saída prevalece, `skip` não aprova, e a validação de cenários usa a identidade dos casos executados, não substring.
- **Verificação de cenários:** forma `teste` por padrão; `check:<nome>` com justificativa e aprovação humana; não aplicável somente quando a condição de disparo é falsa, avaliada pelo runner. Mudança sem comportamento novo é verificada pela suíte existente e pelos checks declarados, sem testes funcionais fabricados. Teste inalterado pode provar requisito alterado, com justificativa de suficiência aprovada.
- **Relatório de testes declarado:** `checks.test_report` com comando, formato e identificador de suíte, executado pelo runner como suíte obrigatória. `checks.test` referencia a mesma suíte; a equivalência é comprovada pela identidade dos casos executados, não pela sintaxe do comando. Suporte inicial a TAP do Node; JUnit só para produtor concreto identificado.
- **Agente de aceitação (`spec-accept`):** executado pelo runner, com testes vinculados aos IDs dos cenários. Alterações posteriores exigem registro.
- **Configuração em quatro camadas:** política (versionada), configuração proposta (candidatos `candidate_*`), autorização (registro versionado em `authorizations.json`) e consumo (estado e checkpoint). Nenhum valor candidato autoriza gasto. O limite efetivo é o menor entre política, configuração e autorização.
- **Orçamento e reconciliação:** limites independentes; custo desconhecido nunca vira zero. Reserva sem reconciliação permanece aberta. Uma decisão humana pode encerrar a reserva administrativamente, sem converter o consumo desconhecido em zero.
- **Sonda de `--max-turns`:** separada das tarefas verificáveis, não autorizada e não executada. Classifica `enforced`, `not_enforced` ou `inconclusive` pela causa identificada no resultado. Enquanto não houver `probe_result` `enforced`, o runner não anuncia limite de turnos e não inicia perfil que o exija.
- **Modos de execução:** `legacy` e `runner`, definidos na criação e imutáveis. A migração é unidirecional e explícita. Rollback de execução migrada não é transparente.
- **Migração:** histórico preservado como `legacy-markdown` sem aprovação; contadores conservadores; baseline criada pela descoberta atual, sem reconstrução histórica.
- **Benchmark com três níveis:** execução concluída, gates aprovados e aceitação funcional, separados. Nenhum benchmark pago é executado nesta change.
- **BREAKING 1 — gates não gravam estado:** a CLI dos gates deixa de escrever `gates.json` por padrão. A escrita continua só com `--legacy-write`, em execução `legacy`, até a F10. A tabela de gates do `issue-tracker.md` deixa de ser mantida à mão.
- **BREAKING 2 — gate de implementação não exige caso novo:** o gate passa a medir casos antigos e não exige caso novo. A exigência de cobertura de cenários passa ao gate de arquivamento, por identidade de cenário e revisão atual.

## Capabilities

### New Capabilities

- `harness-interview`: entrevista ampliada do `spec-create`, contrato, forma de verificação e comportamento novo.
- `harness-run-state`: estado local, escritor único, bloqueio, identidade, checkpoints, modo e importação com reconciliação.
- `harness-run-control`: máquina de estados, contadores, orçamento, autorização, reconciliação, paradas e retomada.
- `harness-acceptance`: agente de aceitação, vínculo cenário→caso, `test_report`, identidade de filtro, RED, comportamento pré-existente e validação final.
- `harness-evidence`: impressão da evidência, caminhos protegidos, aprovação válida, resumo durável e revalidação.
- `harness-policy`: política, configuração proposta, reconhecimento versus comprovação de CLI, sonda e simuladores.
- `harness-telemetry`: telemetria local, retenção e relatórios de custo com incerteza explícita.

### Modified Capabilities

- `spec-pipeline`: passos conduzidos pelo runner, arquivamento com resumo durável e modo legado.
- `spec-gates`: gates sem escrita de estado, correções dos falsos positivos e compatibilidade legada explícita.
- `headless-execution`: invocação pelo runner com identidade de sessão, limite efetivo e autorização de chamada paga.
- `project-migration`: migração do histórico legado, contadores conservadores, baseline e recuperação.
- `pipeline-benchmark`: resultados em três níveis, regras de domínio e configuração registrada.

## Impact

- `scripts/harness/` (novo, `managed`); `scripts/gates/` (BREAKING 1 e 2); `scripts/test/harness/` (novo, `template_only`).
- `.claude/harness/` (novo, `managed`): `policy.md`, `policy.json`, `profiles/default.json`.
- Skills: `spec-create`, `spec-implement`, `spec-archive`, `handoff`, `spec-accept` (novo), `new-project`, `template-update`, `template-migrate`.
- `template.json`: `checks.test_report`, `harness` (schema, allowlist extensível pelo projeto).
- `.gitignore`: `.harness-local/`.
- Git comum: `<git-common-dir>/harness/locks/` (fora do histórico).
- Versionados por change: `checkpoint.json`, `authorizations.json`, `evidence-summary.json`, `acceptance-manifest.json`.
- Dependências: nenhuma nova. Runtime: Node ≥ 22 (local: 24.21.0), `claude` 2.1.x, `openspec` 1.14.3.
- **Validação de Node (declaração de 2026-10-24):** ambiente verificado desta entrega: Node 24.21.0, macOS. Node 22 não verificado; não bloqueia a conclusão da v1. Não há instalação de Homebrew.
- Custo: nenhuma chamada paga nesta change. A sonda (tarefa separada) exige autorização `probe`.
- Não executa `spec-implement`. Criar esta change não autoriza a execução do plano.

## Recuperação e migração das mudanças BREAKING

- **BREAKING 1 (gates):** execuções `legacy` mantêm a CLI antiga com `--legacy-write` até a F10. Execuções novas usam o runner. Recuperação de uma execução migrada: restauração a partir da cópia pré-migração pelo procedimento humano `manual_rollback` (design, D32), com pré-condição de hash, decisão humana registrada, marca de restauração e reconciliação antes de continuar; evidência e consumo são preservados. Não há rollback transparente.
- **BREAKING 2 (caso novo):** a regra só muda para o gate de implementação. Antes da F3, a change legada continua sendo verificada pela regra antiga. Não há aprovação retroativa: a migração cria baseline a partir da descoberta atual.

## Modo de implementação desta change

Esta change começa pelo fluxo atual (`spec-implement` com os gates atuais). O runner só assume execuções depois de passar pelos testes com simuladores e de atingir o marco de adoção registrado no `issue-tracker.md` por decisão humana (tarefa 13, SP-009). Até lá, a implementação não é atribuída ao runner.

## Premissas

- Aprovadas: `.harness-local/` fora do Git; nome `spec-accept`; D-A a D-H conforme `design.md`.
- Aprovado pelo dono do projeto em 2026-10-24: D26 (registro de reconciliação), com efeitos de saldo definidos em `design.md`. O registro formal em `authorizations.json` está pendente do comando `authorize.mjs record` com terminal interativo, a ser executado pelo dono.
- Aprovado pelo dono do projeto em 2026-10-24: `closed_unknown` mantém a exposição no comprometido, com `reserve_released_usd` zero. A continuidade pode exigir extensão explícita do orçamento. Essa exposição NÃO é custo conhecido.
- Aprovado pelo dono do projeto em 2026-10-24: regras obrigatórias de domínio participam da aceitação funcional. "Oculto" descreve visibilidade, não obrigatoriedade.
- Não aprovadas como autorização: os valores `candidate_*` de `design.md` (inclusive US$ 30,00 por change). Eles são candidatos de calibração.
- `--max-turns` consta na documentação e na definição do binário, mas não na ajuda local. Reconhecimento não comprova funcionamento. Sem sonda autorizada, o limite de turnos fica não comprovado.
- Contrato revisado antes da aprovação: as revisões de cenário permanecem `1`, porque o contrato ainda não foi aprovado.
- **Comportamento novo:** sim
- **Estado do contrato:** rascunho
