# Design

## Context

Ver `proposal.md` (Why). Hoje `/new-project` monta o projeto com `git init` + `git fetch` de `template.repo`; `/template-update` clona o template no scratchpad e copia os `managed`; `/template-migrate` roda `.claude/skills/template-migrate/migrate.mjs` (`plan`, `apply`, `check-update`) contra o clone. Não há `package.json`. Os scripts são Node ≥ 22 em ES module, sem dependências npm.

As regras comuns de execução estão em `.claude/harness/policy.md` e os parâmetros em `.claude/harness/policy.json`. Este design referencia os dois e não repete valores. Nenhum parâmetro muda.

- **Comportamento novo:** sim
- **Política:** `.claude/harness/policy.md` e `.claude/harness/policy.json` (referenciados, não repetidos).

## Goals / Non-Goals

**Goals**

- Um único CLI (`npx specloop`) para instalar, iniciar, adotar e atualizar.
- Fonte dos arquivos = o próprio pacote instalado, versionado pelo npm.
- Nome SpecLoop, créditos aos upstreams, nenhum registro do nome pessoal nos arquivos versionados.

**Non-Goals**

- Não muda pipeline, gates, harness, specs, política nem `migrate.mjs` (só é chamado).
- Não reescreve o histórico do git.
- Nenhuma dependência npm; nenhum comando além dos quatro.

## Decisions

### D1. Pacote é a fonte; sem git no CLI

O CLI resolve a raiz do pacote a partir de `import.meta.url` e copia de lá. `update` com versão nova é `npx specloop@latest update`. Alternativa: o CLI fazer `git fetch` do repositório. Descartada: versão presa à branch e dependência de rede e git em cada comando.

### D2. Conteúdo do pacote por `files`, derivado do manifesto

`package.json` → `files` lista `bin/`, `scripts/cli/`, os caminhos `managed` de `template.json`, `templates/docs/agents/`, `template.json`, `CLAUDE.md` (modelo do projeto) e `README.md`. Um teste compara `files` com `managed` e garante que `template_only` (exceto `templates`) e `openspec/specs`/`openspec/changes` não entram. Alternativa: `.npmignore`. Descartada: lista de exclusão vaza caminhos novos por padrão.

### D3. Comandos

| Comando | Faz | Recusa |
|---------|-----|--------|
| `install` | copia `managed` (com as rules escolhidas, `--languages`) no diretório atual; cria `template.json` mínimo se não houver | diretório sem git; escrita em `owned` |
| `init <dir>` | `git init`, copia o pacote, poda rules e `template_only`, instala `docs/agents` dos modelos, grava `template.json` com `framework`, reescreve título do `CLAUDE.md` e `README.md`, primeiro commit após confirmação (`--yes` dispensa) | `<dir>` existente e não vazio |
| `adopt` | roda `migrate.mjs plan --template <raiz do pacote>`, pergunta item a item, roda `apply` com os confirmados | projeto sem git |
| `update` | compara `managed` com o pacote, mostra os três grupos (atualizar, adicionados, removidos), roda `check-update`, aplica após confirmação e grava `framework.version` | sem `template.json`; quando o diretório é o próprio repositório do framework; `check-update` reprovado |

Sem confirmação (resposta não "s"/"y" ou sem TTY e sem `--yes`), nenhum comando escreve.

### D4. Manifesto `framework`

`template.json` ganha `framework: { "package": "specloop", "version": "<semver>" }`. `update` lê `framework`; se só houver `template.repo` (projeto antigo), trata como versão desconhecida, compara normalmente e, aplicado, grava `framework` e remove `template.repo`. No próprio repositório do framework, `template.json` mantém `framework.package` e a versão de `package.json`.

### D5. Skills como wrappers

`/new-project` chama `npx specloop init` repassando `--non-interactive` como `--yes` e os argumentos (`--name`, `--description`, `--languages`, `--checks-*`); `--template-source <caminho>` vira executar o `bin/specloop.mjs` desse caminho. `/template-update` chama `update`; `/template-migrate` chama `adopt`. As skills mantêm a confirmação na conversa e a regra de não executar scripts de fonte não confiável: o CLI executado é o do pacote que o usuário pediu.

### D6. Nome pessoal

