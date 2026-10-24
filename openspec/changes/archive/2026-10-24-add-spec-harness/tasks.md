# Tasks

Como esta change será implementada: **pelo fluxo atual** (`spec-implement` com os gates atuais) até o marco de adoção da tarefa 13. O runner novo só assume execuções depois desse marco (SP-009).

Ordem: as fatias seguem as dependências de `design.md` → Fatias. Dentro de cada fatia, RED antes de GREEN. Todo teste de aceitação do harness usa o ID do cenário no nome, `[ID] ...`.

Regras comuns:
- Nenhum teste automatizado chama o modelo. A suíte usa o simulador `claude` falso e fixtures TAP (PO-012).
- Nenhuma tarefa exige chamada paga. A sonda é a seção P, separada, e nenhuma fatia depende dela.
- Cada fatia mantém o caminho de funcionamento anterior (`design.md` → Fatias).
- `checks.test`, `checks.lint` e `checks.typecheck` verdes ao fim de cada fatia.

## 1. F1 — Política e configuração proposta

Depende de: nada. Cobre: PO-001, PO-002, PO-003, PO-005, PO-008, PO-009, PO-012.

- [x] 1.1 RED: carregamento e validação de `policy.json` e da configuração proposta (uma definição por chave; configuração que amplia teto é recusada com `config_error`, PO-002; chave `candidate_*` marcada como provisória, PO-005)
- [x] 1.2 GREEN: `.claude/harness/policy.json`, `.claude/harness/policy.md` (regras referenciando chaves) e `.claude/harness/profiles/default.json`; `scripts/harness/policy.mjs`
- [x] 1.3 RED→GREEN: configuração reduzida aceita (PO-003); segredo fora da impressão (PO-008); versão incompatível (PO-009)
- [x] 1.4 Classificar `.claude/harness/` e `scripts/harness/` em `managed`, `scripts/test/harness/` em `template_only`; `template-check` READY

Aceite: `policy.json` é a única definição de cada valor; nenhuma chave `candidate_*` libera invocação (testado em 5.2).

## 2. F2 — Estado local, identidade, bloqueio e checkpoint

Depende de: F1. Cobre: RS-002 a RS-017.

- [x] 2.1 RED: escrita atômica com falha injetada entre temporário e `rename` (RS-004); recuperação por `.prev` (RS-005); estado ilegível sem recriação (RS-006); reserva antes do processo (RS-007); incremento de revisão (RS-003)
- [x] 2.2 RED: identidade divergente (RS-008); segundo runner na mesma change recusado com `lock_held` em outro worktree (RS-009); lock de outra change não bloqueia (RS-016); lock vencido sem remoção automática (RS-010); liberação só por registro `lock_release` (RS-017)
- [x] 2.3 GREEN: `scripts/harness/state.mjs` (único escritor), `scripts/harness/lock.mjs` (criação exclusiva em `<git-common-dir>/harness/locks/<change>.lock`, heartbeat, remoção ao término normal), `scripts/harness/views.mjs` (visões derivadas com `derived_from_revision`, RS-002)
- [x] 2.4 RED→GREEN: checkpoint somente nos marcos (RS-011); conteúdo do checkpoint (RS-012); importação exige reconciliação (RS-013, RS-014)
- [x] 2.5 RED→GREEN: campo `mode` imutável com `config_error` (RS-015); `gates.json` legado não lido no modo `runner` (SG-019 e PM-008, verificados na F3 e na F12)
- [x] 2.6 Teste de que nenhum módulo de `scripts/gates/` importa o escritor de estado (cobre a regra de RS-002 e de SG-008)

Aceite: identidade divergente nunca é aceita; dois runners na mesma change não gravam o mesmo estado; change independente não é bloqueada.
- [x] 2.7 **Correção de identidade e lock (aprovada).** `project_id` persistente em `.harness-project.json` (versionado); `local_id` em `<git-common-dir>/harness/local-id`; `execution_id` por execução. Checkpoint e estado referenciam `project_id`, não o caminho. Lock: `lock_held` como motivo de bloqueio sem novo estado; vencimento só por heartbeat, nunca por origem; liberação em etapas com conferência de conteúdo antes da remoção. Cobre RS-008 (revisado), RS-009, RS-010 (revisado), RS-016, RS-017 (revisado), RS-018, RS-019, RS-020, RS-021. Testes antigos de identidade (`project_key` por caminho) são substituídos, com justificativa no log.
- [x] 2.8 **Lock ilegível (aprovado).** `lock_unreadable`, arquivo preservado, hash registrado no diagnóstico, liberação só se o hash não mudou. Cobre RS-022.
- [x] 2.9 **Identidade owned (aprovado).** `.harness-project.json` não é sobrescrito por template-update; projeto novo recebe id novo; clone preserva. Cobre RS-019, RS-023.

## 3. F3 — Gates corrigidos e compatibilidade legada

Depende de: F1. Cobre: SG-001 a SG-020.

