# Domínio

## Glossário

| Termo | Significado | Evite |
|-------|-------------|-------|
| framework | Este repositório (SpecLoop), publicado como o pacote npm `specloop` e fonte dos projetos | "template", "boilerplate" |
| projeto SpecLoop | Repo que usa o framework, criado com `npx specloop init` ou adotado com `npx specloop adopt`; o `template.json` registra `framework` | "projeto derivado", "fork" |
| managed | Caminho que o `npx specloop update` sobrescreve nos projetos | — |
| owned | Caminho do projeto; nenhum comando do CLI escreve nele | — |
| template_only | Caminho que só existe no repositório do framework e nunca é copiado para os projetos (o CLI e os modelos vão no pacote, mas não no projeto) | — |
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

- Nenhum projeto SpecLoop herda specs ou changes do framework.
- Nada é enviado para fora (push, PR) sem pedido explícito.
- Nenhuma invocação headless usa `--dangerously-skip-permissions`.
