# Design

## Context

Critérios aprovados pelo usuário em 2026-10-23 (pendência 1):

| Critério | Limiar |
|---|---|
| Arquivamento aprovado | 10/10 |
| `stopped_after_denial` | 0 |
| Média de `compound_denials` | ≤ 1 |
| Arquivos fora de `scoped_paths` | 0 |

O limite é de 10 rodadas.

## Decisions

- **D1. Snapshot real.** O estado vem de `with_docs-4` do benchmark de 2026-10-23. Nessa execução, a implementação passou (antigos 100%, novos 100%), e o `spec-archive` nunca rodou porque o orçamento acabou. O tracker não traz notas de falha que possam enviesar o agente. Ficaram fora `.git`, `.claude`, `scripts/` e `template.json`: o runner reinstala o toolset atual, para medir as skills corrigidas.
- **D2. Isolar o passo.** Rodar só o `spec-archive` custa 1 invocação por execução, contra 3 no legado completo, e mede exatamente onde a falha ocorreu.
- **D3. Regra de "comando composto".** Conta como composto um comando com `;`, `&&`, `||`, `$?`, `$(`, crase ou `cd` como palavra. Pipes simples não contam: eles não estavam entre as falhas observadas.
- **D4. Se reprovar.** A correção é técnica: acrescentar à lista de permissões as formas compostas que o agente sempre usa. Nunca liberar Bash irrestrito.
