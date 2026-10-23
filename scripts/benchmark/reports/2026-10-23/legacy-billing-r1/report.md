# Benchmark — legacy-billing (`legacy-billing`)

- **Status:** complete
- **N:** 8 por grupo
- **Invocações de `claude -p`:** 37 (orçamento 37/48)
- **Custo total:** US$ 26.0058
- **`scoped_paths`:** `src/`, `test/`, `openspec/`, `docs/agents/`
- **Início / fim:** 2026-10-23T21:00:22.799Z / 2026-10-23T21:12:13.448Z
- work dir: <work-dir>/legacy-billing
- modelo: padrão do usuário
- timeout por invocação: 25 min
- **Com vs. sem `docs/agents/`:** sucesso 50% vs. 50% (com − sem: 0 p.p.)
- **Gate hidden (regras só nos docs):** 50% vs. 0% (com − sem: 50 p.p.; conclusivo: sim)

## Critérios de aceite: reprovado

| Critério | Valor | Limiar | Resultado |
|----------|-------|--------|-----------|
| min_best_group_success_rate | 50 | >= 75 | ✗ |

## Grupo `with_docs`

- **Taxa de sucesso:** 50% (4/8 execuções completas; 0 interrompidas por orçamento; 0 não iniciadas)
- **Arquivos fora de `scoped_paths`:** 0
- **Cobertura:** antes 100% (min 100, max 100); depois 100% (min 100, max 100)
- **Custo:** US$ 13.6466 em 20 invocações
- **Negações de comando composto:** média 0.13 por execução; 0 execuções pararam após negação

| Gate | Avaliado | Aprovado | Taxa |
|------|----------|----------|------|
| bootstrap | 8 | 8 | 100% |
| spec | 8 | 6 | 75% |
| implement | 6 | 6 | 100% |
| archive | 6 | 4 | 66.67% |
| scope | 8 | 8 | 100% |
| hidden | 8 | 4 | 50% |

**Tempo por etapa (média, min, max):**

- spec-create: 105.3 s (4.2 s–159.6 s)
- spec-implement: 95.6 s (4.3 s–150.8 s)
- spec-archive: 22.6 s (4.2 s–34.9 s)

| Execução | Status | Gates (bootstrap/spec/implement/archive/scope/hidden) | Fora do escopo | Cobertura depois | Invocações | Custo (US$) | Tempo |
|----------|--------|-----------------------------------------------|----------------|------------------|------------|-------------|-------|
| 1 | passed | ✓ ✓ ✓ ✓ ✓ ✓ | 0 | 100% | 3 | 2.695 | 320.6 s |
| 2 | passed | ✓ ✓ ✓ ✓ ✓ ✓ | 0 | 100% | 3 | 2.8108 | 311.8 s |
| 3 | passed | ✓ ✓ ✓ ✓ ✓ ✓ | 0 | 100% | 3 | 2.7799 | 301.6 s |
| 4 | passed | ✓ ✓ ✓ ✓ ✓ ✓ | 0 | 100% | 3 | 2.8691 | 343.3 s |
| 5 | failed | ✓ ✓ ✓ ✗ ✓ ✗ | 0 | 100% | 3 | 1.5825 | 170.3 s |
| 6 | failed | ✓ ✓ ✓ ✗ ✓ ✗ | 0 | 100% | 3 | 0.9093 | 122.7 s |
| 7 | failed | ✓ ✗ – – ✓ ✗ | 0 | 100% | 1 | 0 | 7.8 s |
| 8 | failed | ✓ ✗ – – ✓ ✗ | 0 | 100% | 1 | 0 | 7.2 s |

**Falhas:**

- Execução 5: gate archive reprovado
- Execução 6: gate archive reprovado
- Execução 7: gate spec reprovado
- Execução 8: gate spec reprovado

## Grupo `without_docs`

- **Taxa de sucesso:** 50% (4/8 execuções completas; 0 interrompidas por orçamento; 0 não iniciadas)
- **Arquivos fora de `scoped_paths`:** 0
- **Cobertura:** antes 100% (min 100, max 100); depois 100% (min 100, max 100)
- **Custo:** US$ 12.3592 em 17 invocações
- **Negações de comando composto:** média 0.25 por execução; 0 execuções pararam após negação

| Gate | Avaliado | Aprovado | Taxa |
|------|----------|----------|------|
| bootstrap | 8 | 8 | 100% |
| spec | 8 | 5 | 62.5% |
| implement | 5 | 4 | 80% |
| archive | 4 | 4 | 100% |
| scope | 8 | 8 | 100% |
| hidden | 8 | 0 | 0% |

**Tempo por etapa (média, min, max):**

- spec-create: 86.8 s (4 s–133.9 s)
- spec-implement: 78.2 s (21.9 s–111.8 s)
- spec-archive: 32.2 s (29.3 s–33.9 s)

| Execução | Status | Gates (bootstrap/spec/implement/archive/scope/hidden) | Fora do escopo | Cobertura depois | Invocações | Custo (US$) | Tempo |
|----------|--------|-----------------------------------------------|----------------|------------------|------------|-------------|-------|
| 1 | passed | ✓ ✓ ✓ ✓ ✓ ✗ | 0 | 100% | 3 | 2.4659 | 252.7 s |
| 2 | passed | ✓ ✓ ✓ ✓ ✓ ✗ | 0 | 100% | 3 | 2.4832 | 245 s |
| 3 | passed | ✓ ✓ ✓ ✓ ✓ ✗ | 0 | 100% | 3 | 2.6324 | 271.2 s |
| 4 | passed | ✓ ✓ ✓ ✓ ✓ ✗ | 0 | 100% | 3 | 2.6367 | 258.4 s |
| 5 | failed | ✓ ✓ ✗ – ✓ ✗ | 0 | 100% | 2 | 1.4951 | 148.8 s |
| 6 | failed | ✓ ✗ – – ✓ ✗ | 0 | 100% | 1 | 0.6459 | 51.9 s |
| 7 | failed | ✓ ✗ – – ✓ ✗ | 0 | 100% | 1 | 0 | 6.9 s |
| 8 | failed | ✓ ✗ – – ✓ ✗ | 0 | 100% | 1 | 0 | 7.3 s |

**Falhas:**

- Execução 5: gate implement reprovado
- Execução 6: gate spec reprovado
- Execução 7: gate spec reprovado
- Execução 8: gate spec reprovado

