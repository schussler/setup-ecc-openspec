# Proposal

## Why

Na tarefa `legacy-pricing`, com e sem `docs/agents/` deram o mesmo resultado (4/5 cada). A tarefa não discrimina: todas as regras estão no código e nos testes. Para medir se o contexto ajuda, é preciso uma tarefa em que certas regras existam só em `docs/agents/`, e um gate que as verifique sem que o agente veja os testes.

## What Changes

- Fixture `legacy-billing` (faturas com taxa de serviço). Três regras existem só em `docs/agents/`:
  - **domínio:** isenção para contrato legado;
  - **invariante:** arredondamento bancário em centavos;
  - **arquitetura:** `src/billing/` só importa de si mesmo e não lê o relógio.
- Testes ocultos (`legacy-billing.hidden/`) que o runner copia para o projeto só depois do pipeline. Eles viram o gate `hidden`, informativo: não entra no status da execução.
- Soluções de validação (`legacy-billing.solutions/`): a referência passa nas 3 regras; a ingênua falha em pelo menos 2. Testes do template garantem isso.
- O relatório compara o gate `hidden` entre as variantes (diferença em p.p. e conclusivo ou não) e avalia `min_best_group_success_rate`.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `pipeline-benchmark`: testes ocultos, comparação do gate `hidden` e critério de melhor taxa de sucesso entre os grupos.

## Impact

`scripts/benchmark/` (template_only). Rodada real: N=8 por variante, 48 invocações.
