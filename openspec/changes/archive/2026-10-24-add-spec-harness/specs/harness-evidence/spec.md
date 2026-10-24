## ADDED Requirements

### Requirement: Impressão da evidência
Cada aprovação SHALL registrar a impressão da evidência avaliada: código efetivamente avaliado (incluindo alterações não commitadas e arquivos novos relevantes), revisões do contrato, testes de aceitação e seu manifesto, `checks` com `test_report`, perfil efetivo, autorizações vigentes, versões de runtime e valores das configurações não sensíveis da allowlist. Os itens excluídos SHALL estar listados em `policy.json`.

#### Scenario: impressao inclui alteracoes nao commitadas
- **ID:** EV-001
- **Revisão:** 1
- **WHEN** um arquivo novo é criado depois do último commit
- **THEN** a impressão muda e inclui o arquivo

#### Scenario: issue tracker fica fora da impressao e o contrato continua dentro
- **ID:** EV-016
- **Revisão:** 1
- **WHEN** só `docs/agents/issue-tracker.md` muda, ou só `design.md` da change muda
- **THEN** a mudança no tracker não altera a impressão, porque ele está em `excluded_paths`, e a mudança em `design.md` altera a impressão

### Requirement: Artefatos derivados fora da impressão
Artefatos derivados (resumo durável, checkpoint, `gates.json`, relatórios, run-state e eventos) SHALL ficar fora da impressão somente quando não contêm configuração executável usada na avaliação (D31).

#### Scenario: artefatos operacionais nao mudam a impressao
- **ID:** EV-002
- **Revisão:** 1
- **WHEN** só `run-state.json` ou `gates.json` muda, e nenhum deles contém configuração executável
- **THEN** a impressão não muda

### Requirement: Caminhos protegidos
O runner SHALL calcular hashes dos caminhos protegidos definidos em `policy.json` antes e depois de cada invocação e de cada gate. Alteração detectada SHALL invalidar a aprovação e levar o estado a `forbidden_action_stopped`. A única alteração permitida em `tasks.md` SHALL ser alternar o checkbox (EV-015). `authorizations.json` SHALL ter hash próprio (D31). Os caminhos de exclusão de `policy.json` também são protegidos, e a lista SHALL NOT ser ampliada pelo executor.

#### Scenario: alteracao em caminho protegido interrompe o fluxo
- **ID:** EV-003
- **Revisão:** 1
- **WHEN** o hash de um arquivo do contrato muda durante uma invocação
- **THEN** a aprovação é invalidada, o estado vira `forbidden_action_stopped` e o motivo é `protected_change`

#### Scenario: marcar tarefa como concluida nao e alteracao proibida
- **ID:** EV-004
- **Revisão:** 1
- **WHEN** a única diferença em `tasks.md` é um checkbox `- [ ]` virando `- [x]` ou o inverso
- **THEN** nenhuma alteração proibida é registrada

### Requirement: Aprovação válida no arquivamento
O `spec-archive` SHALL arquivar somente com uma aprovação cuja impressão seja igual à impressão atual. Aprovação com impressão antiga SHALL ser recusada.

#### Scenario: aprovacao desatualizada e recusada no arquivamento
- **ID:** EV-005
- **Revisão:** 1
- **WHEN** uma alteração de código acontece depois da aprovação e antes do arquivamento
- **THEN** o `spec-archive` recusa o arquivamento e pede nova validação final

### Requirement: Mudança durante a validação
Antes e depois da validação final, o runner SHALL comparar a impressão do estado relevante. Diferença SHALL invalidar a aprovação.

#### Scenario: mudanca durante a validacao invalida a aprovacao
- **ID:** EV-006
- **Revisão:** 1
- **WHEN** um arquivo relevante muda enquanto a suíte roda
- **THEN** a validação não é aprovada, mesmo que a suíte tenha passado

### Requirement: Invalidação por revisão de cenário
Mudança de comportamento SHALL ser registrada como nova revisão do cenário, por autorização do tipo `revision`. A revisão SHALL invalidar as evidências do cenário, das interfaces e regras compartilhadas que ele cita, e das fatias que dependem dele. As dependências declaradas em `Depende de` SHALL ser percorridas transitivamente (D21b, D15). A invalidação não se encerra pela atualização do manifesto: a reaceitação segue EV-014.

#### Scenario: revisao de cenario invalida evidencias dependentes
- **ID:** EV-007
- **Revisão:** 1
- **WHEN** o cenário `RC-008` ganha a revisão 2 com autorização registrada
- **THEN** as evidências de `RC-008`, dos cenários que dependem dele (transitivamente) e das fatias que dependem dele ficam marcadas como invalidadas, e a aprovação não retorna sem EV-014

