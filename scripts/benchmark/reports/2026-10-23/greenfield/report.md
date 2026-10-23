# Benchmark — greenfield (`greenfield-duration`)

- **Status:** complete
- **N:** 5 por grupo
- **Invocações de `claude -p`:** 20 (orçamento 20/20)
- **Custo total:** US$ 20.6979
- **`scoped_paths`:** `src/`, `test/`, `openspec/`, `docs/agents/`
- **Início / fim:** 2026-10-23T18:45:54.931Z / 2026-10-23T19:10:01.144Z
- work dir: <work-dir>/greenfield
- modelo: padrão do usuário
- timeout por invocação: 25 min

## Grupo `default`

- **Taxa de sucesso:** 100% (5/5 execuções completas; 0 interrompidas por orçamento; 0 não iniciadas)
- **Arquivos fora de `scoped_paths`:** 0
- **Cobertura:** antes n/a; depois 100% (min 100, max 100)
- **Custo:** US$ 20.6979 em 20 invocações

| Gate | Avaliado | Aprovado | Taxa |
|------|----------|----------|------|
| bootstrap | 5 | 5 | 100% |
| spec | 5 | 5 | 100% |
| implement | 5 | 5 | 100% |
| archive | 5 | 5 | 100% |
| scope | 5 | 5 | 100% |

**Tempo por etapa (média, min, max):**

- new-project: 105.9 s (93.5 s–125.1 s)
- spec-create: 158.9 s (132.6 s–209.8 s)
- spec-implement: 171 s (130.1 s–203.5 s)
- spec-archive: 34.8 s (32.5 s–39.4 s)

| Execução | Status | Gates (bootstrap/spec/implement/archive/scope) | Fora do escopo | Cobertura depois | Invocações | Custo (US$) | Tempo |
|----------|--------|-----------------------------------------------|----------------|------------------|------------|-------------|-------|
| 1 | passed | ✓ ✓ ✓ ✓ ✓ | 0 | 100% | 4 | 3.8283 | 424.3 s |
| 2 | passed | ✓ ✓ ✓ ✓ ✓ | 0 | 100% | 4 | 4.156 | 438.2 s |
| 3 | passed | ✓ ✓ ✓ ✓ ✓ | 0 | 100% | 4 | 4.3291 | 489.9 s |
| 4 | passed | ✓ ✓ ✓ ✓ ✓ | 0 | 100% | 4 | 4.0557 | 454 s |
| 5 | passed | ✓ ✓ ✓ ✓ ✓ | 0 | 100% | 4 | 4.3288 | 553.8 s |