Fixtures de teste trocam o nome pessoal por `mantenedor`; `authorizations.json` arquivados trocam só o campo `approver`; `issue-tracker.md` usa "mantenedor". `approver` não entra em `calculateContractHash`, então as aprovações continuam válidas. Um teste de varredura (`git ls-files` + leitura) falha se encontrar o nome pessoal ou o nome antigo (sem diferenciar maiúsculas) em qualquer arquivo versionado. Os termos proibidos ficam só no teste, montados por partes (`['setup', 'ecc', 'openspec'].join('-')`), para que nenhum arquivo, inclusive esta change e as specs arquivadas, os contenha literalmente. Nos artefatos, "nome antigo" é o nome anterior do repositório e "nome pessoal" é o primeiro nome do mantenedor original.

## Interfaces e regras compartilhadas

- `bin/specloop.mjs <install|init|adopt|update> [opções]`; saída 0 em sucesso, 1 em recusa com mensagem que diz o motivo, 2 em uso inválido.
- Classificação `managed`/`owned`/`template_only` continua vindo de `template.json`, a mesma usada por `migrate.mjs` e pelos gates.
- `.harness-project.json` é `owned`: nunca copiado nem sobrescrito.

## Invariantes

- Nenhum comando escreve em caminho `owned`.
- Nenhum comando escreve antes da confirmação (ou `--yes`).
- Nenhum projeto recebe specs, changes ou arquivo de changes do framework.
- O tarball não contém `scripts/test`, `scripts/benchmark`, `openspec/specs` nem `openspec/changes`.
- Nenhuma publicação externa sem confirmação explícita do usuário no momento.

## Comportamento existente mantido

- `migrate.mjs` (`plan`, `apply`, `check-update`) e seus testes, sem mudança.
- Benchmark greenfield continua criando o projeto sem humano (via `/new-project --non-interactive`).
- Gates, harness, política e checks do `template.json`.

## Testes necessários

- `scripts/test/cli/*.test.mjs`, um teste por cenário com o mesmo nome e ID (SL-…), rodando o CLI em diretórios temporários com o pacote local como fonte.
- Teste de varredura de nomes (SL-001, SL-002).
- Teste do conteúdo do pacote com `npm pack --dry-run --json` (SL-010).
- Suíte, lint e sintaxe verdes (`template.json` → `checks`); `typecheck` passa a incluir `bin` e `scripts/cli`.

## Ambiente e sandbox

Node ≥ 22, macOS/Linux, sem rede nos testes (fonte local). `npm pack` roda local. `gh repo rename` e `npm publish` só na F5, fora da suíte, com confirmação.

## Fatias e dependências

- **F1** Identidade: renomeação, README como framework e créditos, troca do nome pessoal, teste de varredura. Sem dependência.
- **F2** Pacote e `install`/`update`: `package.json`, `bin`, `scripts/cli`, manifesto `framework`. Depende de F1 (nome).
- **F3** `init` e `adopt`, skills como wrappers, README de instalação. Depende de F2.
- **F4** Verificação do tarball: `npm pack`, `init` a partir do tarball, `openspec validate --all` no projeto gerado. Depende de F3.
- **F5** Publicação: `gh repo rename specloop`, atualizar URL, `npm publish`. Só com confirmação do usuário. Depende de F4 e do merge.

## Risks / Trade-offs

- **[Risco] Pacote leva arquivo a mais ou a menos.** → `files` explícito e teste do `npm pack --dry-run` (SL-010).
- **[Risco] Projetos antigos com `template.repo`.** → `update` aceita e converte (SL-009).
- **[Risco] `npx` executa código remoto.** → É o pacote que o usuário pediu pelo nome; sem `postinstall`, sem dependências.
- **[Risco] Edição de registros arquivados.** → Só `approver`, fora do hash; exceção registrada no `issue-tracker.md`.
- **[Trade-off] Skills viram wrappers.** → Aceito: elimina o segundo caminho de instalação.

## Migration Plan

1. F1 a F4 na branch, com a suíte verde.
2. Merge; F5 com confirmação.
3. Projetos existentes: `npx specloop update` converte o manifesto.
4. Rollback: reverter os commits; um pacote publicado é despublicado/depreciado com `npm deprecate` (decisão do usuário).

## Premissas

As mesmas de `proposal.md` → `## Premissas`.

## Open Questions

Nenhuma. As decisões de comandos, fonte, alcance da remoção do nome e publicação foram respondidas na conversa.
