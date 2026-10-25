# release-ci Specification

## Purpose
CI de PR, publicação do pacote `specloop` no npm pela `main` com trusted publishing, regra da `main` e passos do dono do repositório.

## Requirements

### Requirement: Checks da CI
`scripts/ci/run-checks.mjs` SHALL executar `test`, `lint` e `typecheck` de `template.json` → `checks` e SHALL sair com código diferente de zero quando qualquer um falhar, nomeando o check.

#### Scenario: run-checks passa quando todos os checks passam
- **ID:** CI-001
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** `run-checks` roda num diretório cujo `template.json` tem `test`, `lint` e `typecheck` que saem com 0
- **THEN** o comando sai com 0

#### Scenario: run-checks falha quando um check falha
- **ID:** CI-002
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** `run-checks` roda com `lint` saindo com 1
- **THEN** o comando sai com 1 e a saída nomeia `lint`

### Requirement: Decisão de publicar
`scripts/ci/should-publish.mjs` SHALL publicar só quando a versão do `package.json` não estiver entre as versões publicadas. Pacote inexistente SHALL resultar em não publicar, com aviso de primeira publicação manual. Qualquer outro erro do npm SHALL falhar.

#### Scenario: versao nova e publicada
- **ID:** CI-003
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** a versão é `0.2.0` e o npm lista `["0.1.0"]`
- **THEN** a decisão é publicar

#### Scenario: versao ja publicada nao republica
- **ID:** CI-004
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** a versão é `0.1.0` e o npm lista `["0.1.0"]`
- **THEN** a decisão é não publicar, com o motivo "versão já publicada"

#### Scenario: pacote inexistente pede primeira publicacao manual
- **ID:** CI-005
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** o npm responde com erro `E404`
- **THEN** a decisão é não publicar, e o motivo diz que a primeira publicação é manual

#### Scenario: erro do npm falha o job
- **ID:** CI-006
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** o npm responde com um erro que não é `E404`
- **THEN** o comando sai com 1 e não grava decisão

### Requirement: CI de PR sem credenciais
`.github/workflows/ci.yml` SHALL rodar em PR para a `main`, num job `ci` em Node 22, chamando `run-checks`. Nenhum workflow SHALL usar `pull_request_target`, e o `ci` SHALL NOT ter `id-token`.

#### Scenario: ci roda em pull request com node 22
- **ID:** CI-007
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** `ci.yml` é lido
- **THEN** o gatilho é `pull_request` para `main`, o job se chama `ci`, usa Node 22 e roda `node scripts/ci/run-checks.mjs`

#### Scenario: ci nao recebe credenciais
- **ID:** CI-008
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** os arquivos de `.github/workflows/` são lidos
- **THEN** nenhum contém `pull_request_target`, e `ci.yml` declara `contents: read` e não contém `id-token`

### Requirement: Publicação só pela main
`.github/workflows/publish.yml` SHALL rodar só no push da `main`, no environment `npm`, em Node 24, com `id-token: write` e sem token secreto, executando `run-checks` e `should-publish` antes de `npm publish --provenance --access public`. As actions SHALL ser fixadas por SHA.

#### Scenario: publish so roda no push da main com environment npm
- **ID:** CI-009
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** `publish.yml` é lido
- **THEN** o único gatilho é `push` para `main` e o job usa `environment: npm`

#### Scenario: publish usa oidc sem token
- **ID:** CI-010
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** `publish.yml` é lido
- **THEN** ele declara `id-token: write`, usa Node 24, roda `npm publish --provenance --access public` e não cita `secrets.` nem `NODE_AUTH_TOKEN`

#### Scenario: publish roda checks antes de publicar
- **ID:** CI-011
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** `publish.yml` é lido
- **THEN** `run-checks` aparece antes de `should-publish`, e `should-publish` antes de `npm publish`, que só roda quando a decisão é publicar

#### Scenario: actions fixadas por sha
- **ID:** CI-012
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** os arquivos de `.github/workflows/` são lidos
- **THEN** cada `uses:` aponta para um SHA de 40 caracteres hexadecimais

### Requirement: Regra da main sem exceção
`.github/rulesets/main.json` SHALL exigir PR e o check `ci` na branch padrão, bloquear force push e exclusão, e não ter exceção.

#### Scenario: regra da main exige pr e ci sem excecao
- **ID:** CI-013
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** `main.json` é lido
- **THEN** `enforcement` é `active`, o alvo é a branch padrão, `bypass_actors` é vazio, e as regras incluem `pull_request`, `required_status_checks` com o contexto `ci`, `non_fast_forward` e `deletion`

### Requirement: Passos do dono documentados
O README SHALL ter uma seção "Publicação" com os sete passos do dono, em ordem, cada um com o comando ou o caminho de configuração.

#### Scenario: readme documenta os passos do dono na ordem
- **ID:** CI-014
- **Revisão:** 2
- **Verificação:** teste
- **Aprovação:** auth:f8957be0-2bcc-4257-878c-b46bfb759f5c
- **WHEN** a seção "Publicação" do README é lida
- **THEN** ela cita, nesta ordem, `gh repo rename specloop`, o environment `npm` restrito à `main`, `npm publish` manual, `npm trust github @k0d3r/specloop --file publish.yml --repo schussler/specloop --env npm`, o bloqueio de tokens no npm, `gh api` com `.github/rulesets/main.json` e a aprovação de workflows de colaboradores externos

### Requirement: CI fora do pacote e dos projetos
`.github` e `scripts/ci` SHALL estar em `template_only` e SHALL NOT estar no pacote.

#### Scenario: ci fica fora do pacote e dos projetos
- **ID:** CI-015
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** `template.json` e `package.json` são lidos
- **THEN** `template_only` inclui `.github` e `scripts/ci`, e nenhuma entrada de `files` começa com `.github` ou `scripts/ci`
