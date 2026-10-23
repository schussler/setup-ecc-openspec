# Proposal

## Why

`CLAUDE.md`, `docs/agents/`, `.claude/settings.json` e `checks` são `owned`, então o `/template-update` nunca os entrega a projetos existentes. Além disso, o `/template-update` compara a lista `managed` do próprio projeto: um caminho `managed` novo do template (como `scripts/gates`) nunca chega a um projeto antigo. Sem esses itens, as skills do pipeline chegam, mas os gates falham por configuração ausente.

## What Changes

- Nova skill `template-migrate` com o script `migrate.mjs` no próprio diretório da skill. Ele chega pelo `/template-update` e roda localmente, sem executar código do clone do template.
- O script tem `plan` (só leitura) e `apply` (só os itens confirmados). Os itens são:
  - `managed`: entradas novas de `managed`/`owned` no manifesto e a cópia dos caminhos `managed` ausentes;
  - `docs-agents`: modelos copiados só se o diretório não existir;
  - `checks`: candidatos detectados, grava só o que foi confirmado;
  - `settings`: merge só aditivo de `permissions.allow`;
  - `claude-md`: blocos marcados `<!-- template:<id>:start/end -->`, preservando o resto.
- O `CLAUDE.md` do template passa a marcar os blocos `agents-context` e `pipeline`.

## Capabilities

### New Capabilities

- `project-migration`: migração explícita, confirmada item a item, dos caminhos `owned` e dos `managed` novos para projetos derivados existentes.

### Modified Capabilities

Nenhuma.

## Impact

- Novos: `.claude/skills/template-migrate/` e testes em `scripts/test/`.
- Alterados: o `CLAUDE.md` do template (marcadores) e o README.
- Sem dependências novas.
