# Proposal

## Why

Hoje a regra "Zero código sem spec" (`CLAUDE.md` §1) exige uma change OpenSpec para qualquer alteração, inclusive ajustes visuais ou textuais. O custo de planejamento e de verificação fica desproporcional ao risco, e o agente não tem um ponto de entrada para pedidos comuns como "troque a cor do botão".

## What Changes

- Três caminhos proporcionais ao risco, classificados por condições de risco e não pelo tamanho do diff:
  - **Caminho 1 (ajuste visual ou textual):** sem alteração funcional relevante. Executado dentro do pedido explícito, com a classificação informada. Registro curto em `docs/agents/issue-tracker.md`, sem change OpenSpec. Verificação pertinente aos arquivos e riscos afetados, com lacunas declaradas.
  - **Caminho 2 (mudança localizada):** comportamento localizado, impacto limitado, interfaces externas preservadas e aceite verificável. Contrato curto apresentado, com decisões faltantes confirmadas. Nesta versão, executado de forma supervisionada, por limitação declarada.
  - **Caminho 3 (mudança funcional ou arquitetural):** fluxo completo atual, com aprovação formal.
- Nova skill de ponto de entrada `change-flow`, que aceita pedidos comuns sem exigir o nome de uma skill, classifica o caminho, informa a classificação e encaminha para o fluxo correspondente.
- Detecção de conflito: a skill reporta antes de agir se o `CLAUDE.md` do projeto ainda mantém a regra "Zero código sem spec" de forma incondicional.
- `CLAUDE.md` do template (§1) passa a referenciar os três caminhos. Projetos existentes só recebem essa mudança por migração explícita, porque `CLAUDE.md` é `owned`.
- Guardrails obrigatórios em todos os caminhos: segredos, permissões e autenticação só mudam no caminho 3; escopo limitado aos arquivos declarados; nenhum push, PR ou publicação sem pedido explícito.
- Não há mudança em caminhos protegidos (`scripts/gates`, `scripts/harness`, `.claude/harness`, `policy.json`), nem em orçamento, segurança de execução ou multifatia.

## Capabilities

### New Capabilities

- `change-flow`: classificação proporcional ao risco, pontos de entrada para pedidos comuns, registro mínimo por caminho, verificação proporcional e detecção de regra antiga em conflito.

### Modified Capabilities

Nenhuma. `spec-pipeline` e os demais requisitos existentes não mudam. Os caminhos 2 e 3 reutilizam as regras de contrato e de pipeline já existentes.

## Impact

- Novo: `.claude/skills/change-flow/SKILL.md` e um detector de conflito local à skill, com testes em `scripts/test/`.
- Alterado: `.claude/skills/spec-create/SKILL.md` (referência ao caminho 2 curto e à classificação prévia), `CLAUDE.md` do template (§1), e modelos de projeto novo que descrevem o fluxo.
- Testes de texto que amarram as skills (`spec-create.test.mjs`, `skills-pipeline.test.mjs`, `headless.test.mjs`, `claude-md.test.mjs`) precisam ser atualizados com justificativa, sem enfraquecer asserções.
- Não afetado: gates, runner, política, orçamento e caminhos protegidos.
- Lacuna declarada: a avaliação visual real (troca de cor, acessibilidade, responsividade) não é executada nesta change. Os testes são estáticos e avaliam classificação, fixtures de pedido esperado e o detector de conflito.
