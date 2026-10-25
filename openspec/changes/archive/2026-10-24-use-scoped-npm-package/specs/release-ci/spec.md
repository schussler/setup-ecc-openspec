# Spec Delta

## MODIFIED Requirements

### Requirement: Passos do dono documentados
O README SHALL ter uma seção "Publicação" com os sete passos do dono, em ordem, cada um com o comando ou o caminho de configuração.

#### Scenario: readme documenta os passos do dono na ordem
- **ID:** CI-014
- **Revisão:** 2
- **Verificação:** teste
- **Aprovação:** auth:f8957be0-2bcc-4257-878c-b46bfb759f5c
- **WHEN** a seção "Publicação" do README é lida
- **THEN** ela cita, nesta ordem, `gh repo rename specloop`, o environment `npm` restrito à `main`, `npm publish` manual, `npm trust github @k0d3r/specloop --file publish.yml --repo schussler/specloop --env npm`, o bloqueio de tokens no npm, `gh api` com `.github/rulesets/main.json` e a aprovação de workflows de colaboradores externos
