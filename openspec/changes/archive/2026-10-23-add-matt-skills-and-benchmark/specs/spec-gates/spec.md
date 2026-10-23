## ADDED Requirements

### Requirement: Gate de implementação
O gate de implementação SHALL medir três valores:
- percentual de testes novos passando;
- percentual de testes antigos passando;
- número de erros de lint e de tipo.

Testes novos são os arquivos de teste ausentes no baseline registrado no início da implementação. O gate SHALL aprovar somente quando testes novos e antigos estiverem em 100% e não houver erros de lint nem de tipo.

#### Scenario: gate de implementacao aprova com tres condicoes
- **WHEN** todos os testes passam e lint e typecheck terminam sem erro
- **THEN** o veredito é `pass`, com `old_pct` e `new_pct` iguais a 100 e erros iguais a 0

#### Scenario: gate de implementacao reprova teste antigo falhando
- **WHEN** um arquivo de teste presente no baseline falha
- **THEN** o veredito não é `pass` e `old_pct` fica abaixo de 100

#### Scenario: gate de implementacao reprova erro de lint
- **WHEN** o comando de lint termina com código diferente de zero
- **THEN** o veredito não é `pass` e `lint_errors` é maior que zero

#### Scenario: testes novos separados dos antigos pelo baseline
- **WHEN** um arquivo de teste é criado depois do baseline
- **THEN** ele conta em `new_pct` e não em `old_pct`

### Requirement: Ciclo de autocorreção
Cada gate SHALL registrar cada avaliação, com pontuação e número da tentativa, em `gates.json` dentro da change. Depois da avaliação inicial, o gate SHALL permitir no máximo 3 tentativas de correção. Também SHALL parar quando o número de falhas não diminuir entre duas avaliações seguidas. O gate SHALL ler os limiares de constantes, e não de argumentos.

#### Scenario: ciclo para apos tres correcoes
- **WHEN** a quarta avaliação reprovada é registrada
- **THEN** o veredito é `stop`

#### Scenario: ciclo para sem melhora entre tentativas
- **WHEN** uma avaliação reprovada não tem menos falhas que a anterior
- **THEN** o veredito é `stop`

### Requirement: Gate de arquivamento
O gate de arquivamento SHALL exigir que o último veredito do gate de implementação seja `pass` e que a suíte completa passe. Também SHALL calcular o percentual de cenários das specs da change que têm teste correspondente. Um teste corresponde quando contém o nome do cenário, normalizado sem acentos, sem caixa e sem pontuação. O gate SHALL aprovar somente com 100%.

#### Scenario: gate de arquivamento exige teste por cenario
- **WHEN** um cenário da change não tem teste com o mesmo nome
- **THEN** o gate reprova e lista o cenário em `missing`

#### Scenario: gate de arquivamento exige gate de implementacao aprovado
- **WHEN** `gates.json` não tem veredito `pass` do gate de implementação
- **THEN** o gate de arquivamento reprova sem avaliar cenários

### Requirement: Gate de PR
O gate de PR SHALL reprovar quando houver change ativa em `openspec/changes/` (ignorando `archive/`), quando `git status` não estiver limpo ou quando a suíte de testes falhar.

#### Scenario: gate de pr bloqueia change ativa
- **WHEN** existe um diretório de change fora de `openspec/changes/archive/`
- **THEN** o gate de PR reprova e nomeia a change

#### Scenario: gate de pr bloqueia arvore suja
- **WHEN** há arquivo modificado ou não rastreado
- **THEN** o gate de PR reprova

### Requirement: Checagem de escopo
A checagem de escopo SHALL listar cada arquivo alterado, adicionado ou não rastreado desde uma referência git que não esteja dentro de um caminho de `scoped_paths`.

#### Scenario: arquivos fora de scoped_paths sao listados
- **WHEN** um arquivo fora de `scoped_paths` é criado depois da referência
- **THEN** ele aparece em `out_of_scope`

### Requirement: Lint e sintaxe sem dependências
O template SHALL ter um lint que valida o frontmatter das skills e os arquivos JSON do manifesto, e uma checagem de sintaxe que roda `node --check` em cada script. Os dois SHALL terminar com código diferente de zero quando houver erro.

#### Scenario: lint acusa skill sem frontmatter
- **WHEN** um `SKILL.md` não tem `name` igual ao nome do diretório
- **THEN** o lint termina com erro e cita o arquivo

#### Scenario: checagem de sintaxe acusa script invalido
- **WHEN** um arquivo `.mjs` tem erro de sintaxe
- **THEN** a checagem termina com erro e cita o arquivo
