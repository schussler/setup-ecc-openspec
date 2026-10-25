# Tasks

## 1. F1 — Scripts testáveis

- [x] 1.1 RED: `scripts/test/ci/run-checks.test.mjs` com CI-001 e CI-002
- [x] 1.2 GREEN: `scripts/ci/run-checks.mjs` sobre `loadChecks` e `runCommand` de `scripts/gates/checks.mjs`
- [x] 1.3 RED: `scripts/test/ci/should-publish.test.mjs` com CI-003 a CI-006
- [x] 1.4 GREEN: `scripts/ci/should-publish.mjs` (`decide` e CLI com `$GITHUB_OUTPUT`) (design.md D2)
- [x] 1.5 Verificação: suíte, lint e sintaxe verdes

## 2. F2 — Workflows e regra da main

- [x] 2.1 Obter os SHAs de `actions/checkout` v6 e `actions/setup-node` v6 com `gh api` (leitura)
- [x] 2.2 RED: `scripts/test/ci/workflows.test.mjs` com CI-007 a CI-013
- [x] 2.3 GREEN: `.github/workflows/ci.yml` (D4), `.github/workflows/publish.yml` (D3, D5) e `.github/rulesets/main.json` (D6)
- [x] 2.4 Verificação: suíte, lint e sintaxe verdes

## 3. F3 — Manifesto e documentação

- [x] 3.1 RED: `scripts/test/ci/docs.test.mjs` com CI-014 e CI-015
- [x] 3.2 GREEN: `.github` e `scripts/ci` em `template_only`; README → Publicação com os sete passos; `docs/agents/architecture.md`
- [x] 3.3 Verificação final: suíte, lint, sintaxe, `openspec validate --all`, SL-010 verde

## 4. F4 — Após o merge (dono do repositório)

- [x] 4.1 Executar os sete passos do README na ordem (2026-10-25; ver `issue-tracker.md`, log "F4 concluída")
- [x] 4.2 Abrir a primeira PR real e registrar no `issue-tracker.md` o check `ci` e, após o merge com versão nova, a publicação com proveniência (PR #4 a #6; `0.1.1` publicada pela CI com proveniência)
