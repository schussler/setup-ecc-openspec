---
name: spec-accept
description: Acceptance-test step of the spec pipeline, run by the runner between spec-create and spec-implement. Writes one test per scenario, tagged with the scenario ID, from the approved contract, the approved interfaces and the project's test conventions. Records the expected RED by behavior, records pre-existing behavior, and writes acceptance-manifest.json. Never edits specs/. Use when the runner starts acceptance for a change, or when the user says "spec-accept".
metadata:
  origin: local
---

# Spec Accept

Etapa entre `spec-create` e `spec-implement`, executada pelo runner: `spec-create` → (`spec-accept`) → `spec-implement` → `spec-archive`. Esta skill escreve os testes de aceitação e o manifesto de aceitação. Não escreve o contrato nem código de implementação.

Esta skill não edita `specs/`. O contrato é a fonte da verdade. Quando um teste não pode ser escrito do jeito que um cenário descreve, o contrato não é alterado para acomodar o teste.

## Entradas

Use only these inputs. Read them before writing anything:

1. **Contrato:** `openspec/changes/<change>/proposal.md`, `design.md` and `specs/**/spec.md`. The scenarios, their `ID`, their `Revisão` and their `Verificação` come from here.
2. **Interfaces aprovadas:** the interfaces and shared rules in `design.md`. A test calls only these interfaces.
3. **Convenções de teste:** `template.json` → `checks.test`, `checks.test_report` and the test directory the project already uses. Follow the existing file names and the existing runner.

## Passos

1. **Select the scenarios.** Take the scenarios whose `Verificação` is `teste` and that apply. A scenario with `check:<nome>` gets no functional test. A scenario with `Não aplicável` and a false trigger gets no test. Skip nothing else.

2. **Write one test per scenario, tagged with its ID.** The test name contains the scenario ID in brackets, for example `test('[AC-001] spec-accept não edita specs', …)`. A test that covers several scenarios has one tag for each ID. A scenario that needs several cases has one test per case. The tag is the link the runner uses; a name without the tag does not satisfy the scenario.

3. **Write the test to fail by behavior.** Before the implementation exists, the test must fail with an assertion of value (`AssertionError`, expected and actual). A failure from a missing module, a syntax error, an import error or a configuration error is not a valid RED. Run the test and classify its output with `classifyRedFailure` and `acceptRed` from `scripts/harness/red.mjs`. Only `behavioral` counts. Never write a stub that fails on purpose to produce a RED.

4. **Record pre-existing behavior before any change.** Before the change touches existing code, run the relevant existing tests and record each one with `recordPreexisting` from `scripts/harness/red.mjs`. A test that already passes is `preexisting_pass`. A failure caused by a mock or stub that returns `undefined` without a value assertion is `invalid_evidence`, and the scenario is not accepted as RED. Never fabricate a failure to satisfy the RED.

5. **Create characterization when no test covers the behavior.** If `recordPreexisting` reports `characterization_needed`, write a characterization test that describes what the current code does, tag it with the scenario ID, and run it. It must pass on the current code before any change. A characterization test that fails is a finding to report, not a test to force green.

6. **Write the acceptance manifest.** Generate it with `node scripts/harness/manifest-cli.mjs generate openspec/changes/<change> --tests <arquivos>` and confirm it with `node scripts/harness/manifest-cli.mjs validate openspec/changes/<change>`. The CLI computes the identities and hashes (D28); do not type them by hand. The manifest content below is what it writes. Create or update `openspec/changes/<change>/acceptance-manifest.json` (D28). For each case, compute the values with `scripts/harness/acceptance.mjs`: `caseIdOf(file, testName)` for `case_id`, and `caseBodyHash(root, file, helpers)` for `case_body_hash`. Set `scenario_ids`, `scenario_revisions` (the current `Revisão` of each scenario), `helpers` and `helper_hashes`. Do not compute hashes by hand.

7. **Parar em divergência.** Se um teste não puder ser escrito do jeito que um cenário descreve, há divergência: a skill para e registra a divergência em `docs/agents/issue-tracker.md`, com o ID do cenário e o motivo. Não edita o cenário e não escreve um teste mais fraco para passar.

## Alteração de teste aprovado

A test that is already approved in the manifest may change only with a record. A changed test without a `revision` authorization with `purpose: "test_adequacy"`, whose `scope` names the scenario and the affected `cases`, is a protected change. The runner then stops the change in `forbidden_action_stopped` with `protected_change`. The skill never writes the authorization. A human records it through the harness authorization procedure, outside this skill (RC-029).

## Arquivos que a skill escreve

- Acceptance test files, in the project's test directory, following `checks.test`.
- `openspec/changes/<change>/acceptance-manifest.json`.
- Divergence and characterization notes in `docs/agents/issue-tracker.md`.

## O que esta skill não faz

- Não edita `specs/` nem o contrato. Uma correção de contrato passa por `spec-create` e por autorização humana.
- Não escreve código de implementação.
- Não considera um teste aprovado por si: a aprovação vem da validação do runner.
- Não usa cenário com `check:` como teste funcional.
- Não dá o RED por válido quando a falha é de ambiente.
