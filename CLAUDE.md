# Diretrizes do Repositório (OpenSpec + Everything Claude Code)

Este projeto utiliza **OpenSpec** para gerenciamento de requisitos/tarefas (Spec-Driven Development) e os padrões do **ECC** para execução do agente, arquitetura e qualidade.

---

## 1. Fluxo de Decisão (OpenSpec)
- **Zero código sem spec:** Nenhuma funcionalidade ou alteração arquitetural deve ser escrita sem uma especificação em `openspec/changes/<feature>/`.
- **Fonte da Verdade:** Os requisitos e critérios de aceite residem em `proposal.md` e `design.md`.
- **Roteiro de Execução:** Siga estritamente a ordem definida em `tasks.md`. Atualize o status das caixas de seleção (`- [x]`) conforme for finalizando.

---

## 2. Engenharia e Execução (ECC Standards)
- **TDD Rigoroso:** Escreva testes que falhem antes de codificar a implementação da tarefa.
- **Regras Modulares:** Siga os padrões descritos em `.claude/rules/` para estilo de código, testes, tratamento de erros e segurança.
- **Escopo Atômico:** Resolva uma tarefa de cada vez. Não adicione dependências ou refatore códigos fora do escopo da task atual.
- **Validação Contínua:** Execute linters, checagens de tipo e testes após concluir cada item de `tasks.md`.

---

## 3. Comandos Principais
- Validar integridade das specs: `openspec validate`
- Listar mudanças ativas: `openspec list`
- Arquivar spec ao concluir: `openspec archive`
- Testes, lint e tipos: os comandos ficam em `template.json` → `checks` (`test`, `lint`, `typecheck`). Os gates em `scripts/gates/` leem de lá.
