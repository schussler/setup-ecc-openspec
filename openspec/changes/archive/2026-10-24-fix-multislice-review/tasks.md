# Tarefas

## 1. Aprovação por intenção completa (AP-014, AP-015)

- [x] 1.1 RED: testes de desaprovação, palavras parecidas, pergunta e ambiguidade em `aprovacao-conversa.test.mjs`
- [x] 1.2 GREEN: sequências de palavras inteiras e recusa de negação em `authorize.mjs`

## 2. Aprovação atômica e revalidação (MS-016, MS-017)

- [x] 2.1 RED: teste de registro com tarefa e impressão (MS-016) e revalidação interrompida pelo prazo (MS-017)
- [x] 2.2 GREEN: `approveSlice` com tarefa; revalidação por `guardedEvaluation` com `revalidation_interrupted`; validação final recusa impressão antiga

## 3. Correções e identidade de cenário (MS-018, MS-019)

- [x] 3.1 RED: correções por `fatia:gate` e cenário quase igual sem aprovar
- [x] 3.2 GREEN: contador por escopo e `corrections_total`; igualdade exata de identificador

## 4. Medição e conciliação (MS-013, MS-020, MS-021)

- [x] 4.1 RED: negação recuperada não é falha; evento sem fonte de custo é divergência
- [x] 4.2 GREEN: `invocations` no relatório; conciliação por fontes reais

## 5. Sanitização (MS-022)

- [x] 5.1 RED: registro de negação sem trecho do comando
- [x] 5.2 GREEN: só `tool_name` é gravado

## 6. Verificação

- [x] 6.1 Suíte completa, lint e sintaxe verdes
- [x] 6.2 Pontuação do gate de implementação com linha de base do commit anterior à correção (`0f5178d`)
- [x] 6.3 Ajustes de teste justificados: MS-013 custo (fonte financeira no lugar do relatório circular); nome original de MS-010 restaurado
