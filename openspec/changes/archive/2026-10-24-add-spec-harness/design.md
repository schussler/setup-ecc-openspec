# Design

As regras comuns (TDD, tetos, paradas, classificação de falhas, validade, segredos e retenção) ficam em `.claude/harness/policy.md`, com parâmetros em `.claude/harness/policy.json`. As specs referenciam essa política e não a repetem.

Este documento incorpora as decisões D-A a D-H aprovadas em 2026-10-23. Onde a versão anterior divergia, vale esta.

Revisão posterior incorpora D27 a D31 (novos), ajusta D2, D11, D14, D16 e D21b, e acrescenta a seção "Interfaces e regras compartilhadas". Revisão de 2026-10-23 (decisões humanas aprovadas) acrescenta D32 (finalidades de autorização e identificação), transforma as condições aprovadas da reconciliação em regras de D26 e ajusta D1, D4, D17, D29 e a seção de fatias. Pendências explícitas: o registro formal de D26 em `authorizations.json`, a versão do Node (ver "Questões abertas") e as ocorrências PB-008 e PB-009 (não resolvidas).

Revisão de 2026-10-24 (decisões do dono do projeto, não reabertas) acrescenta: D26 aprovado com efeitos de saldo definidos sem ambiguidade (regras 1 e 6); `closed_unknown` mantém a exposição no comprometido; regras obrigatórias de domínio participam da aceitação funcional (requisito "Testes ocultos", MODIFIED em `pipeline-benchmark`); avaliação da falha original PB-009; procedimento de restauração manual em D32; caminhos de migração e recuperação da identidade em D24.

Revisão de compatibilidade de 2026-10-24 (modo financeiro, aprovada pelo dono do projeto para revisão): orçamento, autorização `budget`, reserva e reconciliação financeira passam a valer somente quando o perfil da execução define `modo_financeiro: true` (padrão `false`). Ausente ou falso, o modo é de observação, descrito em `openspec/changes/add-silent-consumption-observability`. Alteram-se só os requisitos conflitantes: "Invocação headless" (`headless-execution`) e "Orçamento com limites independentes", "Reserva e custo", "Reconciliação de reservas", "Registro de reconciliação idempotente e correspondido" e "Extensão de orçamento com autorização" (`harness-run-control`). Nenhum cenário mudou de texto nem de revisão. A aprovação `336249d1-e8e3-43e3-ac57-a35f8147f22d` (hash `9fc8fe2b…751f7a`) permanece como registro histórico e não aprova este contrato revisado; a aprovação deve ser registrada de novo.

**Ambiente verificado desta entrega:** Node 24.21.0, macOS. Node 22 não verificado; não bloqueia a conclusão da v1. Não há instalação de Homebrew nesta etapa.

Revisão de 2026-10-24 (ajustes finais do dono, não reabertos): tracker fora da impressão (D14, D31); identidade dos casos por arquivo com `file_command` e recusa de ambiguidade (D27, D28); interrupção durante a avaliação de gate (D8).

## Visão geral

```
spec-create ──► contrato aprovado ──► checkpoint (marco 1)
                    │
runner (único escritor por execução, com lock)
  ├─► spec-accept (testes com ID de cenário)
  ├─► spec-implement (TDD por fatia)
  ├─► gates (resultado estruturado, sem escrita de estado)
  ├─► validação final ──► checkpoint (marco 2, por fatia)
  └─► spec-archive ──► resumo durável ──► openspec archive
Local (.harness-local/, fora do Git): run-state, eventos, relatórios brutos
Versionado (Git): contrato, autorizações, checkpoints e resumo durável de evidências
```

## Decisões

### D1. Identidades, bloqueio e recuperação
Três identidades distintas:
- **Projeto (`project_id`):** UUID em `.harness-project.json` na raiz do repositório, versionado. Clonar, mover ou trocar o caminho preserva o id. Criar um projeto derivado pelo `new-project` gera outro. Contrato, estado e checkpoints referenciam esse id. Não depende do caminho absoluto.
- **Clone/worktree (`local_id`):** UUID em `<git-common-dir>/harness/local-id`, criado uma vez por clone e compartilhado pelos worktrees. Não é versionado. Identifica onde a execução ocorre.
- **Execução (`execution_id`):** UUID gerado a cada execução do runner.

**Lock:** `<git-common-dir>/harness/locks/<change>.lock`, criado de forma exclusiva. Ele impede duas execuções concorrentes da mesma change dentro de um clone, em qualquer worktree. Changes diferentes não se bloqueiam. Clones separados têm diretórios comuns diferentes e não se bloqueiam entre si: limite declarado, tratado pela reconciliação de D19. Conteúdo: `project_id`, `change`, `local_id`, `execution_id`, `pid`, `host`, `started_at`, `heartbeat_at`.

**Lock_held** é motivo de bloqueio da partida. Não cria estado novo e não altera o estado da change.

**Vencimento:** o lock vence somente por heartbeat anterior a `lock_stale_seconds`. A origem (host) não torna o lock vencido. Um lock de outro host com heartbeat recente continua valendo.

**Diagnósticos de lock em `events.jsonl`:** podem ser gravados com `kind: "lock"` e identificação própria (`project_id`, `change`, `local_id`, `execution_id` quando houver, `lock_sha256` quando aplicável). A escrita em `events.jsonl` é serializada: somente o processo que detém o lock da change, ou o procedimento de liberação executado sob esse lock, acrescenta linhas. Uma partida recusada por `lock_held` não acrescenta linha: o diagnóstico vai para a saída do comando (TE-009). Não há segundo escritor concorrente.

**Liberação de lock vencido, em etapas:**
1. validar identidade: `project_id`, `change` e `execution_id` do lock coincidem com os do registro `lock_release`;
2. validar vencimento pela política;
3. validar a autorização `lock_release` (registro humano, não revogado);
4. reler o arquivo imediatamente antes de remover e comparar o conteúdo com o validado; se o lock foi renovado ou substituído, recusar;
5. remover e gravar o evento.

**Limites declarados:** o bloqueio é advisory, não resiste a outro processo da mesma conta. Não resolve concorrência entre clones separados.

### D2. Estado local e checkpoints versionados
- Autoridade operacional: `.harness-local/<change>/run-state.json`, fora do Git, por worktree. Inclui revisão, rodada, contadores, consumo, reservas, modo e `schema_version`.
- Versão do esquema (`schema_version`) é um campo do arquivo, validado pelo runner. Não tem relação com o histórico do Git.
- Checkpoint versionado: `openspec/changes/<change>/checkpoint.json`. Gravado somente nos marcos: `contract_approved`, `slice_approved` (uma vez por fatia) e `archived`. Nunca gerado por invocação, para não produzir diff a cada passo.
- Conteúdo do checkpoint: `checkpoint_seq`, tripla de identidade, hash do contrato, rodada atual, contadores locais por gate, consumo acumulado (gasto conhecido, gasto estimado, número de chamadas com custo desconhecido), reservas abertas, `attempt_id`, ids das autorizações vigentes e o hash da evidência aprovada. Em marco de fatia, a evidência pode ser parcial; nesse caso o campo traz `parcial, não aprovada` (D16).
- Consumo e reservas no checkpoint impedem que trocar de máquina reinicie limites.
- Importação: ver D19.

### D3. Visões derivadas
`gates.json`, `summary.md` e os relatórios locais são regenerados a cada revisão e carregam `derived_from_revision`. Visão com revisão diferente da do estado é regenerada antes do uso. No modo `runner`, `gates.json` é derivado; no modo `legacy`, o arquivo é escrito pela CLI antiga (ver D20).

### D4. Política, configuração proposta, autorização e consumo
Quatro camadas distintas:
1. **Política** (`.claude/harness/policy.json`): tetos e regras, versionada no template. Uma definição por chave.
2. **Configuração proposta** (`.claude/harness/profiles/default.json` e, por change, `profile` no contrato): valores candidatos de calibração, com chaves `candidate_*` e `"provisional": true`. **Não autorizam gasto.**
3. **Autorização** (`openspec/changes/<change>/authorizations.json`, versionado, somente acréscimo): cada registro tem `id`, `kind` (`budget`, `round`, `reconciliation`, `revision`, `probe`, `probe_result`, `lock_release`, `revocation`), escopo, valor ou quantidade, motivo, aprovador e data. Só uma decisão humana explícita origina registro. Skills e runner não concedem autorização, mas o comando `authorize.mjs record` persiste uma decisão humana explícita, com origem, escopo, autor e data, sem edição manual de JSON. O comando exige terminal interativo (TTY) e confirmação digitando o resumo do registro; sem TTY ele recusa. Limitação: isso é procedimental, não impede a mesma conta de editar o arquivo diretamente. Revogação e substituição são registros novos com `revokes` ou `supersedes`. A regra de somente acréscimo é verificada pelo fluxo, não é garantia contra adulteração pela mesma conta.
4. **Consumo** (`run-state.json` e checkpoint): gasto conhecido, estimado e desconhecido, reservas abertas.

Limite efetivo de uma chamada = o menor entre o teto da política, o valor candidato adotado para a change (se houver) e o valor da autorização vigente. Sem autorização cobrindo a reserva, nenhuma chamada paga é iniciada. Registrar US$ 30 em qualquer camada não autoriza gastar US$ 30.

