# Benchmark — legacy-billing (`legacy-billing`)

- **Status:** complete
- **N:** 8 por grupo
- **Invocações de `claude -p`:** 46 (orçamento 46/48)
- **Custo total:** US$ 1.7117
- **`scoped_paths`:** `src/`, `test/`, `openspec/`, `docs/agents/`
- **Início / fim:** 2026-10-23T21:16:12.582Z / 2026-10-23T21:30:09.162Z
- work dir: <work-dir>/legacy-billing
- modelo: padrão do usuário
- timeout por invocação: 25 min
- **Com vs. sem `docs/agents/`:** sucesso 62.5% vs. 87.5% (com − sem: -25 p.p.)
- **Gate hidden (regras só nos docs):** 62.5% vs. 0% (com − sem: 62.5 p.p.; conclusivo: sim)

## Critérios de aceite: aprovado

| Critério | Valor | Limiar | Resultado |
|----------|-------|--------|-----------|
| min_best_group_success_rate | 87.5 | >= 75 | ✓ |

## Grupo `with_docs`

- **Taxa de sucesso:** 62.5% (5/8 execuções completas; 0 interrompidas por orçamento; 0 não iniciadas)
- **Arquivos fora de `scoped_paths`:** 0
- **Cobertura:** antes 100% (min 100, max 100); depois 100% (min 100, max 100)
- **Custo:** US$ 1.0013 em 22 invocações
- **Negações de comando composto:** média 1.63 por execução; 3 execuções pararam após negação

| Gate | Avaliado | Aprovado | Taxa |
|------|----------|----------|------|
| bootstrap | 8 | 8 | 100% |
| spec | 8 | 7 | 87.5% |
| implement | 7 | 7 | 100% |
| archive | 7 | 5 | 71.43% |
| scope | 8 | 8 | 100% |
| hidden | 8 | 5 | 62.5% |

**Tempo por etapa (média, min, max):**

- spec-create: 101.1 s (34.7 s–139.1 s)
- spec-implement: 72.1 s (25.9 s–117.6 s)
- spec-archive: 20.1 s (12.1 s–25 s)

| Execução | Status | Gates (bootstrap/spec/implement/archive/scope/hidden) | Fora do escopo | Cobertura depois | Invocações | Custo (US$) | Tempo |
|----------|--------|-----------------------------------------------|----------------|------------------|------------|-------------|-------|
| 1 | passed | ✓ ✓ ✓ ✓ ✓ ✓ | 0 | 100% | 3 | 0.1173 | 216.3 s |
| 2 | passed | ✓ ✓ ✓ ✓ ✓ ✓ | 0 | 100% | 3 | 0.1332 | 228 s |
| 3 | passed | ✓ ✓ ✓ ✓ ✓ ✓ | 0 | 100% | 3 | 0.2196 | 252.3 s |
| 4 | passed | ✓ ✓ ✓ ✓ ✓ ✓ | 0 | 100% | 3 | 0.1034 | 196.6 s |
| 5 | failed | ✓ ✓ ✓ ✗ ✓ ✗ | 0 | 100% | 3 | 0.0999 | 150 s |
| 6 | passed | ✓ ✓ ✓ ✓ ✓ ✓ | 0 | 100% | 3 | 0.1692 | 243.5 s |
| 7 | failed | ✓ ✓ ✓ ✗ ✓ ✗ | 0 | 100% | 3 | 0.1392 | 160 s |
| 8 | failed | ✓ ✗ – – ✓ ✗ | 0 | 100% | 1 | 0.0195 | 37.1 s |

**Falhas:**

- Execução 5: gate archive reprovado
- Execução 7: gate archive reprovado
- Execução 8: gate spec reprovado

## Grupo `without_docs`

- **Taxa de sucesso:** 87.5% (7/8 execuções completas; 0 interrompidas por orçamento; 0 não iniciadas)
- **Arquivos fora de `scoped_paths`:** 0
- **Cobertura:** antes 100% (min 100, max 100); depois 100% (min 100, max 100)
- **Custo:** US$ 0.7104 em 24 invocações
- **Negações de comando composto:** média 1.63 por execução; 1 execuções pararam após negação

| Gate | Avaliado | Aprovado | Taxa |
|------|----------|----------|------|
| bootstrap | 8 | 8 | 100% |
| spec | 8 | 8 | 100% |
| implement | 8 | 8 | 100% |
| archive | 8 | 7 | 87.5% |
| scope | 8 | 8 | 100% |
| hidden | 8 | 0 | 0% |

**Tempo por etapa (média, min, max):**

- spec-create: 82.5 s (73.7 s–95 s)
- spec-implement: 70.3 s (27.8 s–94.1 s)
- spec-archive: 23.2 s (13.1 s–30.3 s)

| Execução | Status | Gates (bootstrap/spec/implement/archive/scope/hidden) | Fora do escopo | Cobertura depois | Invocações | Custo (US$) | Tempo |
|----------|--------|-----------------------------------------------|----------------|------------------|------------|-------------|-------|
| 1 | passed | ✓ ✓ ✓ ✓ ✓ ✗ | 0 | 100% | 3 | 0.0794 | 187.4 s |
| 2 | passed | ✓ ✓ ✓ ✓ ✓ ✗ | 0 | 100% | 3 | 0.0914 | 192 s |
| 3 | passed | ✓ ✓ ✓ ✓ ✓ ✗ | 0 | 100% | 3 | 0.0968 | 195.8 s |
| 4 | passed | ✓ ✓ ✓ ✓ ✓ ✗ | 0 | 100% | 3 | 0.0816 | 168.2 s |
| 5 | passed | ✓ ✓ ✓ ✓ ✓ ✗ | 0 | 100% | 3 | 0.1154 | 206.3 s |
| 6 | passed | ✓ ✓ ✓ ✓ ✓ ✗ | 0 | 100% | 3 | 0.099 | 189.9 s |
| 7 | failed | ✓ ✓ ✓ ✗ ✓ ✗ | 0 | 100% | 3 | 0.0611 | 117.7 s |
| 8 | passed | ✓ ✓ ✓ ✓ ✓ ✗ | 0 | 100% | 3 | 0.0857 | 179.9 s |

**Falhas:**

- Execução 7: gate archive reprovado


---

**Anotação posterior (não gerada pelo runner):** depois da rodada, uma invocação de `claude -p` sem `--model` respondeu com `claude-haiku-5-5`. O custo por passo (~US$ 0,01–0,13, contra ~US$ 1 nas rodadas anteriores) confirma que esta rodada rodou com Haiku, e não com o Opus das rodadas anteriores. O modelo padrão mudou depois que a conta saiu do limite de uso. O runner passou a registrar o modelo efetivo de cada invocação (`models`).
