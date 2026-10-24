## ADDED Requirements

### Requirement: Política versionada
O template SHALL manter a política comum em `.claude/harness/policy.md` (regras) e `.claude/harness/policy.json` (parâmetros autoritativos), com campo `version`. Cada parâmetro SHALL ter uma única definição, em `policy.json`. As regras SHALL referenciar a chave, sem repetir o valor. Mudança na política SHALL exigir revisão explícita e nova versão.

#### Scenario: parametro definido em um so lugar
- **ID:** PO-001
- **Revisão:** 1
- **WHEN** o teto de correções é consultado
- **THEN** o valor vem de `policy.json` e `policy.md` cita a chave sem repeti-lo

### Requirement: Configuração proposta por change
Cada change SHALL ter uma configuração efetiva, copiada de `.claude/harness/profiles/default.json` ou de um perfil da change, com chaves `candidate_*`, modelo e esforço solicitados, forma de verificação padrão e limites por chamada e por fatia. A configuração proposta SHALL poder reduzir limites e SHALL NOT ampliar os tetos de `policy.json`. Nenhuma chave da configuração proposta SHALL autorizar gasto.

#### Scenario: configuracao reduzida e aceita
- **ID:** PO-003
- **Revisão:** 1
- **WHEN** a configuração da change define 2 correções por gate
- **THEN** a configuração é aceita e o hash da configuração efetiva é registrado no estado

#### Scenario: configuracao ou decisao que amplia um teto e recusada
- **ID:** PO-002
- **Revisão:** 1
- **WHEN** a configuração da change ou uma decisão humana define 5 correções por gate, e o teto é 3
- **THEN** a execução para com `config_error` antes de qualquer invocação, a política prevalece sem alteração implícita, e a incompatibilidade aparece no relatório
### Requirement: Valores candidatos marcados
Cada valor da configuração proposta que não seja decisão de política SHALL declarar `provisional: true` e SHALL ter um plano de calibração. O relatório SHALL mostrar esses valores como candidatos.

#### Scenario: valor candidato aparece identificado no relatorio
- **ID:** PO-005
- **Revisão:** 1
- **WHEN** o relatório traz um valor da configuração proposta
- **THEN** o valor aparece como candidato, com a referência ao plano de calibração

### Requirement: Reconhecimento não comprova funcionamento
Antes de depender de uma opção da CLI, o runner SHALL verificar se ela existe na versão local e registrar a versão. Reconhecimento SHALL NOT ser tratado como comprovação de comportamento. Opção documentada e ausente da ajuda local SHALL ser declarada no relatório como não comprovada.

#### Scenario: opcao ausente da ajuda local e declarada como nao comprovada
- **ID:** PO-006
- **Revisão:** 1
- **WHEN** `--max-turns` não aparece na ajuda da versão local
- **THEN** o limite de turnos fica como não comprovado e o relatório diz isso

### Requirement: Sonda de CLI com critério de classificação
A sonda de comportamento do `--max-turns` SHALL ser executada somente com autorização do tipo `probe`, com orçamento pretendido registrado. Seu resultado SHALL ser classificado como `enforced`, `not_enforced` ou `inconclusive` conforme o critério de D6.1: `enforced` somente quando o resultado identifica explicitamente o término por limite de turnos e `num_turns` não passa do limite. `is_error` sem causa identificada, e conclusão normal da tarefa, SHALL ser `inconclusive`.

#### Scenario: sonda sem autorizacao nao roda
- **ID:** PO-011
- **Revisão:** 1
- **WHEN** o runner recebe um pedido de sonda sem autorização do tipo `probe`
- **THEN** nenhuma chamada é feita e o pedido é recusado

#### Scenario: sonda sem causa identificada ou concluida normalmente e inconclusiva
- **ID:** PO-007
- **Revisão:** 1
- **WHEN** a sonda retorna `is_error: true` sem motivo identificado, ou termina com a resposta correta sem motivo de limite de turnos
- **THEN** o resultado é `inconclusive`, o limite de turnos continua não comprovado, e `not_enforced` só pode ser registrado com uma execução de controle sem o argumento

#### Scenario: perfil que exige limite de turnos nao inicia sem comprovacao
- **ID:** PO-013
- **Revisão:** 1
- **WHEN** a configuração efetiva exige limite de turnos e não há registro humano `probe-result` com resultado `enforced`
- **THEN** o runner para com `config_error` antes da primeira invocação, e o relatório não promete limite de turnos

#### Scenario: probe_result referencia sonda autorizada e evidencia
- **ID:** PO-014
- **Revisão:** 1
- **WHEN** um registro `probe_result` é gravado
- **THEN** ele referencia o id da autorização `probe` e a evidência da sonda (caminho e hash); sem essas referências o registro é recusado
### Requirement: Configurações não sensíveis
A lista de configurações não sensíveis cujos valores entram na impressão SHALL ficar em `policy.json`. O projeto SHALL poder estendê-la em `template.json` → `harness`, mediante revisão humana. Segredos SHALL ser excluídos e NOT SHALL entrar na impressão nem em relatórios.

#### Scenario: segredo nao entra na impressao
- **ID:** PO-008
- **Revisão:** 1
- **WHEN** uma variável de ambiente com nome de token está no ambiente do runner
- **THEN** ela não entra na impressão nem nos relatórios

### Requirement: Compatibilidade de versões
O runner SHALL comparar `schema_version` do estado, `policy_version` e `template.json → harness.schema` com as versões instaladas. Incompatibilidade SHALL levar a `config_blocked` com `stop_reason: config_error` e a instrução de migração.

#### Scenario: versao incompativel bloqueia a execucao
- **ID:** PO-009
- **Revisão:** 1
- **WHEN** `schema_version` do estado é maior que a versão instalada
- **THEN** a execução é bloqueada com `config_error` e a instrução de migração

### Requirement: Testes do runner com simuladores locais
Os testes do runner SHALL usar simuladores locais: um `claude` falso que emite saídas JSON controladas e fixtures de saída TAP. Nenhum teste automatizado SHALL fazer chamada ao modelo. A validação com chamada real SHALL ser etapa separada, com autorização e registro.

#### Scenario: testes automatizados nao chamam o modelo
- **ID:** PO-012
- **Revisão:** 1
- **WHEN** a suíte do runner é executada
- **THEN** o binário `claude` usado é o simulador, e nenhuma chamada de rede ao modelo ocorre

### Requirement: Classificador da sonda sem chamada
O classificador de resultado da sonda `--max-turns` SHALL ser testado com fixtures locais, sem invocar o `claude` real e sem gravar `probe_result`. Ele SHALL aplicar os critérios de D6.1 e SHALL NOT produzir `not_enforced` sem a execução de controle presente nas fixtures.

#### Scenario: classificador da sonda roda com fixtures sem chamada ao modelo
- **ID:** PO-015
- **Revisão:** 1
- **WHEN** o classificador da sonda é executado com as fixtures locais, incluindo saída com término por limite de turnos, saída com `is_error` sem causa, saída de conclusão normal e saída de controle
- **THEN** ele classifica como `enforced`, `inconclusive` e `not_enforced` conforme D6.1, nenhum `claude` real é invocado, nenhum `probe_result` é gravado, e `not_enforced` só aparece quando a fixture de controle está presente