**Formato de `authorizations.json` (F5).** Lista JSON de registros, gravada de forma atômica somente por `authorize.mjs record`, em formato canônico (indentação de 2 espaços). Um campo por linha:
- `id`: UUID do registro;
- `kind`: um dos tipos listados acima;
- `origin`: `human` (único valor que o `record` grava);
- `scope`: `{"change": "<nome>"}`, igual à change do arquivo;
- `amount_usd`: valor em USD, obrigatório em concessão de `budget` e ausente em revogação;
- `quantity`: inteiro não negativo, quando o tipo exigir quantidade;
- `result`: `enforced`, `not_enforced` ou `inconclusive`, obrigatório em `probe_result`;
- `reason`: motivo, texto não vazio;
- `approver`: aprovador humano, texto não vazio;
- `author`: usuário do sistema operacional que executou o `record` (`os.userInfo().username`);
- `recorded_at`: instante da gravação, em ISO 8601;
- `project_id`: id de `.harness-project.json`;
- `revokes`: id de registro revogado; o próprio registro não concede orçamento;
- `supersedes`: id de registro substituído; o registro novo concede no lugar do antigo;
- `purpose`: finalidade, obrigatória em `kind: revision` e ausente nos demais tipos. Finalidades e limites em D32;
- `project_id` e `scope.change` são obrigatórios e conferidos contra o contexto validado (D32);
- dados extras do tipo (por exemplo `reservations`, `checkpoint_seq`, `execution_id`), vindos de `--data`, que não podem sobrescrever os campos acima.

### D5. Interface dos gates
Cada gate retorna `{gate, passed, failures, cases, evidence, paid, cost_source}`. `cases` traz `id`, `status` (`pass`, `fail`, `skip`, `missing`) e `source`. `skip` nunca aprova. O veredito (`pass`, `retry`, `stop`) é calculado pelo runner com `decideVerdict`, movido para `scripts/harness/`. As CLIs dos gates imprimem o resultado e, no modo legado, escrevem `gates.json` apenas quando `--legacy-write` é passado.

### D6. Verificação da CLI e sonda
Medido com `claude` 2.1.309, sem chamada ao modelo:

| Opção | Reconhecimento (sem modelo) | Documentação oficial | Comprovação de funcionamento |
|-------|------------------------------|----------------------|------------------------------|
| `--max-budget-usd` | `--help` lista a opção | Estimativa do cliente; pode ser ultrapassada; totais de `--resume` não contam | Não comprovado. Tratado como limite aproximado |
| `--max-turns` | `--help` **não** lista. O binário contém a definição `--max-turns <turns>` | Documentado: sai com erro ao atingir o limite | **Não comprovado.** Exige sonda paga (D6.1, tarefa P.2) |
| `--output-format json` | Sim | Traz `total_cost_usd`, `modelUsage`, `num_turns` | Campos a confirmar na sonda |
| `--session-id`, `--model`, `--effort`, `--permission-mode`, `--allowedTools` | Sim (`--help`) | — | Mantidos do pipeline atual |
| `--fallback-model` | Sim | — | Não passado pelo runner |

Reconhecimento (a opção está no código ou no `--help`) não prova funcionamento. `--version` não serve como teste de reconhecimento: encerra antes de validar as opções.

**D6.1 Sonda paga (não autorizada, não executada).** Separada das tarefas verificáveis. Comando candidato, em diretório de scratch com `dados.txt` contendo `chave: valor`:
```
claude -p "Leia dados.txt com a ferramenta Read e responda só com o valor da chave." \
  --model claude-haiku-5-5 --max-turns 1 --output-format json \
  --permission-mode dontAsk --allowedTools Read \
  --max-budget-usd 0.05 --no-session-persistence
```
Critérios de classificação (PO-007 e PO-010; a autorização é PO-011):
- `enforced`: o JSON identifica explicitamente o término por limite de turnos (motivo ou subtipo que nomeia o limite de turnos) e `num_turns` não passa de 1. Só essa combinação comprova o limite.
- `not_enforced`: a tarefa precisava de mais de um turno (confirmada por uma execução de controle sem o argumento) e o JSON não identifica o limite. Exige a execução de controle.
- `inconclusive`: qualquer outro caso, incluindo `is_error: true` sem causa identificada e conclusão normal da tarefa.
- Orçamento pretendido: US$ 0,05. É pretendido, não é teto exato: `--max-budget-usd` é estimativa do cliente e pode ser ultrapassado. O custo real da sonda é registrado com origem.

Sem `enforced`, o limite de turnos fica declarado como não garantido no relatório. O runner não anuncia essa garantia e não inicia perfil que a exija (PO-013): a exigência só passa com um registro humano `probe_result` com resultado `enforced`. A sonda é separada das fatias; nenhuma fatia depende dela.

### D7. Orçamento e reservas
- Reserva por chamada = limite efetivo × (1 + `reserve_margin_ratio`). A margem é reserva de segurança, não garantia de teto.
- Comprometido = reservas abertas + gasto conhecido + gasto estimado. Chamada com custo desconhecido mantém a reserva aberta até reconciliação (D19).
- Custo desconhecido nunca vira zero. Sempre aparece como contagem separada.
- Limites independentes: invocações, turnos (somente quando `enforced`), correções, diagnósticos, tempo por chamada e total, custo por chamada e total, invocações por fatia.

### D8. Máquina de estados
Estados operacionais: `ready`, `invoking`, `awaiting_gate`, `correction_requested`, `approved`, `awaiting_decision`, `interrupted`, `config_blocked`, `diagnosing`, `forbidden_action_stopped`.

Motivos (`stop_reason`), preenchidos só em estados de parada: `correction_limit`, `budget_exhausted`, `budget_reserve_insufficient`, `repeated_symptom`, `protected_change`, `config_error`, `invalid_evidence`, `quota_unavailable`, `time_limit`, `human_decision_needed`, `stale_lock`, `lock_held`, `reconciliation_required`, `mode_mismatch`, `timeout_unclassified`, `authorization_required`, `lock_unreadable`.

Estados de parada por orçamento (`budget_reserve_insufficient`, `budget_exhausted`) ficam em `awaiting_decision`, não em `config_blocked`. `config_blocked` é só para configuração, identidade, esquema, modo e formato de relatório.

**Interrupção durante a avaliação de gate (decisão do dono, 2026-10-24).** A tabela de `scripts/harness/machine.mjs` aceita `awaiting_gate` → `interrupted` e `interrupted` → `awaiting_gate`. Cada avaliação de gate passa pelo guarda `scripts/harness/gate-guard.mjs` (runner, ciclo da fatia e `gate-implement` da CLI):
- **Prazo:** `max_seconds_per_gate`. No prazo, o guarda encerra a árvore de processos de cada comando do gate (D25, `process-group`).
- **Sinal:** SIGINT ou SIGTERM durante o gate seguem a mesma regra. A interrupção registrada pela CLI (`interrupt`) com o estado em `awaiting_gate` também segue a regra; o término só é confirmado se nenhum grupo registrado em `gate_run` continuar vivo.
- **Encerramento confirmado:** `interrupted` com evento de interrupção próprio (`phase: interrupt`, `cause: gate_timeout`, `gate_signal` ou `gate_external`). O gate não abre reserva; não há reconciliação financeira (RC-046).
- **Encerramento não confirmado:** `interrupted` com `stop_reason: human_decision_needed` e `termination_unconfirmed` (`kind: gate`). Nenhuma avaliação nova começa e a retomada é recusada até um `lock_release` humano que cite o `gate_run_id` (RC-043, RC-044).
- **Resultado parcial:** descartado e registrado como descartado (`gate_interruptions[].partial_result: discarded`). Nenhuma tentativa é gravada e nenhum veredito parcial vale como aprovação (`interrupted` → `approved` não está na tabela).
- **Recuperação:** a retomada da mesma execução volta a `awaiting_gate` e marca `gate_rerun_pending`. O ciclo da fatia reexecuta o gate do início, sem nova invocação. Uma nova invocação a partir da interrupção descarta a retomada do gate.

### D9. Teto de correções, repetição e diagnóstico
- Correção consome o limite de `max_corrections_per_gate` quando é despachada. Avaliação de gate não é correção.
- Assinatura de sintoma = hash de (gate, ids dos casos que falharam ou faltaram, classe do erro). Três ocorrências seguidas na rodada → `repeated_symptom`.
- Ação duplicada exige justificativa registrada.
- Divergência com o mesmo código → `diagnosing`, com motivo opcional e limite próprio. Reexecução favorável não aprova sozinha.
- **Runner novo (decisão de 2026-10-24):** não para por contagem de falhas. Resolver uma falha e revelar outra pode ser progresso. Paradas: limite de correções, três ocorrências consecutivas da mesma assinatura, orçamento, tempo ou decisão humana. A regra de contagem (SG-018) vale só no modo legado, identificada como tal.
- Timeout não é classificado como infraestrutura automaticamente. Vai para `timeout_unclassified` e exige diagnóstico com evidência (saída parcial, tempo, comando).

### D10. Aceitação e RED
- `spec-accept` é executado pelo runner, com entradas explícitas: contrato, interfaces e convenções. A separação entre aceitação e implementação é regra de fluxo, não isolamento técnico.
- Falhas são classificadas em `behavioral` ou `environment`. Só `behavioral` vale como RED.
- Comportamento pré-existente: o runner registra o que já passa antes da alteração. Falha não é fabricada.

### D11. Verificação de cenários: teste, check ou não aplicável
Cada cenário do contrato declara a forma de verificação:
- **`teste`** (padrão): exige um caso com o ID do cenário, executado na validação final, com resultado `pass`.
- **`check:<nome>`**: usa um check declarado em `checks` (por exemplo lint ou typecheck) quando um teste funcional não é adequado. Exige justificativa e aprovação humana registradas em autorização do tipo `revision`.
- **Não aplicável**: somente para cenário com **condição de disparo** explícita (condições suportadas listadas em D30). O runner avalia a condição. Se ela for verdadeira, o cenário é aplicável. A declaração não remove o requisito: ele continua valendo sempre que a condição ocorrer. Cenário sem condição nunca é não aplicável.

