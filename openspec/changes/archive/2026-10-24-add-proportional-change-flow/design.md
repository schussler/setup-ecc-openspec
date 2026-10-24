# Design

## Context

Hoje `CLAUDE.md` §1 diz "Zero código sem spec" e não distingue risco. A skill `spec-create` só conhece o fluxo completo. Os caminhos protegidos (`scripts/gates`, `scripts/harness`, `.claude/harness`, `policy.json`) ficam fora desta change. As regras comuns de execução continuam em `.claude/harness/policy.md` e os parâmetros em `.claude/harness/policy.json`; este design referencia os dois e não os repete.

Ver `proposal.md` (Why) para a motivação.

- **Comportamento novo:** sim
- **Política:** `.claude/harness/policy.md` e `.claude/harness/policy.json` (referenciados, não repetidos).

## Goals / Non-Goals

**Goals**

- Um ponto de entrada (`change-flow`) para pedidos comuns, com classificação por risco e registro mínimo por caminho.
- Classificação testável: o agente declara fatos com valor e evidência, e uma função pura determina o caminho.
- Fato desconhecido nunca vira ausência de risco: ele leva a investigação ou pergunta.
- Detecção de regra antiga em conflito no `CLAUDE.md` do projeto.

**Non-Goals**

- Sem novos mecanismos de orçamento, segurança de execução ou multifatia.
- Sem gate novo nem alteração de `scripts/gates`, `scripts/harness` ou `.claude/harness`.
- Sem avaliação visual real: contraste, foco e responsividade não são medidos nesta change.
- Sem migração automática de projetos existentes.

## Decisions

### D1. Classificação por fatos com valor e evidência

Cada fato tem um valor (`sim`, `não` ou `desconhecido`) e uma evidência. Sem evidência, o valor é `desconhecido`.

Os oito fatos:

| # | Fato | Significado | Quando é `sim` |
|---|------|-------------|----------------|
| 1 | `ambiguidadeEscopo` | A dúvida muda escopo, comportamento observável, compatibilidade ou critério de aceite. | Pergunta proporcional antes de qualquer alteração. |
| 2 | `apenasAparencia` | A mudança é só visual ou textual, sem efeito funcional. | Candidato a caminho 1, se os fatos 3 a 8 estiverem confirmados como `não`. |
| 3 | `impactoAcessibilidade` | Altera foco, rótulo, papel, contraste de texto ou componente, ou alvo de toque. | Caminho 2 no mínimo. |
| 4 | `comportamentoLocal` | Altera comportamento de um componente ou fluxo, sem mudar contrato externo. | Caminho 2. |
| 5 | `contratoExterno` | Altera API, evento, esquema, argumentos de CLI ou props públicas. Aparência de componente não conta. | Caminho 3. |
| 6 | `regraNegocio` | Altera regra de negócio relevante. | Caminho 3. |
| 7 | `areaSensivel` | Toca segredos, dados sensíveis, autenticação, permissões ou dependências de risco. | Caminho 3. |
| 8 | `arquitetural` | Altera arquitetura, fronteira de módulo ou dependência estrutural. | Caminho 3. |

Regras, em ordem:

- **R1 (sim decide para cima):** `ambiguidadeEscopo` = `sim` → `esclarecer`. Qualquer um dos fatos 5 a 8 = `sim` → caminho 3.
- **R2 (sim decide para o caminho 2):** fato 3 ou 4 = `sim` (com 5 a 8 todos `não`) → caminho 2.
- **R3 (caminho 1 exige confirmação):** `apenasAparencia` = `sim`, e os fatos 3 a 8 confirmados como `não` → caminho 1. Se algum deles está `desconhecido`, a classificação não é 1.
- **R4 (desconhecido não é ausência):** se um fato que decidiria o caminho para baixo está `desconhecido`, a saída é `investigar`: ler o código, a documentação ou o pedido, ou perguntar. Não se classifica como `não`.
- **R5 (sem fato útil):** se não há fato `sim` e nem `apenasAparencia` confirmado, a saída é `esclarecer`.

