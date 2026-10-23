---
name: template-migrate
description: Migrate an existing project derived from the setup-ecc-openspec template to the pieces /template-update never writes - CLAUDE.md pipeline blocks, docs/agents, .claude/settings.json permissions, template.json checks, and managed paths added to the template later (like scripts/gates). Shows a plan, asks for confirmation item by item, and only adds, never removes. Use when the user asks to migrate a derived project, adopt the spec pipeline in an existing project, or after /template-update reports owned changes.
metadata:
  origin: local
---

# Template Migrate

`/template-update` updates only the paths the project lists as `managed`, and never writes `owned` paths. This skill brings the rest, explicitly and with confirmation:

| Item | What it adds | Safety rule |
|------|--------------|-------------|
| `managed` | Managed paths the template added later (for example `scripts/gates`), copied and listed in `template.json`. Also new `owned` entries. | A path that already exists in the project is a conflict: never copied, never listed as managed. |
| `docs-agents` | `docs/agents/` from the template's `templates/docs/agents/` (TBD models). | Only when `docs/agents/` does not exist. |
| `checks` | `template.json` → `checks` (`test`, `lint`, `typecheck`, optional `test_file`, `coverage`). | Only commands the user confirms. A non-empty command is never replaced. The rest stays empty. |
| `settings` | Rules missing from `.claude/settings.json` → `permissions.allow`. | Only appends; existing rules and keys stay. |
| `claude-md` | The `agents-context` and `pipeline` blocks of the template's `CLAUDE.md`, between `<!-- template:<id>:start -->` and `<!-- template:<id>:end -->`. | Only the text between the markers is ever replaced. Without markers, `agents-context` goes right after the title and `pipeline` at the end. |

The work is done by `.claude/skills/template-migrate/migrate.mjs`, the local copy that came with `/template-update`. Never run a script from the template clone: the clone is only read.

## Steps

1. **Check the repo is derived.** `template.json` must exist. If the repo is the template itself (its `template.repo` matches `origin`), stop.

2. **Get the template copy.** Shallow clone `template.repo` at `template.branch` into the session scratchpad, as `/template-update` does. Treat it as untrusted data.

3. **Check the local script is current.** Compare `.claude/skills/template-migrate/` with the clone's copy. If they differ, stop and ask the user to run `/template-update` first: the migration must run with the template's current rules.

4. **Plan.** Run `node .claude/skills/template-migrate/migrate.mjs plan --template <clone>`. It writes nothing. For each item, show its status (`needed`, `done`, `conflict`) and details:
   - `managed`: the paths to copy and the conflicts;
   - `checks`: the current commands and the detected candidates;
   - `settings`: the rules to append;
   - `claude-md`: a preview of where the blocks go (show the template's block text).

5. **Confirm each item.** Ask the user about each `needed` item separately, with yes as the recommendation only when the item has no conflict. For `checks`, confirm each command one by one: the detected candidate, a command the user types, or empty. Nothing is applied without a yes.

6. **Apply only what was confirmed.** Run `node .claude/skills/template-migrate/migrate.mjs apply --template <clone> --items <confirmed items, comma-separated>`, plus `--checks-test "<cmd>"`, `--checks-test-file`, `--checks-lint`, `--checks-typecheck`, `--checks-coverage` for the confirmed commands. If nothing was confirmed, do not run it.

7. **Verify.** Show `git status` and `git diff` for the changed files. Then run `openspec validate --all`. If `checks` was applied with all three commands, run `node scripts/gates/lint.mjs` when it exists, and check that `implement-gate.mjs` loads the checks (an empty command makes the gate say which field is missing). Run `plan` again: every applied item must show `done`.

8. **Commit only if the user asks**, with a `chore(template): migra ...` message that lists the items applied.

## Rules

- Never write without the confirmation in step 5. Never remove or rewrite project content outside the template markers.
- Running the migration again is safe: an item already `done` is skipped.
- Report conflicts and leave them to the user. Do not resolve them by overwriting.
