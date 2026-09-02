# setup-ecc-openspec — Template OpenSpec + ECC

Template de referência para iniciar novos projetos combinando **[OpenSpec](https://github.com/Fission-AI/OpenSpec)** (desenvolvimento orientado a especificações — *Spec-Driven Development*) com **[ECC — Everything Claude Code](https://github.com/affaan-m/everything-claude-code)** (agentes, skills, rules e hooks para execução com Claude Code).

A regra central do template: **zero código sem spec**. Toda funcionalidade nasce como uma especificação em `openspec/changes/`, é implementada com TDD e validação contínua seguindo os padrões ECC, e é arquivada ao concluir.

## Conceitos

| Camada | Papel |
|--------|-------|
| **OpenSpec** | Gerencia *o que* construir: propostas, specs, design e tarefas versionados em `openspec/`. É a fonte da verdade dos requisitos. |
| **ECC** | Governa *como* construir: rules em `.claude/rules/` (TDD, estilo, segurança, code review) e agentes especializados (planner, tdd-guide, code-reviewer, etc.). |
| **CLAUDE.md** | Instruções que o Claude Code carrega em toda sessão, conectando as duas camadas. |

Cada mudança (*change*) no fluxo `spec-driven` produz quatro artefatos:

1. `proposal.md` — por quê e o quê (critérios de aceite)
2. `specs/<capability>/spec.md` — requisitos de comportamento (delta; opcional em mudanças sem comportamento novo)
3. `design.md` — decisões técnicas de como implementar
4. `tasks.md` — checklist de implementação, executado em ordem

## Pré-requisitos

- **[Claude Code](https://claude.com/claude-code)** instalado e autenticado
- **CLI do OpenSpec** disponível no PATH (`openspec --version` para conferir)
- **Rules ECC** instaladas no projeto (este template já as traz em `.claude/rules/`); para instalar em outro lugar, siga `.claude/rules/README.md`

## Inicializando um novo projeto

1. **Crie o projeto a partir deste template** (use como template no GitHub, ou clone e reinicie o histórico):

   ```bash
   git clone <url-deste-repo> meu-projeto
   cd meu-projeto
   rm -rf .git && git init
   ```

2. **Confira a estrutura herdada** — `openspec/` já vem inicializado com o schema `spec-driven`, e `.claude/rules/` já contém as rules ECC (`common/` + `openspec.md`). Se estiver montando do zero em vez de clonar, rode `openspec init` e copie as rules conforme `.claude/rules/README.md`.

3. **Adapte o `CLAUDE.md`** ao contexto do projeto se necessário — ele é o contrato que o agente segue em toda sessão. Os rule sets específicos de linguagem já vêm incluídos no template (ex.: `.claude/rules/typescript/`) — mantenha os que correspondem à sua stack; para detalhes da estrutura, veja `.claude/rules/README.md`.

4. **Verifique a saúde do setup**:

   ```bash
   openspec doctor      # saúde do root OpenSpec
   openspec list        # nenhum change ativo ainda
   ```

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
├── .claude/
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
