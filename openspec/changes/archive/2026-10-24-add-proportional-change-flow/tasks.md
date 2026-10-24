## 1. Classificação (F1)

- [x] 1.1 RED: testes de `classifyRequest` para as regras R1 a R5 de D1, para os quatro exemplos (troca de cor, mudança localizada, regra de negócio, pedido ambíguo) e para fato desconhecido ([CF-013]) e evidência ([CF-014]); CF-001 a CF-003 quando a classificação os cobre
- [x] 1.2 GREEN: `.claude/skills/change-flow/change-flow.mjs` com `classifyRequest`, mínimo para os testes passarem
- [ ] 1.3 REFACTOR: nomes e constantes dos fatos, sem mudar o retorno (não feito como passo separado; a implementação foi escrita de uma vez)

## 2. Detecção de regra antiga (F1)

- [x] 2.1 RED: testes de `detectRuleConflict` com regra antiga, regra que cita `change-flow` e texto sem a frase ([CF-010], [CF-011])
- [x] 2.2 GREEN: `detectRuleConflict` em `change-flow.mjs`
- [ ] 2.3 REFACTOR: sem mudar o retorno (não feito como passo separado)

## 3. Skill de ponto de entrada (F1)

- [x] 3.1 RED: teste estático da skill `change-flow` para critérios por risco sem tamanho do diff ([CF-001]), interface qualificada ([CF-002]), ambiguidade proporcional ([CF-003]), caminho 1 sem change ([CF-004]), caminho 2 com contrato curto ([CF-005]), caminho 3 com fluxo completo ([CF-006]), lacuna declarada ([CF-007]), guardrails ([CF-008]) e gatilhos de pedido comum ([CF-009])
- [x] 3.2 GREEN: `.claude/skills/change-flow/SKILL.md` com esses blocos, mínimo para os testes passarem
- [x] 3.3 Incluir no SKILL.md a detecção de D5, chamando `detectRuleConflict` (via CLI `conflict`) antes de aplicar os caminhos

## 4. Ajustes nas skills e no template (F1)

- [x] 4.1 RED: teste de `spec-create` que exige a referência ao caminho 2 curto e à classificação prévia por `change-flow` (falhou antes da edição)
- [x] 4.2 GREEN: `.claude/skills/spec-create/SKILL.md` com essa referência, sem mudar os gates
- [x] 4.3 `CLAUDE.md` §1: trocar "Zero código sem spec" incondicional pela referência aos três caminhos e a `change-flow`
- [x] 4.4 Confirmar que `template.json` mantém `CLAUDE.md` em `owned` ([CF-012])

## 5. Atualização dos testes de texto (F1)

- [x] 5.1 Revisar `spec-create.test.mjs`, `skills-pipeline.test.mjs`, `headless.test.mjs` e `claude-md.test.mjs`. Nenhuma asserção precisou mudar: a frase "cannot be skipped" e a sequência do pipeline foram mantidas.
- [x] 5.2 Nenhuma asserção removida ou enfraquecida

## 6. Validação do contrato curto (pergunta aberta de design.md)

- [x] 6.1 Em cópia descartável fora do repositório, montar um contrato curto de caminho 2 e rodar `openspec validate --strict` e `node scripts/harness/contract.mjs` (repetido nesta fase: ambos passam, e o cenário sem ID continua reprovado com HI-003)
- [x] 6.2 Registrar o resultado. Passa: o caminho 2 curto pode ser prometido nessa forma.

## 7. Verificação final (F1)

- [x] 7.1 Suíte (`checks.test`): 879 testes, 0 falhas, 0 pulados. Lint: 0 erro. Typecheck (sintaxe): 0 erro.
- [x] 7.2 `openspec validate add-proportional-change-flow --strict` passa
- [x] 7.3 `node scripts/harness/contract.mjs openspec/changes/add-proportional-change-flow` passa (0 erro)
- [x] 7.4 Lacuna declarada: avaliação visual real (troca de cor, acessibilidade, responsividade) não executada nesta change
