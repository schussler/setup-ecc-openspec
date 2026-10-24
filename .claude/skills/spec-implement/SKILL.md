---
name: spec-implement
description: Second step of the spec pipeline. Implements an OpenSpec change task by task with TDD (Red → Green → Refactor) through /opsx:apply, then runs the implementation gate and self-corrects until it passes or the cycle stops. Use when the user wants to implement a change, continue implementation, or says "spec-implement".
metadata:
  origin: local
  adapted-from: mattpocock/skills@5beb35b040e3de97e54fa9e386d7e42d15c295c2 (engineering/tdd)
---

# Spec Implement

Step 2 of the pipeline `spec-create` → `spec-implement` → `spec-archive` → `pr`.

It is a thin wrapper over `/opsx:apply`. That command owns the task loop and the checkboxes in `tasks.md`. This skill adds TDD discipline, the implementation gate, and the self-correction cycle. The gate's score comes from `scripts/gates/implement-gate.mjs`, never from your own judgment. Run autonomously, this step is conducted by the runner (`scripts/harness/`); run supervised, it delegates to `/opsx:apply`. Until the adoption milestone (marco de adoção) is recorded, every execution stays `legacy`.

## Input

The change name. If it is missing, use **Change ativa** from `docs/agents/issue-tracker.md`, or the only active change in `openspec list`. If more than one is active, ask.

## Modo da execução

Read the `mode` field of `.harness-local/<change>/run-state.json`. Without that file the execution is `legacy`.

- **legacy** (the mode in use today): the gate CLIs write `gates.json` only with `--legacy-write`. Pass that flag to every gate call in this skill. The CLI is the only writer of counters and verdicts; this skill writes none.
- **runner**: the runner owns the state. Do not run the gate CLIs. Run `node scripts/harness/cli.mjs gate-implement --change <change> --note "<what changed since the last attempt>"` and act on the `status` it returns (`pass`, `retry` or `stop`). The exit code is 0, 1 or 2. Failures and interruptions go to the runner too: `node scripts/harness/cli.mjs fail --change <change> --stop-reason <motivo> --cause "<texto>"`, `node scripts/harness/cli.mjs interrupt --change <change>`, and `node scripts/harness/cli.mjs resume --change <change>` to continue the same execution.
- **Autonomous execution (runner only):** `node scripts/harness/cli.mjs run --change <change>` conducts the slice headless: it invokes `claude -p` with this skill and `--runner-step`, evaluates the implementation gate, dispatches corrections with the gate's failures, and stops (`stop`, with `stop_reason` and a stop report) or concludes with the final validation (`pass`). It needs `start --mode runner` first and a human `budget` authorization; without it, it stops with `authorization_required` before any call. After a stop, record the human decision and run the same command again: it continues the same execution.
- Until the adoption milestone (marco de adoção) is recorded in `docs/agents/issue-tracker.md` by a human decision, no execution is assigned to the runner. Every execution stays `legacy`, whatever else exists on disk.

## Before the first task

1. **Read the context.** Read `docs/agents/architecture.md`, `docs/agents/domain.md` and the restore point in `docs/agents/issue-tracker.md`. Then read the change: `proposal.md`, `design.md`, the delta specs and `tasks.md`.
2. **Check the commands.** `template.json` → `checks` must have `test`, `lint` and `typecheck`. If one is empty, the gate fails and names it. Stop and say which one is missing. Do not invent a command.
3. **Record the baseline, once per change.** Read `openspec/changes/<change>/gates.json`.
   - If it has no `implement.baseline`, record it before you write any code. In `legacy`, run `node scripts/gates/implement-gate.mjs baseline --change <change> --legacy-write`. In `runner`, `node scripts/harness/cli.mjs start --change <change> --mode runner` creates the execution and records the baseline. A later execution of the same change keeps the baseline. The baseline is the list of test files that exist now. Every test file created after it counts as new.
   - If a baseline exists, keep it. You are resuming.
   - If the last attempt's verdict is `stop`, do not continue. Report it and wait for the user.

## Task loop

Run `/opsx:apply <change>`. If it is not available, use `openspec instructions apply --change <change>` and follow it. For each task, in order:

