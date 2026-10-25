# Proposal

## Why

Na primeira publicação, o npm recusou o nome `specloop` (E403: "Package name too similar to existing package spec-loop") e sugeriu o escopo da conta. O usuário escolheu `@k0d3r/specloop`. A marca SpecLoop, o repositório `schussler/specloop` e o comando instalado `specloop` continuam iguais; muda o nome do pacote e, com ele, o que se digita no `npx`.

## What Changes

- `package.json` → `name: @k0d3r/specloop`; `bin` continua `specloop` (o `npx @k0d3r/specloop <comando>` resolve o bin pelo nome sem escopo).
- `template.json` → `framework.package` e `PACKAGE_NAME` do CLI passam a `@k0d3r/specloop`.
- README, skills `new-project`, `template-update`, `template-migrate` e `template-check`, e `docs/agents` passam a `npx @k0d3r/specloop ...` e `npx @k0d3r/specloop@latest update`.
- README → Publicação: `npm trust github @k0d3r/specloop --file publish.yml --repo schussler/specloop --env npm`.
- Cenários SL-005 e CI-014 sobem para a revisão 2 (texto com o nome do pacote). Testes que fixavam `specloop` como nome de pacote passam a ler o nome do `package.json`.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `framework-identity`: o README documenta a instalação por `npx @k0d3r/specloop`.
- `release-ci`: o passo do trusted publisher usa `@k0d3r/specloop`.
- `framework-cli`: requisito novo de nome de pacote com escopo e `bin` `specloop`.

## Impact

- Arquivos: `package.json`, `template.json`, `scripts/cli/common.mjs`, `README.md`, skills citadas, `docs/agents/architecture.md`, `docs/agents/domain.md`, testes em `scripts/test/cli/` e `scripts/test/ci/`.
- `publish.yml` e `should-publish.mjs` não mudam: já usam `--access public` e leem o nome do `package.json`.
- Externo: a primeira publicação (passo 3 do README) passa a ser de `@k0d3r/specloop`, depois do merge.
- Política: `.claude/harness/policy.md` e `.claude/harness/policy.json` (referenciadas, não repetidas).

## Comportamento

- **Comportamento novo:** sim

## Premissas

- O histórico (changes arquivadas e log do `issue-tracker.md`) continua citando `specloop` como nome de pacote: registra o que foi decidido na época e não é reescrito.
