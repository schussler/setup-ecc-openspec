---
name: spec-implement
description: Second step of the spec pipeline. Implements an OpenSpec change task by task with TDD (Red → Green → Refactor) through /opsx:apply, then runs the implementation gate and self-corrects until it passes or the cycle stops. Use when the user wants to implement a change, continue implementation, or says "spec-implement".
metadata:
  origin: local
  adapted-from: mattpocock/skills@5beb35b040e3de97e54fa9e386d7e42d15c295c2 (engineering/tdd)
---

# Spec Implement

Step 2 of the pipeline `spec-create` → `spec-implement` → `spec-archive` → `pr`.

It is a thin wrapper over `/opsx:apply`. That command owns the task loop and the checkboxes in `tasks.md`. This skill adds TDD discipline, the implementation gate, and the self-correction cycle. The gate's score comes from `scripts/gates/implement-gate.mjs`, never from your own judgment.

## Input

The change name. If it is missing, use **Change ativa** from `docs/agents/issue-tracker.md`, or the only active change in `openspec list`. If more than one is active, ask.

## Before the first task

1. **Read the context.** Read `docs/agents/architecture.md`, `docs/agents/domain.md` and the restore point in `docs/agents/issue-tracker.md`. Then read the change: `proposal.md`, `design.md`, the delta specs and `tasks.md`.
2. **Check the commands.** `template.json` → `checks` must have `test`, `lint` and `typecheck`. If one is empty, the gate fails and names it. Stop and say which one is missing. Do not invent a command.
3. **Record the baseline, once per change.** Read `openspec/changes/<change>/gates.json`.
   - If it has no `implement.baseline`, run `node scripts/gates/implement-gate.mjs baseline --change <change>` before you write any code. The baseline is the list of test files that exist now. Every test file created after it counts as new.
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

1. Run `node scripts/gates/implement-gate.mjs score --change <change> --note "<what changed since the last attempt>"`. It prints JSON and exits 0 (`pass`), 1 (`retry`), 2 (`stop`) or 3 (`error`).
2. Record the attempt as a row in the **Gates** table of `docs/agents/issue-tracker.md`: the attempt number, what failed (failing files, lint or type errors), what you changed, the score (`old_pct`, `new_pct`, `lint_errors`, `type_errors`) and the verdict.
3. Act on the verdict:
   - **pass**: the gate is done. Set **Próximo passo** to `spec-archive <change>`.
   - **retry**: read the failures, fix the **implementation**, and score again with a new `--note`.
   - **stop**: the script stops after 3 corrections, or when the failure count did not drop. Record the failure under **Paradas** with the last score, and stop. Do not try a fourth correction.
   - **error**: a configuration problem, for example an empty `checks` command or a missing baseline. Fix the cause if it is in scope, otherwise stop and report.

## Headless mode

Under `claude -p`, or when the input contains `--headless`, run the same steps without asking anything. When the spec and `docs/agents/` leave a decision open, take the option that changes the least and still satisfies the spec. Record it as a premise in the log of `issue-tracker.md`. The gate and its cycle run exactly as above. End with one line: `SPEC-IMPLEMENT: <change> <verdict>`.

Permissions in headless mode match each command literally. Run one plain command per Bash call: no `;`, `&&`, `cd`, `$?` or shell variables. The exit status is already in the tool result. If a compound command is denied, retry it as separate plain commands before concluding that a tool is unavailable.

## Rules

- **Never lower a gate threshold**, and never edit `scripts/gates/` or `checks` to make a gate pass.
- **Never change a test to make it pass** unless the test is provably wrong. When it is, write the proof (the spec line or the counterexample) in `issue-tracker.md` before you change it. Deleting a baseline test counts as a failing old test.
- The gate cannot be skipped, also not in headless mode.
- One task at a time. Do not add dependencies or refactor outside the task's scope.
