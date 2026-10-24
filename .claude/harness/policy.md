# Política do harness

Esta política define as regras comuns do runner de specs. Os parâmetros autoritativos ficam em `.claude/harness/policy.json`. Este arquivo cita as chaves pelo nome e não repete seus valores. Para conhecer um limite, leia a chave em `policy.json`.

## Versão e mudanças

- A versão da política é a chave `version` de `policy.json`.
- Mudança em qualquer parâmetro exige revisão explícita e nova versão. Nenhuma skill ou execução altera a política.
- Cada parâmetro tem uma única definição, em `policy.json`. Regras e relatórios referenciam a chave.

## Limites e configuração proposta

- O teto de correções por gate é a chave `max_corrections_per_gate`.
- A margem de reserva de orçamento é a chave `reserve_margin_ratio`. Ela é reserva de segurança, não garantia de teto.
- A configuração proposta de cada change (`.claude/harness/profiles/default.json` ou um perfil da change) pode reduzir limites. Ela não pode ampliar um teto de `policy.json`. Violação para com `config_error` antes de qualquer invocação.
- Chaves `candidate_*` são valores provisórios. Elas exigem `"provisional": true` e um plano de calibração. Nenhuma chave `candidate_*` autoriza gasto.
- O limite efetivo de uma chamada paga é o menor entre o teto da política, o candidato do perfil e o valor da autorização vigente do tipo `budget`. Sem autorização `budget`, nenhuma chamada paga é iniciada.

## Bloqueio e lock

- O tempo, em segundos, após o qual um lock é tido como vencido é a chave `lock_stale_seconds`. Um lock vencido nunca é removido automaticamente.
- O lock só é liberado por registro `lock_release` ou pelo término normal da execução.

## Caminhos

- Caminhos protegidos estão na chave `protected_paths`. Alteração neles, durante a execução, para o runner com o motivo `protected_change`.
- Artefatos operacionais estão na chave `excluded_paths`. Eles não entram na impressão de validade.

## Estados e paradas

- Os estados operacionais estão na chave `states`. Transições aceitas são só as da tabela `TRANSITIONS` de `scripts/harness/machine.mjs`, que é a tabela desta regra. A chave `states` e a lista de paradas de `machine.mjs` são conferidas contra este arquivo pela suíte.
- Os motivos de parada estão na chave `stop_reasons`. O motivo fica em `stop_reason`, separado do estado, e só é preenchido em estados de parada.
- Parada por orçamento fica em `awaiting_decision`. `config_blocked` é reservado a configuração, identidade, esquema, modo e formato de relatório.

## Segredos e configuração não sensível

- Somente as chaves listadas em `non_sensitive_config` entram na impressão e nos relatórios.
- Variáveis de ambiente que não estão nessa lista não são impressas. Nomes com aparência de segredo nunca são incluídos.

## Compatibilidade

- O runner compara o `schema_version` do estado com a versão instalada. Estado mais novo que a versão instalada para com `config_error` e instrução de migração.

## Retenção

- Artefatos locais são guardados pelo prazo da chave `log_retention_days`. A limpeza preserva resumo durável, checkpoint e autorizações.

## Tetos de orçamento (provisórios)

Os tetos `max_*` de `policy.json` são iguais aos valores candidatos do perfil padrão. Assim o perfil nunca amplia a política. Eles dependem de aprovação humana registrada, e nenhum deles autoriza gasto: a chamada paga exige autorização `budget` (`authorizations.json`).

## Plano de calibração

Os candidatos (`max_invocations_per_change`, `max_invocations_per_slice`, `max_usd_per_call`, `reserve_margin_ratio`, `max_usd_per_change`, `max_seconds_per_call`, `max_seconds_per_change` e `max_diagnostics_per_signature` em `policy.json`) não estão calibrados. O plano abaixo define como revisá-los. Ele não executa nenhum benchmark pago: nenhum benchmark pago é executado nesta change, e os testes usam o simulador.

