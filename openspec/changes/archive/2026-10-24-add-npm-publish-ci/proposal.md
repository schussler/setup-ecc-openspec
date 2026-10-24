# Proposal

## Why

O pacote `specloop` (change arquivada `rename-to-specloop-npx`) não tem CI nem forma segura de publicação recorrente. O repositório é aberto: qualquer pessoa abre PR, e hoje a `main` aceita push direto. O objetivo é que nada chegue à `main` sem CI e que nada seja publicado no npm sem uma PR mergeada que suba a versão, sem token guardado no repositório e sem caminho de publicação fora da `main`.

## What Changes

- **`.github/workflows/ci.yml`:** em todo PR para a `main`, job `ci` (Node 22) roda `scripts/ci/run-checks.mjs`, que executa `test`, `lint` e `typecheck` de `template.json` → `checks`. Só `pull_request`, `permissions: contents: read`, sem `id-token`.
- **`.github/workflows/publish.yml`:** no push da `main`, com o environment `npm` (restrito à `main`), Node 24: roda os checks, decide com `scripts/ci/should-publish.mjs` e, se a versão do `package.json` ainda não está no npm, publica com `npm publish --provenance --access public` por trusted publishing (OIDC, `id-token: write`, sem token).
- **`scripts/ci/should-publish.mjs`:** versão nova → publica; versão já publicada → não publica; pacote inexistente → não publica e avisa que a primeira publicação é manual; qualquer outro erro do npm → falha.
- **`.github/rulesets/main.json`:** regra da `main`: exige PR e o check `ci`, bloqueia force push e exclusão, sem exceção (`bypass_actors: []`).
- **Actions fixadas por SHA de commit.** Nenhum workflow usa `pull_request_target`.
- **README → Publicação:** os sete passos do dono, em ordem, com comandos: renomear o repositório, criar o environment `npm` restrito à `main`, primeira publicação manual, trusted publisher com `--env npm`, bloquear publicação por token no npm, criar a regra da `main`, exigir aprovação de workflows de colaboradores externos.
- **Manifesto:** `.github` e `scripts/ci` em `template_only`; fora do pacote e dos projetos.

## Capabilities

### New Capabilities

- `release-ci`: CI de PR, publicação no npm pela `main` com trusted publishing, regra da `main` e passos do dono.

### Modified Capabilities

Nenhuma. `framework-cli` e o pipeline não mudam.

## Impact

- Arquivos novos: `.github/workflows/ci.yml`, `.github/workflows/publish.yml`, `.github/rulesets/main.json`, `scripts/ci/run-checks.mjs`, `scripts/ci/should-publish.mjs`, testes em `scripts/test/ci/`.
- Alterados: `template.json` (`template_only`, `checks.typecheck` inalterado: `scripts` já cobre `scripts/ci`), `README.md`, `docs/agents/architecture.md`.
- Externo (executado pelo dono, fora do agente): GitHub (rename, environment, ruleset, configuração de Actions) e npm (primeira publicação, trusted publisher, bloqueio de tokens). O `gh` local só tem leitura no repositório.
- Política: `.claude/harness/policy.md` e `.claude/harness/policy.json` (referenciadas, não repetidas). Nenhum caminho protegido muda.

## Comportamento

- **Comportamento novo:** sim

## Premissas

Não aprovadas individualmente; apresentadas na consolidação aprovada com "aprovado":

- `ci` roda em Node 22 (piso de `engines`, cobre a lacuna "Node 22 não verificado"); `publish` roda em Node 24 (trusted publishing exige npm ≥ 11.5.1). Se errado, muda só `node-version`.
- O check obrigatório chama `ci` (nome do job).
- Actions: `actions/checkout` e `actions/setup-node` v6, fixadas pelo SHA do commit da tag no momento da implementação.
- Os workflows só rodam no GitHub: os testes locais validam a lógica dos scripts e o conteúdo dos arquivos; a primeira PR real é a evidência manual (F4).
