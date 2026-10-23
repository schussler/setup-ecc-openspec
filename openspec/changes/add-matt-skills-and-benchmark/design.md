# Design

## Context

O template (`schussler/setup-ecc-openspec`) gera projetos com `/new-project` e os mantém com `/template-update`, e o `template.json` divide os caminhos em `managed` e `owned`. Até aqui o repositório só tinha prompts (skills, rules, comandos), sem nenhum script nem teste. Ver `proposal.md` para a motivação.

Estado verificado no início (2026-10-23):

- `openspec --version`: 1.14.3.
- `template-check`: READY. Os 8 checks passaram, com 2 notas: a menção a `/private/tmp/claude-` vem do texto do próprio check, e os `opsx/*.md` não têm `generatedBy`, que é o formato do upstream.
- Perfil global do OpenSpec: `custom`, com os workflows `propose, explore, apply, sync, archive`. Não foi alterado. Como `archive` está no perfil, `/opsx:archive` está disponível. Mesmo assim, o modo headless usa a CLI `openspec archive <change> --yes`, porque não depende do perfil.
- `anthropic-skills:grill-me` não está disponível nesta máquina. O `spec-create` usa o roteiro embutido.
- `claude` 2.1.309, `node` v24.21.0 e `gh` 2.102.0.

## Goals / Non-Goals

**Goals:**

- Gates com pontuação calculada por script, nunca por autoavaliação do agente.
- O mesmo pipeline roda no dia a dia (interativo) e por `claude -p` (headless), sem pular gates.
- O benchmark mede a taxa de sucesso, o custo e a variação entre execuções, e compara legado com e sem `docs/agents/`.

**Non-Goals:**

- Migrar projetos derivados existentes. `CLAUDE.md` e `docs/agents/` são `owned`, então a mudança chega a eles só por migração explícita.
- Suportar todo framework de testes. A contagem de testes reconhece os formatos do `node --test`, do jest/vitest e do pytest, e nos demais casos usa o código de saída por arquivo.
- Abrir PR ou fazer push. A skill `pr` é entregue, mas só roda sob pedido.

## Decisions

### D1. Skills `spec-*` são wrappers finos sobre `/opsx:*`

`spec-create` chama `/opsx:propose`, `spec-implement` chama `/opsx:apply` e `spec-archive` chama `/opsx:archive`. Cada uma acrescenta só o que o OpenSpec não tem: a entrevista, os gates, o registro em `issue-tracker.md` e o modo headless. Se um comando `/opsx:*` não estiver disponível, o fallback é a CLI: `openspec new change` + `openspec instructions`, `openspec status`/`openspec instructions apply` e `openspec archive <change> --yes`, respectivamente.
*Alternativa descartada:* reescrever a lógica de propose/apply/archive. Isso duplicaria código gerado pelo OpenSpec, que o `openspec update` sobrescreve.

### D2. Gates em scripts Node, em `scripts/gates/` (managed)

A pontuação vem de scripts determinísticos que imprimem JSON. As skills chamam os scripts e não calculam nada sozinhas. `scripts/gates` entra em `managed`, então chega aos projetos pelo `/template-update`. Os testes desses scripts ficam em `scripts/test/` (só no template), para que a suíte de um projeto derivado com jest ou vitest não tente rodá-los.
*Alternativas descartadas:* guardar os scripts dentro do diretório de uma skill, o que acoplaria gates compartilhados a uma skill só; ou deixar a pontuação a cargo do próprio agente, que não é verificável.

### D3. Suíte do template: JavaScript ES module, `node --test`, sem dependências

- `checks.test`: `node --test "scripts/test/**/*.test.mjs"`.
- `checks.lint`: `node scripts/gates/lint.mjs`. Valida o frontmatter das skills, o `name` igual ao diretório e os JSON do manifesto e do `.claude/settings.json`.
- `checks.typecheck`: `node scripts/gates/syntax-check.mjs scripts`.

**Limitação registrada:** JavaScript não tem checador de tipos sem dependência. Por isso o "gate de tipo" do template é `node --check` em cada script, que só detecta erro de sintaxe. Erro de tipo em tempo de execução só aparece nos testes.

