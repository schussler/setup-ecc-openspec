# setup-ecc-openspec — Template OpenSpec + ECC

Template de referência para iniciar novos projetos combinando **[OpenSpec](https://github.com/Fission-AI/OpenSpec)** (desenvolvimento orientado a especificações — *Spec-Driven Development*) com **[ECC — Everything Claude Code](https://github.com/affaan-m/everything-claude-code)** (agentes, skills, rules e hooks para execução com Claude Code).

A regra central do template: **zero código sem spec**. Toda funcionalidade nasce como uma especificação em `openspec/changes/`, é implementada com TDD e validação contínua seguindo os padrões ECC, e é arquivada ao concluir.

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
- **Node 22+**, para os gates (`scripts/gates/`), a migração e o benchmark (sem dependências npm)
- **Rules ECC** instaladas no projeto (este template já as traz em `.claude/rules/`); para instalar em outro lugar, siga `.claude/rules/README.md`

## Inicializando um novo projeto

Use a skill **`/new-project`**. Ela cria o projeto a partir deste template e pede confirmação antes do primeiro commit:

1. Informe o diretório de destino (que não exista ou esteja vazio), o nome do projeto, uma descrição de uma linha, as linguagens que o projeto usa (ex.: `typescript python`) e os comandos de teste, lint e tipos. `common/` é sempre mantido. Comando não informado fica vazio, e o gate correspondente avisa qual campo falta.
2. A skill monta o repositório só com git (`git init`, `git fetch` do template e `git checkout FETCH_HEAD -- .`), então o projeto nasce sem o histórico do template.
3. Ela remove as rules das linguagens não escolhidas e os caminhos de `template_only`, e instala `docs/agents/` a partir dos modelos `TBD` de `templates/docs/agents/`.
4. Ela grava em `template.json` o projeto, as rules e os `checks`, reescreve o título do `CLAUDE.md` e o `README.md`, valida o OpenSpec e faz o primeiro commit.

Para automação, `--non-interactive` recebe tudo por argumentos e não pergunta nada, e `--template-source` aceita um caminho local (ver o `SKILL.md` da skill).

Para fazer à mão:

```bash
git init -b main meu-projeto
git -C meu-projeto fetch --depth 1 <url-deste-repo> main
git -C meu-projeto checkout FETCH_HEAD -- .
cd meu-projeto
git rm -r -q -f docs/agents
mkdir -p docs
git mv templates/docs/agents docs/agents
rm -r templates   # só sobraram diretórios vazios depois do git mv
git rm -r -q -f scripts/benchmark scripts/test openspec/specs openspec/changes/archive CLAUDE.ecc.md
mkdir -p openspec/specs openspec/changes
openspec validate --all
openspec config list   # confirme profile: core
```

Depois:
- preencha os campos `TBD` de `docs/agents/`;
- preencha `checks` e remova `template_only` do `template.json`;
- mantenha só as rules das linguagens que o projeto usa.

Detalhes da estrutura em `.claude/rules/README.md`.

## Manutenção do template e dos projetos derivados

Cada projeto criado a partir do template guarda um `template.json` com a origem (`template.repo` e `template.branch`), as versões de ECC e OpenSpec, a lista de caminhos gerenciados (`managed`, atualizados pelo template) e a de caminhos próprios (`owned`, nunca sobrescritos: `CLAUDE.md`, `README.md`, `openspec/config.yaml`, `openspec/changes/`, `openspec/specs/`, `.claude/rules/project/`, `docs/agents/` e `.claude/settings.json`). Ele também guarda os `checks`: os comandos de teste, lint e tipos que os gates usam. No template, `template_only` lista o que só existe aqui (benchmark, suíte do template, modelos) e é removido pelo `/new-project`.

| Skill | Onde rodar | O que faz |
|-------|-----------|-----------|
| `/template-update` | projeto derivado | Compara os caminhos gerenciados com o template, mostra o que mudaria e aplica só depois da sua confirmação |
| `/template-migrate` | projeto derivado | Traz o que o `/template-update` não escreve: blocos do pipeline no `CLAUDE.md`, `docs/agents/`, permissões em `.claude/settings.json`, `checks` e caminhos gerenciados novos (como `scripts/gates`). Mostra o plano e aplica item a item, só com confirmação, sem remover nada |
| `/template-check` | este template | Valida o manifest, os caminhos, as versões e a ausência de caminhos pessoais e segredos |
| `/upstream-sync-check` | este template | Compara rules, agents, skills e workflows com os upstreams ECC, OpenSpec e `mattpocock/skills` e lista o que está desatualizado |
| `/toolset-retro` | qualquer um | Retrospectiva do toolset `.claude/` ao fim de uma sessão |

Em um projeto criado antes do pipeline com gates, rode `/template-update` e depois `/template-migrate`.

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
| `/new-project` | Criar um projeto novo a partir do template |
| `/template-update` | Atualizar um projeto derivado a partir do template |
| `/template-migrate` | Trazer a um projeto existente o que o `/template-update` não escreve |
| `/template-check` | Validar o template antes de usá-lo como base ou publicá-lo |
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
├── template.json            # Origem, versões, managed/owned/template_only e checks
├── docs/agents/             # Contexto do agente (do template; projetos recebem os modelos)
├── templates/docs/agents/   # Modelos TBD copiados pelo /new-project
├── scripts/
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

## Para aprofundar

- [`CLAUDE.md`](CLAUDE.md) — diretrizes que o agente segue neste repositório
- [`.claude/rules/README.md`](.claude/rules/README.md) — estrutura e instalação das rules ECC
- [OpenSpec](https://github.com/Fission-AI/OpenSpec) — documentação e CLI
- [Everything Claude Code](https://github.com/affaan-m/everything-claude-code) — projeto upstream do ECC
- [Claude Code](https://code.claude.com/docs) — documentação oficial