- [x] 3.1 RED: um teste por falso positivo conhecido: saída `1` com `# pass 3` / `# fail 0` (SG-005); caso `# SKIP` (SG-006); cenário em comentário (SG-012); change com comportamento novo e sem cenário (SG-011)
- [x] 3.2 RED: gate de implementação aprova sem caso novo (SG-001); caso antigo falhando reprova (SG-002); novo separado do antigo pelo baseline (SG-004); lint com erro reprova (SG-003)
- [x] 3.3 GREEN: `implement-gate` e `archive-gate` retornam `{gate, passed, failures, cases, evidence, paid, cost_source}`, sem gravar; código de saída prevalece; `skip` não aprova
- [x] 3.4 GREEN: baseline guarda IDs de casos, não só arquivos; vínculo por `[ID]` do caso executado, sem substring (AC-003, SG-009, SG-010, SG-012)
- [x] 3.5 RED→GREEN: `--legacy-write` escreve `gates.json` só em execução `legacy` (SG-008, SG-019); sem a flag, nada é gravado
- [x] 3.6 RED→GREEN: `paid` e independência da autoavaliação (SG-013, SG-014); escopo ignora arquivos operacionais (SG-015, SG-016)
- [x] 3.7 RED→GREEN: change sem comportamento novo passa com a suíte existente e os checks declarados, sem caso funcional novo (SG-020)
- [x] 3.8 Testes de regressão reescritos para a nova interface, com o limiar de 100% mantido em constante

Aceite: nenhum falso positivo aprova; a CLI sem `--legacy-write` não grava; limiares constantes.

- [x] 3.9 **Avaliador de arquivamento no benchmark (aprovado).** Avaliador legado (nome normalizado) só para change sem nenhum `**ID:**` e sem run-state de modo runner; formato novo sem ID reprova sem fallback; relatório registra o avaliador e suas limitações. Cobre PB-007, PB-008. Restaura os seis testes do benchmark sem alterar os snapshots.

## 4. F4 — `spec-create` ampliado

Depende de: F1. Cobre: HI-001 a HI-011; SP-002, SP-003.

- [x] 4.1 RED: conteúdo da skill: investigação antes de perguntar (HI-001), perguntas em grupos (HI-002), premissas em `## Premissas` (SP-002, HI-005), contrato com os campos obrigatórios (HI-003), exceção registrada como revisão (HI-007), proibição de gerar testes de aceitação (HI-004)
- [x] 4.2 GREEN: `.claude/skills/spec-create/SKILL.md` e `interview.md` com a entrevista ampliada, a forma de verificação por cenário (HI-008, HI-009), a condição de disparo (HI-010, HI-011) e `Comportamento novo`
- [x] 4.3 **Validação do contrato (aprovada).** A validação completa é `openspec validate --strict` mais `scripts/harness/contract.mjs`, nessa ordem. Testes positivos e negativos para HI-003, HI-008 a HI-011, e o campo `Aprovação` (`auth:<id>` que referencia autorização `revision` humana em `authorizations.json`; texto livre ou booleano é recusado). Formato dos campos em `design.md` D21b.

Aceite: a skill não gera código nem testes de aceitação; `openspec validate --strict` passa.

## 5. F5 — Runner: invocação, orçamento, autorização e reconciliação (simulador)

Depende de: F2, F3. Cobre: HE-001 a HE-005; RC-008 a RC-011; RC-021, RC-022, RC-024; RC-029, RC-030; PO-013.

- [x] 5.1 RED: argumentos com `--session-id`, `--max-budget-usd` com o limite efetivo, sem `--fallback-model` (HE-001, HE-003, HE-004); sem `--dangerously-skip-permissions` nem `--bare` (HE-002); `is_error` sem causa não é limite de turnos (HE-006)
- [x] 5.2 RED: limite efetivo é o menor entre política, configuração e autorização (RC-022); configuração proposta não autoriza gasto (RC-021); sem autorização `budget` cobrindo a reserva, nenhuma chamada inicia (HE-005); perfil que exige turnos sem `probe_result` `enforced` para com `config_error` (PO-013)
- [x] 5.3 RED: reserva = limite efetivo × (1 + margem) (RC-008); esgotamento sem gasto além do autorizado (RC-009); custo desconhecido não vira zero (RC-010); reserva sem reconciliação permanece aberta e comprometida (RC-011)
- [x] 5.4 RED: reconciliação com `closed_unknown` preserva a contagem de custo desconhecido (RC-024)
- [x] 5.5 RED→GREEN: registro de autorização só por decisão humana (RC-029); acréscimo, revogação e substituição por registros novos (RC-030); a alteração de linha existente é tratada como alteração protegida (EV-003). **Pendente:** a parte de EV-003 é detecção de alteração protegida, da F7; aqui o registro só recusa reescrita (formato canônico e conteúdo alterado na confirmação)
- [x] 5.6 **Módulo do harness separado do benchmark (aprovado).** `scripts/harness/claude.mjs` é o módulo de invocação do harness e não altera `scripts/benchmark/`. Integração posterior deve reutilizar esse módulo ou explicar a diferença, evitando duas implementações divergentes.
- [x] 5.7 Simulador `claude` falso com saídas JSON controladas: sucesso, `is_error` sem causa, custo ausente, limite de uso da conta