Mudança sem comportamento novo: o contrato declara `Comportamento novo: não`, com aprovação humana. Nesse caso a change não tem delta de requisitos, e a verificação é a suíte existente executada com sucesso, mais os checks declarados (lint, typecheck). Não se fabricam testes funcionais.

### D12. Relatório de testes: `checks.test_report`
- O projeto declara `checks.test_report` com `command` (saída no formato suportado, em stdout), `format` e `suite` (identificador da suíte obrigatória). O runner não acrescenta flags por detecção.
- Relação com `checks.test`: o runner executa somente `checks.test_report.command` como suíte obrigatória. `checks.test` referencia a mesma `suite`; `suite` divergente → `config_error`. Não se exige comando textualmente igual, porque o reporter pode precisar de flags diferentes. A equivalência é comprovada pela identidade dos casos esperados (AC-015), não pela sintaxe do comando. O relatório registra os hashes dos dois comandos.
- Preservação: o runner captura a saída, o código de saída e o hash do comando. Código de saída diferente de zero reprova, mesmo com contagens favoráveis.
- Identidade: a saída capturada fica em `.harness-local/<change>/evidence/<execution_id>/`. Relatório de outra execução não é aceito.
- Filtro: a verificação compara conjuntos de identidade (ids dos cenários com verificação `teste` aplicáveis mais ids declarados no manifesto de aceitação) e não contagens. Ausente, ignorado ou não executado reprova.
- Formato: `format: tap` na v1 (ver D21).

### D13. Revisão de teste e suficiência
- Cada caso registra o `scenario_revision` e o `file_hash` da execução.
- Aprovação exige `scenario_revision` do caso igual à revisão atual do cenário.
- Se a revisão do cenário mudou e o `file_hash` do caso não mudou, a aprovação exige justificativa de suficiência, aprovada por humano (autorização `revision`). Teste inalterado pode provar um requisito alterado, desde que o registro diga por quê.

### D14. Validade, caminhos protegidos e garantia da v1
- Impressão da evidência: hash de código avaliado (árvore rastreada e não rastreada, excluindo `excluded_paths`), contrato e revisões, testes de aceitação e manifesto, `checks` com `test_report`, perfil efetivo, autorizações vigentes, versões de runtime e configurações da allowlist. Artefatos derivados (`run-state.json`, `gates.json`, eventos, relatórios, resumo durável e checkpoint) ficam fora somente quando não contêm configuração executável usada na avaliação (D31).
- Caminhos protegidos: contrato, testes de aceitação, manifesto de aceitação, gates, `policy.*`, perfil, `checks` e `test_report`. `tasks.md` aceita apenas alternância de checkbox (`- [ ]` ↔ `- [x]`); outra mudança de conteúdo ou escopo é protegida (D31, EV-015). `authorizations.json` tem hash próprio (D31).
- Hashes antes e depois de cada invocação e gate. Alteração → `forbidden_action_stopped`, com `protected_change`.
- Garantia: detecção, sem isolamento técnico. Um executor com a mesma conta pode alterar arquivos e hashes. O relatório repete essa limitação.
- **Issue tracker fora da impressão (decisão do dono, 2026-10-24).** `docs/agents/issue-tracker.md` está em `excluded_paths`. Um padrão de `excluded_paths` com barra interna vale para o caminho inteiro a partir da raiz. Regra: requisitos e decisões que afetem a execução ficam no contrato (`proposal.md`, `design.md`, `specs/`) ou em configurações versionadas (`policy.json`, `template.json`), nunca só no tracker. O tracker é narrativa: editá-lo não muda a impressão; editar o contrato muda (EV-016).

### D15. Revisão de contrato
Alterar o contrato exige autorização `revision` com motivo, aprovador, cenários afetados e nova revisão. Sem autorização, `protected_change`. Dependências entre cenários, interfaces e fatias invalidam as evidências afetadas.

### D16. Resumo durável e evidência local
- O resumo durável (`openspec/changes/<change>/evidence-summary.json`, versionado) é gravado somente após validação final aprovada (EV-011) e preservado no arquivamento. Não é gravado em marco de fatia. Nos marcos de fatia, o checkpoint pode conter evidência parcial, marcada `parcial, não aprovada`, que não é apresentada como aprovação final. Campos (para revisão, EV-012):
  - **contrato:** hash do contrato e revisão de cada cenário;
  - **código:** commit base, hash da árvore avaliada, caminhos alterados com hash, indicação de alterações não commitadas;
  - **testes:** hash do manifesto de aceitação; inventário completo dos casos da suíte obrigatória (identificador, nome, resultado e cenário vinculado quando existir, incluindo regressões sem vínculo); por cenário, forma de verificação e `file_hash`; código de saída da suíte, hash do comando e `execution_id`. O TAP bruto não é guardado no Git;
  - **ambiente:** versões de Node, `claude` e `openspec`; hash de `checks` e de `test_report`; hash da configuração proposta; `policy_version` e `schema_version`;
  - **resultados:** veredito da validação, datas e `execution_id`;
  - **limitações:** lista das limitações declaradas aplicáveis (por exemplo, limite de turnos não comprovado);
  - **consumo:** gasto reportado, estimado e contagem de chamadas com custo desconhecido, por origem;
  - **reservas e reconciliação:** reservas pendentes, decisões `kept`, `closed_observed` ou `closed_unknown`, e aprovador;
  - **autorizações:** ids usados.
  Não contém saída TAP bruta nem segredo, e não depende de logs de telemetria.
- Evidência local (saída capturada, eventos, relatórios) é retida pela política de 90 dias. Se faltar na importação ou na auditoria, a evidência correspondente exige revalidação (D19). Não é reconstruída a partir do hash.
- Hash sozinho não basta para auditoria: o resumo guarda o resultado por cenário e as identidades necessárias para reproduzir a decisão.

### D17. Telemetria
- Eventos em `.harness-local/<change>/events.jsonl`, append-only, um por passo, fora do Git.
- Custo com origem: `reported`, `estimated`, `unknown` ou `unmeasured`.
- Relatório separa custo conhecido, estimado, desconhecido (contagem) e etapas não medidas. Nunca apresenta total completo quando há desconhecido ou não medido.
- Eventos de ciclo de vida: o runner grava início, conclusão, falha, interrupção e retomada (TE-010). Diagnósticos de lock seguem D1 e TE-009.
- Retenção: 90 dias para eventos brutos e relatórios locais, contados pela data registrada no próprio registro (`at` em eventos, `recorded_at` em relatórios), nunca pelo mtime do arquivo. Data ausente ou inválida gera aviso e preservação conservadora: o registro fica (TE-011). Não remove estado, checkpoint, autorizações nem resumo durável.

### D18. Arquivamento
1. `spec-archive` pede a validação final ao runner, que exige aprovação válida (D14).
2. O runner grava `evidence-summary.json` e `checkpoint.json` (marco `archived`) dentro da change, antes de arquivar.
3. `openspec archive <change> --yes` move a pasta da change, com os dois arquivos versionados.
4. O diretório local `.harness-local/<change>/` é movido para `.harness-local/archive/<AAAA-MM-DD>-<change>/`. A retenção de 90 dias aplica-se aos eventos brutos desse diretório, não ao resumo.
5. Se o passo 2 ou 3 falhar, o estado fica em `awaiting_decision` com `stop_reason: human_decision_needed` e o arquivamento não é repetido às cegas.

### D19. Checkpoint, importação e reconciliação
Ao importar um checkpoint (outra máquina, worktree novo ou perda do estado local):
1. O runner valida `schema_version`, o `project_id` e a `change`. Divergência de `project_id` ou de `change` → `config_error`. Diferença de `local_id` é esperada (outra máquina) e não é erro.
2. A execução vira `awaiting_decision` com `stop_reason: reconciliation_required`.
3. Nenhuma chamada paga inicia antes de um registro de reconciliação (`kind: reconciliation`) que contenha:
   - consumo observado por chamada, com valor e origem (`reported`, `estimated` ou `unknown`);
   - decisão sobre cada reserva aberta: `kept`, `closed_observed` ou `closed_unknown`;
   - lista de evidências a revalidar;
   - aprovador e data.
4. `closed_unknown` encerra a reserva, mas o valor reservado permanece no comprometido como exposição desconhecida, com `reserve_released_usd` zero (D26, regra 6). O consumo desconhecido não vira zero: permanece como contagem no estado, no checkpoint e no relatório. A continuidade pode exigir extensão explícita do orçamento (autorização `budget`). Essa exposição NÃO é custo conhecido.
5. Evidência local ausente → revalidação obrigatória antes de aprovar. O checkpoint não basta para aprovar.

### D20. Modos e compatibilidade
- Cada execução tem `mode`, definido na criação e imutável: `legacy` ou `runner`.
- `legacy`: a execução continua com a CLI antiga, que escreve `gates.json` com `--legacy-write`. Usado pelas skills atuais até a F10.
- `runner`: somente o runner grava estado. `gates.json` é derivado.
- Nenhuma execução mistura os dois modos. Se o runner encontrar `gates.json` de execução `legacy`, para com `mode_mismatch`.
- Migração `legacy` → `runner` é um passo explícito e unidirecional (D21 e `project-migration`): copia a evidência antes, importa o histórico, cria o checkpoint de migração e só então muda o modo.
- Recuperação: o rollback de uma execução já migrada **não é transparente**. A restauração a partir da cópia pré-migração segue o procedimento manual de D32 (`manual_rollback`). É um procedimento humano, não um tipo de autorização de D4 e não é autorização de revisão. Evidência e consumo são preservados em qualquer caso.