1. Depois da primeira change executada em modo `runner`, calcular o custo p95 por chamada a partir dos eventos de telemetria dessa execução. O maior valor observado não é garantia de máximo futuro.
2. Contar as paradas por tipo (`stop_reason`) e a frequência de `budget_exhausted` por change e por fatia.
3. Comparar cada candidato com esses números. Um candidato só muda se o dado mostrar que o valor atual para antes do trabalho útil, ou deixa gasto sem controle.
4. Cada mudança passa por revisão versionada: nova `version` em `policy.json`, registro de quem aprovou e a evidência usada. Nenhuma skill ou execução altera a política.
5. Até essa revisão, os candidatos continuam provisórios, marcados como `candidato` no relatório do benchmark, e nenhum deles autoriza gasto.

## manual_rollback (procedimento humano, PM-011, D32)

Restaura uma execução migrada de `legacy` para `runner` a partir da cópia pré-migração. **Não é reversão transparente**: não existe comando automático de volta ao estado anterior, e o relatório declara isso. O procedimento não é um tipo de autorização (`kind`) e não é autorização de revisão. Não cria `kind` novo em `authorizations.json`.

Pré-condições, todas obrigatórias, nesta ordem:

1. **Autorização humana registrada.** A decisão é tomada por uma pessoa em terminal interativo (RC-039). O terminal descreve o procedimento; não comprova identidade. O aprovador, a data e o motivo são registrados.
2. **Cópia pré-migração com hash conferido.** A cópia está em `.harness-local/<change>/migration/pre-migration/`. Seu hash é conferido com o hash registrado no checkpoint de migração (`migration/checkpoint.json`). Se não conferir, a restauração é recusada e nenhum arquivo é alterado.
3. **Lock da change livre (D1).** Nenhuma invocação pode estar em curso.

Passos:

1. Registrar o evento `kind: "restore"` em `events.jsonl`, com aprovador, data, motivo, origem (caminho e hash da cópia) e hash do estado atual antes da restauração.
2. Restaurar a cópia pré-migração como estado da execução.
3. Marcar o `run-state.json` com o campo `restored`: origem, hash anterior à restauração e hash do estado restaurado.
4. Preservar o consumo acumulado. Ele continua no histórico e nunca é apagado nem zerado. As evidências locais também são preservadas.
5. **Reconciliar as reservas abertas antes de continuar.** Cada reserva aberta recebe uma decisão `kept`, `closed_observed` ou `closed_unknown` (D26). Nenhuma chamada paga inicia antes dessa reconciliação.

O relatório da execução restaurada declara que a restauração não é transparente (PM-009, PM-011).

Comando humano (exige terminal interativo; sem ele, nada é alterado):

```
node .claude/skills/template-migrate/legacy-run.mjs restore --change <change> --approver <nome> --reason <motivo>
```

O comando mostra o resumo e pede o código de confirmação, como o `authorize.mjs record`. Recusa sem alterar arquivos quando não há terminal interativo, quando falta aprovador ou motivo, quando o hash da cópia não confere com `pre_migration_sha256` do checkpoint de migração, quando a confirmação não confere ou quando o lock da change está ocupado. O `run-state.json` legado guardado na cópia não volta: o modo é imutável (RS-008). Com reservas abertas, a execução restaurada fica em `awaiting_decision` com `reconciliation_required` até a reconciliação pelo `cli.mjs reconcile`.

## Aprovação pela conversa e conclusão supervisionada (simplify-approval-and-execution)

- A aprovação de contrato de change nova pode vir da conversa, registrada com `procedure: conversa` em `authorizations.json`. Vale só para uma change sem aprovação de contrato anterior. O caminho 1 não grava registro. Aprovações de TTY já existentes continuam válidas.
- A conclusão supervisionada grava `supervised-completion.json` com as evidências atuais (suíte, lint, sintaxe, `validate --strict` e contrato). Ela substitui o veredito `pass` do gate de implementação só para o hash atual do contrato, e nunca altera `gates.json`.
- Os parâmetros de orçamento, limites, reserva e caminhos protegidos não mudam com esta regra. Os motivos de parada continuam os da chave `stop_reasons`.