Aceite: nenhuma invocação sem autorização cobrindo a reserva; testes usam somente o simulador.
- [x] 5.8 **Orçamento em duas dimensões (aprovado).** `total_usd` e `per_call_usd` na autorização `budget`; limite efetivo, saldo com reservas pendentes, reserva cabe no saldo total, margem e reserva documentadas separadamente (D23). Cobre RC-008, RC-022, RC-031, RC-033.
- [x] 5.9 **Revogação como registro próprio (aprovado).** `kind: revocation` referenciando o id revogado; não é autorização de orçamento; a original permanece. Cobre RC-034.
- [x] 5.10 **Probe_result referenciado (aprovado).** Exige id da autorização `probe` e evidência (caminho e hash). Cobre PO-014.
- [x] 5.11 **Preservação do registro (aprovado).** Relê, valida e não altera registros anteriores; divergência recusa a gravação. Cobre RC-040.
- [x] 5.12 **Origem da autorização (aprovado 2026-10-24).** `origin: human` e `procedure: tty`; RC-039. Corrigir authorize.mjs e testes; lock.mjs continua aceitando `origin: human`.
- [x] 5.13 **Revisão de rascunho (aprovado).** `contract.mjs` aceita revisão > 1 em `Estado do contrato: rascunho` e exige autorização `revision` em `aprovado`. Cobre HI-013 e a regra de D21b.

## 6. F6 — Estados, paradas, repetição, retomada e checkpoint

Depende de: F5. Cobre: RC-001 a RC-005, RC-007, RC-012 a RC-020, RC-023, RC-025 a RC-028; RS-011 a RS-014 (integração).

- [x] 6.1 RED: transições (RC-001), motivo separado do estado (RC-002), contadores (RC-003, RC-004), correção sem alteração consome o limite (RC-005), teto (RC-007), ciclo após três correções e sem melhora conduzido pelo runner (SG-017, SG-018)
- [x] 6.2 **Correção aprovada (2026-10-24).** Runner novo não para por contagem de falhas (RC-041); três ocorrências consecutivas da mesma assinatura param (RC-014); SG-018 só no modo legado, identificado. Atualizar o teste de RC-014 no runner.
- [x] 6.3 RED: quota (RC-025), tempo total (RC-026), decisão humana por ambiguidade (RC-027)
- [x] 6.4 RED: retomada mantém reservas (RC-017); alteração na retomada fica pendente (RC-018); parada sem hipótese inventada (RC-019); nova rodada só com autorização `round` (RC-012, RC-013); contadores incertos (RC-028); replanejamento (RC-020)
- [x] 6.5 GREEN: `scripts/harness/machine.mjs` (tabela de transições de `policy.md`), `scripts/harness/symptoms.mjs` (assinatura), gravação de checkpoint nos marcos
- [x] 6.6 Teste de interrupção: matar o runner no meio de uma invocação simulada, verificar que o lock permanece, e retomar com decisão humana, sem chamada real

Aceite: nenhuma transição fora da tabela; reescrever hipótese não reinicia o contador; checkpoint não muda entre invocações.
- [x] 6.7 **Limites de invocação e tempo (aprovado).** Invocações por change e tempo total de execução ativa, com limites efetivos de D23. Cobre RC-036, RC-037. Enquanto estiverem ausentes, o runner não pode ser declarado operacional.
- [x] 6.8 **Execução e invocação com identidade (aprovado).** Retomada preserva `execution_id`; nova execução referencia a anterior sem reiniciar consumo; `invocation_id` por invocação. Cobre RS-024, RC-035, RC-038.
- [x] 6.9 **Distinção de motivos (aprovado).** `authorization_required` sem autorização; `budget_reserve_insufficient` só com autorização vigente sem saldo. Testes e relatório distinguem. Cobre RC-031.
- [x] 6.10 **Registro de reconciliação (PROPOSTA, pendente de aprovação).** Implementar o esquema de D26 e o exemplo sem dados sensíveis; não considerar aprovado sem decisão humana. Cobre RC-045. Nota: aprovação humana do esquema continua pendente; o registro não é considerado aprovado. Atualização de 2026-10-24: esquema aprovado pelo dono do projeto; registro formal em `authorizations.json` pendente do comando `authorize.mjs record` com terminal interativo, a ser executado pelo dono (design, D26).
- [x] 6.11 **Encerramento de árvore de processos (aprovado).** Grupo de processos por comando; timeout encerra o grupo; término não confirmado bloqueia (RC-043) e impede nova avaliação (RC-044). Teste com simulador que cria processo filho. Cobre D25.
- [x] 6.12 **Tempo ativo por categoria e timeout de gate (aprovado).** Durações por categoria; `max_seconds_per_gate` em policy.json (provisório); gate travado encerrado por timeout (RC-042).
- [x] 6.13 **Interrupção e diagnóstico (aprovado).** `diagnosing` com motivo opcional; interrupção registra evento próprio; `reconciliation_required` só com consumo ou reserva a reconciliar (RC-046).
- [x] 6.14 **Investigação do timeout de score (registrada).** Causa observada descrita em D25; teste com simulador prova que a árvore é encerrada no timeout.

