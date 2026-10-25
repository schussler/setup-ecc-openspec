# Design

## Context

Ver `proposal.md` (Why). O nome do pacote aparece em `package.json`, `template.json` → `framework.package`, `scripts/cli/common.mjs` (`PACKAGE_NAME`), README, quatro skills, `docs/agents` e testes. `should-publish.mjs` e `publish.yml` leem o nome do `package.json` e já publicam com `--access public`, exigido para pacote com escopo.

As regras comuns de execução estão em `.claude/harness/policy.md` e os parâmetros em `.claude/harness/policy.json`. Este design referencia os dois e não repete valores.

- **Comportamento novo:** sim
- **Política:** `.claude/harness/policy.md` e `.claude/harness/policy.json` (referenciados, não repetidos).

## Goals / Non-Goals

**Goals:** publicar como `@k0d3r/specloop`; nenhuma instrução de instalação sem o escopo.

**Non-Goals:** trocar a marca, o repositório ou o `bin`; criar organização no npm; publicar nesta change.

## Decisions

### D1. Uma fonte para o nome

`PACKAGE_NAME` do CLI passa a ler `name` do `package.json` do pacote, em vez de uma constante. `framework.package` gravado por `init`, `install` e `update` sai daí. Alternativa: trocar a constante. Descartada: duas fontes podem divergir de novo.

### D2. `bin` mantido

O `bin` continua `specloop`. O npx, com `npx @k0d3r/specloop`, executa o bin cujo nome é o do pacote sem escopo; depois de instalado, o comando é `specloop`.

### D3. Testes leem o nome do pacote

Os testes que comparavam `framework.package` com `'specloop'` passam a comparar com `name` do `package.json` (fonte independente do código do CLI). Os testes de documentação exigem o escopo literal `@k0d3r/specloop`, que é o contrato externo.

## Interfaces e regras compartilhadas

- Instalação: `npx @k0d3r/specloop <install|init|adopt|update>`; atualização: `npx @k0d3r/specloop@latest update`.
- `template.json` → `framework: { package: "@k0d3r/specloop", version }`.

## Invariantes

- Nenhum documento instala por `npx specloop` sem escopo.
- O `bin` instalado continua `specloop`.

## Comportamento existente mantido

- Comandos, opções e efeitos de `install`, `init`, `adopt` e `update`; conteúdo do pacote (SL-010); workflows e regra da `main`.

## Testes necessários

- SL-005 (revisão 2) e CI-014 (revisão 2) com o novo texto.
- SL-018 e SL-019 (novos) em `scripts/test/cli/pacote.test.mjs` e `identidade.test.mjs`.
- SL-008 e SL-009 continuam com o mesmo texto; o valor esperado de `framework.package` vem do `package.json`.
- Suíte, lint e sintaxe verdes; CI da PR verde.

## Ambiente e sandbox

Node ≥ 22 local, sem rede nos testes. `npm pack` local.

## Fatias e dependências

- **F1** Código e testes (D1, D3, SL-018). Depende das autorizações de SL-005 e CI-014.
- **F2** Documentação (README, skills, `docs/agents`) e SL-019.
- **F3** PR, CI e merge; depois, a primeira publicação (passo 3 do README) e os passos 4 a 7.

## Risks / Trade-offs

- **[Risco] Escopo pessoal.** → Aceito pelo usuário; migrar para uma organização depois é outra change (novo nome, `npm deprecate` do antigo).
- **[Risco] Documento esquecido com `npx specloop`.** → SL-019 varre README, skills e `docs/agents`.

## Migration Plan

1. F1 e F2 na branch, com a suíte verde. 2. PR e merge. 3. Publicação manual de `@k0d3r/specloop@0.1.0`. 4. Rollback: reverter o commit; nada foi publicado com o nome antigo.

## Premissas

As mesmas de `proposal.md` → `## Premissas`.

## Open Questions

Nenhuma.