### D21. Adaptadores de teste e migração de projetos
- Suporte inicial: TAP do Node (`format: tap`), comprovado por fixtures da versão 22 ou superior. Ambiente verificado desta entrega: Node 24.21.0, macOS. Node 22 não verificado; não bloqueia a conclusão da v1 (ver "Questões abertas", item 4).
- JUnit: adicionado somente para um produtor concreto necessário a um projeto-alvo, identificado por nome e versão, e coberto por fixtures desse produtor. Nenhum "JUnit genérico".
- Formato não suportado → `config_error` com diagnóstico que nomeia `checks.test_report.format`, lista os formatos suportados e mostra exemplo de preenchimento.
- Compatibilidade com outros projetos **não é afirmada**. A tarefa 12.4a prepara a migração e a verifica com fixtures; a adoção real em cada projeto identificado é a tarefa 12.4b, separada, e não bloqueia o núcleo nem significa adoção concluída. A lista de projetos derivados ainda não foi identificada.

### D22. Legado: contadores e baseline
- Contagem legada conservadora: preservar cada tentativa; contar como correção apenas um `retry` seguido de nova tentativa; nunca equiparar avaliação de gate a correção.
- Se não for possível reconstruir os contadores, registrar `counters_certain: false` e exigir autorização `round` para iniciar rodada reconciliada.
- Baseline da migração: a descoberta atual de casos cria a baseline da migração. Não reconstrói a baseline histórica e não produz aprovação retroativa.

### D23. Orçamento, reserva e limites de invocação e tempo (decisões de 2026-10-23)
- **Autorização de orçamento** (`budget`) traz `total_usd` e `per_call_usd`, ambos validados (números positivos, `per_call_usd` ≤ `total_usd`).
- **Limite efetivo por chamada** = menor valor entre `max_usd_per_call` (política), `candidate_usd_per_call` (perfil, se houver) e `per_call_usd` (autorização vigente).
- **Saldo total efetivo** = menor valor entre `max_usd_per_change` (política), `candidate_usd_per_change` (perfil, se houver) e `total_usd` (autorização vigente). Sem autorização vigente, não há saldo: a parada é `authorization_required`.
- **Margem e reserva** são documentadas separadamente: margem = `reserve_margin_ratio`; reserva da chamada = limite efetivo por chamada × (1 + margem).
- **A reserva precisa caber no saldo total**, descontando consumo conhecido, gasto estimado e reservas pendentes. Se não couber, a parada é `budget_reserve_insufficient`, e só ocorre com autorização vigente.
- **Revogação** é registro próprio (`kind: revocation`, com `revokes` apontando o id revogado). Não é autorização de orçamento. A autorização revogada permanece no arquivo.
- **Invocações:** limite efetivo = menor entre `max_invocations_per_change` (política) e `candidate_invocations_per_change`. Ao atingir, parada `budget_exhausted` (RC-037).
- **Tempo ativo (decisão de 2026-10-24):** inclui invocações, gates, diagnósticos e ferramentas executadas pelo runner, com duração registrada por categoria. Exclui espera humana e períodos sem execução. Cada gate tem timeout (`max_seconds_per_gate`, valor provisório igual a `max_seconds_per_call`), para que um gate travado não escape do orçamento de tempo.
- **Tempo total:** mede somente execução ativa do runner (intervalos com heartbeat). A espera por decisão humana (`awaiting_decision`) não conta. Limite = menor entre `max_seconds_per_change` e `candidate_seconds_per_change`. Tempo por chamada = menor entre `max_seconds_per_call` e `candidate_seconds_per_call`, aplicado como timeout.

### D24. Identidade do projeto, execução e lock ilegível (decisões de 2026-10-23)
- `.harness-project.json` é arquivo **owned**: o `template-update` nunca o sobrescreve. `new-project` gera identidade nova; clonar preserva a existente (RS-019, RS-023).
- **Execução:** retomar a mesma execução preserva `execution_id`. Uma execução nova recebe outro `execution_id` com `previous_execution_id`, sem reiniciar consumo, reservas ou limites acumulados da change (RC-035, RS-024). Cada invocação tem `invocation_id` próprio (RC-038).
- **Lock ilegível:** a partida é bloqueada com `lock_held` e `stop_reason: lock_unreadable`. O arquivo é preservado para diagnóstico, sem mover nem apagar. O diagnóstico registra o hash do arquivo; qualquer liberação autorizada só ocorre se o hash atual for igual ao registrado (RS-022).
- **Procedimento de autorização:** registro com `origin: human` e `procedure: tty`. TTY descreve o procedimento e não comprova sozinho identidade ou autorização (RC-039). A limitação é declarada nos relatórios.
- **lock_sha256** identifica o conteúdo observado do lock para detectar substituição; não é prova de autoria.
- **Caminho de migração da identidade (projeto existente):** (1) copiar o estado pré-migração para o diretório de cópia (PM-002), antes de qualquer gravação; (2) importar o histórico como `legacy-markdown` (PM-001); (3) gravar o checkpoint de migração; (4) só então mudar o modo para `runner` (D20, PM-008). Se `.harness-project.json` estiver ausente, a migração cria um `project_id` novo e registra a criação; se estiver presente, preserva o id.
- **Caminho de recuperação da identidade:** clone ou worktree novo preserva o `project_id` lido do arquivo versionado e cria o `local_id` e um `execution_id` próprios. Checkpoint importado passa por reconciliação (D19). Restauração de estado migrado segue o procedimento de D32. `project_id` divergente é `config_error` (D19, item 1); a recuperação nunca gera id novo para a change.
- **`.harness-project.json` permanece owned:** a migração, o `template-update` e a recuperação nunca o sobrescrevem. Só `new-project` gera identidade nova para um projeto derivado (RS-019, RS-023).

### D25. Encerramento de processos e término não confirmado (decisão de 2026-10-24)
- Cada comando lançado pelo runner (invocação, gate, diagnóstico, ferramenta) roda em grupo de processos próprio. No timeout, o runner encerra o grupo inteiro.
- Se o encerramento não for confirmado (processo ainda vivo após a tentativa), o estado registra `término não confirmado`, bloqueia novas execuções conflitantes da mesma change e não inicia nova avaliação até decisão humana (RC-043, RC-044).
- Causa observada do incidente das tentativas 3 e 4: o comando de avaliação excedeu o tempo da ferramenta de shell, que o moveu para segundo plano em vez de encerrá-lo; o `score` continuou executando e registrou a tentativa 3. O script do gate não tinha timeout próprio. Evidência: o registro de tentativas em `gates.json` e a notificação de conclusão do processo em segundo plano. Não é causa confirmada de outra natureza.

### D26. Registro de reconciliação (aprovado pelo dono do projeto em 2026-10-24; registro formal em `authorizations.json` pendente)
Esquema, valores permitidos e exemplos sem dados sensíveis. **Aprovado pelo dono do projeto em 2026-10-24; registro formal em authorizations.json pendente do comando authorize.mjs record com terminal interativo, a ser executado pelo dono.** Até esse registro, os testes usam simuladores e nenhum registro real de reconciliação é tratado como aprovado. As regras da subseção seguinte valem como regras de implementação e de teste.

| Campo | Valores | Observação |
|-------|---------|------------|
| `kind` | `reconciliation` | registro em `authorizations.json` |
| `reconciliation_id` | texto único na change | chave de idempotência (regra 2) |
| `execution_id` | id da execução | a invocação pertence a esta execução (regra 3) |
| `invocation_id` | id da invocação | existe em `execution_id` (regra 3) |
| `reserve_id` | id da reserva | pertence a `invocation_id` (regra 3) |
| `reserve_decision` | `kept`, `closed_observed`, `closed_unknown` | `closed_unknown` não converte o consumo desconhecido em zero (regra 6) |
| `unknown_treatment` | `counted_in_budget` | obrigatório quando `reserve_decision` é `closed_unknown` (regra 6) |
| `evidence_available` | lista de `{nome, sha256}` | só o que existe localmente |
| `cost.usd` | número finito não negativo, ou `null` | `null` obrigatório quando `cost.status` é `unknown` (regra 4) |
| `cost.status` | `observed`, `estimated`, `unknown` | |
| `cost.origin` | `reported`, `estimated`, `none` | `reported` identifica a fonte do valor, não cobrança efetiva (regra 5) |
| `human_decision` | `{decided_by, decided_at, note}` | `decided_by` é o procedimento humano, não prova de identidade |
| `balance_effect` | `{reserved_usd, reserve_closed, reserve_released_usd, cost_accounted_usd, exposure_unknown_usd, available_before_usd, net_available_effect_usd, available_after_usd, unknown_calls_after}` | calculado pelo runner; valores informados são conferidos (regra 1) |
| `supersedes` | `reconciliation_id` do registro corrigido | presente só em correção (regra 7) |

