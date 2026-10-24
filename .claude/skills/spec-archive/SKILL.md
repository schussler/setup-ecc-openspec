---
name: spec-archive
description: Third step of the spec pipeline. Runs the archive gate (implementation gate passed, suite green, every spec scenario has a test with the same name), then archives the change through /opsx:archive and syncs the main specs. Use when a change is implemented and the user wants to archive it, or says "spec-archive".
metadata:
  origin: local
---

# Spec Archive

Step 3 of the pipeline `spec-create` → `spec-implement` → `spec-archive` → `pr`.

It is a thin wrapper over `/opsx:archive`. It adds the archive gate before archiving and the record in `docs/agents/issue-tracker.md`. The gate cannot be skipped, also not in headless mode. Run autonomously, this step is conducted by the runner (`scripts/harness/`); run supervised, it delegates to `/opsx:archive`. Until the adoption milestone (marco de adoção) is recorded, every execution stays `legacy`.

## Input

The change name. If it is missing, use **Change ativa** from `docs/agents/issue-tracker.md`.

## Modo da execução

Read the `mode` field of `.harness-local/<change>/run-state.json`. Without that file the execution is `legacy`.

- **legacy** (the mode in use today): the gate CLI writes `gates.json` only with `--legacy-write`. Pass that flag to the archive gate call. The CLI is the only writer of counters and verdicts; this skill writes none.
- **runner**: the runner owns the state. Do not run the archive gate CLI. Run `node scripts/harness/cli.mjs gate-archive --change <change> --note "<...>"` for the gate (exit 0 `pass`, 1 `retry`, 2 `stop`), then `node scripts/harness/cli.mjs validate-final --change <change>` for the final validation. The runner writes `evidence-summary.json` at that step. Before archiving, `node scripts/harness/cli.mjs checkpoint --milestone archived --change <change>` writes the archive checkpoint; it refuses without an approved final validation (D18). After the move, `node scripts/harness/cli.mjs report --change <change>` writes the archive report.
- Until the adoption milestone (marco de adoção) is recorded in `docs/agents/issue-tracker.md` by a human decision, no execution is assigned to the runner. Every execution stays `legacy`, whatever else exists on disk.

## Steps

1. **Read the context.** Read the restore point in `docs/agents/issue-tracker.md` and `openspec/changes/<change>/gates.json`. If the last implementation verdict is not `pass`, stop and send the user to `spec-implement`. Archiving comes only after the implementation gate.

2. **Evaluate the archive gate**, in the mode from **Modo da execução**. In `legacy`, run `node scripts/gates/archive-gate.mjs --change <change> --note "<what changed since the last attempt>" --legacy-write`. In `runner`, run `node scripts/harness/cli.mjs gate-archive --change <change> --note "<...>"` and then `validate-final`. The gate prints JSON and exits 0 (`pass`), 1 (`retry`), 2 (`stop`) or 3 (`error`). It scores:
   - the precondition: the last implementation verdict is `pass`;
   - the full suite (`checks.test`) passes;
   - `scenarios.pct`: the share of `#### Scenario:` names in the change's specs that appear, normalized (no accents, no case, no punctuation), in a test file. It must be 100.

3. **Do not write the attempt, the score or the verdict by hand.** The gates table of `issue-tracker.md` is derived from the state. Put only the narrative in the log: what failed (`scenarios.missing`, a failing suite) and what changed.

4. **Act on the verdict.**
   - **pass**: go to step 5.
   - **retry**: for each name in `scenarios.missing`, write the test that proves that scenario and name it with the scenario's exact text. Run it and see it pass for the right reason. If a scenario has no behavior in the code, the implementation is incomplete: stop and send the change back to `spec-implement`. Then evaluate the gate again with a new `--note`.
   - **stop**: record the reason under **Paradas**, without copying counters, and stop. No fourth correction.
   - **error**: a configuration problem, for example an empty `checks.test`. Fix it if it is in scope, otherwise stop and report.

5. **Archive.** First, in `runner`, check that `evidence-summary.json` and the archive checkpoint (`checkpoint.json`, marco `archived`) are written inside the change: the runner writes them before the change moves. If either is missing, stop and report `awaiting_decision`. Then run `/opsx:archive <change>`. If it is not available, or in headless mode, run `openspec archive <change> --yes`. The change moves to `openspec/changes/archive/<YYYY-MM-DD>-<change>/` together with its `gates.json` and, in `runner`, its summary and checkpoint. Record which path was used.

6. **Sync the specs.** The archive applies the delta specs to `openspec/specs/`. Check that every capability in the change now exists there. If one is missing or stale, run the `openspec-sync-specs` skill for that change. Then run `openspec validate --all`.

7. **Record the restore point.** In `issue-tracker.md`, clear **Change ativa**, set **Próximo passo** to `pr` (only on explicit request) or the next change, and add a log entry that points to the gates state for the final scores, without copying them.

8. **Consumo e observações finais.** Only after a successful archive, run `node scripts/harness/cli.mjs consumo --change <change> --archived` and show its `section` to the user under the heading "Consumo e observações finais". If the command fails, report that the report failed and that the archive is kept, then stop; the command can be run again later. Never revert the archive, never change the gate verdict, and never run this command in any other step.

## Headless mode

Under `claude -p`, or when the input contains `--headless`, run the same steps without asking anything. Archive with `openspec archive <change> --yes`. The gate and its cycle run exactly as above. End with one line: `SPEC-ARCHIVE: <change> <archived|not-archived> <verdict>`.

Permissions in headless mode match each command literally. Run one plain command per Bash call: no `;`, `&&`, `cd`, `$?` or shell variables. The exit status is already in the tool result. If a compound command is denied, retry it as separate plain commands before concluding that a tool is unavailable.

## Conclusão supervisionada

Quando a implementação foi feita fora do runner, o gate de arquivamento aceita o registro de conclusão supervisionada no lugar do veredito `pass` do gate de implementação. Gere o registro com as evidências atuais:

```
node scripts/harness/supervised-completion.mjs --change <change>
```

O comando roda suíte, lint, sintaxe, `openspec validate --strict` e o contrato agora. Qualquer evidência sem `pass` recusa o registro e nada é gravado. O registro vale só para o hash atual do contrato: depois de qualquer alteração em `proposal.md`, `design.md` ou `specs/`, gere de novo. `gates.json` e o veredito anterior não mudam.

## Rules

- Never archive with a gate in any verdict other than `pass`.
- Never lower a threshold, never edit `scripts/gates/`, and never rename a scenario to match an existing test. The test follows the spec, not the other way round.
- Do not commit, push or open a PR here.
