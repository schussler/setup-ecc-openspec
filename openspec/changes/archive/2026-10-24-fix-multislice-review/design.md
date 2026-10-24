# Design

## D1. Aprovação pela conversa

Intenções são sequências de palavras inteiras (`CONVERSATION_INTENTS`), comparadas por igualdade. Negação em
qualquer posição (`NEGATIVE_WORDS`) ou pergunta recusa. Ambiguidade não autoriza.

## D2. Escrita da aprovação de fatia

`approveSlice` grava `slice`, `task`, impressão e casos numa única escrita de estado. Não há mais segunda escrita para
identificar a tarefa.

## D3. Revalidação

Usa `guardedEvaluation` com o prazo da política. Interrompida: devolve `revalidation_interrupted`, com a aprovação
antiga intocada. A validação final recusa aprovação cuja impressão não é a atual (`revalidation_required`).

## D4. Correções

`counters.corrections` é indexado por `fatia:gate` quando há tarefa. `counters.corrections_total` acumula no change.

## D5. Medição e conciliação

Invocação negada e invocação que falhou são contagens distintas (`invocations.with_denials`, `invocations.failed`).
Conciliação compara: contador e lista do estado, eventos (descontando interrompidas sem evento), medição do relatório
calculada a partir dos eventos, e fonte de custo de cada evento pago. No modo financeiro, consumo do estado contra
eventos.

## D6. Sanitização

Negação registra só `tool_name`. Nada do comando.