#### Scenario: revisao sem autorizacao e recusada
- **ID:** EV-008
- **Revisão:** 1
- **WHEN** um cenário muda sem registro de autorização de revisão
- **THEN** o estado vira `forbidden_action_stopped` com `stop_reason: protected_change`

### Requirement: Garantias e limites declarados
A v1 SHALL garantir detecção de alterações sem isolamento técnico. O relatório SHALL declarar que a separação de papéis não equivale a isolamento do avaliador, que o bloqueio de execução é advisory e que um executor com a mesma conta pode alterar arquivos e hashes.

#### Scenario: relatorio declara o limite de isolamento
- **ID:** EV-010
- **Revisão:** 1
- **WHEN** o relatório de uma change é gerado
- **THEN** ele inclui a declaração de que a v1 detecta alterações sem isolar o executor

### Requirement: Aprovação válida registrada
Uma validação final SHALL registrar aprovação quando, ao mesmo tempo: a suíte `checks.test_report` sair com código zero; todo cenário com forma `teste` aplicável tiver caso `pass` com revisão atual; todo cenário com forma `check:<nome>` tiver check com código zero; e a impressão for igual antes e depois da avaliação. Essa aprovação SHALL ser o insumo do resumo durável, gravado somente após ela e nunca em marco de fatia.

#### Scenario: validacao completa registra aprovacao e libera o arquivamento
- **ID:** EV-011
- **Revisão:** 1
- **WHEN** a suíte sai com zero, todos os cenários aplicáveis têm caso `pass` com a revisão atual e a impressão não muda durante a avaliação
- **THEN** a aprovação é registrada, o resumo durável é gravado no marco de arquivamento e o `spec-archive` pode arquivar

### Requirement: Resumo durável mínimo
O resumo durável (`openspec/changes/<change>/evidence-summary.json`, versionado) SHALL conter os campos de auditoria de `design.md` D16 e o inventário completo dos casos da suíte obrigatória, com identificador, nome, resultado e vínculo com cenário quando existir, incluindo testes de regressão sem vínculo. SHALL NOT conter a saída TAP bruta nem segredos.
#### Scenario: resumo duravel contem os campos de auditoria
- **ID:** EV-012
- **Revisão:** 1
- **WHEN** o resumo é gravado depois de uma aprovação válida
- **THEN** ele contém o contrato (hash e revisões de cada cenário), o código (commit base, hash da árvore avaliada e caminhos alterados com hash), os testes (hash do manifesto; o inventário de cada caso da suíte obrigatória com identificador, nome, resultado e cenário vinculado quando existir; `case_body_hash`; código de saída e hash do comando da suíte), o ambiente (versões de Node, `claude` e `openspec`, hash de `checks` e da configuração proposta, `policy_version` e `schema_version`), as limitações declaradas, o consumo por origem com a contagem de custo desconhecido, as reservas pendentes e as decisões de reconciliação, e os ids das autorizações usadas
### Requirement: Hash não substitui evidência de auditoria
O hash da impressão SHALL NOT ser tratado como evidência suficiente. Auditoria e importação SHALL usar o resumo durável. Evidência local ausente (saída capturada, eventos) SHALL exigir revalidação antes de aprovar ou arquivar.

#### Scenario: evidencia local ausente exige revalidacao
- **ID:** EV-013
- **Revisão:** 1
- **WHEN** a saída capturada de uma aprovação do resumo não existe localmente
- **THEN** a aprovação não é usada, e a validação final precisa ser executada de novo

### Requirement: Reaceitação após revisão
Depois de uma revisão de cenário, a aprovação SHALL voltar somente quando estiverem registradas as três verificações de D29: (a) confirmação humana da adequação dos testes por autorização `revision` com `scope` de cenário e de casos; (b) justificativa de suficiência por autorização `revision` quando o `case_body_hash` não mudou; (c) reexecução dos casos com `pass` na revisão atual. Atualizar o manifesto de aceitação NÃO SHALL bastar.

#### Scenario: reaceitacao exige as tres verificacoes
- **ID:** EV-014
- **Revisão:** 1
- **WHEN** o cenário `RC-008` ganhou a revisão 2, o manifesto foi atualizado, e apenas uma das três verificações de D29 foi feita
- **THEN** a validação não aprova enquanto faltar qualquer uma das três, e volta a aprovar somente quando as três estiverem registradas

### Requirement: Escopo de tasks.md
Mudança de conteúdo ou de escopo em uma tarefa de `tasks.md`, além da alternância de checkbox, SHALL ser alteração protegida (D31).

#### Scenario: tarefa com conteudo alterado e detectada
- **ID:** EV-015
- **Revisão:** 1
- **WHEN** o texto de uma tarefa é alterado, ou uma tarefa é acrescentada ou removida, em `tasks.md`, além de mudanças de checkbox
- **THEN** a mudança é registrada como alteração protegida e o estado vira `forbidden_action_stopped` com `protected_change`
