# Proposal

## Why

O repositório se apresenta como um template com o nome antigo do repositório, é instalado e atualizado por três skills que fazem `git fetch` do repositório, e carrega o nome pessoal do mantenedor em fixtures de teste, registros arquivados e no log. Quem chega de fora não tem uma forma única e versionada de começar um projeto novo, adotar o pipeline num projeto existente ou buscar atualizações. A mudança dá ao projeto um nome próprio (**SpecLoop**), o posiciona como framework, credita os três repositórios que o inspiraram e entrega um CLI único via `npx specloop`.

## What Changes

- **Nome.** Toda ocorrência do nome antigo nos arquivos versionados passa a ser `SpecLoop` (texto) ou `specloop` (pacote, comando, repositório).
- **Posicionamento e créditos.** O README apresenta o SpecLoop como framework e ganha uma seção de créditos com link e licença de ECC (`affaan-m/everything-claude-code`), OpenSpec (`Fission-AI/OpenSpec`) e `mattpocock/skills`. A instalação documentada passa a ser só o `npx`.
- **Pacote npm `specloop`.** Novo `package.json` com `bin` e `files`. O pacote leva só o que chega aos projetos (caminhos `managed` e os modelos de `docs/agents`), sem dependências, Node ≥ 22.
- **CLI `npx specloop <comando>`**, copiando do próprio pacote:
  - `install`: copia só os caminhos `managed` no repositório atual; não escreve em `owned`.
  - `init <dir>`: cria um projeto novo (o que o `/new-project` faz hoje).
  - `adopt`: leva um projeto existente ao pipeline completo, com plano e confirmação item a item, só aditivo (reaproveita `migrate.mjs`).
  - `update`: mostra o que muda nos `managed`, aplica após confirmação e grava a versão nova.
- **Manifesto.** `template.json` passa a registrar `framework: { package, version }`. Um `template.repo` antigo continua aceito e é convertido no `update`.
- **Skills.** `/new-project`, `/template-update` e `/template-migrate` viram wrappers finos do CLI: uma única forma de instalar e atualizar.
- **Nome pessoal.** Nenhum arquivo versionado contém o nome pessoal do mantenedor: fixtures usam `mantenedor`, e o `approver` dos `authorizations.json` arquivados e o `issue-tracker.md` também. O histórico do git não é reescrito.
- **Publicação.** Última fatia: `gh repo rename specloop` e `npm publish`, executados só após confirmação explícita do usuário no momento.

## Capabilities

### New Capabilities

- `framework-identity`: nome SpecLoop, posicionamento como framework, créditos aos upstreams e ausência do nome pessoal nos arquivos versionados.
- `framework-cli`: pacote npm `specloop` e os comandos `install`, `init`, `adopt` e `update`.

### Modified Capabilities

Nenhuma. O funcionamento do pipeline, dos gates, do harness e da migração (`project-migration`) não muda; `adopt` chama o mesmo `migrate.mjs`. O requisito "New-project não interativo" (`headless-execution`) continua atendido: a skill passa os mesmos argumentos ao CLI.

## Impact

- Arquivos: `README.md`, `template.json`, novo `package.json`, novo `bin/specloop.mjs` e módulos em `scripts/cli/`, skills `new-project`, `template-update`, `template-migrate` e `template-check`, `docs/agents/architecture.md`, `docs/agents/domain.md`, `docs/agents/issue-tracker.md`, testes em `scripts/test/harness/` (fixtures), `scripts/benchmark/reports/2026-10-23/greenfield/report.json`, `authorizations.json` arquivados (campo `approver`), design arquivado de `add-matt-skills-and-benchmark`.
- Caminhos protegidos pela política (`.claude/harness/policy.json`, `protected_paths`): nenhum código de `scripts/harness` ou `scripts/gates` muda; só fixtures de teste. Nenhum parâmetro de `policy.json` muda.
- `authorizations.json` arquivados: o `approver` não entra em `contract_hash`, então as aprovações continuam válidas. Exceção registrada ao requisito "Change arquivada inalterada" (`project-migration`, PM-005): ele trata da migração de projetos, não desta edição; a troca é limitada ao campo `approver`.
- Externo: repositório GitHub renomeado para `specloop` e pacote publicado no npm, só na fatia F5 e com confirmação.
- Projetos já derivados: continuam funcionando; o primeiro `npx specloop update` converte `template.repo` em `framework`.
- Política: `.claude/harness/policy.md` e `.claude/harness/policy.json` (referenciadas, não repetidas).

## Comportamento

- **Comportamento novo:** sim

## Premissas

Não aprovadas pelo usuário; registradas para revisão:

- O repositório renomeado fica em `github.com/schussler/specloop`: `schussler` é o usuário do GitHub, não o nome removido. Se errado, muda só a URL em `package.json` e no README.
- O `npm publish` usa a conta npm do usuário já autenticada (`npm whoami`). Se não houver sessão, a F5 para e pede `npm login`.
- `init`, `adopt` e `update` aceitam `--yes` e argumentos para rodar sem perguntas, mantendo o `--non-interactive` do `/new-project` usado pelo benchmark. Se errado, o benchmark greenfield deixa de rodar sem humano.
- Os textos do framework continuam em português.
- O nome `specloop` está livre no npm em 2026-10-24 (`npm view specloop` → 404). Se for tomado antes da F5, a publicação para e volta ao usuário.
