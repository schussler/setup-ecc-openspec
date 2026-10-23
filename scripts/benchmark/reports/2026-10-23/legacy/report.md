# Benchmark — legacy (`legacy-pricing`)

- **Status:** budget_exhausted
- **N:** 5 por grupo
- **Invocações de `claude -p`:** 21 (orçamento 21/21)
- **Custo total:** US$ 24.2988
- **`scoped_paths`:** `src/`, `test/`, `openspec/`, `docs/agents/`
- **Início / fim:** 2026-10-23T19:32:57.097Z / 2026-10-23T20:01:12.131Z
- work dir: <work-dir>/legacy
- modelo: padrão do usuário
- timeout por invocação: 25 min
- **Com vs. sem `docs/agents/`:** sucesso 66.67% vs. 66.67% (com − sem: 0 p.p.)

## Grupo `with_docs`

- **Taxa de sucesso:** 66.67% (2/3 execuções completas; 1 interrompidas por orçamento; 1 não iniciadas)
- **Arquivos fora de `scoped_paths`:** 0
- **Cobertura:** antes 98.77% (min 98.77, max 98.77); depois 100% (min 100, max 100)
- **Custo:** US$ 12.6944 em 11 invocações

| Gate | Avaliado | Aprovado | Taxa |
|------|----------|----------|------|
| bootstrap | 3 | 3 | 100% |
| spec | 3 | 3 | 100% |
| implement | 3 | 3 | 100% |
| archive | 3 | 2 | 66.67% |
| scope | 3 | 3 | 100% |

**Tempo por etapa (média, min, max):**

- spec-create: 191.9 s (172.9 s–214.2 s)
- spec-implement: 199.1 s (184.8 s–214.6 s)
- spec-archive: 39.6 s (38.2 s–41.5 s)

| Execução | Status | Gates (bootstrap/spec/implement/archive/scope) | Fora do escopo | Cobertura depois | Invocações | Custo (US$) | Tempo |
|----------|--------|-----------------------------------------------|----------------|------------------|------------|-------------|-------|
| 1 | passed | ✓ ✓ ✓ ✓ ✓ | 0 | 100% | 3 | 3.4767 | 449.2 s |
| 2 | passed | ✓ ✓ ✓ ✓ ✓ | 0 | 100% | 3 | 3.2739 | 417.2 s |
| 3 | failed | ✓ ✓ ✓ ✗ ✓ | 0 | 100% | 3 | 2.9774 | 416.9 s |
| 4 | budget_exhausted | ✓ ✓ ✓ – – | n/a | n/a | 2 | 2.9664 | 411.5 s |
| 5 | not_run | – – – – – | n/a | n/a | 0 | 0 | 0 s |

**Falhas:**

- Execução 3: gate archive reprovado

## Grupo `without_docs`

- **Taxa de sucesso:** 66.67% (2/3 execuções completas; 1 interrompidas por orçamento; 1 não iniciadas)
- **Arquivos fora de `scoped_paths`:** 0
- **Cobertura:** antes 98.77% (min 98.77, max 98.77); depois 100% (min 100, max 100)
- **Custo:** US$ 11.6044 em 10 invocações

| Gate | Avaliado | Aprovado | Taxa |
|------|----------|----------|------|
| bootstrap | 3 | 3 | 100% |
| spec | 3 | 3 | 100% |
| implement | 3 | 3 | 100% |
| archive | 3 | 2 | 66.67% |
| scope | 3 | 3 | 100% |

**Tempo por etapa (média, min, max):**

- spec-create: 210.7 s (187.7 s–248.7 s)
- spec-implement: 193 s (147.1 s–246 s)
- spec-archive: 31.9 s (21.1 s–38.8 s)

| Execução | Status | Gates (bootstrap/spec/implement/archive/scope) | Fora do escopo | Cobertura depois | Invocações | Custo (US$) | Tempo |
|----------|--------|-----------------------------------------------|----------------|------------------|------------|-------------|-------|
| 1 | passed | ✓ ✓ ✓ ✓ ✓ | 0 | 100% | 3 | 3.4572 | 476.1 s |
| 2 | passed | ✓ ✓ ✓ ✓ ✓ | 0 | 100% | 3 | 3.8134 | 492.6 s |
| 3 | failed | ✓ ✓ ✓ ✗ ✓ | 0 | 100% | 3 | 2.9479 | 358.7 s |
| 4 | budget_exhausted | ✓ ✓ – – – | n/a | n/a | 1 | 1.3859 | 200.3 s |
| 5 | not_run | – – – – – | n/a | n/a | 0 | 0 | 0 s |

**Falhas:**

- Execução 3: gate archive reprovado