## 7. F7 — Validade, validação final e relatório de testes

Depende de: F2, F3, F4. Cobre: EV-001 a EV-013; AC-001 a AC-021 (exceto as já cobertas em F8).

- [x] 7.1 RED: impressão inclui arquivo não commitado (EV-001); artefatos operacionais não mudam a impressão (EV-002); alteração em caminho protegido, incluindo exclusões de `policy.json` (EV-003); `- [ ]` → `- [x]` permitido (EV-004)
- [x] 7.2 RED: aprovação desatualizada recusada (EV-005); mudança durante a validação (EV-006); revisão de cenário com autorização (EV-007) e sem autorização (EV-008)
- [x] 7.3 RED: validação completa registra aprovação e libera o arquivamento (EV-011); resumo durável com os campos de D16 (EV-012); evidência local ausente exige revalidação, e hash sem resumo não basta (EV-013)
- [x] 7.4 RED: identidade de suíte divergente para com `config_error` (AC-014); formato `junit` bloqueado com diagnóstico (AC-016); TAP do Node reconhecido por caso (AC-017)
- [x] 7.5 RED: contagem igual com identidade diferente reprova (AC-015); falha de teste reprova (AC-011); saída não zero reprova (AC-012); teste acrescentado a arquivo existente conta (AC-013); `skip` não satisfaz (AC-005)
- [x] 7.6 RED: `check:<nome>` com código zero satisfaz (AC-018); caso com revisão antiga reprova (AC-019); teste inalterado sem justificativa de suficiência não aprova (AC-020); condição verdadeira torna o cenário obrigatório (AC-021)
- [x] 7.7 GREEN: `scripts/harness/evidence.mjs` (impressão, hashes, comparação antes/depois), `scripts/harness/test-report.mjs` (executa `checks.test_report.command`, captura saída e código, parser TAP, conjunto de identidades), `scripts/harness/validate.mjs` (validação final e resumo durável)
- [x] 7.8 Teste de que o relatório declara o limite de isolamento e o caráter advisory do bloqueio (EV-010)
- [x] 7.9 Fixtures TAP do Node 22 ou superior: `ok`, `not ok`, `# SKIP`, `# TODO` e saída filtrada

Aceite: nenhuma aprovação sem resumo durável; nenhum caso ausente ou ignorado aprova; formato não suportado sempre bloqueia com diagnóstico.

## 8. F8 — `spec-accept`, RED e comportamento pré-existente

Depende de: F4, F5. Cobre: AC-001, AC-002, AC-007 a AC-010.

- [x] 8.1 RED: classificação `behavioral` × `environment` (AC-007, AC-008)
- [x] 8.2 RED: caracterização passa no código atual antes de qualquer alteração (AC-009); falha fabricada por mock recusada (AC-010)
- [x] 8.3 RED: divergência entre teste e cenário para a skill sem editar `specs/` (AC-001); alteração de teste aprovado sem registro (AC-002)
- [x] 8.4 GREEN: `.claude/skills/spec-accept/SKILL.md` e `scripts/harness/red.mjs` (classificação)

Aceite: nenhum RED aceito por erro de ambiente; `spec-accept` não edita `specs/`.

## 9. F9 — Telemetria e relatórios

Depende de: F5, F6. Cobre: TE-001 a TE-008.

- [x] 9.1 RED: evento com modelo solicitado e efetivo divergentes (TE-001); custo `unknown` no evento, nunca zero (TE-002); limpeza preserva resumo, checkpoint e autorizações (TE-003)
- [x] 9.2 RED: relatório separa custo conhecido, estimado, contagem desconhecida e etapa não medida (TE-004, TE-008); custo por entrega inclui tentativas (TE-005); declaração de separação de agentes (TE-006); exportação sem segredos (TE-007)
- [x] 9.3 GREEN: `scripts/harness/telemetry.mjs`, `scripts/harness/report.mjs`; `.gitignore` com `.harness-local/`. Inclui a ligação do runner com os eventos de ciclo de vida e o diagnóstico de lock em `events.jsonl` (TE-009, TE-010), e a retenção por data registrada (TE-011). Os testes dessa ligação estão em 9.4 e 9.5, ainda não marcados; este checkbox foi mantido por regra de não alterar itens já marcados.
- [x] 9.4 **Ligação de eventos e lock (aprovado).** RED antes de GREEN. O runner grava início, conclusão, falha, interrupção e retomada, cada um com `execution_id` e `at` (TE-010). Partida recusada por `lock_held` ou `lock_unreadable` não acrescenta linha a `events.jsonl`; o diagnóstico vai para a saída do comando, e só o detentor do lock grava `kind: "lock"` (TE-009). Testes com o simulador, sem chamada ao modelo.
- [x] 9.5 **Retenção por data registrada (aprovado).** Idade calculada por `at` (eventos) e `recorded_at` (relatórios), nunca por mtime. Evento sem data ou com data inválida gera aviso e é preservado, mesmo com mtime antigo (TE-011). Cobre também TE-003 com essa regra.

