# Proposta: correções da revisão da execução multifatia

## Motivo

A revisão da validação real (add-multislice-run) encontrou defeitos e afirmações sem sustentação. Esta change é
corretiva e mínima. Não acrescenta funcionalidade.

## Achados e decisão

1. Aprovação por substring e negações ("desaprovo", "desaprovado", "não aprovo"): corrigido com sequências de
   palavras inteiras, comparadas por igualdade, e recusa de qualquer negação ou pergunta (AP-014, AP-015).
2. Revalidação interrompida: motivo explícito `revalidation_interrupted`, aprovação antiga intocada, e validação
   final recusa aprovação de impressão anterior (MS-016, MS-017).
3. Aprovação e identidade da fatia em uma única escrita (MS-016).
4. Correções contadas por fatia e gate; o total do change acumula (MS-018). Decisão: o limite
   `max_corrections_per_gate` vale por `fatia:gate`; `max_invocations_per_change` e os limites de tempo continuam
   acumulados no change.
5. Identidade de cenário por igualdade exata (MS-019).
6. Negação de permissão e falha de invocação são medidas separadamente (MS-020).
7. Conciliação compara fontes reais, sem comparar contador com ele mesmo (MS-021).
8. Nome do comando e primeira palavra não são gravados (MS-022).

## Fora desta change

- Aprovação formal desta change: depende de frase do usuário (pendente).
- Interrupção real com modelo: não exercitada.
- Caminho com espaço no piloto real: comprovado só por simulador.
