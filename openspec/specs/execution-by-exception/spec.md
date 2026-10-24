# execution-by-exception Specification

## Purpose
Define quando o agente segue sem nova confirmação dentro do escopo aprovado, quando pede decisão ao usuário e como explica cada parada.

## Requirements

### Requirement: Continuidade dentro do escopo aprovado
Dentro do escopo aprovado, o agente SHALL seguir sem nova confirmação para detalhes internos reversíveis, edição e testes já autorizados, correções dentro dos critérios aprovados, registro de decisão já dada e correções editoriais sem mudança de significado.

#### Scenario: detalhe interno reversível não pede confirmação
- **ID:** EX-001
- **Revisão:** 1
- **WHEN** o agente precisa escolher um detalhe interno reversível dentro do escopo aprovado
- **THEN** ele escolhe a opção recomendada, registra a escolha e continua sem perguntar

#### Scenario: correção editorial não pede confirmação
- **ID:** EX-002
- **Revisão:** 1
- **WHEN** o agente corrige um texto sem mudança de significado
- **THEN** ele aplica a correção sem pedir confirmação

### Requirement: Decisão do usuário somente quando necessária
O agente SHALL pedir decisão ao usuário somente quando houver mudança relevante de comportamento, escopo, risco ou aceite, decisão de negócio ou arquitetura indefinida, limite operacional atingido, repetição improdutiva, ação destrutiva ou publicação não autorizada, ou restrição de ferramenta que impeça continuar.

#### Scenario: mudança de comportamento pede decisão
- **ID:** EX-003
- **Revisão:** 1
- **WHEN** a execução exige mudar um comportamento ou aceite já aprovado
- **THEN** o agente para e pede decisão antes de alterar o contrato

#### Scenario: publicação sem autorização pede decisão
- **ID:** EX-004
- **Revisão:** 1
- **WHEN** a continuação exigiria push, PR ou publicação não autorizados
- **THEN** o agente para antes da ação e pede autorização

#### Scenario: repetição improdutiva para com diagnóstico
- **ID:** EX-005
- **Revisão:** 1
- **WHEN** o mesmo sintoma se repete além do limite de `max_diagnostics_per_signature` de `.claude/harness/policy.json`
- **THEN** o agente para com motivo `human_decision_needed`, sem nova tentativa

### Requirement: Diagnóstico curto de cada parada
Cada parada SHALL informar motivo, evidência e recomendação em linguagem curta. O motivo SHALL usar um dos valores `stop_reasons` de `.claude/harness/policy.json`.

#### Scenario: parada informa motivo evidência e recomendação
- **ID:** EX-006
- **Revisão:** 1
- **WHEN** o agente para uma execução
- **THEN** a mensagem traz um `stop_reason` existente em `policy.json`, a evidência observada e uma recomendação de próxima ação

#### Scenario: motivo fora da lista é recusado
- **ID:** EX-007
- **Revisão:** 1
- **WHEN** um diagnóstico usa um motivo que não está em `stop_reasons`
- **THEN** o diagnóstico é recusado e o agente registra o motivo como `config_error`