**Regras aprovadas pelo dono do projeto em 2026-10-24:**
1. **Efeito no saldo calculado.** `balance_effect` é calculado pelo runner a partir do estado e do registro. Valores informados no registro são conferidos contra o cálculo; divergência recusa o registro. Nunca são saldo autoritativo. Os quatro conceitos são distintos e não se confundem:
   - *valor reservado* (`reserved_usd`): valor da reserva da invocação, como estava no estado antes do registro;
   - *reserva encerrada* (`reserve_closed`, booleano): `true` somente em `closed_observed` e `closed_unknown`;
   - *custo contabilizado* (`cost_accounted_usd`): consumo conhecido acrescentado pelo registro;
   - *saldo disponível* (`available_after_usd` = `available_before_usd` + `net_available_effect_usd`): saldo após o registro, sem truncar valores negativos.

   Campos auxiliares: `reserve_released_usd` (valor que deixa de ser comprometido como reserva aberta), `exposure_unknown_usd` (valor que permanece comprometido como exposição desconhecida) e `net_available_effect_usd` = `reserve_released_usd` − `cost_accounted_usd`.

   Tratamento por decisão:
   - **`closed_observed`:** `reserve_released_usd` = `reserved_usd` inteiro; `cost_accounted_usd` = custo observado; `exposure_unknown_usd` = 0; `net_available_effect_usd` = `reserve_released_usd` − `cost_accounted_usd`. Se o custo observado exceder a reserva, o efeito é negativo e aparece como tal, sem ser truncado em zero.
   - **`closed_unknown`:** `reserve_released_usd` = 0; `cost_accounted_usd` = 0 (nenhum custo conhecido); `exposure_unknown_usd` = `reserved_usd` (continua comprometido); `unknown_calls_after` aumenta em 1; `net_available_effect_usd` = 0.
   - **`kept`:** nenhuma liberação: `reserve_closed` = false; `reserve_released_usd` = 0; `cost_accounted_usd` = 0; `exposure_unknown_usd` = 0; `net_available_effect_usd` = 0; `unknown_calls_after` sem alteração. O campo `cost` deve ser `{usd: null, status: unknown, origin: none}`, porque `kept` não contabiliza custo.
2. **Idempotência.** `reconciliation_id` é único na change. Repetir um registro idêntico não libera reserva nem contabiliza custo de novo. Mesmo `reconciliation_id` com conteúdo diferente é recusado. Uma reserva já encerrada não aceita segunda reconciliação: a tentativa é recusada, não somada.
3. **Correspondência.** `invocation_id` deve existir em `execution_id`; `reserve_id` deve pertencer a `invocation_id`. Cada elo se refere ao anterior. Referência inexistente ou divergente recusa o registro.
4. **Custo.** `cost.status: unknown` exige `cost.usd: null`. Os status `observed` e `estimated` exigem número finito e não negativo. Zero só é valor observado ou estimado; nunca substitui desconhecido.
5. **Origem.** `cost.origin: reported` identifica a fonte do valor (informado pela CLI). Não comprova cobrança efetiva.
6. **Reserva encerrada com custo desconhecido.** Com `closed_unknown`, `unknown_treatment: counted_in_budget` é obrigatório no registro. A reserva deixa de ser reserva aberta (`reserve_closed: true`), mas seu valor permanece no comprometido como `exposure_unknown_usd`, e a chamada entra em `unknown_calls_after`. `reserve_released_usd` é zero. Liberar a reserva não faz o gasto desaparecer do controle. A continuidade pode exigir extensão explícita do orçamento (autorização `budget`) ou novo registro de reconciliação por decisão humana posterior (RC-055).
7. **Correção como novo registro.** Correção é um registro novo com `supersedes` apontando o `reconciliation_id` original. O original não é editado nem removido (RC-056).

Exemplo (dados fictícios):
```json
{
  "kind": "reconciliation",
  "reconciliation_id": "rec-0001",
  "execution_id": "exec-0002",
  "invocation_id": "inv-0003",
  "reserve_id": "res-0003",
  "reserve_decision": "closed_observed",
  "evidence_available": [{"nome": "resultado-inv-0003.json", "sha256": "<hash>"}],
  "cost": {"usd": 0.42, "status": "observed", "origin": "reported"},
  "human_decision": {"decided_by": "<procedimento humano>", "decided_at": "2026-10-24T10:00:00Z", "note": "custo informado pela CLI"},
  "balance_effect": {"reserved_usd": 2.50, "reserve_closed": true, "reserve_released_usd": 2.50, "cost_accounted_usd": 0.42, "exposure_unknown_usd": 0, "available_before_usd": 10.00, "net_available_effect_usd": 2.08, "available_after_usd": 12.08, "unknown_calls_after": 0}
}
```

Exemplos das três decisões (dados fictícios: reserva de 2,50, custo de 0,42 quando observado, saldo antes de 10,00). Mostram só os campos que mudam; os demais são os do exemplo acima.

`closed_unknown` (exposição mantida no comprometido, sem custo conhecido):
```json
{"reserve_decision": "closed_unknown", "unknown_treatment": "counted_in_budget", "cost": {"usd": null, "status": "unknown", "origin": "none"},
 "balance_effect": {"reserved_usd": 2.50, "reserve_closed": true, "reserve_released_usd": 0, "cost_accounted_usd": 0, "exposure_unknown_usd": 2.50, "available_before_usd": 10.00, "net_available_effect_usd": 0, "available_after_usd": 10.00, "unknown_calls_after": 1}}
```

`kept` (reserva segue aberta, nenhum efeito no saldo):
```json
{"reserve_decision": "kept", "cost": {"usd": null, "status": "unknown", "origin": "none"},
 "balance_effect": {"reserved_usd": 2.50, "reserve_closed": false, "reserve_released_usd": 0, "cost_accounted_usd": 0, "exposure_unknown_usd": 0, "available_before_usd": 10.00, "net_available_effect_usd": 0, "available_after_usd": 10.00, "unknown_calls_after": 0}}
```

### D27. Esquema de `checks.test` e `checks.test_report`
- `checks.test` aceita dois formatos:
  - **string** (formato legado): modo legado compatível. Não tem identidade de suíte e vale enquanto o projeto não declara `checks.test_report`;
  - **objeto** `{"command": "<comando>", "suite": "<id>"}`.
- `checks.test_report`, quando presente, é objeto `{"command", "suite", "format"}`. Na v1, `format` aceita somente `"tap"`.
- Com `checks.test_report` presente, `checks.test` SHALL ser objeto com a mesma `suite`. Divergência, ou `checks.test` em string, leva a `config_error` sem executar a suíte (AC-014, AC-022).
- `format` fora da lista leva a `config_error` com diagnóstico que nomeia `checks.test_report.format`, lista os formatos suportados (`tap`) e mostra exemplo (AC-016).
- Projetos sem `checks.test_report` seguem no modo legado compatível até a migração explícita (F12, AC-023).
- **`file_command` (opcional, decisão do dono de 2026-10-24).** `checks.test_report.file_command` é o comando por arquivo de teste, declarado pelo projeto, com o marcador `{file}`. O runner só troca o marcador pelo caminho entre aspas; não acrescenta flags por detecção. Sem o marcador, `config_error`. Com `file_command`, o runner executa a suíte (`command`), que é a autoridade do código de saída e das contagens, e executa `file_command` uma vez por arquivo de `files`, para obter a identidade de cada caso (D28). A soma por arquivo precisa bater com a suíte, no total e por resultado; divergência ou arquivo que excede o tempo reprova com `inventory_mismatch`. A saída por arquivo fica em `test-report-files.tap`, ao lado da saída da suíte. O template declara `"file_command": "node --test --test-reporter=tap {file}"`.
- **`files` (opcional, obrigatório com `file_command`).** `checks.test_report.files` é um glob, ou lista de globs, declarado pelo projeto com os arquivos que `file_command` executa; precisam ser os mesmos da suíte (`command`). O runner expande o glob com o `globSync` de `node:fs` (mesmo critério do `node --test` para `**`, sem `node_modules`) e não usa `listTestFiles` nem detecção de stack. `file_command` sem `files` leva a `config_error` que nomeia `checks.test_report.files`; arquivo a mais ou a menos aparece na soma por arquivo e reprova com `inventory_mismatch`. O template declara `"files": "scripts/test/**/*.test.mjs"`.

Exemplo ilustrativo (o comando real é declarado pelo projeto):
```json
"checks": {
  "test": { "command": "node --test \"scripts/test/**/*.test.mjs\"", "suite": "unit" },
  "test_report": { "command": "node --test --test-reporter=tap \"scripts/test/**/*.test.mjs\"", "suite": "unit", "format": "tap" },
  "lint": "node scripts/gates/lint.mjs"
}
```
Diagnóstico de formato não suportado (exemplo):
`config_error: checks.test_report.format "junit" não suportado. Formatos suportados: tap. Exemplo: "format": "tap".`

### D28. Manifesto de aceitação
Arquivo `openspec/changes/<change>/acceptance-manifest.json`, versionado. Descreve o vínculo entre cenários e casos de teste. Não é prova de aprovação (ver D29).
```json
{
  "schema_version": 1,
  "entries": [
    {
      "case_id": "scripts/test/harness/exemplo.test.mjs::Exemplo calcula total [AC-024]",
      "file": "scripts/test/harness/exemplo.test.mjs",
      "test_name": "Exemplo calcula total [AC-024]",
      "scenario_ids": ["AC-024"],
      "scenario_revisions": {"AC-024": 1},
      "file_hash": "<sha256>",
      "helpers": ["scripts/test/harness/helpers/tap.mjs"],
      "helper_hashes": {"scripts/test/harness/helpers/tap.mjs": "<sha256>"}
    }
  ]
}
```
Exemplo fictício; os hashes são marcadores.