### D4. Campo `checks` no manifesto

```json
"checks": {
  "test": "<suíte completa>",
  "test_file": "<roda um arquivo; contém {file}>",
  "lint": "<lint>",
  "typecheck": "<tipos>",
  "coverage": "<opcional; imprime a tabela de cobertura>"
}
```

- `test`, `lint` e `typecheck` são obrigatórios para os gates. Se um deles faltar ou estiver vazio, o gate falha com `checks.<campo> não definido em template.json`.
- O `/new-project` grava os comandos informados e deixa vazio o que não foi informado. Não grava `TBD`, para não parecer um comando válido.
- `test_file` é opcional. Sem ele, o gate de implementação não consegue separar testes novos de antigos, roda a suíte inteira uma vez e exige 100% nas duas medidas (o relatório marca `split: false`).

### D5. Baseline e "testes novos" vs "antigos"

`implement-gate.mjs baseline --change <c>` grava em `openspec/changes/<c>/gates.json` a lista de arquivos de teste existentes. Arquivo de teste é o que casa com `*.test.*`, `*.spec.*`, `test_*.py`, `*_test.py` ou `*_test.go`, fora de `.claude/` e `openspec/`. O toolset vendorizado traz testes de exemplo (por exemplo, `skill-comply/tests/test_*.py`) que não são do projeto. Isso foi encontrado na primeira avaliação real do gate, na Fatia 3. Nas avaliações seguintes:

- o que está no baseline é "antigo";
- o resto é "novo".

A contagem por arquivo vem da saída do runner (`node --test`, jest/vitest, pytest). Se o formato não for reconhecido, vale o código de saída, e o arquivo conta como 1 teste.
*Alternativa descartada:* usar uma referência git como baseline. Um projeto recém-criado pode não ter commits na change, e a lista de arquivos é mais simples e não depende do git.

### D6. Ciclo de autocorreção imposto pelo script

As regras abaixo são constantes do script, não argumentos, para que um limiar não possa ser afrouxado pela linha de comando:

- `MAX_CORRECTIONS = 3`, ou seja, no máximo 4 avaliações por sessão de gate, contando a inicial;
- `REQUIRED_PCT = 100`;
- `MAX_ERRORS = 0`.

Cada avaliação é gravada em `gates.json`. A pontuação de melhora é `failures = testes antigos falhando + testes novos falhando + erros de lint + erros de tipo`. Os vereditos são:

- `pass`: todas as condições foram atendidas;
- `retry`: a avaliação reprovou, ainda há tentativa e houve melhora;
- `stop`: a avaliação reprovou e já houve 3 correções, ou `failures` não diminuiu em relação à avaliação anterior.

`gates.json` é arquivado junto com a change, o que deixa o histórico de tentativas auditável. Um baseline novo abre uma sessão nova de gate e move a anterior para `implement.history`. Numa change em fatias, cada fatia tem a própria sessão, e os testes das fatias anteriores contam como antigos. A skill também copia cada tentativa (o que falhou, o que mudou e a nova pontuação) para `docs/agents/issue-tracker.md`.

### D7. Gate de arquivamento

Primeiro o gate de arquivamento verifica duas pré-condições: o último veredito de implementação em `gates.json` é `pass`, e `checks.test` passa. Depois extrai os `#### Scenario:` das specs da change e procura cada nome, normalizado (sem acentos, minúsculo, pontuação vira espaço), no texto normalizado dos arquivos de teste. Aprova somente com 100%. A suíte completa entra porque um teste escrito para cobrir um cenário depois do gate de implementação também precisa passar.
*Alternativa descartada:* anotar a ligação teste↔cenário com IDs. A correspondência pelo nome foi pedida explicitamente e não exige convenção nova.

### D8. Arquivamento

O destino é `openspec/changes/archive/<data>-<change>/`, o caminho padrão da CLI 1.14.3 neste repo. O `spec-archive` usa `/opsx:archive` no modo interativo e `openspec archive <change> --yes` no headless. Depois roda `openspec-sync-specs` só se ainda houver delta não aplicado em `openspec/specs/`. A CLI já aplica os deltas no arquivamento, então o sync normalmente não tem o que fazer.

