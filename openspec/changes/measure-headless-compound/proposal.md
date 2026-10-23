# Proposal

## Why

No benchmark de legado de 2026-10-23, 2 de 6 execuções falharam no arquivamento. Comandos compostos (`node …; echo $?`, `cd …; cat …`) foram negados no modo headless, e o agente concluiu que o Bash estava indisponível. As skills `spec-*` passaram a pedir um comando simples por chamada, mas o efeito não foi medido.

## What Changes

- Novo cenário `archive-only` no runner. Ele parte de um snapshot em que a implementação já passou (`fixtures/legacy-pricing.pre-archive`, de uma execução real) e roda só o `spec-archive`, a 1 invocação por execução.
- O relatório passa a contar `compound_denials` por passo e `stopped_after_denial` por execução.
- As tarefas podem declarar `acceptance` (limiares), e o relatório avalia esses critérios.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `pipeline-benchmark`: cenário que começa num passo intermediário, métricas de negação de comando composto e avaliação de critérios de aceite.

## Impact

`scripts/benchmark/` (template_only). Rodada real: N=10, 10 invocações.
