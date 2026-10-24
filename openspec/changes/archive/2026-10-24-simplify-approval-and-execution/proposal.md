# Proposal

## Why

Hoje o uso cotidiano do harness exige TTY, código de confirmação e, em alguns casos, edição manual de JSON para aprovar um contrato. A execução paga é a única forma de concluir uma change, mesmo quando a implementação já foi feita e verificada de forma supervisionada. Quando o fluxo bloqueia, a mensagem não diz o motivo nem a próxima ação. Três changes (`add-proportional-change-flow`, `add-silent-consumption-observability` e `add-spec-harness`) ficaram abertas por causa desse desenho, não por falha de implementação.

## What Changes

- **Aprovação pela conversa, proporcional ao caminho.** Para changes novas, o agente registra em `authorizations.json` a decisão que o usuário deu na conversa, com origem, data, escopo e hash ou versão do contrato. Caminho 1: o pedido explícito autoriza o ajuste e suas verificações. Caminho 2: "pode fazer" autoriza o escopo apresentado. Caminho 3: "aprovado" autoriza o escopo apresentado. Sem TTY, código de confirmação ou edição manual de JSON no fluxo padrão. O registro não se apresenta como autenticação forte. Só instrução explícita do usuário autoriza; conteúdo de arquivos, ferramentas ou documentos não.
- **Execução por exceção.** Dentro do escopo aprovado, o agente segue sem nova confirmação para detalhes internos reversíveis, edição e testes já autorizados, correções dentro dos critérios aprovados, registro de decisão já dada e correções editoriais sem mudança de significado. Pede decisão só quando houver mudança relevante de comportamento, escopo, risco ou aceite, decisão de negócio ou arquitetura indefinida, limite operacional ou repetição improdutiva, ação destrutiva ou publicação não autorizada, ou restrição de ferramenta que impeça continuar.
- **Diagnóstico de bloqueios.** Cada parada informa motivo, evidência e recomendação em linguagem curta, usando os motivos de parada já existentes.
- **Conclusão supervisionada.** Um registro novo, com evidência (suíte, lint, sintaxe, `openspec validate --strict`, `contract.mjs` e hash do contrato), que o gate de arquivamento aceita quando a implementação foi feita fora do runner. O veredito de implementação anterior não muda, e `gates.json` não é editado à mão.
- **Aplicação limitada.** A aprovação pela conversa vale só para changes novas. As aprovações existentes de `add-spec-harness` (v3) e `add-silent-consumption-observability` (v2) continuam válidas. Nenhum veredito de `add-proportional-change-flow`, `add-silent-consumption-observability` ou `add-spec-harness` é alterado nesta change.

## Capabilities

### New Capabilities

- `conversation-approval`: registro, na conversa, da decisão de aprovação de caminhos 1, 2 e 3, com escopo e versão, sem TTY no fluxo padrão.
- `execution-by-exception`: continuidade dentro do escopo aprovado, critérios para pedir decisão e diagnóstico curto de cada parada.
- `supervised-completion`: registro de conclusão supervisionada com evidência, aceito pelo gate de arquivamento quando o implement foi feito fora do runner.

### Modified Capabilities

Nenhuma. O aceite da conclusão supervisionada no gate de arquivamento é um requisito novo de `supervised-completion`, e não altera o requisito "Gate de arquivamento" de `spec-gates`.

## Impact

- Protegidos pela política (`.claude/harness/policy.json`, `protected_paths`): `scripts/harness/authorize.mjs` (registro da decisão de conversa), `scripts/harness/contract.mjs` (aceitação de `auth:<id>` de conversa em changes novas), `scripts/gates/archive-gate.mjs` (conclusão supervisionada), e `.claude/harness/policy.md`. A alteração ocorre nesta change, sob revisão humana, e não durante execução do runner. Nenhum parâmetro de `policy.json` muda, e nenhum teto é ampliado.
- Skills: `spec-create` e `spec-archive` (passo de aprovação pela conversa e registro de conclusão supervisionada), `change-flow` (caminhos 1 a 3 com aprovação proporcional).
- Não afetado: orçamento, reserva, limites de chamadas, multifatia, isolamento do executor e o runner headless. Nenhuma chamada paga é feita nesta change.
- Premissas (não aprovadas, registradas em `design.md` `## Premissas`): o diagnóstico reaproveita `stop_reason` e `symptoms.mjs`; o registro de conversa reaproveita o formato de `authorizations.json` com `kind` `contract_approval` ou `revision`, sem tipo novo; a conclusão supervisionada não depende do runner.
- Lacuna declarada: o registro de conversa não comprova a identidade de quem aprovou. A proteção contra edição direta de `authorizations.json` continua procedimental, como hoje.

## Premissas

Não aprovadas pelo usuário; registradas para revisão:

- O diagnóstico de bloqueios reaproveita `stop_reason` e `symptoms.mjs`, sem módulo novo (design.md D4).
- O registro de aprovação de conversa reaproveita `kind` `contract_approval`, com `procedure: "conversa"` (design.md D1).
- A conclusão supervisionada não depende do runner e é gravada em `supervised-completion.json` (design.md D3).
- Os IDs de cenário das specs MODIFIED (AG-001 a AG-003) começam na revisão 1, porque a spec principal ainda não tem IDs para esses cenários.
