# Tasks

## 1. Registro de aprovação pela conversa

- [x] 1.1 RED: testes com AP-001 e AP-002 em `scripts/test/harness/aprovacao-conversa.test.mjs`
- [x] 1.2 GREEN: `recordConversationApproval` em `scripts/harness/authorize.mjs`, com `procedure: conversa` (design.md D1)
- [x] 1.3 RED: testes com AP-006 (sem TTY, pelo CLI `conversa`) e AP-007 (change com aprovação anterior é recusada)
- [x] 1.4 GREEN: gravação sem TTY e recusa em `authorize.mjs`; a gravação compartilha `commitRecord` com o registro por TTY
- [x] 1.5 Verificação: 18 testes de `aprovacao-conversa` e `authorize` passam

## 2. Aprovação proporcional por caminho

- [x] 2.1 RED: testes com AP-003 (caminho 1 sem registro), AP-004 ("pode fazer") e AP-005 ("aprovado"). Desvio: os testes são de código (`recordConversationApproval`), não de texto de skill
- [x] 2.2 GREEN: regra por caminho no código (`CONVERSATION_PHRASES`) e texto em `.claude/skills/change-flow/SKILL.md` e `.claude/skills/spec-create/SKILL.md`
- [x] 2.3 Verificação: suíte completa verde, sem asserção removida

## 3. Aceitação do registro de conversa pelo contrato

- [x] 3.1 RED: teste "contrato aceita aprovação de conversa com hash atual e recusa hash antigo" em `aprovacao-conversa.test.mjs`
- [x] 3.2 GREEN: `contract.mjs` não precisou de mudança: o registro tem `origin: human` e a mesma regra de hash e versão
- [x] 3.3 Verificação: `node scripts/harness/contract.mjs openspec/changes/simplify-approval-and-execution` sem erro

## 4. Execução por exceção e diagnóstico de paradas

- [x] 4.1 RED: testes com EX-001 a EX-004 em `scripts/test/harness/execucao-excecao.test.mjs`. Verificação no texto da skill `spec-implement`
- [x] 4.2 GREEN: seção "Execução por exceção" em `.claude/skills/spec-implement/SKILL.md`
- [x] 4.3 RED: testes com EX-005, EX-006 e EX-007
- [x] 4.4 GREEN: `diagnoseStop` em `scripts/harness/stop-report.mjs`, com `stop_reasons` e `max_diagnostics_per_signature` de `policy.json`
- [x] 4.5 Verificação: testes da seção verdes

## 5. Conclusão supervisionada

- [x] 5.1 RED: testes com SC-001, SC-002 e SC-004 em `scripts/test/harness/conclusao-supervisionada.test.mjs`
- [x] 5.2 GREEN: `scripts/harness/supervised-completion.mjs` grava `supervised-completion.json` com as evidências recalculadas agora e o hash do contrato
- [x] 5.3 RED: teste com SC-003 (hash diferente trata o registro como ausente)
- [x] 5.4 GREEN: `readSupervisedCompletion` confere o hash e as cinco evidências a cada leitura
- [x] 5.5 Verificação: `gates.json` das três changes abertas sem alteração no `git status`

## 6. Gate de arquivamento aceita conclusão supervisionada

- [x] 6.1 RED: testes com SC-005, SC-006 e SC-007 em `scripts/test/gates/archive-supervisionado.test.mjs` (IDs antes AG-001 a AG-003; renomeados ao mover o requisito para `supervised-completion`)
- [x] 6.2 GREEN: `scripts/gates/archive-gate.mjs` aceita `readSupervisedCompletion(...).valid` além do veredito `pass`
- [x] 6.3 Verificação: suíte completa verde, lint 0 erro, sintaxe 0 erro

## 7. Fluxo e documentação

- [x] 7.1 `.claude/skills/spec-archive/SKILL.md` com a seção "Conclusão supervisionada"
- [x] 7.2 `.claude/harness/policy.md` com a seção da aprovação pela conversa e da conclusão supervisionada, sem valores de `policy.json`
- [x] 7.3 Registro em `docs/agents/issue-tracker.md` (ver entrada de 2026-10-24 da change)

## 8. Verificação final

- [x] 8.1 `openspec validate simplify-approval-and-execution --strict` passa
- [x] 8.2 `node scripts/harness/contract.mjs openspec/changes/simplify-approval-and-execution` passa
- [x] 8.3 Suíte completa (`template.json` → `checks.test`) passa, com a contagem registrada no issue tracker

## 9. Ajuste de consolidação (solicitado pelo usuário)

- [x] 9.1 RED: testes com AP-008 e AP-009 (seção "Consolidação antes dos artefatos" em `spec-create`) e AP-010 (nova versão com contrato alterado)
- [x] 9.2 GREEN: seção de consolidação em `.claude/skills/spec-create/SKILL.md`, antes dos passos; `recordConversationApproval` aceita nova versão só com hash diferente da última aprovação (AP-007)
- [x] 9.3 Correção de validação: o delta MODIFIED de `spec-gates` foi removido, porque a spec principal mudou com o arquivamento de `add-spec-harness`. O aceite no gate passou a ser o requisito "Aceite no gate de arquivamento" de `supervised-completion` (SC-005 a SC-007). Nenhuma revisão foi alterada.
- [x] 9.4 Aprovação do contrato v2 pela conversa (caminho 3, frase "Aprovado o contrato versão 2…"), registrada com `procedure: conversa`
- [x] 9.5 `supervised-completion.json` regerado para o hash atual (`f5dc411a…a11c`), com suíte, lint, sintaxe, `validate --strict` e contrato em pass
- [x] 9.6 Arquivamento desta change pelo fluxo normal (gate de arquivamento pass, 24/24 cenários). Pendências de saída preservada e interrupção não fazem parte deste contrato (ver Desvios)

## Desvios registrados

- `scripts/test/harness/runner-gates.test.mjs` ([RC-029]): o invariante "skills e runner não citam `authorize.mjs`" foi estreitado. A única exceção é o comando `authorize.mjs conversa` da skill `spec-create` (AP-006). `recordAuthorization` e `authorize.mjs record` continuam proibidos em todo lugar, e o teste confere que só `spec-create` cita o comando de conversa.
