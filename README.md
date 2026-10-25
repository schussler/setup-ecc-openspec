# SpecLoop — framework de desenvolvimento orientado a specs para Claude Code

**SpecLoop** é um framework que combina **[OpenSpec](https://github.com/Fission-AI/OpenSpec)** (desenvolvimento orientado a especificações, ou *Spec-Driven Development*) com **[ECC — Everything Claude Code](https://github.com/affaan-m/everything-claude-code)** (agentes, skills, rules e hooks para Claude Code), mais um pipeline com gates verificáveis: `spec-create` → `spec-implement` → `spec-archive` → `pr`.

A regra central: **zero código sem spec**. Toda funcionalidade nasce como uma especificação em `openspec/changes/`, é implementada com TDD e validação contínua seguindo os padrões ECC, e é arquivada ao concluir.

## Instalação

Um único CLI instala e atualiza o framework. Não é preciso clonar este repositório.

| Comando | Quando usar | O que faz |
|---------|-------------|-----------|
| `npx @k0d3r/specloop init <dir>` | começar um projeto novo | cria `<dir>` (vazio ou inexistente) com git, o toolset, os modelos de `docs/agents/`, `template.json` e o primeiro commit |
| `npx @k0d3r/specloop adopt` | seguir um projeto existente | mostra o plano (toolset, `docs/agents/`, `checks`, permissões, blocos do `CLAUDE.md`) e aplica só os itens que você confirmar, sem remover nada |
| `npx @k0d3r/specloop install` | só o toolset no repositório atual | copia os caminhos `managed` (rules, agents, skills, comandos, gates e harness); não toca em `CLAUDE.md`, `docs/agents/` nem `.claude/settings.json` |
| `npx @k0d3r/specloop@latest update` | buscar atualização do framework | mostra o que muda nos caminhos `managed`, aplica após confirmação e grava a versão em `template.json` → `framework` |

Opções comuns:
- `--yes`: confirma tudo sem perguntar (automação e modo headless).
- `init`: `--name <nome>`, `--description "<texto>"`, `--languages "typescript python"` (rules de linguagem; `common` vem sempre), `--checks-test`, `--checks-lint`, `--checks-typecheck`, `--checks-test-file`, `--checks-coverage`, `--checks-test-report` e `--suite`.
- `adopt`: os mesmos `--checks-*`; sem eles, usa os comandos detectados no projeto (`package.json`, `pyproject.toml`, `go.mod`).
- `install`: `--languages`.

Nenhum comando escreve antes da confirmação, e nenhum escreve em caminhos próprios do projeto (`owned`). Projetos criados antes do CLI, com `template.repo` no `template.json`, passam a usar `framework` no primeiro `update`.

Dentro do Claude Code, as skills `/new-project`, `/template-migrate` e `/template-update` chamam o mesmo CLI (`init`, `adopt` e `update`).

## Conceitos

| Camada | Papel |
|--------|-------|
| **OpenSpec** | Gerencia *o que* construir: propostas, specs, design e tarefas versionados em `openspec/`. É a fonte da verdade dos requisitos. |
| **ECC** | Governa *como* construir: rules em `.claude/rules/` (TDD, estilo, segurança, code review) e agentes especializados (planner, tdd-guide, code-reviewer, etc.). |
| **CLAUDE.md** | Instruções que o Claude Code carrega em toda sessão, conectando as duas camadas. |
| **docs/agents/** | Contexto de engenharia que o agente lê antes de agir: `architecture.md`, `domain.md` e `issue-tracker.md` (log e ponto de restauração). Projetos novos recebem os modelos de `templates/docs/agents/`. |
| **scripts/gates/** | Gates com pontuação verificável (implementação, arquivamento, PR, escopo). Os comandos vêm de `template.json` → `checks`. |

Cada mudança (*change*) no fluxo `spec-driven` produz quatro artefatos:

1. `proposal.md` — por quê e o quê (critérios de aceite)
2. `specs/<capability>/spec.md` — requisitos de comportamento (delta; opcional em mudanças sem comportamento novo)
3. `design.md` — decisões técnicas de como implementar
4. `tasks.md` — checklist de implementação, executado em ordem

## Pré-requisitos

- **[Claude Code](https://claude.com/claude-code)** instalado e autenticado
- **CLI do OpenSpec 1.14.3** disponível no PATH (`openspec --version` para conferir; é a versão registrada em `template.json`). O perfil de workflows é global na máquina: rode `openspec config profile core` uma vez, para ter o workflow `update` junto com os demais
- **Node 22+** e **npm** (para o `npx`), usados também pelos gates (`scripts/gates/`) e pela migração; o pacote não tem dependências npm
- **git**, para `init`, `adopt` e `install`

## Manutenção do framework e dos projetos

Cada projeto SpecLoop guarda um `template.json` com a origem (`framework.package` e `framework.version`), as versões de ECC e OpenSpec, a lista de caminhos gerenciados (`managed`, atualizados pelo `update`) e a de caminhos próprios (`owned`, nunca sobrescritos: `CLAUDE.md`, `README.md`, `openspec/config.yaml`, `openspec/changes/`, `openspec/specs/`, `.claude/rules/project/`, `docs/agents/` e `.claude/settings.json`). Ele também guarda os `checks`: os comandos de teste, lint e tipos que os gates usam. No repositório do framework, `template_only` lista o que só existe aqui (benchmark, suíte, modelos) e não vai para os projetos.

| Skill | Onde rodar | O que faz |
|-------|-----------|-----------|
| `/template-update` | projeto SpecLoop | Chama `npx @k0d3r/specloop update`: compara os caminhos gerenciados com o pacote, mostra o que mudaria e aplica só depois da sua confirmação |
| `/template-migrate` | projeto SpecLoop | Chama `npx @k0d3r/specloop adopt`. Traz o que o `/template-update` não escreve: blocos do pipeline no `CLAUDE.md`, `docs/agents/`, permissões em `.claude/settings.json`, `checks` e caminhos gerenciados novos (como `scripts/gates`). Mostra o plano e aplica item a item, só com confirmação, sem remover nada |
| `/template-check` | este repositório | Valida o manifest, os caminhos, as versões e a ausência de caminhos pessoais e segredos |
| `/upstream-sync-check` | este repositório | Compara rules, agents, skills e workflows com os upstreams ECC, OpenSpec e `mattpocock/skills` e lista o que está desatualizado |
| `/toolset-retro` | qualquer um | Retrospectiva do toolset `.claude/` ao fim de uma sessão |

Em um projeto criado antes do pipeline com gates, rode `npx @k0d3r/specloop@latest update` e depois `npx @k0d3r/specloop adopt`.

Para corrigir uma rule de origem ECC só num projeto, não edite o arquivo de origem: ele é sobrescrito na próxima atualização. Crie a rule local em `.claude/rules/project/`, que é um caminho próprio do projeto.

## Pipeline com gates

O fluxo do dia a dia são quatro skills. As `spec-*` são wrappers finos sobre os comandos `/opsx:*` descritos na próxima seção:

| Passo | Skill | Gate (script) | Aprova quando |
|-------|-------|---------------|---------------|
| 1 | `spec-create` | `openspec validate --strict` | a change é válida |
| 2 | `spec-implement` | `scripts/gates/implement-gate.mjs` | testes novos e antigos em 100%, 0 erro de lint e de tipo |
| 3 | `spec-archive` | `scripts/gates/archive-gate.mjs` | 100% dos cenários têm teste de mesmo nome, e a suíte passa |
| 4 | `pr` (só sob pedido) | `scripts/gates/pr-gate.mjs` | nenhuma change ativa, `git status` limpo e testes passando |

Cada gate permite até 3 correções e para se a pontuação não melhorar. As tentativas ficam em `openspec/changes/<change>/gates.json` (modo `legacy`, gravado pela CLI com `--legacy-write`). A tabela de gates de `docs/agents/issue-tracker.md` é derivada desse estado e não se edita à mão. Preencha `checks` em `template.json` antes do primeiro `spec-implement`.

Limite de isolamento: a v1 não isola o executor do avaliador. A separação de papéis não é isolamento, o bloqueio de execução é advisory, e um executor com a mesma conta pode alterar arquivos e hashes. O runner (`scripts/harness/`) só assume execuções depois do marco de adoção, registrado por decisão humana em `docs/agents/issue-tracker.md`; até lá, todas as execuções ficam em `legacy`.

Para encerrar uma sessão, `handoff` grava o ponto de restauração em `docs/agents/issue-tracker.md`, de onde a próxima sessão retoma.

**Modo headless.** As skills rodam sem perguntas por `claude -p "/<skill> --headless <argumento>"`. As permissões vêm de `.claude/settings.json` → `permissions.allow`, passadas com `--allowedTools` (o Claude Code ignora a lista do projeto enquanto o workspace não for confiável), e o modo é `--permission-mode dontAsk`. Nunca se usa `--dangerously-skip-permissions` nem `--bare`, e os hooks do ECC continuam ativos. A lista do template não libera `rm`, `git push`, `git -C` nem `gh`. Cada passo roda um comando simples por chamada, porque as permissões casam o comando literalmente.

Partes de `spec-create`, `spec-implement`, `pr` e `handoff` são adaptadas de [`mattpocock/skills`](https://github.com/mattpocock/skills) (MIT; ver o `NOTICE.md` de cada skill).

### Benchmark do pipeline

`node scripts/benchmark/run.mjs --scenario <cenário>` roda o pipeline sem intervenção humana, por `claude -p`, N vezes. Depois, reavalia cada gate no diretório da execução, sem confiar no que o agente relatou.

| Cenário | O que roda | Mede |
|---|---|---|
| `greenfield` | diretório vazio → `/new-project --non-interactive` → `spec-create --headless` → `spec-implement` → `spec-archive` | o pipeline completo num projeto novo |
| `legacy` | fixture `legacy-pricing` (sem OpenSpec), com e sem `docs/agents/` | regressão numa refatoração de legado |
| `legacy-billing` | fixture `legacy-billing`, com e sem `docs/agents/`, mais testes ocultos | se o contexto em `docs/agents/` muda o resultado: três regras existem só lá, e testes que o agente não vê formam o gate informativo `hidden` |
| `archive-only` | snapshot com a implementação aprovada → só `spec-archive` | o passo de arquivamento, a 1 invocação por execução |

`--scenario all` roda `greenfield` e `legacy`. Os padrões são N=5, até 60 invocações e 25 min por invocação; `--n`, `--max-invocations`, `--timeout-min`, `--concurrency` e `--model` mudam isso.

Cada cenário grava `report.json` e `report.md` com:
- pass/fail por gate, tempo por etapa, cobertura antes e depois e arquivos fora de `scoped_paths`;
- custo, invocações e **modelo efetivo** de cada invocação (o padrão da conta pode mudar entre rodadas);
- negações de comando composto;
- a comparação com e sem `docs/agents/`;
- os critérios de `acceptance` da tarefa.

O status é `complete`, `partial` ou `budget_exhausted`. O limite de uso da conta conta como orçamento esgotado, não como falha de gate.

Nos cenários de legado, o projeto recebe só o toolset do pipeline (skills `spec-*`, `handoff` e `openspec-*`, comandos `opsx`, rules comuns e `scripts/gates`), para não pagar as ~300 skills em cada turno. O runner só existe no template (`template_only`). Resultados de 2026-10-23 em `scripts/benchmark/reports/2026-10-23/`.

## Fluxo de trabalho de uma mudança

O ciclo completo usa os comandos experimentais `/opsx:*` dentro do Claude Code (a CLI `openspec`, estável, serve de apoio em qualquer etapa):

### 1. Propor — `/opsx:propose <descrição>`

Descreva o que quer construir. O agente cria o change em `openspec/changes/<nome>/` e gera todos os artefatos de planejamento (proposal, specs, design, tasks). Mudanças puramente documentais ou de tooling podem declarar `skip_specs: true` no `.openspec.yaml` do change.

### 2. Revisar os artefatos

Leia e ajuste os artefatos gerados — eles são a fonte da verdade da implementação. Valide a integridade:

```bash
openspec validate <nome-do-change>
openspec status --change <nome-do-change>
```

### 3. Implementar — `/opsx:apply`

O agente executa `tasks.md` na ordem, marcando cada caixa (`- [x]`) ao concluir. Nesta etapa valem os padrões ECC (ver [Padrões ECC](#padrões-ecc-durante-a-implementação)): TDD rigoroso, escopo atômico (uma task por vez, sem refatorações fora do escopo) e validação contínua (lint, tipos e testes após cada task).

### 4. Arquivar — `/opsx:archive`

Com todas as tasks concluídas, o change é movido para `openspec/changes/archive/` e as specs principais em `openspec/specs/` são atualizadas.

Comandos auxiliares úteis durante o ciclo: `/opsx:explore` (investigar antes de propor) e `/opsx:sync` (sincronizar specs).

## Padrões ECC durante a implementação

As rules em `.claude/rules/` são a fonte da verdade — o resumo abaixo apenas orienta:

- **TDD obrigatório** (`common/testing.md`): teste falhando antes da implementação (RED → GREEN → IMPROVE), cobertura mínima de 80%.
- **Estilo** (`common/coding-style.md`): imutabilidade, KISS/DRY/YAGNI, funções < 50 linhas, arquivos focados.
- **Code review** (`common/code-review.md`): revisão após escrever código; issues CRITICAL bloqueiam merge.
- **Segurança** (`common/security.md`): checklist antes de qualquer commit (sem segredos hardcoded, inputs validados, etc.).
- **Git** (`common/git-workflow.md`): conventional commits (`feat:`, `fix:`, `chore:`, ...).
- **Fluxo de desenvolvimento** (`common/development-workflow.md`): pesquisar soluções existentes antes de escrever código novo.

Agentes especializados (`common/agents.md`) apoiam cada etapa: **planner** (planejamento de features complexas), **tdd-guide** (novas features e correções), **code-reviewer** (após escrever código), **security-reviewer** (antes de commits sensíveis), **build-error-resolver** (build quebrado), entre outros.

## Referência rápida de comandos

| Comando | Uso |
|---------|-----|
| `/opsx:propose <descrição>` | Criar change com todos os artefatos de planejamento |
| `/opsx:apply [nome]` | Implementar as tasks do change |
| `/opsx:archive` | Arquivar change concluído |
| `/spec-create <descrição>` | Entrevista e cria a change (`--headless` assume premissas) |
| `/spec-implement [nome]` | TDD tarefa por tarefa e gate de implementação |
| `/spec-archive [nome]` | Gate de arquivamento, arquivamento e sync das specs |
| `/pr` | PR com gate e confirmação; só sob pedido |
| `/handoff` | Grava o ponto de restauração para a próxima sessão |
| `/new-project` | Criar um projeto novo (chama `npx @k0d3r/specloop init`) |
| `/template-update` | Atualizar um projeto (chama `npx @k0d3r/specloop update`) |
| `/template-migrate` | Adotar o pipeline num projeto existente (chama `npx @k0d3r/specloop adopt`) |
| `/template-check` | Validar o framework antes de publicá-lo |
| `/upstream-sync-check` | Ver o que está desatualizado em relação ao ECC, ao OpenSpec e ao `mattpocock/skills` |
| `/toolset-retro [foco]` | Retrospectiva do toolset `.claude/` ao fim de uma sessão: aplica ajustes e adia o resto como change |
| `openspec list` | Listar changes ativos |
| `openspec validate <nome>` | Validar integridade de um change |
| `openspec status --change <nome>` | Status dos artefatos de um change |
| `openspec show <nome>` | Exibir um change ou spec |
| `openspec archive <nome>` | Arquivar via CLI (equivalente ao `/opsx:archive`) |
| `openspec doctor` | Diagnóstico do root OpenSpec |
| `node scripts/gates/implement-gate.mjs <baseline\|score> --change <nome>` | Gate de implementação (as skills chamam) |
| `node scripts/gates/archive-gate.mjs --change <nome>` | Gate de arquivamento |
| `node scripts/gates/pr-gate.mjs` | Gate de PR |
| `node --test "scripts/test/**/*.test.mjs"` | Suíte do template |
| `node scripts/benchmark/run.mjs --scenario <cenário>` | Benchmark do pipeline (só no template) |

> Os comandos `/opsx:*` são o fluxo experimental do OpenSpec e podem evoluir; os comandos da CLI `openspec` são estáveis.

## Estrutura de diretórios

```
.
├── CLAUDE.md                # Contrato do agente: fluxo OpenSpec + padrões ECC
├── CLAUDE.ecc.md            # CLAUDE.md original do ECC upstream (referência)
├── README.md                # Este guia
├── .github/                 # CI de PR, publicação no npm e regra da main (só no repositório)
├── package.json             # Pacote npm specloop (bin e files)
├── template.json            # Versão do framework, upstreams, managed/owned/template_only e checks
├── bin/specloop.mjs         # CLI: npx @k0d3r/specloop <install|init|adopt|update>
├── docs/agents/             # Contexto do agente (do template; projetos recebem os modelos)
├── templates/docs/agents/   # Modelos TBD copiados pelo init e pelo adopt
├── scripts/
│   ├── ci/                  # run-checks e should-publish, usados pelos workflows
│   ├── cli/                 # Comandos do CLI (vão no pacote, não nos projetos)
│   ├── gates/               # Gates do pipeline (vão para os projetos)
│   ├── benchmark/           # Runner, tarefas, fixtures e relatórios (só no template)
│   └── test/                # Suíte do template (node --test)
├── .claude/
│   ├── settings.json        # permissions.allow do pipeline (usado também no headless)
│   ├── commands/            # /opsx:* e /toolset-retro
│   ├── agents/              # Agentes ECC
│   ├── skills/              # Skills ECC, OpenSpec, pipeline spec-* e manutenção do template
│   └── rules/
│       ├── openspec.md      # Regra de integração com OpenSpec
│       ├── README.md        # Como instalar/estender as rules ECC
│       └── common/          # Rules universais (TDD, estilo, segurança, git...)
└── openspec/
    ├── config.yaml          # Configuração (schema padrão: spec-driven)
    ├── specs/               # Specs principais (estado atual do sistema)
    └── changes/             # Changes ativos (um diretório por mudança)
        └── archive/         # Changes concluídos
```

## Publicação

O pacote `@k0d3r/specloop` é publicado no npm pela CI, nunca da máquina de alguém (exceto a primeira vez). O fluxo:

1. Toda mudança chega à `main` por PR. O workflow `ci` (`.github/workflows/ci.yml`) roda `test`, `lint` e `typecheck` de `template.json` → `checks` sem nenhuma credencial, e o merge exige o check `ci` verde.
2. O merge dispara `.github/workflows/publish.yml`, no environment `npm`. Ele roda os checks de novo e `scripts/ci/should-publish.mjs`: se a versão do `package.json` ainda não está no npm, publica com `npm publish --provenance --access public` por trusted publishing (OIDC, sem token); se já está, não faz nada. Para publicar, suba a versão do `package.json` na PR.

Não há caminho de publicação fora disso: push direto e force push na `main` são bloqueados para todos, um fork não recebe o token OIDC do repositório, e o environment `npm` só aceita a branch `main`.

### Configuração única (dono do repositório)

Rode na ordem. Os passos 1 a 7 dependem de permissão de administrador no GitHub e de dono do pacote no npm.

1. **Renomear o repositório:** `gh repo rename specloop` (no clone do repositório atual).
2. **Criar o environment `npm` restrito à `main`:** em Settings → Environments, crie `npm` e, em "Deployment branches and tags", escolha "Selected branches and tags" com a regra `main`. Pela CLI:
   ```bash
   gh api repos/schussler/specloop/environments/npm --method PUT --input - <<< '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'
   gh api repos/schussler/specloop/environments/npm/deployment-branch-policies --method POST -f name=main -f type=branch
   ```
3. **Primeira publicação, manual** (o trusted publisher só pode ser configurado num pacote que já existe): com 2FA ativo na conta npm, `npm login` e, na raiz do repositório na `main`, `npm publish --access public`.
4. **Trusted publisher:** `npm trust github @k0d3r/specloop --file publish.yml --repo schussler/specloop --env npm --allow-publish` (ou, no npmjs.com, Package → Settings → Trusted publishing, com o environment `npm`).
5. **Bloquear publicação por token:** no npmjs.com, Package → Settings → Publishing access, escolha "Require two-factor authentication and disallow tokens", e revogue tokens antigos em Access Tokens.
6. **Regra da `main`** (exige PR e o check `ci`, bloqueia force push e exclusão, sem exceção): `gh api repos/schussler/specloop/rulesets --method POST --input .github/rulesets/main.json`.
7. **Workflows de quem é de fora:** em Settings → Actions → General → "Approval for running fork pull request workflows from contributors", escolha "Require approval for all outside collaborators".

Ative também 2FA na conta do GitHub. O que nenhuma configuração cobre: uma PR maliciosa que o dono mergeie publica. A revisão antes do merge é a defesa.

## Créditos

O SpecLoop é construído sobre três projetos abertos, e não existiria sem eles:

| Projeto | O que o SpecLoop usa | Licença |
|---------|----------------------|---------|
| [Everything Claude Code (ECC)](https://github.com/affaan-m/everything-claude-code), de `affaan-m` | rules, agentes e skills em `.claude/` | MIT |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec), de `Fission-AI` | CLI, workflows `/opsx:*` e o formato de specs e changes em `openspec/` | MIT |
| [mattpocock/skills](https://github.com/mattpocock/skills), de `mattpocock` | partes das skills `spec-create`, `spec-implement`, `pr` e `handoff` (ver o `NOTICE.md` de cada uma) | MIT |

As versões vendorizadas ficam em `template.json` → `upstreams`, e `/upstream-sync-check` mostra o que mudou desde então.

## Licença

SpecLoop é distribuído sob a licença MIT (ver [`LICENSE`](LICENSE)). O conteúdo vindo dos projetos acima mantém a licença MIT de origem.

## Para aprofundar

- [`CLAUDE.md`](CLAUDE.md) — diretrizes que o agente segue neste repositório
- [`.claude/rules/README.md`](.claude/rules/README.md) — estrutura e instalação das rules ECC
- [OpenSpec](https://github.com/Fission-AI/OpenSpec) — documentação e CLI
- [Everything Claude Code](https://github.com/affaan-m/everything-claude-code) — projeto upstream do ECC
- [Claude Code](https://code.claude.com/docs) — documentação oficial
