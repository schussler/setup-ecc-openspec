# Proposal

- **Estado do contrato:** rascunho
- **Comportamento novo:** sim
- **Política:** `.claude/harness/policy.md` e `.claude/harness/policy.json` (referenciados, não repetidos).
- **Revisão de compatibilidade:** `openspec/changes/add-spec-harness` (ver seção "Revisão de compatibilidade" de `design.md`). Esta change não repete os requisitos revisados.

## Why

O harness registra custo e tokens por invocação em `events.jsonl`, mas hoje a execução padrão exige autorização `budget` antes de qualquer chamada paga, e não há resumo de consumo por etapa, tentativa e correção. O dono do projeto quer observar onde o consumo acontece e por quê, sem aprovar orçamento, sem mensagens recorrentes e sem bloqueio por custo.

## What Changes

- **Modo padrão de observação:** sem `modo_financeiro: true` no perfil da execução, o runner não exige autorização `budget`, não cria reserva e não bloqueia por custo. Os controles não financeiros continuam: aprovação do contrato, escopo, integridade, tentativas, correções e erro repetido.
- **Modo financeiro opcional:** quando `modo_financeiro: true` está ativo, valem as regras de orçamento e reconciliação de `add-spec-harness`, como revisadas.
- **Coleta silenciosa:** cada invocação grava, em `events.jsonl`, agente, modelo solicitado e efetivo, esforço, duração, tokens (entrada, saída, cache), custo com origem, e vínculos com change, execução, invocação, etapa e tentativa. O vínculo com tarefa só existe quando é confiável.
- **Resumo após arquivamento:** após um arquivamento bem-sucedido, a seção "Consumo e observações finais" é exibida uma vez e gravada junto dos artefatos arquivados.
- **Consulta sob demanda:** um comando somente leitura mostra o consumo de uma change aberta ou concluída sem arquivamento. Nunca roda em cada etapa.
- **Falhas de observabilidade:** coleta, consolidação, gravação ou exibição que falhem não alteram o veredito de gate, a aprovação nem o arquivamento. Registram aviso quando possível.

## Capabilities

### New Capabilities

- `harness-consumption-observation`: modo de observação, coleta silenciosa por invocação, resumo final, consulta sob demanda e tratamento de falhas de observabilidade.

### Modified Capabilities

Nenhuma nesta change. A revisão de compatibilidade de `add-spec-harness` (requisitos "Invocação headless", "Orçamento com limites independentes", "Reserva e custo", "Reconciliação de reservas", "Registro de reconciliação idempotente e correspondido" e "Extensão de orçamento com autorização") é aplicada naquela change, não aqui.

## Impact

- Novo: módulo de observação e consulta no harness, com testes em `scripts/test/harness/`.
- Alterado nesta change: `scripts/harness/` (coleta e resumo), `cli.mjs` (comando de consulta) e a skill `spec-archive` (chamada do resumo após arquivamento).
- Alterado na revisão de `add-spec-harness`: somente as descrições dos requisitos listados e uma nota de revisão no `design.md` dessa change.
- Não afetado: gates, política, caminhos protegidos, mecanismo de conclusão supervisionada, sonda de `--max-turns` (ação paga explícita, com autorização `probe`, fora do escopo).
- Dependência: a aprovação do contrato revisado de `add-spec-harness` e a aprovação desta change precisam ser registradas por um humano, em TTY, com `authorize.mjs`. Nada disso é feito nesta etapa.
- Lacuna declarada: subagentes e sessões interativas aparecem como não medidos, e não há atribuição perfeita por tarefa.
