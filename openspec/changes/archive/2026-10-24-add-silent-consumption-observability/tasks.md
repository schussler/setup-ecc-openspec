## 1. Modo de observação no runner (F1)

- [x] 1.1 RED: testes [CO-001] a [CO-004] com o simulador de `claude`: execução padrão sem autorização `budget`, `modo_financeiro` ausente ou falso sem reserva nem `--max-budget-usd`, controles não financeiros preservados, custo desconhecido sem parada
- [x] 1.2 GREEN: `runHarnessStep` pula reserva, autorização de orçamento e limites de custo quando o modo é de observação; mantém correções, sintoma repetido, caminho protegido e tempo
- [x] 1.3 RED: [CO-018] modo financeiro ativo sem autorização `budget` para com `authorization_required`
- [x] 1.4 GREEN: `modo_financeiro` lido do perfil da execução, com padrão falso e validação booleana

## 2. Coleta silenciosa (F1)

- [x] 2.1 RED: [CO-005] registro com agente, função, modelos, esforço, duração, tokens por categoria, custo com origem, `stage` e `attempt`
- [x] 2.2 RED: [CO-006] tarefa nula sem vínculo confiável; [CO-007] tokens nulos sem `usage` válido
- [x] 2.3 GREEN: campos `stage`, `attempt` e `task` em `buildEvent` e na chamada do runner, sem renomear campos existentes
- [x] 2.4 RED: [CO-008] saída do passo sem linhas de consumo; [CO-009] coleta e consolidação sem invocação de `claude`
- [x] 2.5 GREEN: nenhuma saída de consumo durante o passo

## 3. Falhas de observabilidade (F1)

- [x] 3.1 RED: [CO-014] falha de gravação de telemetria não altera o resultado do passo e registra aviso
- [x] 3.2 GREEN: envolver a gravação de observação em tratamento de erro, com aviso em `events.jsonl` (`kind: observability`)

## 4. Resumo final e consulta (F1)

- [x] 4.1 RED: [CO-010] seção "Consumo e observações finais" gravada na pasta arquivada, fora dos arquivos do contrato (hash da aprovação inalterado)
- [x] 4.2 RED: [CO-011] totais somam só valores conhecidos, desconhecidos contados e total marcado como parcial; [CO-012] sem evidência declarada; [CO-013] subagentes e sessões interativas como não medidos; [CO-020] campos obrigatórios do resumo
- [x] 4.3 GREEN: módulo de consolidação a partir de `events.jsonl`, com causas observadas e hipóteses separadas
- [x] 4.4 RED: [CO-015] falha do relatório depois do arquivamento preserva o arquivamento e informa a falha em separado
- [x] 4.5 GREEN: gravação do resumo depois do arquivamento, com a falha tratada e nova geração possível
- [x] 4.6 RED: [CO-016] `cli.mjs consumo --change <change>` somente leitura; [CO-017] nenhum passo chama o comando
- [x] 4.7 GREEN: subcomando `consumo` em `cli.mjs` e passo 8 da skill `spec-archive`

## 5. Processamento local (F1)

- [x] 5.1 RED: [CO-019] coleta, resumo e consulta sem conexão externa
- [x] 5.2 GREEN: módulo sem dependência de rede

## 6. Verificação final (F1)

- [x] 6.1 Suíte completa de `scripts/test` verde (899/899). Testes existentes de orçamento passaram a declarar `modo_financeiro: true` no perfil, sem alterar asserções; justificativa em `docs/agents/issue-tracker.md`
- [x] 6.2 `openspec validate --strict` e `contract.mjs` da change (ver resultado na entrega)
- [x] 6.3 Lint (0 erro) e sintaxe (0 erro) conforme `template.json` → `checks`

Nota sobre a ordem: a implementação de 1 a 5 foi escrita antes dos testes de cada item. Os testes foram conferidos por mutação (modo financeiro forçado derruba 8 dos 20 testes CO), mas o RED de cada item não foi observado isoladamente. Lacunas declaradas: CO-003 cobre o limite de invocações; correções, sintoma repetido e caminho protegido no modo de observação não têm teste próprio. CO-014 é teste de unidade do aviso, sem falha injetada no runner.
