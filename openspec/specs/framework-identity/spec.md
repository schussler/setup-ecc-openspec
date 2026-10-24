# framework-identity Specification

## Purpose
Nome, posicionamento e créditos do SpecLoop, sem o nome antigo nem o nome pessoal nos arquivos versionados.

## Requirements

### Requirement: Nome SpecLoop
Nenhum arquivo versionado SHALL conter o nome antigo do repositório (definido em `design.md` D6), sem diferenciar maiúsculas. O README SHALL ter `SpecLoop` no título.

#### Scenario: nenhum arquivo cita o nome antigo
- **ID:** SL-001
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** todos os arquivos de `git ls-files` são lidos
- **THEN** nenhum contém o nome antigo, sem diferenciar maiúsculas

### Requirement: Sem nome pessoal
Nenhum arquivo versionado SHALL conter o nome pessoal do mantenedor (definido em `design.md` D6), sem diferenciar maiúsculas. Os registros de aprovação arquivados SHALL continuar válidos para o hash do contrato.

#### Scenario: nenhum arquivo cita o nome pessoal
- **ID:** SL-002
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** todos os arquivos de `git ls-files` são lidos
- **THEN** nenhum contém o nome pessoal, sem diferenciar maiúsculas

#### Scenario: aprovações arquivadas seguem válidas
- **ID:** SL-003
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** o `approver` de um registro em `authorizations.json` de uma change arquivada é trocado
- **THEN** `calculateContractHash` da change é o mesmo de antes da troca, e `proposal.md`, `design.md` e `specs/` da change não mudam

### Requirement: Posicionamento e créditos
O README SHALL apresentar o SpecLoop como framework, documentar a instalação só por `npx specloop` e ter uma seção de créditos com link para `affaan-m/everything-claude-code`, `Fission-AI/OpenSpec` e `mattpocock/skills`.

#### Scenario: README credita os tres upstreams
- **ID:** SL-004
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** o README é lido
- **THEN** ele tem uma seção de créditos com os links dos três repositórios e se apresenta como framework

#### Scenario: README documenta so o npx
- **ID:** SL-005
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** o README é lido
- **THEN** ele documenta `npx specloop install`, `init`, `adopt` e `update`, e não documenta `git fetch` do repositório para instalar
