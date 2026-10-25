# Tasks

## 1. F1 — Código e testes

- [x] 1.1 Autorizações `scenario_change` de SL-005 e CI-014 (revisão 2), gravadas pelo usuário; trocar `auth:PENDENTE-*` pelos ids
- [x] 1.2 RED: SL-018 em `scripts/test/cli/pacote.test.mjs`; SL-008 e SL-009 passam a esperar `name` do `package.json`
- [x] 1.3 GREEN: `package.json` → `name`; `template.json` → `framework.package`; `PACKAGE_NAME` lido do `package.json` (design.md D1)
- [x] 1.4 Verificação: suíte, lint e sintaxe verdes

## 2. F2 — Documentação

- [x] 2.1 RED: SL-019 em `identidade.test.mjs`; SL-005 e CI-014 com o escopo
- [x] 2.2 GREEN: README, skills `new-project`, `template-update`, `template-migrate`, `template-check` e `docs/agents` com `npx @k0d3r/specloop`
- [x] 2.3 Verificação: suíte, lint, sintaxe, `openspec validate --all`; tarball `k0d3r-specloop-0.1.0.tgz` e `npx --package=<tgz> specloop init` num diretório temporário

## 3. F3 — Entrega

- [ ] 3.1 PR com CI verde e merge (sob pedido do usuário)
- [ ] 3.2 Primeira publicação manual de `@k0d3r/specloop@0.1.0` e passos 4 a 7 do README
