# Design

## Context

Ver `proposal.md`. Os critérios de aprovação vêm da pendência 3, aprovada pelo usuário em 2026-10-23:
- nada do projeto é perdido;
- a migração é idempotente;
- os gates funcionam depois;
- nenhuma escrita acontece sem confirmação;
- o `template-check` continua READY;
- piloto: migrar uma cópia do `MN_Academy` e rodar `spec-create` → `spec-implement` numa change pequena, com os gates aprovados.

O limite é de 10 rodadas.

## Decisions

### D1. O script fica no diretório da skill
`.claude/skills/template-migrate/migrate.mjs`. Projetos antigos recebem `.claude/skills` pelo `/template-update`, então o script chega antes da migração e roda localmente. Do clone do template só se leem arquivos, como já faz o `/template-update`.
*Alternativa descartada:* `scripts/template/` como `managed` novo. Não chegaria a projetos antigos, que é o problema que esta change resolve.

### D2. `plan` e `apply` separados
`plan` imprime JSON e não escreve. `apply` exige `--items` e aplica só esses itens. A skill pede a confirmação ao usuário. O script não pergunta nada, para ser testável.

### D3. Blocos marcados no `CLAUDE.md`
O template marca `<!-- template:agents-context:start -->…end` e `<!-- template:pipeline:start -->…end`. O comportamento no projeto é:
- **com marcadores:** troca só o conteúdo entre eles;
- **sem marcadores:** insere `agents-context` logo depois da primeira linha de título e `pipeline` no fim;
- **sem `CLAUDE.md`:** cria o arquivo com o título `# <project.name>` e os dois blocos.

### D4. "Nada perdido" medido semanticamente
Uma diferença de linhas acusaria a vírgula acrescentada a um array JSON. Por isso o critério é:
- **texto:** cada linha original aparece no resultado, na mesma ordem (subsequência);
- **JSON:** o original é um subconjunto profundo do resultado (arrays: todos os elementos originais presentes, na mesma ordem).

### D5. Detecção de checks
| Arquivo | Proposta |
|---|---|
| `package.json` | scripts `test` → `npm test`; `lint` → `npm run lint`; `typecheck`, `type-check` ou `tsc` → `npm run <nome>`; sem script de tipos, mas com `tsconfig.json` → `npx tsc --noEmit` |
| `pyproject.toml` | `pytest`, `pytest {file}`; `ruff check .` se houver `[tool.ruff]`; `mypy .` se houver `[tool.mypy]` |
| `go.mod` | `go test ./...`, `go vet ./...`, `go build ./...` |

Tudo é proposta: a skill confirma cada comando.
