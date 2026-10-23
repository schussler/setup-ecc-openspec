# Tasks

## 1. Script de migração

- [x] 1.1 Testes (RED) e implementação de `plan`/`apply` para os itens `managed`, `docs-agents`, `checks`, `settings` e `claude-md`; verificar com `node --test`
- [x] 1.2 Marcadores no `CLAUDE.md` do template; verificar com o teste de blocos
- [x] 1.3 Testes de idempotência, preservação e gates numa cópia do `MN_Academy`; verificar com `node --test`

## 2. Skill e piloto

- [x] 2.1 Skill `template-migrate` com confirmação por item; verificar com o teste de contrato
- [x] 2.2 Piloto: migrar uma cópia do `MN_Academy` e rodar `spec-create` → `spec-implement` headless numa change pequena; verificar os gates com os verificadores do runner
- [x] 2.3 `template-check` READY e README; verificar com o `template-check`
