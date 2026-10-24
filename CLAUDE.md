# Diretrizes do Repositório (OpenSpec + Everything Claude Code)

Este projeto utiliza **OpenSpec** para gerenciamento de requisitos/tarefas (Spec-Driven Development) e os padrões do **ECC** para execução do agente, arquitetura e qualidade.

---

<!-- template:agents-context:start -->
## 0. Leitura Inicial Obrigatória
Antes de qualquer tarefa, leia nesta ordem:
1. `docs/agents/issue-tracker.md`: retome do **Ponto de restauração**.
2. `docs/agents/architecture.md`: módulos, fronteiras e como verificar.
3. `docs/agents/domain.md`: vocabulário e regras de negócio. Use esses termos em specs, testes e código.

Campo `TBD` é lacuna conhecida. Não invente o valor; registre a lacuna em `issue-tracker.md`.
<!-- template:agents-context:end -->

---

## 1. Fluxo de Decisão (OpenSpec)
- **Zero código sem spec:** Nenhuma funcionalidade ou alteração arquitetural deve ser escrita sem uma especificação em `openspec/changes/<feature>/`.
- **Fonte da Verdade:** Os requisitos e critérios de aceite residem em `proposal.md` e `design.md`.
- **Roteiro de Execução:** Siga estritamente a ordem definida em `tasks.md`. Atualize o status das caixas de seleção (`- [x]`) conforme for finalizando.

---

<!-- template:pipeline:start -->
## 2. Pipeline de Entrega
Quatro passos, nesta ordem. Cada um é uma skill em `.claude/skills/`:

1. **`spec-create`:** entrevista (`grill-me` ou roteiro embutido) e cria a change via `/opsx:propose`. Com `--headless`, assume premissas e as registra na seção `## Premissas` da proposta.
2. **`spec-implement`:** TDD (Red → Green → Refactor) tarefa por tarefa via `/opsx:apply`, e depois o gate de implementação.
3. **`spec-archive`:** gate de arquivamento (cada cenário com teste de mesmo nome), depois `/opsx:archive` e sync das specs.
4. **`pr`:** só sob pedido explícito do usuário, nunca em modo headless. Mostra commit, branch e corpo da PR e aguarda confirmação.

Regras dos gates:
- Os gates não podem ser pulados, nem no modo headless.
- A pontuação vem dos scripts em `scripts/gates/`, não da autoavaliação do agente.
- Até 3 correções por gate. O ciclo para se a pontuação não melhorar. Cada tentativa é registrada em `docs/agents/issue-tracker.md`.
- Nunca reduza um limiar. Nunca altere um teste para passar sem justificar no `issue-tracker.md`.
- No modo headless (`claude -p`), as permissões vêm de `.claude/settings.json` (`permissions.allow`) com `--permission-mode dontAsk`. Nunca use `--dangerously-skip-permissions`. Os hooks do ECC continuam ativos: não use `--bare`.
- Ao encerrar uma sessão, rode `handoff` para gravar o ponto de restauração.

Tabela de gates (derivada dos scripts e do modo da execução; não é editada à mão):

| Gate | Script | Modo `legacy` (em uso) | Modo `runner` (após o marco) |
|------|--------|------------------------|------------------------------|
| Implementação | `scripts/gates/implement-gate.mjs` | `score` e `baseline` com `--legacy-write` gravam `gates.json` | avaliação pedida ao runner |
| Arquivamento | `scripts/gates/archive-gate.mjs` | com `--legacy-write` grava `gates.json` | validação final pelo `scripts/harness/validate.mjs` |
| PR | `scripts/gates/pr-gate.mjs` | só leitura | só leitura |

Limite de isolamento: a v1 não isola o executor do avaliador. A separação de papéis não é isolamento; o bloqueio de execução é advisory; um executor com a mesma conta pode alterar arquivos e hashes.
<!-- template:pipeline:end -->

---

## 3. Engenharia e Execução (ECC Standards)
- **TDD Rigoroso:** Escreva testes que falhem antes de codificar a implementação da tarefa.
- **Regras Modulares:** Siga os padrões descritos em `.claude/rules/` para estilo de código, testes, tratamento de erros e segurança.
- **Escopo Atômico:** Resolva uma tarefa de cada vez. Não adicione dependências ou refatore códigos fora do escopo da task atual.
- **Validação Contínua:** Execute linters, checagens de tipo e testes após concluir cada item de `tasks.md`.

---

## 4. Comandos Principais
- Validar integridade das specs: `openspec validate --all`
- Listar mudanças ativas: `openspec list`
- Arquivar spec ao concluir: `spec-archive` (fallback: `openspec archive <change> --yes`)
- Testes, lint e tipos: os comandos ficam em `template.json` → `checks` (`test`, `lint`, `typecheck`). Os gates em `scripts/gates/` leem de lá.

---

## 5. Arquivos Próprios do Projeto
`CLAUDE.md`, `docs/agents/`, `.claude/settings.json` e `template.json` → `checks` são do projeto (`owned`). O `/template-update` nunca os sobrescreve. Mudanças do template nesses arquivos chegam a projetos novos pelo `/new-project` e a projetos existentes só por migração explícita.
