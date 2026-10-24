# Design

## Context

Ver `proposal.md` (Why). Hoje a aprovação de contrato passa por `scripts/harness/authorize.mjs`, que grava `authorizations.json` só a partir de terminal interativo e código de confirmação. `scripts/harness/contract.mjs` aceita `Aprovação: auth:<id>` apenas para registros `revision` válidos e não revogados. O archive gate (`scripts/gates/archive-gate.mjs`) exige veredito `pass` do gate de implementação em `gates.json`. As três changes abertas não têm esse veredito porque a implementação foi supervisionada, fora do runner.

As regras comuns de execução estão em `.claude/harness/policy.md`, e os parâmetros em `.claude/harness/policy.json`. Este design referencia os dois e não repete valores. Nenhum parâmetro muda.

- **Comportamento novo:** sim
- **Política:** `.claude/harness/policy.md` e `.claude/harness/policy.json` (referenciados, não repetidos).

## Goals / Non-Goals

**Goals**

- Aprovação de changes novas registrada a partir da conversa, com escopo e hash, sem TTY.
- Conclusão supervisionada com evidência, aceita pelo archive gate sem editar `gates.json`.
- Paradas com motivo, evidência e recomendação, usando os `stop_reasons` existentes.

**Non-Goals**

- Sem tipo novo em `authorizations.json`: a decisão de conversa usa `kind` `contract_approval`.
- Sem alteração de orçamento, reserva, limites, multifatia, isolamento do executor ou runner headless.
- Sem alteração de vereditos existentes nem de aprovações de `add-spec-harness` e `add-silent-consumption-observability`.
- Sem autenticação forte. O registro de conversa não comprova identidade.

## Decisions

### D1. Registro de conversa usa `contract_approval` com origem `conversa`

O registro `contract_approval` (kind `revision`, origin `human`) ganha `procedure: "conversa"`, que descreve como a decisão foi recebida, e a frase do usuário em `instruction`. A origem da decisão continua humana, por isso `contract.mjs` aceita o registro sem mudança. Alternativa: novo `kind` `conversation_approval`. Descartada: exige nova lista fechada em `PURPOSES` e nova regra em `contract.mjs`, sem ganho de verificação.

### D2. Aceitação por hash e versão, não por tipo de change

`contract.mjs` continua exigindo `auth:<id>` válido para o hash atual. A restrição "só changes novas" (AP-007) é procedimental: o agente não grava registro de conversa se já houver `contract_approval` na change. Alternativa: detectar "change nova" por data de criação. Descartada: frágil, e as changes antigas já têm registros TTY que continuam válidos.

### D3. Conclusão supervisionada como registro separado

Um arquivo `openspec/changes/<change>/supervised-completion.json`, com evidência e hash do contrato. O archive gate lê esse arquivo somente quando `gates.json` não tem veredito `pass` e aceita o registro só se o hash bater com o contrato atual. Alternativa: gravar um veredito `pass` em `gates.json`. Descartada: falsificaria o histórico do gate de implementação, que a regra existente proíbe.

### D4. Diagnóstico reaproveita `stop_reason` e `symptoms.mjs`

Cada parada já grava `stop_reason`. O diagnóstico acrescenta evidência e recomendação ao relatório existente, em linguagem curta. Alternativa: novo módulo de diagnóstico. Descartada por custo e por duplicar `symptoms.mjs`.

### D5. Caminhos protegidos mudam só nesta change

`scripts/harness`, `scripts/gates`, `.claude/harness` e `policy.json` são protegidos. Esta change os altera sob revisão humana, fora de execução do runner. Nenhum parâmetro de `policy.json` muda.

## Risks / Trade-offs

- **[Risco] Registro de conversa parece autenticação forte.** → Mitigação: campo `origem: "conversa"` e texto de relatório que declara decisão recebida na conversa (AP-006).
- **[Risco] Edição direta de `authorizations.json` continua possível.** → Mitigação: procedimental, como hoje. Declarado como lacuna no proposal.
- **[Risco] Registro de conclusão supervisionada fica desatualizado após nova edição do contrato.** → Mitigação: o hash é conferido a cada gate (SC-003).
- **[Trade-off] Dois caminhos de aprovação (TTY e conversa).** → Aceito: o TTY continua disponível e é o único usado para changes que já o têm.

## Migration Plan

1. Implementar os testes e o código desta change em `scripts/harness` e `scripts/gates`, com a suíte verde.
2. Atualizar `spec-create`, `spec-archive` e `change-flow` para o novo fluxo.
3. Rollback: reverter o commit da change. Nenhuma aprovação existente é alterada, então o rollback não exige migração de dados.

## Premissas

Registradas também em `proposal.md`, como premissas não aprovadas:

- O diagnóstico reaproveita `stop_reason` e `symptoms.mjs` (D4).
- O registro de conversa reaproveita `kind` `contract_approval` (D1).
- A conclusão supervisionada não depende do runner (D3).

## Open Questions

Nenhuma aberta. As decisões de aprovação de conversa, conclusão supervisionada e execução por exceção foram respondidas pelo usuário na conversa.
