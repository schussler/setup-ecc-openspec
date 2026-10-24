# Tarefas

## 1. Registro dos ajustes já feitos

- [x] 1.1 Ajuste de `--claude-bin` com espaços (`binOf`), coberto por `bin-argv.test.mjs` (feito antes deste contrato, sem RED retroativo)
- [x] 1.2 Intenções de aprovação por caminho e negação, cobertas por AP-012 e AP-013 (feito antes deste contrato)

## 2. Fatias declaradas (MS-001, MS-002)

- [x] 2.1 RED: testes de `declaredSlices` com MS-001, MS-002 e MS-008 (RED observado: módulo sem `declaredSlices`)
- [x] 2.2 GREEN: `declaredSlices` e `sliceDeclarations` em `slice.mjs` (3/3 verdes)

## 3. Execução sequencial e retomada (MS-003 a MS-005, MS-008)

- [x] 3.1 RED: teste integrado com duas fatias no simulador, raiz com espaço e `--claude-bin` em array JSON (MS-003, MS-004, MS-005, MS-008). RED observado: a execução parou na primeira fatia
- [x] 3.2 GREEN: `runDeclaredSlices` em `cli-run.mjs` (loop sequencial, `leaveApproved`, `tagSliceApproval`, retomada pelas aprovações com `task`). Ajuste no caminho de casos: o id do caso é o nome do teste, e o cenário casa por `[ID]`

## 4. Conclusão (MS-006, MS-007)

- [x] 4.1 MS-006 e MS-007 cobertos pelo percurso integrado (sem RED unitário separado: a pendência foi observada no próprio percurso)
- [x] 4.2 GREEN: `validateFinal` usa `required_slices`, recusa com pendência antes de rodar a suíte e marca `execution_approved: false`

## 5. Verificação

- [x] 5.1 Suíte completa 961/961, lint 0, sintaxe 0 (última verificação local)
- [x] 5.2 Percurso integrado pelo CLI `cli.mjs` com o simulador (raiz com espaço, `--claude-bin` em JSON). Contagens das invocações conferem com o simulador; conciliação entre estado, eventos e relatório coberta por MS-013
- [x] 5.3 Execução real multifatia no piloto (validada em 2026-10-24, ver 10.2 e issue-tracker). Limitações preservadas: o caminho do piloto não tem espaço (caminho com espaço comprovado só por simulador); interrupção real não exercitada com modelo

## 6. Preflight (MS-009)

- [x] 6.1 RED: teste de `preflight` com repositório sem commit (bloqueio `git_head`), sem chamada ao modelo
- [x] 6.2 GREEN: `scripts/harness/preflight.mjs` e ligação no `run` antes do lock

## 7. Permissão negada (MS-010)

- [x] 7.1 RED: invocação com `permission_denials` no simulador para na hora, sem correção
- [x] 7.2 GREEN: revisado depois da validação real (ver D7 e MS-014). RED original: parada imediata em qualquer negação; o piloto mostrou negação recuperada classificação `permission_denied` em `claude.mjs`/`slice.mjs`

## 8. Reutilização de aprovação (MS-011, MS-012)

- [x] 8.1 RED: fatia aprovada, código alterado, cenário ainda passa (sem chamada) e cenário quebrado (retirada)
- [x] 8.2 GREEN: revalidação em `cli-run.mjs` com `revalidations` e `invalidated_slices`

## 9. Conciliação (MS-013)

- [x] 9.1 RED: contagem divergente impede a conclusão
- [x] 9.2 GREEN: `scripts/harness/conciliation.mjs` e ligação na conclusão e no relatório

## 10. Piloto (validação real)

- [x] 10.1 Change `add-pending-summary` no piloto, com duas fatias dependentes, contrato validado e aprovado pela conversa
- [x] 10.2 Execução real com `claude -p` pela assinatura, em modo observação, com a raiz em caminho com espaço
- [x] 10.3 Conciliação das chamadas e do consumo com o relatório

Registro: a aprovação de conversa desta change é anterior à revisão de MS-010 e MS-014; a nova versão precisa de registro antes do arquivamento.
