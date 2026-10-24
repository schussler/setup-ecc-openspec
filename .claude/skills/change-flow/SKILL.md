---
name: change-flow
description: Ponto de entrada para pedidos comuns de alteração. Classifica o pedido por risco em um de três caminhos, sem exigir o nome de uma skill. Use para pedidos como "troque a cor do botão", "ajuste o texto da tela", "o botão deve ficar desabilitado enquanto envia", "desconto de 10% acima de R$ 500" ou "melhore o botão". Também detecta a regra antiga "Zero código sem spec" no CLAUDE.md do projeto.
metadata:
  origin: local
---

# Change flow

Ponto de entrada antes de qualquer alteração. O objetivo é escolher um fluxo proporcional ao risco, sem burocracia desnecessária.

O tamanho do diff não é critério de classificação. "É só UI" também não basta para o caminho 1.

## Passo 0: regra antiga

Antes de aplicar qualquer caminho, rode:

```
node .claude/skills/change-flow/change-flow.mjs conflict CLAUDE.md
```

Se a saída tiver `"conflict":true`, pare, informe a linha e peça a migração explícita da regra "Zero código sem spec" antes de seguir.

## Fatos da classificação

Para cada fato, declare um valor (`sim`, `não` ou `desconhecido`) e a evidência que o sustenta. Fato sem evidência é `desconhecido`.

Evidência aceita: citação do pedido, `arquivo:linha`, resultado de medição (por exemplo, razão de contraste com as cores) ou resposta do usuário.

| Fato | Pergunta |
|------|----------|
| `ambiguidadeEscopo` | A dúvida muda escopo, comportamento observável, compatibilidade ou aceite? |
| `apenasAparencia` | A mudança é só visual ou textual, sem efeito funcional? |
| `impactoAcessibilidade` | Altera foco, rótulo, papel, contraste de texto ou componente, ou alvo de toque? |
| `comportamentoLocal` | Altera comportamento de um componente ou fluxo, sem mudar contrato externo? |
| `contratoExterno` | Altera API, evento, esquema, argumentos de CLI ou props públicas? Aparência de componente não é contrato de API. |
| `regraNegocio` | Altera regra de negócio relevante? |
| `areaSensivel` | Toca segredos, dados sensíveis, autenticação, permissões ou dependências de risco? |
| `arquitetural` | Altera arquitetura, fronteira de módulo ou dependência estrutural? |

Só mudança de contrato externo leva ao caminho 3 por interface. Mudar a aparência de um componente não muda o contrato.

## Regras

Aplique em ordem. `classifyRequest` em `change-flow.mjs` implementa estas regras.

1. `ambiguidadeEscopo` = `sim` → `esclarecer`, com a pergunta proporcional.
2. Qualquer fato de `contratoExterno`, `regraNegocio`, `areaSensivel` ou `arquitetural` = `sim` → caminho 3.
3. `impactoAcessibilidade` ou `comportamentoLocal` = `sim`, com os fatos do caminho 3 confirmados como `não` → caminho 2.
4. `apenasAparencia` = `sim`, com os fatos de 3 a 8 confirmados como `não` → caminho 1.
5. Fato de risco `desconhecido` que decidiria a descida → `investigar`: ler o código, a documentação ou o pedido, ou perguntar. Nunca trate `desconhecido` como `não`.
6. Sem fato `sim` útil e sem aparência confirmada → `esclarecer`.

Dúvida que não muda escopo, comportamento, compatibilidade nem aceite vira premissa registrada e não sobe o caminho. Não transforme qualquer ambiguidade em caminho 3.

## Caminho 1: ajuste visual ou textual

Executa dentro do pedido explícito, informando a classificação e os fatos com evidência.

No caminho 1 o registro vai para `docs/agents/issue-tracker.md` e não se cria change OpenSpec. A entrada tem data, pedido, fatos com evidência, arquivos alterados, verificação executada, lacunas e classificação.

Escalada que amplie escopo ou custo exige confirmação.

## Caminho 2: comportamento localizado

No caminho 2 apresente um contrato curto com objetivo, escopo, critérios de aceite e testes necessários. Confirme as decisões que faltarem antes de implementar.

A execução supervisionada nesta versão é uma limitação declarada, e não significa custo zero. A classificação de risco não depende do modo de execução.

## Caminho 3: mudança funcional ou arquitetural

No caminho 3 use `spec-create`, com aprovação formal do contrato e os gates atuais. Não pule gates, mesmo para um pedido que parece pequeno.

## Verificação proporcional

Execute os checks pertinentes aos arquivos e riscos afetados, usando `template.json` → `checks`. A suíte completa e a captura de tela não são obrigatórias em toda alteração textual ou visual.

Quando uma verificação não puder ser feita, declare a lacuna. Não substitua por outra verificação sem avisar.

Para acessibilidade, use os critérios aplicáveis ao elemento e ao projeto. Números de referência (razão de contraste, alvo de toque, largura de reflow) são exemplos de critério e não regras universais.

## Guardrails em todos os caminhos

Guardrails em todos os caminhos: segredos, permissões, escopo declarado e nenhum push, PR ou publicação sem pedido explícito.

- Segredos e autenticação não mudam sem caminho 3.
- Altere só os arquivos declarados no registro ou no contrato.
- Push, PR e publicação só com pedido explícito.