- `schema_version`: inteiro, `1`.
- `case_id` = `<arquivo>::<nome>`. `<arquivo>` é relativo à raiz do repositório, com `/`. `<nome>` é o nome completo do teste, com espaços no início e no fim removidos e sequências de espaços reduzidas a um, incluindo a tag `[ID]`. O `case_id` é a identidade do caso. O ID do cenário fica em `scenario_ids`: ID de cenário e ID de caso são coisas distintas.
- Um caso que cobre vários cenários tem uma tag `[ID]` por cenário no nome e lista todos em `scenario_ids`. Um cenário que exige vários casos tem uma entrada por caso; o cenário passa somente quando todos os seus casos passam (AC-026).
- `scenario_revisions` registra a revisão de cada cenário de `scenario_ids` no momento da aprovação do vínculo.
- `file_hash` = sha256 de: conteúdo normalizado do arquivo de teste (fins de linha LF, sem BOM), seguido, para cada helper em ordem lexicográfica de caminho, de `<caminho>` + `\n` + hash sha256 normalizado do helper + `\n`.
- `helpers` lista os caminhos dos helpers compartilhados usados pelo arquivo; `helper_hashes` guarda o hash de cada um. Um helper compartilhado entra no hash de cada arquivo que o declara (AC-025).
- **Identidade dos casos executados (decisão do dono, 2026-10-24).** A TAP do `node --test` não traz o arquivo do caso. Com `file_command` (D27), cada caso executado tem a identidade `<arquivo>::<nome completo>`; o nome completo une os subtestes ancestrais e o caso por ` > `. O caso do manifesto é procurado pelo arquivo e pelo nome: um homônimo de outro arquivo não decide o cenário. Sem `file_command`, a identidade é só o nome completo; nomes repetidos entre casos reprovam com `inventory_ambiguous`, e a falha lista os nomes. Nunca há colisão silenciosa (AC-028, AC-029).
- **Limitação declarada:** a granularidade é o arquivo. Alterar outro teste do mesmo arquivo invalida o `file_hash` e exige reexecução e revisão dos casos desse arquivo. A v1 não detecta helpers por análise de imports: a lista é fixada no vínculo (questão aberta 6).

### D29. Reaceitação após revisão de cenário
Revisão comportamental de cenário (EV-007) invalida as evidências dependentes. Atualizar `acceptance-manifest.json` **não basta** para voltar à aprovação. A aprovação só retorna após estas três verificações:
- **(a) Adequação dos testes:** confirmação humana registrada como autorização `revision`, com `scope: {"change", "scenario", "cases"}` (lista de `case_id` afetados), `purpose: "test_adequacy"`, aprovador e data. Exigida em toda revisão nova.
- **(b) Suficiência:** quando o `file_hash` dos casos não mudou em relação à revisão anterior, autorização `revision` com o mesmo `scope`, `purpose: "sufficiency"` e a justificativa. Quando o hash mudou, esta verificação não se aplica.
- **(c) Execução no estado atual:** os casos executados na suíte obrigatória atual com resultado `pass`, e `scenario_revision` igual à revisão atual (AC-019).

A ordem é (a), depois (b) quando aplicável, depois (c). Os valores de `purpose` estão aprovados e têm limites explícitos em D32: `test_adequacy` e `sufficiency` nunca substituem a execução de (c).

### D30. Condições de não aplicabilidade
Um cenário é não aplicável somente quando sua `Condição de disparo` é reconhecida pelo runner e falsa nesta execução (HI-010, AC-021). Condições suportadas:

| Condição | Verdadeira quando |
|----------|-------------------|
| `quando houver formato <X>` | `checks.test_report.format` é `<X>` nesta execução |
| `quando houver chamada paga` | a execução tem invocação paga |

Condição fora dessa lista é **não reconhecida** e é tratada como **obrigatória**. O relatório mostra `condição não avaliada: <texto>` (AC-027). Nada é interpretado silenciosamente.

Exceção a cenário obrigatório só por revisão humana: autorização `revision` com `scope` do cenário, motivo, aprovador e data (`purpose: "exception"`).

### D31. Impressão da evidência: derivados, `tasks.md` e autorizações
- **Artefatos derivados** (resumo durável, checkpoint, `gates.json`, relatórios, run-state e eventos) ficam fora da impressão somente quando não contêm configuração executável usada na avaliação. Se contiverem, por exemplo uma cópia de `checks` no checkpoint, o trecho correspondente entra na impressão (EV-002).
- **`tasks.md`:** a exclusão cobre somente a alternância de checkbox (`- [ ]` ↔ `- [x]`). Qualquer outra mudança no conteúdo ou no escopo das tarefas é detectada e conta como alteração protegida (EV-004, EV-015).
- **`authorizations.json`** tem hash próprio, separado da impressão do código. Alterações relevantes (registro alterado, removido ou acrescentado fora de `authorize.mjs record`) são verificadas antes de iniciar ou continuar uma execução.
- Garantia: detecção, não isolamento (D14).

### D32. Finalidades de autorização e identificação (aprovado em 2026-10-23)
**Identificação obrigatória.** Toda autorização identifica o projeto e a change, diretamente ou por contexto validado: `project_id` de `.harness-project.json` e `scope.change`, conferidos contra o projeto validado e o caminho da change. Registro sem identificação é recusado. Registro com `project_id` ou change diferente do contexto validado também é recusado.

**Finalidades (`purpose`).** Obrigatória em `kind: revision`; ausente nos demais tipos. Cada finalidade tem o que permite e o que não permite:

- **`contract_approval`:** aprova o contrato na versão exata. Vincula a aprovação a `contract_hash` (sha256 de `proposal.md`, `design.md` e `specs/**`, com caminhos em ordem lexicográfica, cada um seguido de `\n`) e a `contract_version` (inteiro que sobe a cada aprovação). Permite: validar que a aprovação corresponde ao hash e à versão atuais. Não permite: valer para outro hash ou outra versão. Qualquer alteração em proposta, design ou specs muda o hash e exige nova aprovação com nova versão. Não comprova execução de testes.
- **`scenario_change`:** aprova alteração semântica de cenário (D15, D29a). Não permite: aprovar teste, check, não aplicável nem comportamento novo.
- **`test_adequacy`:** registra decisão humana de que os casos listados são adequados ao cenário (D29a). Permite: abrir a reaceitação. Não permite: dispensar a execução dos testes; a aprovação continua exigindo execução válida no estado atual (D29c). Não aprova check, não aplicável nem comportamento novo.
- **`sufficiency`:** registra a justificativa humana de que teste com hash inalterado prova o requisito alterado (D13, D29b). Não permite: dispensar a execução dos testes nem aprovar outro item. Não aprova check, não aplicável nem comportamento novo.
- **`exception`:** dispensa um cenário obrigatório (D30) somente quando a exceção está explicitamente prevista pela política. O registro traz `policy_key`, que deve ser uma chave listada em `policy.json` ou `policy.md`. Sem `policy_key` válida, é recusado. Não permite: dispensar regra genérica, nem tornar cenário não aplicável fora de D30. Hoje `policy.json` não declara nenhuma chave de exceção; portanto nenhuma exceção é aceita até a política declarar a chave.

**Escopo por finalidade.** `test_adequacy`, `sufficiency` e `exception` exigem `scope` com `change`, `scenario` e (nos dois primeiros) `cases`. `contract_approval` exige `scope.contract_approval: true` e `contract_hash`. A conferência é feita pelo `authorize.mjs` no registro e pelo `contract.mjs` no uso.

**Limite de identificação.** TTY e identificação não provam identidade (RC-039). O campo de projeto e de change prova apenas a qual projeto e change o registro se refere.

**Procedimento de restauração (`manual_rollback`).** É um procedimento humano, executado por comando humano. Não é um tipo de autorização de D4 e não é autorização de revisão (`revision`). Não existe reversão transparente: o procedimento abaixo é o único caminho e exige estes passos, nesta ordem:
- (a) **Pré-condição:** a cópia pré-migração existe e seu hash é conferido com o hash registrado no checkpoint de migração. Se não conferir, a restauração é recusada sem alterar arquivos.
- (b) **Autorização humana explícita:** o comando exige terminal interativo (RC-039). A decisão é registrada como evento `kind: "restore"` em `events.jsonl`, com aprovador, data e motivo. Não se cria tipo novo em `authorizations.json`; a lista de `kind` de D4 não muda.
- (c) **Restauração:** feita por comando humano, sob o lock da change (D1). O registro guarda a origem (caminho e hash da cópia). O consumo acumulado é preservado no histórico e nunca é apagado. Evidências locais são preservadas.
- (d) **Marca no estado:** o `run-state.json` recebe o campo `restored`, com a origem, o hash anterior à restauração e o hash do estado restaurado.
- (e) **Reconciliação antes de continuar:** a execução restaurada reconcilia as reservas abertas (D19, D26) antes de qualquer chamada paga. Nenhuma chamada paga inicia antes disso.

O relatório declara que a restauração não é transparente (PM-009, PM-011).

## Decisões reversíveis da CLI do runner (2026-10-23)

Tomadas ao conectar as skills à CLI do runner (`scripts/harness/cli.mjs`). Cada uma se reverte por código e teste, sem mudar o contrato.