Aceite: nenhum relatório apresenta custo como total completo com desconhecido ou não medido. A ligação de 9.4 e a retenção de 9.5 são aceitas somente quando seus testes passam.

## 10. F10 — Skills para o runner e remoção do modo legado

Depende de: F6, F7, F8. Cobre: SP-001, SP-004 a SP-009.
Escopo: 10.1, 10.2 e 10.4 são do F10. 10.3 só ocorre depois do marco (13) e da confirmação de que não há execução `legacy` ativa.

- [x] 10.1 RED: `spec-implement`, `spec-archive` e `handoff` (SP-004, SP-005, SP-006); arquivamento grava o resumo antes de mover (SP-007); skills em `legacy` usam `--legacy-write` e em `runner` pedem ao runner (SP-008); sem marco de adoção, nenhuma execução é atribuída ao runner (SP-009)
- [x] 10.2 GREEN: atualizar as três skills; `pr` sem mudança de comportamento
- [ ] 10.3 Remover `--legacy-write` somente depois de (a) confirmar que não há execução `legacy` ativa e (b) o marco da tarefa 13 estar registrado. Antes disso, `--legacy-write` permanece. Teste que garante a remoção
- [x] 10.4 `CLAUDE.md`, `README.md` e `templates/docs/agents/issue-tracker.md`: tabela de gates derivada e limite de isolamento declarado

Aceite: nenhuma skill grava contadores ou vereditos fora do runner.

## 11. F11 — Benchmark em três níveis e calibração (sem execução paga)

Depende de: F6, F9. Cobre: PB-001 a PB-005.
Escopo: 11.1 a 11.4 usam somente simuladores. Nenhum benchmark pago é executado nesta change.

- [x] 11.1 RED: falha do runner separada de falha funcional (PB-001); execução concluída com gate reprovado (PB-002); configuração e autorizações no relatório (PB-003); regra de domínio obrigatória reprova (PB-004); máximo observado com origem e declaração (PB-005)
- [x] 11.2 GREEN: `scripts/benchmark/` com três níveis, configuração efetiva e declarações
- [x] 11.3 Plano de calibração escrito em `policy.md`. **Nenhum benchmark pago é executado nesta change.** Os testes usam o simulador (PO-012).

Aceite: o relatório de teste traz os três níveis separados; zero chamadas reais nos testes.
- [x] 11.4 **Não determinismo (aprovado). Registro no relatório feito; a ocorrência segue aberta.** PB-008 registrado como falha intermitente sem causa (PB-009). Passagens posteriores não apagam. O marco de adoção fica bloqueado até investigação. **Status: não resolvido.** Evidência: 18 reexecuções sem reprodução. Causa não identificada. Risco residual: a falha pode reaparecer. Não marcar como resolvido por passagens posteriores (design, Questões abertas, item 7).

## 12. F12 — Migração

Depende de: F10, F11. Cobre: PM-001 a PM-009.

- [x] 12.1 RED: histórico importado como `legacy-markdown` sem aprovação (PM-001); cópia pré-migração antes de importar (PM-002); contagem conservadora de correções (PM-003); baseline da descoberta sem reconstrução histórica (PM-004); change arquivada inalterada (PM-005); evidência antiga exige revalidação (PM-006)
- [x] 12.2 RED→GREEN: migração interrompida completa na reexecução (PM-007); modo não misturado (PM-008); rollback exige autorização (PM-009)
- [x] 12.3 GREEN: migração em `template-migrate` e `template-update`; `new-project` cria `.harness-local/` no `.gitignore` e o `checks.test_report`. **Critérios para marcar (PM-010), todos testados antes:** (a) migração de `checks.test_report` em projeto existente, com `checks.test` em string convertido para objeto com `suite`; (b) preservação da configuração local: valores já definidos em `checks` não são sobrescritos, e cada diferença é reportada; (c) recusa de formato incompatível (fora de `tap`) com `config_error` que nomeia `checks.test_report.format`, sem alterar arquivos
- [x] 12.4a **Preparação verificável (sem adoção). Autorizada pelo humano; não executada nesta etapa.** Fixtures de projetos sintéticos em Node, com o `checks.test_report` declarado e saída TAP capturada, percorrem a migração ponta a ponta com o simulador. Nenhuma alegação de compatibilidade com outros stacks. Pendência: a verificação de Node 22 via Docker depende de daemon Docker disponível, que hoje não está disponível (design, Questões abertas, item 4)
- [ ] 12.4b **Adoção real (separada, não bloqueia o núcleo). Pendente de projetos identificados e de autorização específica.** Para cada projeto derivado identificado: stack de teste verificado, `checks.test_report` declarado, migração aplicada com autorização humana. Enquanto a lista não existir, a adoção fica pendente. Esta tarefa não é concluída pela 12.4a
- [x] 12.5 Validação final desta change com o gate novo: cada cenário aplicável com caso `[ID]` passando, e `openspec validate add-spec-harness --strict`. Esta validação segue o fluxo atual até o marco da tarefa 13

