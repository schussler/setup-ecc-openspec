# Design

## Context

Ver `proposal.md` (Why). O repositório não tem `.github/`. Os comandos de verificação ficam em `template.json` → `checks` e são lidos por `scripts/gates/checks.mjs` (`loadChecks`, `runCommand`). A suíte usa a CLI do OpenSpec (SL-008) e git. O pacote não tem dependências npm. O `gh` local tem só leitura no repositório atual, que ainda tem o nome antigo.

As regras comuns de execução estão em `.claude/harness/policy.md` e os parâmetros em `.claude/harness/policy.json`. Este design referencia os dois e não repete valores. Nenhum parâmetro muda.

- **Comportamento novo:** sim
- **Política:** `.claude/harness/policy.md` e `.claude/harness/policy.json` (referenciados, não repetidos).

## Goals / Non-Goals

**Goals**

- CI obrigatória em toda PR para a `main`.
- Publicação só a partir da `main`, só com versão nova, sem token guardado.
- Nenhum caminho de publicação por fork, por outra branch ou por PR aberta.

**Non-Goals**

- Aplicar configurações no GitHub ou no npm (feito pelo dono).
- CI para projetos criados pelo `init`.
- Bump de versão automático, changelog ou release notes.

## Decisions

### D1. Os workflows chamam scripts testáveis

A lógica fica em `scripts/ci/run-checks.mjs` e `scripts/ci/should-publish.mjs`; os YAML só os chamam. Assim a decisão de publicar é testada localmente. Alternativa: lógica em shell dentro do YAML. Descartada: não testável sem GitHub.

### D2. `should-publish` com quatro saídas

`decide({ version, view })`, onde `view` é o resultado de `npm view specloop versions --json` (`{ code, stdout, stderr }`):

| Situação | Resultado |
|----------|-----------|
| código 0 e `version` não está na lista | `publish: true` |
| código 0 e `version` está na lista | `publish: false`, motivo "versão já publicada" |
| erro com `E404` | `publish: false`, motivo "pacote não existe no npm: a primeira publicação é manual" |
| qualquer outro erro | exceção: o job falha |

O CLI grava `publish=true|false` em `$GITHUB_OUTPUT` (quando definido), imprime o motivo e sai 0; em exceção, sai 1. Alternativa: tratar qualquer erro como "não publicar". Descartada: esconderia falha de rede.

### D3. Publicação presa à `main` por environment

`publish.yml` usa `environment: npm`; o environment aceita só a branch `main` (deployment branch policy) e o trusted publisher exige o environment (`npm trust github specloop --file publish.yml --repo schussler/specloop --env npm`). O npm confere repositório e arquivo do workflow, não a branch: sem o environment, um `publish.yml` alterado numa branch publicaria.

### D4. CI de PR sem credenciais

`ci.yml` usa só `on: pull_request` (branches `main`), `permissions: contents: read`, sem `id-token`. Nenhum workflow usa `pull_request_target`, que roda código de fork com permissões do repositório.

### D5. Actions fixadas por SHA

`uses: actions/checkout@<sha40>` e `actions/setup-node@<sha40>`, com a tag em comentário. Uma tag pode ser movida; um SHA não.

### D6. Regra da `main` como arquivo versionado

`.github/rulesets/main.json` no formato da API de rulesets: `target: branch`, `enforcement: active`, `conditions.ref_name.include: ["~DEFAULT_BRANCH"]`, `bypass_actors: []`, regras `pull_request`, `required_status_checks` (contexto `ci`), `non_fast_forward` e `deletion`. O dono aplica com `gh api repos/schussler/specloop/rulesets --method POST --input .github/rulesets/main.json`.

### D7. Fora do pacote e dos projetos

`.github` e `scripts/ci` entram em `template_only`; não estão em `package.json` → `files`, e o `init` não os copia.

## Interfaces e regras compartilhadas

- `node scripts/ci/run-checks.mjs [--root <dir>]`: roda `test`, `lint` e `typecheck` de `checks` (por `loadChecks` e `runCommand` de `scripts/gates/checks.mjs`), na ordem; sai 0 se todos passam, 1 no primeiro que falha (nomeando o check), 3 em configuração inválida.
- `node scripts/ci/should-publish.mjs`: ver D2.
- Nome do check obrigatório: `ci`.

## Invariantes

- Nenhuma publicação sem os checks passarem antes, no mesmo job.
- Nenhum token npm no repositório nem em `secrets` usado pelos workflows.
- Erro ao consultar o npm nunca vira "não publicar".
- A regra da `main` não tem exceção e bloqueia force push e exclusão.
- Nenhum workflow usa `pull_request_target`; o `ci` não tem `id-token`.

## Comportamento existente mantido

- `checks` do `template.json`, gates, pipeline e CLI `specloop` sem mudança.
- Conteúdo do pacote (SL-010) sem `.github` e `scripts/ci`.

## Testes necessários

- `scripts/test/ci/run-checks.test.mjs`: CI-001, CI-002 (fixtures de `template.json` com comandos que passam e falham).
- `scripts/test/ci/should-publish.test.mjs`: CI-003 a CI-006 (`decide` com `view` simulado: é fronteira externa).
- `scripts/test/ci/workflows.test.mjs`: CI-007 a CI-013 (leitura do texto dos YAML e do JSON; sem dependência de parser YAML).
- `scripts/test/ci/docs.test.mjs`: CI-014, CI-015.
- Suíte, lint e sintaxe verdes.

## Ambiente e sandbox

Node ≥ 22 local, sem rede nos testes. Os workflows só são exercitados no GitHub (F4, evidência manual). Os SHAs das actions são obtidos com `gh api` (leitura) na implementação.

## Fatias e dependências

- **F1** Scripts `run-checks` e `should-publish` com testes. Sem dependência.
- **F2** `ci.yml`, `publish.yml` e `main.json` com testes de conteúdo. Depende de F1.
- **F3** Manifesto, README (Publicação, sete passos) e arquitetura. Depende de F2.
- **F4** Após o merge, pelo dono: os sete passos e a primeira PR real como evidência. Depende de F3 e do merge.

## Risks / Trade-offs

- **[Risco] Suíte depende do ambiente (OpenSpec, git).** → `ci.yml` instala `@fission-ai/openspec` na versão de `upstreams.openspec` e configura identidade git; falhas aparecem na primeira PR (F4).
- **[Risco] Merge de PR maliciosa publica.** → Mitigação humana: revisão do dono antes do merge; aprovação obrigatória não é usada porque o dono mantém sozinho e não pode aprovar a própria PR.
- **[Risco] Conta do dono comprometida.** → 2FA no GitHub e no npm; tokens bloqueados no pacote (passo 5).
- **[Trade-off] Primeira publicação manual.** → Exigência do npm: o trusted publisher é configurado num pacote existente.

## Migration Plan

1. F1 a F3 na branch, com suíte verde.
2. Merge (ainda sem regra: o dono faz o merge desta PR antes de aplicar a regra, ou aplica a regra depois do merge).
3. F4: o dono executa os sete passos na ordem do README.
4. Rollback: remover os workflows; desativar a regra (`enforcement: disabled`); remover o trusted publisher no npm.

## Premissas

As mesmas de `proposal.md` → `## Premissas`.

## Open Questions

Nenhuma. As decisões de gatilho, regra sem exceção, trusted publishing, environment e SHA foram aprovadas na conversa.