- **`kept` não contabiliza custo (D26, regra 1).** A decisão exige `cost` desconhecido com `usd` nulo. Custo conhecido se registra com `closed_observed`.
- **Custo acima da reserva em `closed_observed` (D26, regra 1).** O efeito líquido é negativo e aparece como tal, sem truncamento em zero. A reconciliação devolve o aviso `custo observado acima da reserva`.
- **Evento de restauração (D32, `manual_rollback`).** Grava-se em `events.jsonl` com `kind: "restore"`. Não há tipo novo em `authorizations.json`. O código que grava esse evento fica na tarefa B.5, ainda não implementada.
- **Interrupção durante gate (2026-10-24):** substituída pela decisão do dono registrada em D8. `awaiting_gate` → `interrupted` está na tabela; uma interrupção a partir de origem fora da tabela (por exemplo `approved`) continua recusada com evento `transition_refused`, e o estado não muda (C2, RC-001).
- **Aprovação em dois níveis (2026-10-24, C1):** gate `pass` em `awaiting_gate` aprova a fatia (`slice_approvals`, com impressão e casos); a execução só fica aprovada (`execution_approval`) com validação final `pass` e todas as fatias de `REQUIRED_SLICES` aprovadas (SP-010).
- **Liberação de lock vencido (2026-10-24, RS-017):** a CLI e o runner liberam lock vencido só com `lock_release` humano que cite o `execution_id` do lock, por `releaseStaleLock`; sem o registro vale RS-010.
- **Relatório com chamada interrompida (2026-10-24, D17, RC-017, RC-024):** a contagem de custo desconhecido, a exposição e as interrupções usam o estado como piso, porque a chamada morta não gera evento; com desconhecido não há total completo.
- **Entrada pública da execução headless (2026-10-24, C.4):** `node scripts/harness/cli.mjs run --change <change>` conduz a fatia `implement` pelo ciclo já especificado (`slice.mjs`: invocação por `runHarnessStep`, gate de implementação real, correção com as falhas do gate, teto de correções, sintoma repetido, ação repetida, divergência) e, com a fatia aprovada, a validação final. Prompt: `/spec-implement <change> --runner-step` (HE-001); a correção acrescenta `--correction` com os casos que falharam. O binário é `claude`; `--claude-bin` troca o comando (simulador nos testes, mesma convenção do benchmark). Exige `start --mode runner` (marco de adoção) e autorização `budget`. A parada por autorização ausente, que `runHarnessStep` devolve antes do lock, é gravada no estado com o lock (RC-021). Não arquiva nem roda o gate de arquivamento: isso segue com `spec-archive`. Só `run` chama o modelo; os demais subcomandos continuam sem chamada.

### Reconciliação integrada ao runner (B.2)

- `reconcile --record <arquivo.json>` valida identidade e formato, confere a correspondência com o histórico de invocações do estado (`invocations`), calcula o `balance_effect` com os nove campos de D26 e o saldo total autorizado, e grava somente se um valor informado coincidir com o calculado. Mesmo `reconciliation_id` com o mesmo conteúdo é duplicata e não altera nada.
- Enquanto o registro formal em `authorizations.json` estiver pendente (D26), os registros ficam em `run-state.json`: `reconciliations` e `reconciliation_base` (snapshot antes da primeira reconciliação). O saldo do estado é recalculado a partir da base e dos registros.
- Uma reserva aberta sem registro D26 bloqueia a próxima chamada paga com `reconciliation_required`. Uma reserva marcada `kept` continua coberta e não bloqueia por si só.
- `unknown_calls_after` conta cada chamada desconhecida uma vez, mesmo quando a reserva já fora marcada como custo desconhecido na invocação.

### Marco de adoção (SP-009)

`start --mode runner` exige a linha `Marco de adoção registrado: <data> — aprovador: <nome>` em `docs/agents/issue-tracker.md`. Sem ela, a execução é recusada com `config_error`. O modo `legacy` não exige marco.

### Caminhos de migração e recuperação da identidade (D24, B.3)

- **Migração de projeto existente:** (1) `legacy-run.mjs migrate --change <change>` copia o estado legado para `.harness-local/<change>/migration/pre-migration/` antes de qualquer gravação; (2) importa o histórico como `legacy-markdown`, nunca como aprovação; (3) grava o checkpoint de migração com o hash da cópia; (4) só então muda o modo. Um `.harness-project.json` existente preserva o `project_id`. Ausente, a migração cria um id novo e registra a criação.
- **Recuperação (clone ou worktree novo):** o `project_id` vem do arquivo versionado (`identity.mjs`, `projectId`). O clone cria `local_id` e `execution_id` próprios. Checkpoint importado vai para `awaiting_decision` com `reconciliation_required` até a reconciliação. Id divergente é `config_error`, e a recuperação nunca gera id novo para a change. A restauração de estado migrado segue `manual_rollback` em `.claude/harness/policy.md`.
- `.harness-project.json` é owned (`template.json`) e fica fora de `managed`. O `template-update` não o sobrescreve (RS-023), e só `new-project` gera identidade nova (RS-019).

### Ponto de entrada de `legacy-run.mjs` (B.4)

Decisão: implementar o ponto de entrada mínimo `migrate --change <change>`, em vez de eliminar a dependência. A skill `template-migrate` e os testes PM-001 a PM-009 já usam as funções; eliminá-las removeria código verificado. A recuperação é o procedimento humano de `manual_rollback` (D32), executado pelo comando `legacy-run.mjs restore`, que exige terminal interativo, confere o hash da cópia pré-migração, grava o evento `restore` e o campo `restored`, e não promete reversão transparente.

### Classificador da sonda (P.1)

`scripts/harness/probe.mjs` é função pura, sem chamada e sem gravação. O campo de motivo de limite de turnos é `subtype` ou `stop_reason`. `not_enforced` exige a saída de controle sem o argumento. P.2 segue bloqueada.

## Formato dos campos do contrato (D21b)

Campos por cenário, em linhas `- **Campo:** valor`. Validados pelo `scripts/harness/contract.mjs`, além do `openspec validate --strict`.

| Campo | Obrigatório | Valores | Regra |
|-------|-------------|---------|-------|
| `ID` | sim | `XX-NNN` | único na change |
| `Revisão` | sim | inteiro ≥ 1 | incrementa com autorização `revision` |
| `Verificação` | sim | `teste` ou `check:<nome>` | `<nome>` deve existir em `checks` |
| `Justificativa` | se `check:` | texto livre não vazio | explica por que não há teste funcional |
| `Aprovação` | se `check:`, se não aplicável, se revisão alterada | `auth:<id>` | `<id>` deve referenciar registro humano em `authorizations.json`, do tipo `revision`, não revogado; para reaceitação e exceções, o `scope` deve ser o do cenário (D29, D30) |
| `Não aplicável` | opcional | `sim` | só com `Condição de disparo` |
| `Condição de disparo` | se `Não aplicável` | condição suportada (D30) | reconhecida pelo runner e falsa nesta execução para ser não aplicável; texto fora de D30 é obrigatório (AC-027) |
| `Depende de` | opcional | lista separada por vírgula de `XX-NNN`, `IF-<nome>`, `RG-<nome>` ou `F<n>` | cada referência deve existir: cenário da change, interface ou regra declarada em "Interfaces e regras compartilhadas", ou fatia da tabela de Fatias; texto livre é recusado (HI-014) |
| `Comportamento novo` | no contrato da change | `sim` ou `não` | `não` exige `Aprovação: auth:<id>` |

**Estado do contrato** (proposal.md): `rascunho` ou `aprovado`. Em rascunho, revisão de cenário (`Revisão` > 1) não exige autorização, porque ainda não há contrato aprovado; a mudança fica rastreada pelo número da revisão. Em `aprovado`, qualquer alteração semântica de cenário exige autorização `revision` e nova revisão. A aprovação do contrato é registrada como autorização `revision` com `purpose: contract_approval`, `contract_hash`, `contract_version` e `scope.contract_approval: true` (D32).

Texto livre ou booleano escrito pelo agente não constitui aprovação. A validação completa exige `openspec validate --strict` e `contract.mjs`.

## Interfaces e regras compartilhadas

Referências `IF-<nome>` e `RG-<nome>` no campo `Depende de` (D21b) só são válidas quando declaradas aqui, uma por linha, no formato `- IF-<nome>: <descrição>` ou `- RG-<nome>: <descrição>`. Mudança declarada de uma interface ou regra invalida as evidências de todos os cenários que a citam, transitivamente (EV-007). Referência não declarada é recusada pelo `contract.mjs` (HI-014).

Nenhuma interface ou regra compartilhada declarada nesta change.

## Fatias

Cada fatia entrega um incremento verificável e preserva o caminho de funcionamento. Nenhuma fatia exige chamada paga.

| Fatia | Conteúdo | Depende de | Caminho preservado |
|-------|----------|-----------|--------------------|
| F1 | Política, configuração proposta e loader/validador | — | Nada muda para os fluxos atuais |
| F2 | Estado local: identidade, lock, escrita atômica, recuperação, visões derivadas, modo | F1 | Modo `legacy` intacto |
| F3 | Gates corrigidos, resultado estruturado, `--legacy-write` para o modo legado | F1 | Skills atuais chamam a CLI com `--legacy-write` |
| F4 | `spec-create` ampliado, verificação por cenário, condição de disparo | F1 | Skill atual continua valendo, com o formato novo |
| F5 | Runner: invocação, reservas, orçamento, autorização, reconciliação (sem chamada real) | F2, F3 | Runner só roda em modo `runner`, em simulador |
| F6 | Estados, paradas, repetição, retomada, checkpoint nos marcos | F5 | Idem |
| F7 | Validade, caminhos protegidos, `test_report`, identidade, validação final, resumo durável | F2, F3, F4 | Gates via runner em simulador |
| F8 | `spec-accept`, RED e comportamento pré-existente | F4, F5 | `spec-accept` roda supervisionado |
| F9 | Telemetria e relatórios | F5, F6 | Relatórios locais |
| F10 | Skills para o runner; remoção do `--legacy-write` | F6, F7, F8 | Execuções legadas terminam antes; novas usam `runner` |
| F11 | Benchmark em três níveis e calibração, sem execução paga | F6, F9 | Benchmark existente roda com simulador |
| F12 | Migração (preparação verificável por fixtures) e documentação | F10, F11 | Projetos derivados seguem em `legacy` até migração explícita |
| Marco | Adoção do runner: decisão humana registrada no `issue-tracker.md`, depois de F1–F12 verdes com simuladores | F12 | Antes do marco, esta change é implementada pelo fluxo atual (`spec-implement` com gates atuais) |