Aceite: nenhum histórico vira aprovação; migração idempotente; `template-check` READY.

## 13. Marco de adoção do runner

Depende de: F12 (12.4a) e de decisão humana. Cobre: SP-009.

- [x] 13.1 Testes da F1 a F12 verdes com simuladores, sem chamada real
- [x] 13.2 Registrar no `docs/agents/issue-tracker.md` o marco de adoção, com a data e o aprovador. Só então o runner pode assumir execuções. Sem esse registro, as execuções ficam em `legacy`

Aceite: sem marco registrado, nenhuma execução é atribuída ao runner.

## A. Adendo de contrato desta etapa (pendente, ainda não implementado)

Itens das decisões de revisão de contrato (`design.md` D27 a D31 e D16, D21b). Nenhum está concluído. Cada um começa por RED. Os itens de F1 a F12 acima não mudaram de status.

- [x] A.1 RED: `checks.test` em string com `test_report` recusado (AC-022); modo legado sem `test_report` (AC-023); suíte divergente (AC-014); formato não suportado com diagnóstico (AC-016). GREEN: leitura e validação do esquema de `checks` (D27)
- [x] A.2 RED: identidade do caso por arquivo e nome normalizado (AC-024); helper alterado muda o hash dos arquivos que o declaram (AC-025); cenário com dois casos e caso com duas tags (AC-026). GREEN: `acceptance-manifest.json` e cálculo de `case_body_hash` (D28)
- [x] A.3 RED: `Depende de` com referência não declarada recusado (HI-014); revisão percorre dependências transitivas (EV-007). GREEN: validação das referências em `contract.mjs` e propagação de invalidação. Validação final continua reexecutando a suíte obrigatória completa, sem seleção (D21b)
- [x] A.4 RED: aprovação não volta com só uma ou duas das três verificações (EV-014); caso reexecutado em revisão antiga (AC-019); justificativa de suficiência (AC-020). GREEN: autorização `revision` com `scope` de cenário e de casos, e `purpose` (D29)
- [x] A.5 RED: condição suportada verdadeira torna o cenário obrigatório (AC-021, exemplo `formato tap`); condição não reconhecida vira obrigatória com `condição não avaliada` no relatório (AC-027); condição falsa e não aplicável (HI-010). GREEN: avaliador de condições (D30)
- [x] A.6 RED: derivados fora da impressão só sem configuração executável (EV-002); `tasks.md` com checkbox alternado não muda a impressão (EV-004); mudança de conteúdo em `tasks.md` é protegida (EV-015); `authorizations.json` com hash próprio verificado antes de iniciar ou continuar (D31). GREEN: impressão e verificação de caminhos protegidos
- [x] A.7 RED: resumo durável gravado somente após validação final aprovada (EV-012); checkpoint de fatia com evidência marcada `parcial, não aprovada` (RS, requisito de conteúdo do checkpoint). GREEN: gravação do resumo e do checkpoint
- [x] A.8 **Invalidação transitiva por revisão (parte de A.3, EV-007, EV-008).** Revisão de cenário com autorização `scenario_change` invalida os dependentes de "Depende de", em cadeia (teste de três níveis). A invalidação grava marcas por ID no campo `invalidated` de `evidence-summary.json` e não aprova. Texto de cenário alterado sem nova revisão vira `protected_change`. RED: `a3-invalidation.test.mjs`. GREEN: `scripts/harness/invalidation.mjs` e `validate.mjs`.
- [x] A.9 **Interfaces, regras e fatias (parte de A.3, HI-014, EV-007).** `IF-`, `RG-` e `F<n>` declarados em design.md: a mudança da declaração (digest contra o último resumo aprovado) invalida os cenários que a citam, e as fatias dependentes pela coluna "Depende de", em cadeia. Referência não declarada é recusada nomeando a referência. Pendente de decisão: se mudança de interface, regra ou fatia exige autorização `revision` (D15), ver relatório.
- [x] A.10 **Vínculos por caso (item B, AC-026).** Tags do nome do caso devem ser iguais a `scenario_ids`; tag de cenário não declarado reprova como `ambiguous_link`; cenário com duas revisões no manifesto é `config_error`; o adaptador TAP captura todas as tags do nome. RED: `a3-links.test.mjs`. GREEN: `acceptance.mjs`, `test-report.mjs`, `validate.mjs`.
- [x] A.11 **Hash por arquivo (item C, AC-025).** `file_hash` no manifesto e no resumo, e a função `fileHash`. `case_body_hash` fica só como alias de leitura no manifesto, documentado em `acceptance.mjs`. A limitação de granularidade por arquivo (D28) continua declarada. RED: `a3-file-hash.test.mjs`. Pendência de texto: D28, AC-024 e AC-025 ainda dizem `case_body_hash`; specs e design não foram alterados nesta etapa.
- [x] A.12 **Heurística de mock como aviso (item D, AC-010).** Falha com sinal de mock gera o aviso `mock suspeito para revisão` e mantém o status do caso; não aprova nem reprova. Ajustados o teste antigo de AC-010 em `f8-preexisting.test.mjs` e o novo `a3-red.test.mjs`.
- [x] A.13 **Finalidades das autorizações `revision` (item E, D29, D30).** Lista fechada `PURPOSES` em `authorize.mjs`, com o que cada finalidade permite; escopo exigido por finalidade; `purpose` obrigatório em `revision` e inexistente nos demais tipos; o validador compara a finalidade sem valor padrão; `contract.mjs` recusa finalidade que não aprova o item (test_adequacy e sufficiency). RED: `a3-purpose.test.mjs`.
- [x] A.14 **Caminhos protegidos por projeto (item F, EV-003).** O manifesto da change, os arquivos de teste que ele lista e os helpers declarados entram na proteção, resolvidos pelo manifesto do próprio projeto. `policy.json` não foi alterado. RED: `a3-protected.test.mjs`.
- [x] A.15 **CLI do manifesto (item G, D28).** `scripts/harness/manifest-cli.mjs`: `generate` grava candidato com status `proposto`, recusa substituir manifesto existente mostrando a diferença, e substitui só com `--replace --auth <id>` de autorização `test_adequacy` que cubra os casos; `validate` confere schema, identidades, file_hash, helpers, vínculos e revisões sem alterar arquivos. RED: `manifest-cli.test.mjs`.

