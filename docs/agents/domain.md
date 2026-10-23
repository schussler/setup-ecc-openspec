# Domínio

## Glossário

| Termo | Significado | Evite |
|-------|-------------|-------|
| template | Este repositório, a fonte dos projetos derivados | "boilerplate" |
| projeto derivado | Repo criado com `/new-project`, com `template.json` apontando para cá | "fork" |
| managed | Caminho que o `/template-update` sobrescreve nos projetos | — |
| owned | Caminho do projeto; o `/template-update` nunca escreve nele | — |
| template_only | Caminho que só existe no template; o `/new-project` remove | — |
| upstream | Repositório de onde o conteúdo vem: ECC, OpenSpec, `mattpocock/skills` | — |
| change | Diretório em `openspec/changes/<nome>/` com proposal, design, specs e tasks | "ticket" |
| gate | Script que pontua uma etapa e aprova ou reprova | "check manual" |
| tentativa | Uma avaliação de gate registrada em `gates.json` | — |
| fatia | Incremento commitável de uma change grande | — |

## Regras de negócio

- **Pipeline:** `spec-create` → `spec-implement` → `spec-archive` → `pr`. O `pr` só roda sob pedido explícito.
- **Gates não são negociáveis:** nenhum limiar é reduzido para aprovar. Exemplo: com 99% dos testes antigos passando, o gate de implementação reprova.
- **Autocorreção:** no máximo 3 correções por gate, com parada antecipada se o número de falhas não cair.

## Invariantes

- Nenhum projeto derivado herda specs ou changes do template.
- Nada é enviado para fora (push, PR) sem pedido explícito.
- Nenhuma invocação headless usa `--dangerously-skip-permissions`.