**Escopo confirmado das fatias F10, F11 e F12:**
- **F10** inclui as skills para o runner (tarefas 10.1, 10.2 e 10.4). A remoção do `--legacy-write` (10.3) só ocorre depois de confirmar que não há execução `legacy` ativa e depois do marco (tarefa 13). Até lá, `--legacy-write` permanece.
- **F11** inclui o benchmark em três níveis (tarefas 11.1 a 11.4) somente com simuladores. Nenhum benchmark pago é executado nesta change.
- **F12:** a tarefa 12.3 só é marcada depois de testar os critérios de PM-010 (migração de `checks.test_report`, preservação da configuração local e recusa de formato incompatível). A tarefa 12.4a (preparação com fixtures locais) está autorizada e não executada. A 12.4b depende de projetos identificados e de autorização específica. O marco de adoção continua decisão humana.

## Gate oculto: visibilidade e obrigatoriedade (decisão de 2026-10-24)

"Oculto" descreve a visibilidade dos testes para o agente, não a obrigatoriedade da regra. Regras obrigatórias de domínio da tarefa de referência participam da aceitação funcional (PB-004). Uma regra obrigatória que falha reprova a aceitação funcional, mesmo com todos os gates aprovados (PB-012). Um diagnóstico explicitamente classificado como informativo pode continuar sem mudar o status da execução (PB-011). A classificação precisa estar declarada na tarefa; regra sem classificação declarada é tratada como obrigatória. Esta nota atualiza o requisito "Testes ocultos" por MODIFIED na change; a decisão não foi reaberta.

## Avaliação da falha original (PB-009)

Evidência disponível (registrada em `docs/agents/issue-tracker.md`, 2026-10-24): a falha intermitente ocorreu no snapshot legado de PB-008; a ocorrência original não tem mensagem de erro registrada; 18 reexecuções não reproduziram (15 sequenciais e 3 paralelas). Não há log, saída ou hash da falha original. Com essa evidência, as três perguntas abaixo não podem ser respondidas com segurança.

| Pergunta | Resultado | Evidência disponível | Mitigação | Risco residual |
|----------|-----------|----------------------|-----------|----------------|
| (a) Afeta a execução (o runner para ou produz resultado inválido)? | **não distinguível** | Sem log da falha original, não se sabe se o runner parou ou produziu resultado inválido. | PB-001 separa falha do runner de falha funcional; o motivo de parada fica no estado e no relatório. | Uma execução pode parar de novo sem explicação. |
| (b) Afeta a medição (o relatório mede errado)? | **não distinguível** | Sem a saída original, não se sabe se a taxa do snapshot legado foi medida corretamente. | PB-008 declara o avaliador legado e suas limitações; PB-003 registra a configuração efetiva. | A taxa do snapshot legado não é confiável como medida até a investigação. |
| (c) Afeta a possibilidade de aprovação incorreta (um gate aprova sem ter testado)? | **não distinguível** | O caminho conhecido para aprovação incorreta é a comparação por nome e substring do avaliador legado (proposta, falsos positivos). Não há evidência de que tenha ocorrido nesta falha. | Aprovação legada não equivale à aceitação do novo harness (PB-008); formato novo sem ID reprova sem fallback (PB-007); regras obrigatórias reprovam a aceitação (PB-004, PB-012). | Não se exclui que um gate legado tenha aprovado sem testar no snapshot. |

**Conclusão:** PB-009 permanece aberto. Nenhuma das três perguntas foi respondida de forma positiva ou negativa. Passagens posteriores não encerram a pendência, e o marco de adoção continua bloqueado até a investigação.

**Leitura do dono (2026-10-24).** A ocorrência e a incerteza ficam preservadas. Elas impedem declarar confiabilidade comprovada e permitem avaliar uso experimental supervisionado limitado. Não se esperam logs que não existem: a reavaliação (tarefa B.9) só ocorre se surgir log, saída ou hash da falha original.

## Limites da v1

- Sem isolamento técnico do avaliador nem do acesso à implementação. O bloqueio de execução é advisory.
- Um único executor por change.
- Limite de turnos não garantido até a sonda, que não está autorizada. A sonda P.2 não está autorizada, e perfis que exigem limite de turnos comprovado permanecem bloqueados (PO-013).
- Ambiente verificado: Node 24.21.0, macOS. Node 22 não verificado; não bloqueia a conclusão da v1.
- Custo: estimativa do cliente. Pode ser ultrapassado. Consumo interativo é desconhecido e fica fora do orçamento.
- Adaptadores: TAP apenas. JUnit depende de produtor identificado.
- Valores de configuração proposta são candidatos, sem calibração.
- Sem comparação estatística, sem ajuste automático e sem heurísticas de replanejamento além da recomendação simples.
- Rollback de execução migrada não é transparente.

## Adiado

Isolamento real do avaliador; mutação por amostragem; revalidação seletiva; perfis adicionais; comparação estatística; ajuste automático de limites; concorrência; heurísticas de replanejamento; telemetria externa; adaptadores além de TAP e do produtor JUnit necessário.

## Configuração proposta (candidatos, não autorizados)

| Chave | Candidato | Situação |
|-------|-----------|----------|
| `candidate_invocations_per_change` | 60 | Candidato de calibração |
| `candidate_invocations_per_slice` | 12 | Candidato de calibração |
| `candidate_usd_per_call` | 2,00 | Candidato. Maior custo observado por chamada no benchmark: ~US$ 1,05 |
| `reserve_margin_ratio` | 0,25 | Candidato. Reserva de segurança, não garantia |
| `candidate_usd_per_change` | 30,00 | Candidato. Nenhum valor autoriza gasto |
| `candidate_seconds_per_call` | 1500 | Candidato (25 min, padrão atual) |
| `candidate_seconds_per_change` | 10800 | Candidato (180 min) |
| `candidate_diagnostics_per_signature` | 2 | Candidato |
| Modelo e esforço | definidos por change, pelo humano | — |

Plano de calibração: após a primeira change executada em modo `runner`, revisar cada candidato com custo p95 por chamada, paradas por tipo e frequência de `budget_exhausted`. Mudança passa por revisão versionada.

## Questões abertas

1. **Projetos derivados.** Lista e stack de teste não identificados. Bloqueia a adoção (tarefa 12.4b), não o núcleo.
2. **Sonda P.2.** Pendente de autorização `probe` humana. Sem ela, o limite de turnos fica não comprovado.
3. **Marco de adoção.** Critério de passagem definido por decisão humana no `issue-tracker.md`.
4. **Versão do Node (pendente).** Proposal e D21 tratam Node 22 como suportado. Se Node 22 permanece suportado, precisa de fixtures e verificação nessa versão (tarefas 7.9 e 12.4a). Caso contrário, o requisito muda explicitamente. Sem decisão, nenhum requisito muda. **Validação feita hoje vale SOMENTE para o ambiente Node 24.21.0 (macOS, neste repositório).** **Pendência de verificação:** a verificação em Node 22 via Docker depende de daemon Docker disponível. Hoje o daemon não está disponível; a verificação está pendente e não altera o requisito. Não há instalação de Homebrew. **Declaração de ambiente (2026-10-24):** ambiente verificado desta entrega: Node 24.21.0, macOS. Node 22 não verificado; não bloqueia a conclusão da v1.
5. **D26 (registro de reconciliação).** Aprovado pelo dono do projeto em 2026-10-24, com os efeitos de saldo das regras 1 e 6. **Registro formal em `authorizations.json` pendente** do comando `authorize.mjs record` com terminal interativo, a ser executado pelo dono.
6. **Detecção de helpers.** A v1 não detecta helpers por análise de imports. A lista `helpers` do manifesto é fixada no vínculo (D28). Decidir se a validação deve exigir a lista completa.
7. **PB-008 e PB-009 (não resolvidas).** Falha intermitente do cenário de benchmark PB-008 (snapshot legado): 18 reexecuções sem reprodução. Causa não identificada. Avaliação das três perguntas de PB-009 na seção "Avaliação da falha original (PB-009)": todas não distinguíveis com a evidência disponível. Risco residual: a falha pode reaparecer e não tem explicação. Ocorrência registrada como não resolvida; não é marcada como resolvida por passagens posteriores (PB-009). O marco de adoção fica bloqueado até investigação.
8. **Interpretação de `closed_unknown` (decidido pelo dono do projeto em 2026-10-24).** D26 regra 6 mantém o valor da reserva encerrada com custo desconhecido como exposição no comprometido, com `reserve_released_usd` zero. É o tratamento conservador. A continuidade pode exigir extensão explícita do orçamento. Essa exposição NÃO é custo conhecido.
9. **Exceções previstas.** Nenhuma chave de exceção é declarada em `policy.json` hoje. Decidir quais exceções a política deve prever, se houver (D32, `exception`).
10. **Procedimento `restore` (sem decisão humana).** O evento de restauração de D32 (`kind: "restore"` em `events.jsonl`) é uma escolha de desenho: não há tipo novo em `authorizations.json`. Implementada em `legacy-run.mjs restore` (B.5), mantendo a escolha: evento em `events.jsonl`, sem tipo novo em `authorizations.json`.
11. **Custo em `kept` e efeito negativo (sem decisão humana).** D26 fixa que `kept` não contabiliza custo e que o efeito de `closed_observed` pode ser negativo quando o custo excede a reserva, sem truncamento. Esses detalhes não estavam na decisão aprovada; confirmar.