### D9. Manifesto: `owned`, `template_only` e `scoped_paths`

- `owned` ganha `docs/agents` e `.claude/settings.json`. O `CLAUDE.md` já estava lá.
- **Novo campo `template_only`:** caminhos que só fazem sentido no template e que o `/new-project` remove do projeto gerado: `templates`, `scripts/benchmark`, `scripts/test`, `openspec/specs` e `openspec/changes/archive`. Os dois últimos existem para que o projeto novo não herde as specs do próprio template. O `CLAUDE.ecc.md` continua sendo removido no passo próprio que já existia.
- **Novo campo `scoped_paths`:** lista de prefixos de caminho que uma execução do pipeline pode alterar. Ele é opcional no `template.json` (padrão do projeto) e obrigatório em cada tarefa de benchmark (`scripts/benchmark/tasks/<id>/task.json`), onde tem precedência. A checagem de escopo (`scripts/gates/scope-check.mjs`) compara arquivos alterados, adicionados e não rastreados desde uma referência git. No benchmark, o resultado precisa ser 0.

### D10. `docs/agents/` do template e modelos

O template tem dois conjuntos:

- `docs/agents/`: o contexto do próprio template, preenchido. O `issue-tracker.md` dele é o log desta mudança.
- `templates/docs/agents/`: os modelos com `TBD`.

O `/new-project` sobrescreve `docs/agents/` do destino com os modelos e remove `templates/`.
O formato dos arquivos segue `setup-matt-pocock-skills` (issue tracker local e documentos de domínio), adaptado: o issue tracker é um log de trabalho em Markdown, com ponto de restauração. Não usa GitHub Issues, porque o pipeline headless não pode depender de credencial.

### D11. Licença do `mattpocock/skills`

O `LICENSE` foi inspecionado no commit `5beb35b040e3de97e54fa9e386d7e42d15c295c2` (v1.3.1, 2026-10-19): **MIT**, "Copyright (c) 2026 Matt Pocock". É compatível. O commit fica registrado em `upstreams.mattpocock-skills` e o `upstream-sync-check` passa a compará-lo. As skills adaptadas são:

| Skill | Origem |
|-------|--------|
| `spec-create` | `grilling` / `grill-me` (roteiro de entrevista) |
| `spec-implement` | `tdd` |
| `pr` | `pr` (corpo da PR) |
| `handoff` | `handoff` |

Cada uma leva `NOTICE.md` com o texto MIT e o commit. O conteúdo foi adaptado, não copiado na íntegra, porque o upstream assume GitHub Issues e um fluxo próprio de tickets.

### D12. Modo headless

O runner chama:

```
claude -p "<prompt que nomeia a skill> <argumento de tarefa>" \
  --output-format json --permission-mode dontAsk [--add-dir <dir>] [--model <m>]
```

- As permissões vêm de `.claude/settings.json` do projeto (`permissions.allow`). Com `dontAsk`, uma ferramenta fora da lista é negada, em vez de travar esperando resposta.
- **Verificado na Fatia 5:** o Claude Code ignora o `permissions.allow` de um projeto até o workspace ser marcado como confiável ("this workspace has not been trusted"). Marcar cada diretório do benchmark como confiável exigiria editar o `.claude.json` global do usuário, o que não foi feito. Por isso o runner lê `permissions.allow` do `.claude/settings.json` do projeto e repassa a lista com `--allowedTools`. A lista continua definida no projeto. A sonda confirmou três coisas: a skill nomeada no prompt (`/ping probe-46`) roda; um comando fora da lista (`touch`) é negado; e os hooks disparam no `-p` (26 eventos de hook com `--include-hook-events`).
- **Lista do template:** git sem `push` e sem `-C`, sem `gh`, sem `rm`, sem Bash irrestrito. Ela também vale nas sessões interativas, então não libera nada destrutivo. O passo `new-project` do benchmark recebe, só para aquele destino, `Bash(rm -rf <target>:*)` e `Bash(git -C <target>:*)`.
- Nunca usa `--dangerously-skip-permissions`.
- Nunca usa `--bare`, porque ele desliga hooks. Os hooks do ECC continuam ativos.
- `--output-format json` traz `total_cost_usd`, `duration_ms`, `num_turns` e `is_error`, que vão para o relatório.

