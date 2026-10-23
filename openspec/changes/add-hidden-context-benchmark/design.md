# Design

## Context

Critérios aprovados pelo usuário em 2026-10-23 (pendência 2). O limite é de 10 rodadas.

- **A tarefa é válida (aprova a pendência):** a referência passa 100% nos testes ocultos; a solução ingênua falha em pelo menos 2 das 3 regras; pelo menos uma variante tem ≥ 75% de sucesso nos gates normais.
- **O resultado é conclusivo:** diferença de pelo menos 25 p.p. no gate `hidden` entre `with_docs` e `without_docs`. Abaixo disso, o resultado é registrado como "sem evidência".
- **Reprova:** a tarefa, se a ingênua passar nos ocultos; o resultado, se as duas variantes ficarem abaixo de 50% nos gates normais.

## Decisions

- **D1. Regras só nos docs.** O código expõe `legacyContract` no cadastro, sem comentário, e nenhuma regra ou teste o usa. O arredondamento bancário e a pureza de `billing/` também não aparecem no código. O desconto existente arredonda para baixo, que é uma regra diferente e documentada.
- **D2. Testes ocultos fora da descoberta.** Os arquivos se chamam `*.hidden-test.js`, para que nem o gate do template nem o projeto os descubram. O runner os copia para `.hidden-tests/` só depois da checagem de escopo e os roda pela entrada pública (`issueInvoice`) e por análise estática dos imports.
- **D3. `hidden` é informativo.** O status da execução continua medindo o pipeline (gates normais). O gate `hidden` mede o efeito do contexto e entra só na comparação.
- **D4. N=8 por variante, paralelismo 4.** Com N=8, uma execução vale 12,5 p.p., e o limiar de 25 p.p. exige diferença de 2 execuções.
- **D5. Toolset enxuto nos cenários de legado (pedido do usuário, depois da rodada 2).** O `installToolset` instala só o que o pipeline usa:
  - as skills `spec-*`, `handoff` e `openspec-*`;
  - `.claude/commands/opsx`;
  - `.claude/rules/common`, `openspec.md` e `README.md`;
  - `.claude/settings.json`, `scripts/gates` e `openspec/config.yaml`.

  Saem ~285 skills, ~90 agentes e as rules de linguagem, que entravam no contexto de cada turno de cada `claude -p` sem influir no que é medido. O greenfield continua com o toolset completo, porque ali o `/new-project` faz parte do que é medido.
  **Comparabilidade:** as rodadas 1 e 2 usaram o toolset completo. A partir da rodada 3, o custo por invocação não é comparável com elas, mas os gates e as regras ocultas continuam.
