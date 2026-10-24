---
name: template-migrate
description: Adopt the SpecLoop pipeline in an existing project, or migrate a SpecLoop project to the pieces /template-update never writes - CLAUDE.md pipeline blocks, docs/agents, .claude/settings.json permissions, template.json checks, and managed paths added to the framework later (like scripts/gates). Runs `npx specloop adopt`, shows the plan, asks for confirmation item by item, and only adds, never removes. Use when the user asks to adopt SpecLoop or the spec pipeline in an existing project, migrate a project, or after /template-update reports owned changes.
metadata:
  origin: local
---

# Template Migrate

This skill is a thin wrapper over `npx specloop adopt`. It works on an existing project that does not use the framework yet (adoption) and on a SpecLoop project that needs what `/template-update` never writes (migration). `/template-update` updates only the paths the project lists as `managed`, and never writes `owned` paths. `adopt` brings the rest, explicitly and with confirmation:

| Item | What it adds | Safety rule |
|------|--------------|-------------|
| `managed` | Managed paths the project lacks (all of them on adoption; those the framework added later on migration) (for example `scripts/gates`, with `scripts/harness` and `.claude/harness`, which the gates import), copied and listed in `template.json`. Also new `owned` entries. | A path that already exists in the project is a conflict: never copied, never listed as managed. The apply is refused when the result would leave `scripts/gates` without `scripts/harness` or `.claude/harness`, or with an import outside managed. |
| `docs-agents` | `docs/agents/` from the framework's `templates/docs/agents/` (TBD models). | Only when `docs/agents/` does not exist. |
| `checks` | `template.json` → `checks` (`test`, `lint`, `typecheck`, optional `test_file`, `coverage`). With `--checks-test-report`, also `checks.test_report` (D12, D27): `checks.test` string becomes `{command, suite}`, and `test_report` is created with `format: "tap"`. | Only commands the user confirms. A non-empty command is never replaced; each local value that differs from the proposal is reported as preserved. `format` other than `tap` is refused with `config_error` naming `checks.test_report.format`. A `checks.test` suite that differs from the `test_report` suite is refused. Refusals happen before any file is written. A project without `test_report` stays in legacy mode until this item is applied. |
| `settings` | Rules missing from `.claude/settings.json` → `permissions.allow`. | Only appends; existing rules and keys stay. |
| `claude-md` | The `agents-context` and `pipeline` blocks of the framework's `CLAUDE.md`, between `<!-- template:<id>:start -->` and `<!-- template:<id>:end -->`. | Only the text between the markers is ever replaced. Without markers, `agents-context` goes right after the title and `pipeline` at the end. |

The work is done by `.claude/skills/template-migrate/migrate.mjs` from the npm package, which `npx specloop adopt` runs with the package itself as the template. Never run a script from the template clone: there is no clone, and the framework is never fetched with git.

## Steps

1. **Check the repo.** It must be a git repository. Without `template.json`, `adopt` starts one (`framework`, empty `managed` and `owned`) only when the first item is applied. If the repo is the framework itself (its `template.json` has `template_only`), stop.

2. **Plan.** Run `npx specloop@latest adopt` without answering. It runs `migrate.mjs plan` and writes nothing when no item is confirmed. For each item, show its status (`needed`, `done`, `conflict`) and details:
   - `managed`: the paths to copy and the conflicts;
   - `checks`: the current commands and the detected candidates;
   - `settings`: the rules to append;
   - `claude-md`: a preview of where the blocks go (show the framework's block text).

3. **Confirm each item.** Ask the user about each `needed` item separately, with yes as the recommendation only when the item has no conflict. For `checks`, confirm each command one by one: the detected candidate, a command the user types, or empty. For `test_report`, show the TAP candidate and the suite; ask for the suite (`unit` is the usual one). Show what is preserved and any refusal before asking. Nothing is applied without a yes.

4. **Apply only what was confirmed.** Run `npx specloop@latest adopt --items <confirmed items, comma-separated>`, plus `--checks-test "<cmd>"`, `--checks-test-file`, `--checks-lint`, `--checks-typecheck`, `--checks-coverage`, `--checks-test-report` and `--checks-suite` for the confirmed commands. The CLI calls `migrate.mjs apply` with exactly those `--items`. If nothing was confirmed, do not run it.

5. **Verify.** Show `git status` and `git diff` for the changed files. Then run `openspec validate --all`. If `checks` was applied with all three commands, run `node scripts/gates/lint.mjs` when it exists, and check that `implement-gate.mjs` loads the checks (an empty command makes the gate say which field is missing). Run `npx specloop@latest adopt` again without answering: every applied item must show `done`.

6. **Commit only if the user asks**, with a `chore(specloop): adota ...` message that lists the items applied.

## Rules

- Never write without the confirmation in step 3. Never remove or rewrite project content outside the template markers.
- Running the migration again is safe: an item already `done` is skipped, and a `test_report` already in place is not written again.
- `legacy-run.mjs` (same folder) moves one legacy execution of a change to the `runner` mode: it copies the legacy state first, imports the gates table as history (`legacy-markdown`, never an approval), records conservative counters and a migration baseline, and only then changes the mode. Run it with `node .claude/skills/template-migrate/legacy-run.mjs migrate --change <change>`; it is a separate, explicit step, and running it again is safe. Recovery is the manual procedure `manual_rollback` in `.claude/harness/policy.md` (PM-011), run by a human with `node .claude/skills/template-migrate/legacy-run.mjs restore --change <change> --approver <name> --reason <text>`. It needs an interactive terminal, the pre-migration copy with its hash checked, and reconciliation of the open reservations before any paid call, and it is never transparent. Never run it on the user's behalf.
- Report conflicts and leave them to the user. Do not resolve them by overwriting.
- `apply` refuses before writing anything when the result would leave `scripts/gates` without `scripts/harness` or `.claude/harness` (or with a gate import outside managed). The message names the missing paths. Complete them with `npx specloop adopt --items managed`; do not edit the gates to work around it.