R1 e R2 decidem pelo `sim`, que é seguro porque um risco confirmado sempre sobe o nível. R3 e R4 impedem que um desconhecido desça o nível.

A saída tem a forma `{ path: 1 | 2 | 3 | 'esclarecer' | 'investigar', reason, evidence }`.

### D2. Evidência por fato

Cada fato registra a evidência que o sustenta. Formas aceitas:

- trecho do pedido do usuário (citação literal);
- caminho e linha do código (`arquivo:linha`);
- resultado de medição (por exemplo, razão de contraste calculada, com as cores);
- resposta do usuário à pergunta feita pelo agente.

Um fato sem evidência é `desconhecido`, e o motivo fica no registro.

### D3. Caminho 1 sem change OpenSpec

Registro em `docs/agents/issue-tracker.md`: data, pedido, fatos com valor e evidência, arquivos alterados, verificação executada, lacunas declaradas e classificação. A entrada não cria `openspec/changes/`. Por isso o `pr-gate` não é afetado por caminhos 1.

### D4. Verificação proporcional

A verificação usa os checks de `template.json` → `checks` pertinentes aos arquivos alterados. A suíte completa é exigida quando o arquivo altera código ou o caminho 2 ou 3 está em uso. Cor e texto sem efeito funcional passam por lint e pelos checks afetados. Quando há impacto de acessibilidade (fato 3), o contrato declara o critério aplicável ao elemento (foco, rótulo, alvo, contraste) e o projeto decide os limites. Os números de referência (4,5:1, 3:1, 24 px, 320 px) são exemplos de critério e não viram regra universal.

Uma verificação que não pode ser feita é registrada como lacuna, e não é substituída por uma verificação diferente sem aviso.

### D5. Caminho 2 supervisionado

O caminho 2 apresenta contrato curto e é executado de forma supervisionada nesta versão. Essa limitação é declarada no registro. A classificação de risco não depende do modo de execução.

### D6. Detecção de regra antiga

`detectRuleConflict(claudeMdText)` procura a frase "Zero código sem spec". Se ela aparece e o texto não menciona `change-flow`, retorna conflito com o número da linha. A skill executa a detecção antes de aplicar os caminhos. Com conflito, a skill reporta e pede a migração explícita antes de seguir.

### D7. Migração de projetos existentes

`CLAUDE.md` é `owned`. O `template-update` não o sobrescreve. A mudança do template (§1) chega a projetos existentes somente por migração explícita. Até lá, a detecção de D6 impede que a skill nova contradiga a regra antiga.

### D8. Ponto de entrada

`.claude/skills/change-flow/SKILL.md` lista pedidos comuns como gatilhos na descrição (ajuste de cor, de texto, de espaçamento e similares), sem exigir que o usuário nomeie uma skill. A skill `spec-create` passa a declarar que o caminho 2 usa contrato curto e que o caminho 3 é o fluxo completo.

## Exemplos

- **Troca de cor.** Pedido: "troque a cor do botão primário para #0B5". Fatos: `apenasAparencia` = `sim` (evidência: `Button.css:12`, só `background-color`). `impactoAcessibilidade` = `desconhecido` até medir o contraste do texto sobre o novo fundo. Com a razão medida acima do limite do projeto, o fato vira `não` e a saída é caminho 1. Sem a medição, a saída é `investigar`. Com razão abaixo do limite, o fato vira `sim` e a saída é caminho 2.
- **Mudança localizada de comportamento.** Pedido: "o botão Salvar fica desabilitado enquanto o formulário envia". Fatos: `comportamentoLocal` = `sim` (evidência: `SaveButton.tsx:20`). `contratoExterno` = `não`, confirmado pela leitura das props e da chamada de API, sem mudança de endpoint. Saída: caminho 2.
- **Regra de negócio relevante.** Pedido: "desconto de 10% para pedidos acima de R$ 500". Fatos: `regraNegocio` = `sim` (evidência: citação literal do pedido e `docs/agents/domain.md`). Saída: caminho 3, com aprovação formal.
- **Pedido ambíguo.** Pedido: "melhore o botão". Fatos: `ambiguidadeEscopo` = `sim`. Não se sabe se a melhoria é de aparência, de comportamento ou de acessibilidade. Saída: `esclarecer`, com a pergunta "qual aspecto você quer melhorar: aparência, comportamento ou acessibilidade?". Não é caminho 3 por padrão.

