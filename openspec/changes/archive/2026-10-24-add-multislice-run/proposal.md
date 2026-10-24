# Proposta: execução multifatia sequencial (mínimo)

## Motivo

O runner executa uma única fatia (`REQUIRED_SLICES = ['implement']`). Uma change com duas fatias dependentes não
pode ser concluída sem refazer a primeira, e a validação final só conhece uma fatia. Esta change adiciona o percurso
mínimo: executar a primeira fatia, validá-la, avançar para a segunda e retomar sem repetir a primeira.

## Escopo desta change

- Fatias declaradas em `tasks.md` por cabeçalho `## Fatia: <nome>`, em ordem; cada fatia depende da anterior.
- Sem declaração, o comportamento é o atual (uma fatia `implement`), sem alteração.
- Execução sequencial: uma fatia por vez, cada invocação recebe a tarefa da fatia (`--task`).
- Aprovação por fatia registrada com o nome da tarefa.
- Retomada sem nova invocação das fatias já aprovadas.
- Validação final recusa enquanto houver fatia declarada sem aprovação.

## Registro de ajustes já feitos (antes deste contrato)

Estes ajustes foram implementados antes da existência desta change, sem RED retroativo. Estão aqui para
rastreabilidade e não são evidência de TDD:

1. `--claude-bin` aceita executável com espaço no caminho, array JSON ou comando separado por espaços (`cli-run.mjs`,
   `binOf`). Cobertura: `scripts/test/harness/bin-argv.test.mjs`.
2. Intenção de aprovação por caminho: caminho 2 aceita "pode fazer", "pode implementar", "aprovo", "aprovado";
   caminho 3 aceita "aprovado", "aprovo", "pode implementar"; negação não conta (`authorize.mjs`). Cobertura:
   `aprovacao-conversa.test.mjs`, AP-012 e AP-013. O assert de AP-004 que proibia "aprovado" no caminho 2 foi
   alterado por esta regra.

## Escopo acrescentado (aprovado pela conversa em 2026-10-24)

- Preflight antes de qualquer chamada ao modelo: Git com commit base, identidade Git, identidade do projeto,
  marco de adoção, perfil, checks do `template.json`, ferramenta `claude` e permissões. Qualquer item bloqueado
  para a execução com `preflight_blocked` e nenhuma invocação.
- Permissão negada na invocação é bloqueio operacional (`permission_denied`): para sem chamada de correção.
- Reutilização de aprovação de fatia: se código, contrato, checks, perfil, dependências ou autorizações mudarem
  depois da aprovação, o cenário da fatia é reavaliado pelo gate, sem chamada ao modelo. Passa: a aprovação
  é mantida com a nova impressão. Falha: a aprovação é retirada e a fatia volta ao ciclo com o modelo.
- Conciliação de chamadas e consumo entre estado, eventos e relatório. Divergência impede a conclusão.
- Piloto: uma change de duas fatias dependentes no `harness-pilot`, executada pelo fluxo real com a assinatura,
  modo observação, sem orçamento financeiro e sem API paga.

## Fora desta change (planejado, não implementado)

- Registro formal de verificação humana além da aprovação pela conversa.
- Invalidação de fatias por mudança de dependência entre fatias (cada fatia depende só da anterior nesta change).
- Otimização dos gates e isolamento do executor.

## Premissas

- O simulador (`fake-claude.mjs`) cobre o percurso de duas fatias; a execução real é etapa separada.
- O gate de implementação continua sendo o da suíte do projeto; não há gate por fatia.
