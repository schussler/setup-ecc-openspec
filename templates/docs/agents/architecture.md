# Arquitetura

Leia este arquivo antes de explorar o código. Mantenha curto: o que um agente precisa para não quebrar nada. Detalhes vivem no código e nas specs (`openspec/specs/`).

## Visão geral

- **O que o sistema faz:** TBD
- **Stack:** TBD (linguagem, framework, banco, runtime)
- **Como rodar localmente:** TBD

## Módulos

| Caminho | Responsabilidade | Pode depender de |
|---------|------------------|------------------|
| TBD | TBD | TBD |

## Fronteiras e regras

- **Entradas externas (validar aqui):** TBD
- **Integrações externas (mockar só aqui nos testes):** TBD
- **Caminhos que o agente não deve alterar sem pedido:** TBD

## Verificação

Os comandos ficam em `template.json` → `checks` (`test`, `lint`, `typecheck`). Os gates leem de lá. Se algum estiver vazio, preencha antes de usar `spec-implement`.

- **Onde ficam os testes:** TBD
- **Convenção de nome de teste:** use o nome do cenário da spec (o gate de arquivamento casa cenário e teste pelo nome).

## Decisões

Liste decisões que um agente poderia desfazer por engano, com a razão. Uma linha cada.

- TBD
