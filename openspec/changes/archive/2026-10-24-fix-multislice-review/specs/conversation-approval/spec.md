## ADDED Requirements

### Requirement: Intenção de aprovação completa e conservadora
O registro de aprovação pela conversa SHALL aceitar só afirmação completa por palavra inteira, SHALL recusar negação ou pergunta em qualquer posição, e SHALL recusar frase ambígua.

#### Scenario: desaprovação e palavras parecidas não autorizam
- **ID:** AP-014
- **Revisão:** 1
- **WHEN** a instrução é "Desaprovo.", "Desaprovado o escopo.", "Reaprovado." ou "Aprovo ou não, depende."
- **THEN** o registro é recusado e nada é gravado

#### Scenario: intenção como palavra inteira
- **ID:** AP-015
- **Revisão:** 1
- **WHEN** a instrução é "Aprovos isso." ou "Implementar, por favor."
- **THEN** o registro é recusado e nada é gravado
