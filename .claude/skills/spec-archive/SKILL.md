---
name: spec-archive
description: Third step of the spec pipeline. Runs the archive gate (implementation gate passed, suite green, every spec scenario has a test with the same name), then archives the change through /opsx:archive and syncs the main specs. Use when a change is implemented and the user wants to archive it, or says "spec-archive".
metadata:
  origin: local
---

# Spec Archive

Step 3 of the pipeline `spec-create` → `spec-implement` → `spec-archive` → `pr`.

It is a thin wrapper over `/opsx:archive`. It adds the archive gate before archiving and the record in `docs/agents/issue-tracker.md`. The gate cannot be skipped, also not in headless mode.

## Input

The change name. If it is missing, use **Change ativa** from `docs/agents/issue-tracker.md`.

## Steps

1. **Read the context.** Read the restore point in `docs/agents/issue-tracker.md` and `openspec/changes/<change>/gates.json`. If the last implementation verdict is not `pass`, stop and send the user to `spec-implement`. Archiving comes only after the implementation gate.

2. **Run the archive gate.** Run `node scripts/gates/archive-gate.mjs --change <change> --note "<what changed since the last attempt>"`. It prints JSON and exits 0 (`pass`), 1 (`retry`), 2 (`stop`) or 3 (`error`). It scores:
   - the precondition: the last implementation verdict is `pass`;
   - the full suite (`checks.test`) passes;
   - `scenarios.pct`: the share of `#### Scenario:` names in the change's specs that appear, normalized (no accents, no case, no punctuation), in a test file. It must be 100.

3. **Record the attempt** as a row in the **Gates** table of `issue-tracker.md`: what failed (`scenarios.missing`, a failing suite), what changed, the score and the verdict.

4. **Act on the verdict.**
   - **pass**: go to step 5.
   - **retry**: for each name in `scenarios.missing`, write the test that proves that scenario and name it with the scenario's exact text. Run it and see it pass for the right reason. If a scenario has no behavior in the code, the implementation is incomplete: stop and send the change back to `spec-implement`. Then rerun the gate with a new `--note`.
   - **stop**: record the failure under **Paradas** with the last score, and stop. No fourth correction.
   - **error**: a configuration problem, for example an empty `checks.test`. Fix it if it is in scope, otherwise stop and report.

5. **Archive.** Run `/opsx:archive <change>`. If it is not available, or in headless mode, run `openspec archive <change> --yes`. The change moves to `openspec/changes/archive/<YYYY-MM-DD>-<change>/` together with its `gates.json`. Record which path was used.

6. **Sync the specs.** The archive applies the delta specs to `openspec/specs/`. Check that every capability in the change now exists there. If one is missing or stale, run the `openspec-sync-specs` skill for that change. Then run `openspec validate --all`.

7. **Record the restore point.** In `issue-tracker.md`, clear **Change ativa**, set **Próximo passo** to `pr` (only on explicit request) or the next change, and add a log entry with the final scores of both gates.

## Headless mode

Under `claude -p`, or when the input contains `--headless`, run the same steps without asking anything. Archive with `openspec archive <change> --yes`. The gate and its cycle run exactly as above. End with one line: `SPEC-ARCHIVE: <change> <archived|not-archived> <verdict>`.

Permissions in headless mode match each command literally. Run one plain command per Bash call: no `;`, `&&`, `cd`, `$?` or shell variables. The exit status is already in the tool result. If a compound command is denied, retry it as separate plain commands before concluding that a tool is unavailable.

## Rules

- Never archive with a gate in any verdict other than `pass`.
- Never lower a threshold, never edit `scripts/gates/`, and never rename a scenario to match an existing test. The test follows the spec, not the other way round.
- Do not commit, push or open a PR here.
