# Proposal

## Why

Hoje o template entrega o fluxo `/opsx:propose` → `/opsx:apply` → `/opsx:archive`, mas nada mede se a entrega está pronta. Não há contexto de engenharia que o agente leia antes de agir, nem gate verificável, nem um jeito de rodar o pipeline sem uma pessoa respondendo. Sem isso, não dá para saber se o agente entrega o mesmo resultado em execuções repetidas, nem se o contexto em `docs/agents/` ajuda de fato.

## What Changes

- Modelos de contexto para agentes em `templates/docs/agents/` (`architecture.md`, `domain.md`, `issue-tracker.md`, com campos `TBD`). O `/new-project` copia esses modelos para `docs/agents/` do projeto gerado.
- `template.json` ganha:
  - `docs/agents` e `.claude/settings.json` em `owned`;
  - o campo `checks` (`test`, `lint`, `typecheck`, e os opcionais `test_file` e `coverage`);
  - o campo `template_only`, com os caminhos que o `/new-project` remove do projeto gerado;
  - o terceiro upstream, `mattpocock-skills`.
- Gates determinísticos em `scripts/gates/` (implementação, arquivamento, PR, escopo, lint e sintaxe), com pontuação em JSON, limite de tentativas e parada sem melhora.
- Novas skills em `.claude/skills/`:
  - `spec-create`, interativa com `grill-me` (e fallback embutido) ou `--headless`;
  - `spec-implement`, com TDD e autocorreção;
  - `spec-archive`;
  - `pr`, só sob pedido explícito;
  - `handoff`.

  As skills `spec-*` são wrappers finos sobre `/opsx:*`. Partes de `spec-create`, `spec-implement`, `pr` e `handoff` são adaptadas de `mattpocock/skills` (MIT).
- Modo headless: as skills rodam por `claude -p`, com permissões em `.claude/settings.json` (`permissions.allow`) e `--permission-mode dontAsk`. O `/new-project` ganha um modo não interativo.
- Runner de benchmark em `scripts/benchmark/` com dois cenários:
  - greenfield;
  - migração em legado, com fixture própria e comparação com e sem `docs/agents/`.

  Ele gera relatório em JSON e Markdown.
- `CLAUDE.md` passa a exigir a leitura de `docs/agents/` e descreve o pipeline de 4 passos com gates que não podem ser pulados.
- `upstream-sync-check` e `template-check` passam a cobrir o terceiro upstream e os novos campos do manifesto.
- Suíte de testes do próprio template (`node --test`, sem dependências novas).

## Capabilities

### New Capabilities

- `agent-context`: modelos de `docs/agents/`, a cópia pelo `/new-project` e a classificação como arquivos próprios do projeto.
- `project-checks`: o campo `checks` do manifesto e o comportamento quando um comando falta.
- `spec-gates`: os gates com pontuação verificável e as regras do ciclo de autocorreção.
- `spec-pipeline`: as skills `spec-create`, `spec-implement`, `spec-archive`, `pr` e `handoff`, e a ordem entre elas.
- `headless-execution`: a execução das skills por `claude -p`, sem intervenção humana e sem pular permissões.
- `pipeline-benchmark`: o runner, os cenários, o orçamento de execuções e o relatório.
- `template-maintenance`: o terceiro upstream no manifesto e nas checagens do template.

### Modified Capabilities

Nenhuma. `openspec/specs/` está vazio neste repositório.

## Impact

- Código novo:
  - `scripts/gates/`, entregue aos projetos como `managed`;
  - `scripts/benchmark/` e `scripts/test/`, só no template;
  - `templates/docs/agents/`, só no template.
- Skills alteradas: `new-project`, `template-check`, `template-update` e `upstream-sync-check`.
- Projetos derivados existentes só recebem o novo `CLAUDE.md` e o `docs/agents/` por migração explícita, porque esses caminhos são `owned`. Os scripts e as skills chegam pelo `/template-update`.
- Não há dependência npm nova. O benchmark consome invocações de `claude -p`, até 60 por rodada, e o custo é reportado.