## Interfaces e regras compartilhadas

- IF-001: `classifyRequest(facts)` retorna `{ path, reason, evidence }`. `facts` é um objeto com os oito fatos, cada um `{ value: 'sim' | 'não' | 'desconhecido', evidence }`. Fato ausente conta como `desconhecido`.
- IF-002: `detectRuleConflict(claudeMdText)` retorna `{ conflict: boolean, line?: number }`.
- RG-001: a classificação não usa tamanho do diff como entrada.
- RG-002: fato `desconhecido` nunca é tratado como `não` para descer de caminho.
- RG-003: a skill nunca cria change OpenSpec no caminho 1.
- RG-004: nenhum caminho dispensa guardrails de segredos, permissões, escopo e publicação.

## Fatias

- F1 (`implement`): skill `change-flow`, `change-flow.mjs`, testes, ajustes em `spec-create`, `CLAUDE.md` §1 e atualização dos testes de texto. Dependências: nenhuma.

Só existe uma fatia, de acordo com a limitação atual do runner.

## Comportamento preservado

- Gates, runner, política, orçamento e caminhos protegidos não mudam.
- `template.json` continua com `CLAUDE.md` em `owned`.
- Todo caminho 3 continua passando por `spec-create`, aprovação formal e gates atuais.
- Projetos existentes mantêm o fluxo atual até migração.

## Testes obrigatórios

- Classificação: uma asserção por regra (R1 a R5) e um teste por exemplo (troca de cor com contraste medido, mudança localizada, regra de negócio, pedido ambíguo).
- Fato desconhecido: `desconhecido` que decidiria a descida retorna `investigar`, nunca caminho 1 ou 2.
- Evidência: fato sem evidência é tratado como `desconhecido`.
- Detecção de conflito: regra antiga, regra atualizada e texto sem a frase.
- Estáticos da skill: critérios por risco, ausência do tamanho do diff como critério, guardrails em todos os caminhos, gatilhos de pedidos comuns.
- Texto das skills existentes: `spec-create.test.mjs`, `skills-pipeline.test.mjs`, `headless.test.mjs`, `claude-md.test.mjs`, atualizados com justificativa.

Os testes são estáticos ou de função pura. Eles não provam que um agente real classifica bem um pedido. Avaliação visual real (troca de cor, acessibilidade, responsividade) fica fora desta entrega.

## Ambiente e sandbox

- Comandos: `checks.test`, `checks.lint`, `checks.typecheck` de `template.json`. Nenhum comando pago.
- Arquivos que a fatia pode tocar: `.claude/skills/change-flow/**`, `.claude/skills/spec-create/SKILL.md`, `CLAUDE.md`, `docs/agents/issue-tracker.md` (apenas registro), `scripts/test/change-flow/**`, e os testes de texto listados acima.
- Não tocar: caminhos protegidos do `policy.json`.
- Sem chamada ao modelo na fatia.

## Riscos

- **Classificação errada pelo agente.** Os fatos são declarados pelo agente e não verificados por script. Mitigação: evidência obrigatória (D2), `desconhecido` que não desce de caminho (R4), e a classificação é informada ao usuário. Risco residual, declarado.
- **Guardrails sem gate automático.** Segredos e escopo do caminho 1 dependem da declaração do agente. Mitigação nesta change: texto obrigatório e registro. Gate próprio fica para outra change.
- **Regra antiga em projeto existente.** Mitigação: D6 e D7.
- **Validação do caminho 2 curto.** Respondida no planejamento; repetida na fase de implementação (tarefa 6.1).

## Perguntas abertas

- Nenhuma nesta change. O contrato curto de caminho 2 passa nos validadores (ver histórico no tracker).