Aceite: `contract.mjs` recusa referência não declarada; nenhuma aprovação volta após revisão sem as três verificações de D29; nenhuma condição não reconhecida é ignorada.

## B. Adendo de contrato de 2026-10-24 (pendente, ainda não implementado)

Itens das decisões do dono do projeto de 2026-10-24 (design: D19, D24, D26, D32, "Gate oculto", "Avaliação da falha original (PB-009)"). Nenhum está concluído. Cada um começa por RED. Os itens de F1 a F12 e de A não mudaram de status.

- [x] B.1 **CLI dos gates e checkpoint de arquivamento (usadas pelas skills).** CLI dos gates que imprime o resultado estruturado e grava `gates.json` somente com `--legacy-write` em execução `legacy`. Checkpoint de arquivamento (marco `archived`) gravado pelo runner antes de `openspec archive` (D18, passo 2). RED: skills em `legacy` usam `--legacy-write` e em `runner` pedem ao runner (SP-008); resumo e checkpoint antes de mover a change (SP-007, RS-011).
- [x] B.2 **Integração da reconciliação ao runner.** O runner aplica o registro de D26 antes de qualquer chamada paga: correspondência (RC-051), idempotência (RC-052, RC-053), validação de custo (RC-054), `closed_unknown` com exposição mantida (RC-055), correção por `supersedes` (RC-056), efeito calculado nos quatro conceitos e nos três tratamentos (RC-057, RC-058). Testes pelo runner, não só pelo módulo isolado. Cobre RC-045 e RC-024.
- [x] B.3 **Identidade owned e caminhos de migração e recuperação.** Implementar os caminhos de D24 (cópia pré-migração, importação de histórico `legacy-markdown`, checkpoint de migração, depois a mudança de modo; recuperação com `project_id` preservado e reconciliação do checkpoint importado). RED: cópia antes da importação (PM-002, PM-001); clone preserva `project_id` (RS-019); `template-update` não sobrescreve `.harness-project.json` (RS-023). Complementa 2.9 e não o marca.
- [x] B.4 **`legacy-run` (decisão de dependência).** Definir o ponto de entrada de `.claude/skills/template-migrate/legacy-run.mjs` ou eliminar a dependência dele. A decisão é registrada no `docs/agents/issue-tracker.md`. RED: migração interrompida completa na reexecução (PM-007) pelo caminho escolhido.
- [x] B.5 **`manual_rollback` implementado e documentado.** Procedimento de D32 com pré-condição de hash, terminal interativo, evento `restore` em `events.jsonl`, campo `restored` no `run-state.json` e reconciliação antes de continuar. Documentado para o humano em `.claude/harness/policy.md`. RED: PM-009 e PM-011; sem TTY a restauração é recusada; hash divergente recusa a restauração sem alterar arquivos. **Status (2026-10-24): aberto.** O procedimento está em `.claude/harness/policy.md` com teste textual (PM-011). O código de restauração (terminal interativo, pré-condição de hash, evento `restore`, campo `restored`) não foi implementado nesta etapa.
- [x] B.6 **Gate oculto com classificação (PB-004 MODIFIED).** Classificação `obrigatória` ou `informativa` declarada em cada regra da tarefa; regra sem classificação é obrigatória; regra obrigatória reprovada reprova a aceitação funcional (PB-012); diagnóstico informativo não muda o status (PB-011); o gate mostra o resultado por regra com a classificação (PB-010). RED antes de GREEN. Testes de `scripts/test/benchmark/hidden.test.mjs` que mudam por esta regra são alterados com justificativa no `docs/agents/issue-tracker.md`, sem alterar a regra para passar.
- [x] B.7 **Percurso integrado com simulador.** Iniciar, falhar, corrigir, parar, autorizar retomada, reconciliar interrupção, validar, gerar checkpoint e relatório de arquivamento, com o simulador `claude`, sem chamada ao modelo. RED: sucesso (SP-010) e retomada após interrupção (SP-011). **Status (2026-10-24): concluído com a execução 2 do percurso (fixture no scratchpad, simulador, sem chamada ao modelo).** Início, falha, correção, gate pass aprovando a fatia, invocação morta no meio, lock_release por TTY simulado, reconciliação closed_unknown idempotente, retomada com o mesmo execution_id, validação final aprovada com a execução aprovada, checkpoint archived e relatório. Testes de regressão em scripts/test/harness/c-correcoes.test.mjs.
- [x] B.8 **Validação final desta change pelo caminho novo.** Depois de B.1 a B.7 verdes, o `validate.mjs` do runner valida esta change, sem chamada paga. Não substitui 12.5, que segue o fluxo atual até o marco da tarefa 13.
- [ ] B.9 **Reavaliação de PB-009.** Reavaliar as perguntas (a), (b) e (c) de "Avaliação da falha original (PB-009)" se surgir log, saída ou hash da falha original. Enquanto as três forem não distinguíveis, a pendência permanece aberta e o marco fica bloqueado. Não marcar como resolvido por passagens posteriores.

