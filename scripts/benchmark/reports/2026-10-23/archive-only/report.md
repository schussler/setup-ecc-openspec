# Benchmark — archive-only (`legacy-pricing-archive`)

- **Status:** complete
- **N:** 10 por grupo
- **Invocações de `claude -p`:** 10 (orçamento 10/10)
- **Custo total:** US$ 5.0197
- **`scoped_paths`:** `src/`, `test/`, `openspec/`, `docs/agents/`
- **Início / fim:** 2026-10-23T20:42:06.595Z / 2026-10-23T20:43:41.855Z
- work dir: <work-dir>/archive-only
- modelo: padrão do usuário
- timeout por invocação: 25 min

## Critérios de aceite: aprovado

| Critério | Valor | Limiar | Resultado |
|----------|-------|--------|-----------|
| gate_pass_count.archive | 10 | >= 10 | ✓ |
| max_stopped_after_denial | 0 | <= 0 | ✓ |
| max_compound_denials_mean | 0 | <= 1 | ✓ |
| max_out_of_scope | 0 | <= 0 | ✓ |

## Grupo `default`

- **Taxa de sucesso:** 100% (10/10 execuções completas; 0 interrompidas por orçamento; 0 não iniciadas)
- **Arquivos fora de `scoped_paths`:** 0
- **Cobertura:** antes n/a; depois n/a
- **Custo:** US$ 5.0197 em 10 invocações
- **Negações de comando composto:** média 0 por execução; 0 execuções pararam após negação

| Gate | Avaliado | Aprovado | Taxa |
|------|----------|----------|------|
| bootstrap | 0 | 0 | n/a |
| spec | 0 | 0 | n/a |
| implement | 10 | 10 | 100% |
| archive | 10 | 10 | 100% |
| scope | 10 | 10 | 100% |

**Tempo por etapa (média, min, max):**

- spec-archive: 38 s (34.3 s–47.8 s)

| Execução | Status | Gates (bootstrap/spec/implement/archive/scope) | Fora do escopo | Cobertura depois | Invocações | Custo (US$) | Tempo |
|----------|--------|-----------------------------------------------|----------------|------------------|------------|-------------|-------|
| 1 | passed | – – ✓ ✓ ✓ | 0 | n/a | 1 | 0.5056 | 40 s |
| 2 | passed | – – ✓ ✓ ✓ | 0 | n/a | 1 | 0.5017 | 41.1 s |
| 3 | passed | – – ✓ ✓ ✓ | 0 | n/a | 1 | 0.5062 | 42.5 s |
| 4 | passed | – – ✓ ✓ ✓ | 0 | n/a | 1 | 0.5101 | 42.6 s |
| 5 | passed | – – ✓ ✓ ✓ | 0 | n/a | 1 | 0.5015 | 39.4 s |
| 6 | passed | – – ✓ ✓ ✓ | 0 | n/a | 1 | 0.4881 | 39.1 s |
| 7 | passed | – – ✓ ✓ ✓ | 0 | n/a | 1 | 0.5096 | 40.1 s |
| 8 | passed | – – ✓ ✓ ✓ | 0 | n/a | 1 | 0.4979 | 40.5 s |
| 9 | passed | – – ✓ ✓ ✓ | 0 | n/a | 1 | 0.4945 | 50.5 s |
| 10 | passed | – – ✓ ✓ ✓ | 0 | n/a | 1 | 0.5045 | 38.5 s |

