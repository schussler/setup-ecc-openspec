# Spec Delta

## ADDED Requirements

### Requirement: Nome do pacote com escopo
O pacote SHALL se chamar `@k0d3r/specloop`, com o `bin` `specloop`, e o CLI SHALL gravar esse nome em `template.json` → `framework.package`.

#### Scenario: pacote com escopo e bin specloop
- **ID:** SL-018
- **Revisão:** 1
- **Verificação:** teste
- **WHEN** `package.json` e `template.json` são lidos e `npm pack --dry-run --json` roda na raiz
- **THEN** o nome do pacote é `@k0d3r/specloop`, `bin` tem só `specloop` apontando para `bin/specloop.mjs`, e `template.json` → `framework.package` é `@k0d3r/specloop`
