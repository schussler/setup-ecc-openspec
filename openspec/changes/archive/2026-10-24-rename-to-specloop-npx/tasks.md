# Tasks

## 1. F1 — Identidade (nome, créditos, nome pessoal)

- [x] 1.1 RED: `scripts/test/cli/identidade.test.mjs` com SL-001 e SL-002 (varredura de `git ls-files`, termos montados por partes, design.md D6), SL-003, SL-004 e SL-005
- [x] 1.2 GREEN: trocar o nome antigo por SpecLoop/specloop em README, `template.json`, skills `new-project`, `template-update`, `template-migrate`, `template-check`, `docs/agents/architecture.md`, `docs/agents/issue-tracker.md`, `scripts/test/template-migrate.test.mjs`, relatório de benchmark de 2026-10-23 e design arquivado de `add-matt-skills-and-benchmark`
- [x] 1.3 GREEN: trocar o nome pessoal por `mantenedor` nas fixtures de `scripts/test/harness/`, no campo `approver` dos `authorizations.json` arquivados e no `issue-tracker.md`; registrar a exceção a PM-005 no `issue-tracker.md` (só `approver`, fora do hash)
- [x] 1.4 GREEN: README como framework, seção de créditos (ECC, OpenSpec, `mattpocock/skills`, com link e licença) e glossário de `docs/agents/domain.md` (framework, projeto SpecLoop)
- [x] 1.5 Verificação: suíte, lint e sintaxe verdes; `openspec validate --all`

## 2. F2 — Pacote, `install` e `update`

- [x] 2.1 RED: `scripts/test/cli/install.test.mjs` com SL-006 e SL-007
- [x] 2.2 GREEN: `package.json` (`name: specloop`, `bin`, `files`, `engines.node >= 22`, sem `dependencies`), `bin/specloop.mjs` e `scripts/cli/` (parse de argumentos, confirmação, cópia de `managed`) (design.md D1 a D3)
- [x] 2.3 RED: `scripts/test/cli/update.test.mjs` com SL-009, SL-014, SL-015 e SL-016
- [x] 2.4 GREEN: `update` com os três grupos, `check-update` de `migrate.mjs`, conversão de `template.repo` em `framework` (design.md D4); `template.json` do framework com `framework`
- [x] 2.5 Classificar `bin` e `scripts/cli` no manifesto e incluí-los em `checks.typecheck`
- [x] 2.6 Verificação: suíte, lint e sintaxe verdes

## 3. F3 — `init`, `adopt` e skills como wrappers

- [x] 3.1 RED: `scripts/test/cli/init.test.mjs` com SL-008 e SL-011
- [x] 3.2 GREEN: `init` (git init, cópia, poda de rules e `template_only`, `docs/agents` dos modelos, `template.json` com `framework`, título do `CLAUDE.md` e README, commit com `--yes`)
- [x] 3.3 RED: `scripts/test/cli/adopt.test.mjs` com SL-012 e SL-013
- [x] 3.4 GREEN: `adopt` chamando `migrate.mjs plan`/`apply` com a raiz do pacote como template
- [x] 3.5 RED: SL-017 em `scripts/test/cli/skills-wrapper.test.mjs`
- [x] 3.6 GREEN: `new-project`, `template-update` e `template-migrate` delegam ao CLI (design.md D5), mantendo `--non-interactive` e `--template-source`; ajustar testes de skills existentes que leiam o texto antigo, com justificativa no `issue-tracker.md`
- [x] 3.7 GREEN: README com os quatro comandos `npx specloop`, sem instruções de `git fetch`
- [x] 3.8 Verificação: suíte, lint e sintaxe verdes; benchmark greenfield não é rodado (pago), mas seu runner continua chamando `/new-project --non-interactive`

## 4. F4 — Verificação do pacote

- [x] 4.1 RED: `scripts/test/cli/pacote.test.mjs` com SL-010 (`npm pack --dry-run --json`)
- [x] 4.2 GREEN: ajustar `files` até passar
- [x] 4.3 Evidência manual: `npm pack`, `npx <tarball> init <tmp> --yes --name demo --languages typescript` e `openspec validate --all` no projeto gerado; registrar no `issue-tracker.md`
- [x] 4.4 Verificação final: suíte, lint, sintaxe, `openspec validate --all`, varredura SL-001/SL-002 verde

## 5. F5 — Publicação (adiada para `add-npm-publish-ci`)

Decisão do usuário em 2026-10-24: a publicação passa a ser feita pela CI da `main`, com push direto bloqueado (só PR, sem exceção). Os passos abaixo ficam abertos e são cobertos pela change `add-npm-publish-ci`. O `gh` desta máquina só tem leitura no repositório: renomear e publicar ficam com o dono.

- [x] 5.1 Renomear o repositório no GitHub para `specloop` (dono do repositório) (2026-10-24, `schussler/specloop`)
- [x] 5.2 Primeira publicação manual de `specloop` no npm (pré-requisito do trusted publishing) (publicado como `@k0d3r/specloop@0.1.0`: o nome sem escopo foi recusado; ver `use-scoped-npm-package`)
- [x] 5.3 Publicações seguintes pela CI, em `add-npm-publish-ci` (`0.1.1` pela CI em 2026-10-25)
