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
- **Rules ECC** instaladas no projeto (este template já as traz em `.claude/rules/`); para instalar em outro lugar, siga `.claude/rules/README.md`

## Inicializando um novo projeto

Use a skill **`/new-project`**. Ela cria o projeto a partir deste template e pede confirmação antes do primeiro commit:

1. Informe o diretório de destino (que não exista ou esteja vazio), o nome do projeto, uma descrição de uma linha e as linguagens que o projeto usa (ex.: `typescript python`). `common/` é sempre mantido.
2. A skill clona o template, remove o histórico, remove as pastas de rules das linguagens não escolhidas e grava em `template.json` a origem e as rules escolhidas.
3. Ela reescreve `CLAUDE.md` e `README.md` do projeto e valida o OpenSpec.

Para fazer à mão:

```bash
git clone <url-deste-repo> meu-projeto
cd meu-projeto
rm -rf .git && git init
openspec validate --all
openspec config list   # confirme profile: core
```

Depois, adapte o `CLAUDE.md` à stack do projeto (ele é o contrato que o agente segue em toda sessão) e mantenha só as rules das linguagens que o projeto usa. Detalhes da estrutura em `.claude/rules/README.md`.

## Manutenção do template e dos projetos derivados

Cada projeto criado a partir do template guarda um `template.json` com a origem (`template.repo` e `template.branch`), as versões de ECC e OpenSpec, a lista de caminhos gerenciados (`managed`, atualizados pelo template) e a de caminhos próprios (`owned`, nunca sobrescritos: `CLAUDE.md`, `README.md`, `openspec/config.yaml`, `openspec/changes/`, `openspec/specs/` e `.claude/rules/project/`).

| Skill | Onde rodar | O que faz |
|-------|-----------|-----------|
| `/template-update` | projeto derivado | Compara os caminhos gerenciados com o template, mostra o que mudaria e aplica só depois da sua confirmação |
| `/template-check` | este template | Valida o manifest, os caminhos, as versões e a ausência de caminhos pessoais e segredos |
| `/upstream-sync-check` | este template | Compara rules, agents, skills e workflows com os upstreams ECC e OpenSpec e lista o que está desatualizado |
| `/toolset-retro` | qualquer um | Retrospectiva do toolset `.claude/` ao fim de uma sessão |

Para corrigir uma rule de origem ECC só num projeto, não edite o arquivo de origem: ele é sobrescrito na próxima atualização. Crie a rule local em `.claude/rules/project/`, que é um caminho próprio do projeto.

## Pipeline com gates

O fluxo do dia a dia são quatro skills. As `spec-*` são wrappers finos sobre os comandos `/opsx:*` descritos na próxima seção:

| Passo | Skill | Gate (script) | Aprova quando |
|-------|-------|---------------|---------------|
| 1 | `spec-create` | `openspec validate --strict` | a change é válida |
| 2 | `spec-implement` | `scripts/gates/implement-gate.mjs` | testes novos e antigos em 100%, 0 erro de lint e de tipo |
| 3 | `spec-archive` | `scripts/gates/archive-gate.mjs` | 100% dos cenários têm teste de mesmo nome, e a suíte passa |
| 4 | `pr` (só sob pedido) | `scripts/gates/pr-gate.mjs` | nenhuma change ativa, `git status` limpo e testes passando |

Cada gate permite até 3 correções e para se a pontuação não melhorar. As tentativas ficam em `openspec/changes/<change>/gates.json` e em `docs/agents/issue-tracker.md`. Preencha `checks` em `template.json` antes do primeiro `spec-implement`.

Partes de `spec-create`, `spec-implement`, `pr` e `handoff` são adaptadas de [`mattpocock/skills`](https://github.com/mattpocock/skills) (MIT; ver o `NOTICE.md` de cada skill).

### Benchmark do pipeline

`node scripts/benchmark/run.mjs` roda o pipeline sem intervenção humana, por `claude -p`. Há dois cenários:

- **greenfield:** `/new-project` → `spec-create --headless` → `spec-implement` → `spec-archive`;
- **legado:** uma fixture sem OpenSpec, com e sem `docs/agents/`.

O runner reavalia os gates no diretório de cada execução e grava `report.json` e `report.md`. Os padrões são N=5, até 60 invocações e 25 min por invocação. Ele só existe no template (`template_only`). Resultados de 2026-10-23 em `scripts/benchmark/reports/2026-10-23/`.

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
| `/new-project` | Criar um projeto novo a partir do template |
| `/template-update` | Atualizar um projeto derivado a partir do template |
| `/template-check` | Validar o template antes de usá-lo como base ou publicá-lo |
| `/upstream-sync-check` | Ver o que está desatualizado em relação ao ECC e ao OpenSpec |
| `/toolset-retro [foco]` | Retrospectiva do toolset `.claude/` ao fim de uma sessão: aplica ajustes e adia o resto como change |
| `openspec list` | Listar changes ativos |
| `openspec validate <nome>` | Validar integridade de um change |
| `openspec status --change <nome>` | Status dos artefatos de um change |
| `openspec show <nome>` | Exibir um change ou spec |
| `openspec archive <nome>` | Arquivar via CLI (equivalente ao `/opsx:archive`) |
| `openspec doctor` | Diagnóstico do root OpenSpec |

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
