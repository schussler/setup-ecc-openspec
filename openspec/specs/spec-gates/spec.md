# spec-gates Specification

## Purpose
Gates com pontuação verificável por script (implementação, arquivamento, PR, escopo, lint e sintaxe) e o ciclo de autocorreção limitado que eles impõem.

## Requirements

### Requirement: Gate de implementação
O gate de implementação SHALL medir, por caso de teste executado, o percentual de casos antigos passando e o número de erros de lint e de tipo. Casos antigos são os casos do baseline de casos registrado no início da implementação. O percentual de casos novos SHALL ser informativo e SHALL NOT ser exigido: esse gate não exige caso novo. O gate SHALL aprovar somente quando casos antigos estiverem em 100%, não houver erros de lint nem de tipo, e não houver caso `skip`, `todo` ou ausente entre os antigos. Quando o código de saída do comando de teste for diferente de zero, o gate SHALL reprovar, mesmo que a saída traga contagens favoráveis.

#### Scenario: gate de implementacao aprova com tres condicoes
- **ID:** SG-001
- **Revisão:** 2
- **WHEN** todos os casos antigos passam e lint e typecheck terminam sem erro
- **THEN** `passed` é verdadeiro, com `old_pct` igual a 100 e erros iguais a 0

#### Scenario: gate de implementacao reprova teste antigo falhando
- **ID:** SG-002
- **Revisão:** 2
- **WHEN** um caso do baseline falha
- **THEN** `passed` é falso e `old_pct` fica abaixo de 100

#### Scenario: gate de implementacao reprova erro de lint
- **ID:** SG-003
- **Revisão:** 2
- **WHEN** o comando de lint termina com código diferente de zero
- **THEN** `passed` é falso e `lint_errors` é maior que zero

#### Scenario: testes novos separados dos antigos pelo baseline
- **ID:** SG-004
- **Revisão:** 2
- **WHEN** um caso de teste é criado depois do baseline
- **THEN** ele conta em `new_pct` e não em `old_pct`

#### Scenario: saida nao zero reprova com contagem favoravel no gate
- **ID:** SG-005
- **Revisão:** 2
- **WHEN** a suíte sai com código `1` e a saída traz `# pass 3` e `# fail 0`
- **THEN** `passed` é falso

#### Scenario: teste ignorado nao aprova o gate
- **ID:** SG-006
- **Revisão:** 2
- **WHEN** um caso antigo aparece como `# SKIP` no TAP
- **THEN** o caso conta como `skip`, e o gate não aprova

### Requirement: Ciclo de autocorreção
O ciclo de autocorreção SHALL ser conduzido pelo runner, conforme `harness-run-control`. Os gates SHALL NOT registrar tentativas nem contadores. O teto de correções SHALL vir de `policy.json`, e não de argumentos do gate.

#### Scenario: ciclo para apos tres correcoes
- **ID:** SG-017
- **Revisão:** 2
- **WHEN** a quarta avaliação reprovada é registrada
- **THEN** o runner emite o veredito `stop`

#### Scenario: ciclo para sem melhora entre tentativas
- **ID:** SG-018
- **Revisão:** 2
- **WHEN** uma avaliação reprovada não tem menos falhas que a anterior, em execução `legacy`
- **THEN** o veredito é `stop`, identificado como regra legada. Em execução `runner` esta regra não se aplica (RC-041)

#### Scenario: gate nao registra tentativas
- **ID:** SG-008
- **Revisão:** 2
- **WHEN** a CLI do gate de implementação é executada sem `--legacy-write`
- **THEN** a saída é impressa e nenhum arquivo de change é gravado

### Requirement: Gate de arquivamento
O gate de arquivamento SHALL exigir que a aprovação da implementação esteja válida e que a suíte `checks.test_report` passe com código de saída zero. Para cada cenário com forma `teste` aplicável, SHALL exigir um caso de teste com o ID do cenário, com resultado `pass` e revisão atual, conforme `harness-acceptance`. Nenhum caso SHALL ser vinculado por substring do texto de arquivo. Uma change com comportamento novo e sem cenário SHALL reprovar. Uma change sem comportamento novo SHALL exigir somente a suíte existente e os checks declarados. O gate SHALL aprovar somente com 100% dos cenários aplicáveis.

#### Scenario: gate de arquivamento exige teste por cenario
- **ID:** SG-009
- **Revisão:** 2
- **WHEN** um cenário aplicável da change não tem caso de teste com o seu ID
- **THEN** o gate reprova e lista o ID em `missing`

