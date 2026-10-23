# Tasks

## 1. Métricas e critérios

- [x] 1.1 Testes (RED) e implementação de `compound_denials`, `stopped_after_denial` e `acceptance` no relatório; verificar com `node --test`

## 2. Cenário archive-only

- [x] 2.1 Fixture `legacy-pricing.pre-archive` e tarefa `legacy-pricing-archive` com `acceptance`; verificar que a suíte da fixture passa
- [x] 2.2 Testes (RED) e implementação do cenário `archive-only` com `claude` simulado; verificar com `node --test`
- [x] 2.3 Rodada real N=10 até os critérios passarem (limite de 10 rodadas); verificar com `acceptance.accepted` no relatório