1. **Red.** Write one test for the behavior the task delivers, at the public interface. Name the test after the spec scenario it proves, using the scenario's exact text: the archive gate matches them by name. Run it with `checks.test_file` (or `checks.test`) and watch it fail for the expected reason. A test that passes before the code exists proves nothing. Fix the test.
2. **Green.** Write the minimum code that makes the test pass. Do not anticipate later tasks.
3. **Refactor.** With the tests green, clean up names and duplication. Run the tests again.
4. Mark the task `- [x]` in `tasks.md` only after its tests pass.

Work in vertical slices: one test, then its code, then the next. Never write all tests first.

### What a good test is

- It checks behavior through the public interface and survives an internal refactor.
- Its expected value comes from an independent source: a literal, a worked example, or the spec. It does not recompute the value the way the code does.
- It mocks only at system boundaries: external APIs, time, randomness, and sometimes the file system or database. It never mocks your own modules.

## Gate and self-correction

After the last task:

1. Evaluate the gate, in the mode from **Modo da execução**:
   - `legacy`: run `node scripts/gates/implement-gate.mjs score --change <change> --note "<what changed since the last attempt>" --legacy-write`. It prints JSON and exits 0 (`pass`), 1 (`retry`), 2 (`stop`) or 3 (`error`). The CLI writes the attempt to `gates.json`.
   - `runner`: `node scripts/harness/cli.mjs gate-implement --change <change> --note "<what changed since the last attempt>"`, with the same note. Act only on the `status` it returns.
2. Do not write the attempt, the score or the verdict anywhere by hand. The gates table of `docs/agents/issue-tracker.md` is derived from the state (`gates.json` in `legacy`, `run-state.json` in `runner`). Leave it alone. Put only the narrative in the log: what failed and what you changed.
3. Act on the verdict:
   - **pass**: the gate is done. Set **Próximo passo** to `spec-archive <change>`.
   - **retry**: read the failures, fix the **implementation**, and evaluate again with a new `--note`.
   - **stop**: the cycle stops after 3 corrections, or when the failure count did not drop. Record the reason under **Paradas**, without copying counters, and stop. Do not try a fourth correction.
   - **error**: a configuration problem, for example an empty `checks` command or a missing baseline. Fix the cause if it is in scope, otherwise stop and report.

## Runner step (`--runner-step`)

When the input contains `--runner-step`, the runner invoked you inside `cli.mjs run`. Do the task loop above for the open tasks, then end. Do not run any gate CLI and do not run `cli.mjs`: the runner evaluates the gate after you exit and decides the next step. With `--correction "<failures>"`, fix the implementation for the failures listed; do not edit tests, gates, `checks` or the contract to make them pass. End with one line: `SPEC-IMPLEMENT-STEP: <change> done`.

## Headless mode

Under `claude -p`, or when the input contains `--headless`, run the same steps without asking anything. When the spec and `docs/agents/` leave a decision open, take the option that changes the least and still satisfies the spec. Record it as a premise in the log of `issue-tracker.md`. The gate and its cycle run exactly as above. End with one line: `SPEC-IMPLEMENT: <change> <verdict>`.

Permissions in headless mode match each command literally. Run one plain command per Bash call: no `;`, `&&`, `cd`, `$?` or shell variables. The exit status is already in the tool result. If a compound command is denied, retry it as separate plain commands before concluding that a tool is unavailable.

## Execução por exceção

Dentro do escopo aprovado, siga sem nova confirmação: detalhe interno reversível, edição e testes já autorizados, correção dentro dos critérios aprovados, registro de decisão já dada e correção editorial sem mudança de significado.

Pare e peça decisão só quando houver mudança relevante de comportamento, escopo, risco ou aceite; decisão de negócio ou arquitetura indefinida; limite operacional atingido ou repetição improdutiva; ação destrutiva ou publicação não autorizada (push, PR); ou restrição de ferramenta que impeça continuar.

Cada parada explica em linguagem curta o motivo (um dos `stop_reasons` de `.claude/harness/policy.json`), a evidência e a recomendação.

## Rules

- **Never lower a gate threshold**, and never edit `scripts/gates/` or `checks` to make a gate pass.
- **Never change a test to make it pass** unless the test is provably wrong. When it is, write the proof (the spec line or the counterexample) in `issue-tracker.md` before you change it. Deleting a baseline test counts as a failing old test.
- The gate cannot be skipped, also not in headless mode.
- One task at a time. Do not add dependencies or refactor outside the task's scope.