O `/new-project` ganha `--non-interactive`: todas as entradas vêm dos argumentos, não há perguntas, o commit é feito sem confirmação, e `--template-source` aceita um caminho local para o benchmark rodar contra a branch não publicada.

### D13. Orçamento e paralelismo do benchmark

- **Padrões:** N = 5 por cenário, no máximo 60 invocações de `claude -p` no total e 25 minutos por invocação.
- **Invocações por execução:** o greenfield usa 4 (`new-project`, `spec-create`, `spec-implement`, `spec-archive`) e o legado usa 3 (sem `new-project`: o runner instala o toolset de forma determinística). O total previsto é 5×4 + 2×5×3 = **50**, abaixo de 60.
- **Orçamento esgotado:** o cenário para, o relatório parcial é gerado e as execuções não iniciadas ficam `not_run`, sem contar como falha de gate.
- **Tempo estourado:** uma invocação que passa de 25 minutos é encerrada (SIGTERM e, depois de 10 s, SIGKILL) e o passo falha com motivo `timeout`.
- **Paralelismo:** padrão 2, configurável, para reduzir o tempo total.

### D14. Tarefas de referência do benchmark

Registradas antes de rodar o benchmark:

- **Greenfield (`greenfield-duration`):** biblioteca ES module `src/duration.mjs`, que converte durações como `"1h30m"` e `"45s"` em segundos e rejeita entradas inválidas com erro. Os checks do projeto gerado são:
  - `test`: `node --test`;
  - `test_file`: `node --test {file}`;
  - `lint`: `node scripts/gates/lint.mjs`;
  - `typecheck`: `node scripts/gates/syntax-check.mjs src test`;
  - `coverage`: `node --test --experimental-test-coverage`.

  `scoped_paths`: `src/`, `test/`, `openspec/`, `docs/agents/`.
- **Legado (`legacy-pricing`):** a fixture `scripts/benchmark/fixtures/legacy-pricing/` é um módulo de preços com uma função longa e regras de desconto duplicadas. A refatoração extrai as regras para `src/discounts.js`, sem mudar o comportamento. A variante `with_docs` recebe um `docs/agents/` preenchido com as regras de domínio (`scripts/benchmark/fixtures/legacy-pricing.agents/`). A variante `without_docs` não recebe esse diretório. `scoped_paths`: `src/`, `test/`, `openspec/`, `docs/agents/`.

### D15. Cobertura

Se `checks.coverage` existir, o runner extrai a cobertura de linhas da tabela do `node --test --experimental-test-coverage` (linha `all files`). No greenfield, a cobertura "antes" é `n/a`, porque ainda não há código.

## Risks / Trade-offs

- [O nome do cenário é um texto livre, e o agente pode nomear o teste de outro jeito] → O gate normaliza acentos, caixa e pontuação, e a skill `spec-archive` manda reutilizar o nome literal do cenário no teste.
- [`node --check` não verifica tipos] → Registrado na D3. A cobertura dos testes compensa em parte.
- [Variação entre execuções do `claude -p`] → Aceita e medida. O relatório mostra a taxa de sucesso por N, não uma execução isolada.
- [O custo do benchmark] → Há teto de invocações e de tempo, e o custo de cada invocação entra no relatório.
- [`dontAsk` nega uma ferramenta necessária que ficou fora da lista] → O passo falha de forma visível no relatório (`permission_denials`), e a lista é ajustada em `.claude/settings.json`, nunca contornada.
- [O `gates.json` dentro da change] → O `openspec validate` ignora arquivos que não são artefatos. Isso foi verificado na Fatia 2.

## Migration Plan

- **Projetos novos:** recebem tudo pelo `/new-project`.
- **Projetos existentes:** o `/template-update` traz as skills e o `scripts/gates/`, que são `managed`. `CLAUDE.md`, `docs/agents/`, `.claude/settings.json` e `checks` são `owned`, então precisam de migração explícita: copiar os modelos e preencher `checks`.
- **Rollback:** reverter os commits da branch. Nada é publicado fora do repositório.