#### Scenario: gate de arquivamento exige gate de implementacao aprovado
- **ID:** SG-010
- **Revisão:** 2
- **WHEN** a aprovação da implementação não é válida
- **THEN** o gate de arquivamento reprova sem avaliar cenários

#### Scenario: change com comportamento novo e sem cenario nao passa no arquivamento
- **ID:** SG-011
- **Revisão:** 2
- **WHEN** a change declara comportamento novo e não tem nenhum cenário nas specs
- **THEN** o gate de arquivamento reprova com a falha `no_scenarios`

#### Scenario: nome de cenario em comentario nao conta como cobertura
- **ID:** SG-012
- **Revisão:** 2
- **WHEN** o título de um cenário aparece num comentário de teste, sem o ID como nome de caso
- **THEN** o cenário fica em `missing`

#### Scenario: change sem comportamento novo passa com a suite existente
- **ID:** SG-020
- **Revisão:** 1
- **WHEN** a change declara `Comportamento novo: não`, a suíte passa com zero e os checks declarados passam
- **THEN** o gate de arquivamento aprova sem exigir caso funcional novo

### Requirement: Gate de PR
O gate de PR SHALL reprovar quando houver change ativa em `openspec/changes/` (ignorando `archive/`), quando `git status` não estiver limpo ou quando a suíte de testes falhar.

#### Scenario: gate de pr bloqueia change ativa
- **WHEN** existe um diretório de change fora de `openspec/changes/archive/`
- **THEN** o gate de PR reprova e nomeia a change

#### Scenario: gate de pr bloqueia arvore suja
- **WHEN** há arquivo modificado ou não rastreado
- **THEN** o gate de PR reprova

### Requirement: Checagem de escopo
A checagem de escopo SHALL listar cada arquivo alterado, adicionado ou não rastreado desde uma referência git que não esteja dentro de um caminho de `scoped_paths`. Os arquivos operacionais excluídos por `policy.json` SHALL NOT ser listados.

#### Scenario: arquivos fora de scoped_paths sao listados
- **ID:** SG-015
- **Revisão:** 1
- **WHEN** um arquivo fora de `scoped_paths` é criado depois da referência
- **THEN** ele aparece em `out_of_scope`

#### Scenario: arquivo operacional nao e listado no escopo
- **ID:** SG-016
- **Revisão:** 1
- **WHEN** `run-state.json` muda depois da referência
- **THEN** o arquivo não aparece em `out_of_scope`

### Requirement: Lint e sintaxe sem dependências
O template SHALL ter um lint que valida o frontmatter das skills e os arquivos JSON do manifesto, e uma checagem de sintaxe que roda `node --check` em cada script. Os dois SHALL terminar com código diferente de zero quando houver erro.

#### Scenario: lint acusa skill sem frontmatter
- **WHEN** um `SKILL.md` não tem `name` igual ao nome do diretório
- **THEN** o lint termina com erro e cita o arquivo

#### Scenario: checagem de sintaxe acusa script invalido
- **WHEN** um arquivo `.mjs` tem erro de sintaxe
- **THEN** a checagem termina com erro e cita o arquivo

### Requirement: Resultado estruturado sem escrita de estado
Cada gate SHALL retornar, ao runner, um resultado estruturado com `gate`, `passed`, `failures`, `cases` (ID, status e fonte), `evidence`, `paid` e `cost_source`. O gate SHALL declarar se usa recurso pago. Nenhum gate SHALL gravar o estado.

#### Scenario: gate declara uso de recurso pago
- **ID:** SG-013
- **Revisão:** 1
- **WHEN** um gate roda um comando que consome serviço pago
- **THEN** o resultado traz `paid: true` e o custo com origem registrada

#### Scenario: gate nao depende da autoavaliacao do agente
- **ID:** SG-014
- **Revisão:** 1
- **WHEN** o agente afirma que os testes passam
- **THEN** o resultado do gate vem da execução do comando, e a afirmação não é usada

### Requirement: Compatibilidade legada explícita
A CLI dos gates SHALL escrever `gates.json` somente com `--legacy-write`, e somente em execução de modo `legacy`. Essa escrita SHALL ser removida na fatia F10.

#### Scenario: cli legada grava somente com a flag explicita
- **ID:** SG-019
- **Revisão:** 1
- **WHEN** o gate de implementação é executado com `--legacy-write` numa execução em modo `legacy`
- **THEN** o `gates.json` é escrito no formato antigo, com o veredito calculado pela mesma regra