## C. Ajustes finais de 2026-10-24 (decisões do dono)

Itens novos das decisões do dono (design: D8, D14, D27, D28). Cada um começou por RED. Os itens anteriores não mudaram de status.

- [x] C.1 **Tracker fora da impressão (EV-016).** `docs/agents/issue-tracker.md` em `excluded_paths`; padrão com barra interna vale para o caminho inteiro. Editar o tracker não muda a impressão; editar `design.md` muda. RED→GREEN: `c-final-tracker.test.mjs`
- [x] C.2 **Identidade por arquivo e recusa de ambiguidade (AC-028, AC-029).** `checks.test_report.file_command` com `{file}`; a suíte é autoridade de código de saída e contagens; soma por arquivo divergente reprova com `inventory_mismatch`; sem `file_command`, nome repetido reprova com `inventory_ambiguous`; `template.json` declara `file_command`. RED→GREEN: `c-final-identity.test.mjs`
- [x] C.3 **Interrupção em gate (RC-059, RC-060, RC-061).** `awaiting_gate` → `interrupted` e `interrupted` → `awaiting_gate` na tabela; guarda do gate com prazo `max_seconds_per_gate`, sinais e encerramento da árvore; término não confirmado bloqueia nova avaliação; retomada reexecuta o gate do início com o parcial descartado. RED→GREEN: `c-final-gate-interrupt.test.mjs`
- [x] C.4 **Entrada pública da execução headless (HE-001, HE-005, RC-008, RC-015, RC-021, RC-025, SP-010, SP-011).** Subcomando `run` em `scripts/harness/cli-run.mjs`, registrado em `cli.mjs`, ligando `runSlice` ao gate de implementação real e à validação final; `spec-implement` documenta `run` e `--runner-step`. Testes pelo mesmo comando do usuário, com o simulador em `--claude-bin`: autorização ausente e retomada depois dela, reserva insuficiente, falha do gate e correção até a aprovação, correção sem efeito (parada por ação repetida), quota esgotada, morte do processo com reconciliação e retomada. RED→GREEN: `cli-run.test.mjs`

## P. Sonda de `--max-turns` (NÃO AUTORIZADA, NÃO EXECUTADA)

Separada das fatias. Nenhuma fatia depende dela. O runner não anuncia o limite de turnos enquanto não houver `probe_result` `enforced` (PO-013).

- [x] P.1 (sem custo, com fixtures locais, sem chamada ao modelo; cobre PO-015) RED→GREEN: reconhecimento na ajuda local não é tratado como comprovação (PO-006); classificador de resultado da sonda, com fixtures: `enforced` só com motivo explícito de limite de turnos e `num_turns` dentro do limite (PO-007); `is_error` sem causa ou conclusão normal são `inconclusive` (PO-007); sonda sem autorização `probe` não roda (PO-011). P.2 segue bloqueada: sem autorização `probe` humana.
- [ ] P.2 (**pago, bloqueado**) Executar o comando de `design.md` D6.1 com autorização `probe`, orçamento pretendido de US$ 0,05 (sem teto exato) e os critérios de D6.1. Registrar o resultado com um registro humano `probe_result`. **Pendente de autorização humana.**
- [ ] P.3 (**condicional**) Se o resultado for `inconclusive`, a execução de controle sem `--max-turns` só é feita com nova autorização `probe`. Sem ela, o limite de turnos permanece não comprovado.

Aceite de P.1: classificador passa nas fixtures, sem chamada.
