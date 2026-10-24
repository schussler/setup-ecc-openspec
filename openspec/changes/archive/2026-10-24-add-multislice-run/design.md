# Design

## D1. Declaração de fatias

`tasks.md` declara fatias com cabeçalho `## Fatia: <nome>`. A função `declaredSlices(text)` devolve os nomes em
ordem. Lista vazia significa modo legado (`implement`). A lista é gravada em `state.required_slices` no início da
execução multifatia, para que a validação final use a mesma lista da execução.

## D2. Aprovação por fatia

`approveSlice` continua gravando `slice: 'implement'` (o gate de ciclo). Logo após a aprovação, o `run` acrescenta
`task: <nome>` ao último registro. `sliceApproved` compara `task ?? slice`. Registros legados não mudam.

## D3. Loop sequencial no `run`

1. Calcula as fatias pendentes (declaradas e sem registro com `task`).
2. Sem pendência: conclui pela validação final.
3. Com pendência: se o estado for `approved`, volta a `ready` pela tabela (`approved → ready`). Chama `runSlice`
   com `task` da primeira pendente.
4. Se a fatia parar, retorna a parada sem avançar. Se aprovar, grava `task` e repete.

Não há paralelismo. A máquina de estados não muda.

## D4. Validação final

`validateFinal` usa `state.required_slices` quando existir, senão `REQUIRED_SLICES`. Com fatia pendente, o resultado
é `refused` (já existente).

## D5. Tentativas identificáveis

Cada tentativa gravada em `gates.implement.attempts` recebe `task` quando a execução é multifatia.

## Riscos

- O gate roda a suíte inteira em cada fatia; uma fatia posterior pode quebrar a anterior. Isso é tratado como falha
  da fatia atual, sem invalidar a aprovação anterior nesta change (invalidação está fora de escopo).

## D6. Preflight

`scripts/harness/preflight.mjs` devolve uma lista de itens `{ id, status: ok|blocked, detail }`. Itens: `git_head`
(`headCommit` não nulo), `git_identity` (`user.name` e `user.email`), `project_id` (`.harness-project.json`),
`adoption` (marco no `issue-tracker`), `profile`, `checks` (test, lint e typecheck presentes), `claude_binary`
(`--version`, sem chamada ao modelo) e `permissions` (`.claude/settings.json` com `permissions.allow`). `run` chama o
preflight antes do lock e recusa com `preflight_blocked` se algum item estiver bloqueado.

## D7. Permissão negada

A saída do `claude -p` traz `permission_denials` mesmo quando o modelo recupera a ação depois (o piloto mostrou isso:
um comando composto negado foi repetido como comandos simples e a fatia passou). Por isso as negações são só
registradas (`tool_name` e primeira palavra do comando, sem argumentos). Parada operacional `permission_denied`
acontece quando o gate reprova a fatia e a invocação teve negações: a fatia fica em `awaiting_decision`, sem correção.

## D8. Reutilização de aprovação

Cada aprovação de fatia guarda a impressão. Na retomada, se a impressão mudou, o gate da fatia é reavaliado sem
invocar o modelo (o mesmo `implementEvaluation`). Passa: a aprovação recebe `revalidated_at` e a nova impressão, e o
registro anterior fica em `revalidations`. Falha: a aprovação sai de `slice_approvals` e vai para
`invalidated_slices`, com o motivo, e a fatia é executada de novo.

## D9. Conciliação

`scripts/harness/conciliation.mjs` compara: `state.invocations_total`, `state.counters.invocations`, o tamanho de
`state.invocations`, o número de eventos de invocação paga do runner e o `invocations_total` do relatório. Custo
conhecido: soma dos eventos pagos com `cost_source: reported` contra o `known_usd` do relatório; em modo financeiro,
também contra `state.consumption.known_usd`. Divergência vira `reconciliation_mismatch` na conclusão.
