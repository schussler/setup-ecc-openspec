---
name: template-update
description: Update a SpecLoop project to the latest framework version. Runs `npx @k0d3r/specloop@latest update`, which compares the managed paths with the package, shows what would change, and applies only the managed paths after the user confirms. Use when the user asks to update the project from the framework, pull framework changes, or sync a project with SpecLoop.
metadata:
  origin: local
---

# Template Update

Bring a SpecLoop project up to date with the framework. This is a thin wrapper over `npx @k0d3r/specloop@latest update`: the CLI compares and copies from the npm package, so updating from the terminal or from Claude Code gives the same result. The framework repository itself is checked with `upstream-sync-check`, not this skill.

Only the paths listed in `template.json` as `managed` are updated. Paths listed as `owned` are never written. `.harness-project.json` is owned: it is never overwritten, so the project keeps its `project_id` (RS-023).

The gates in `scripts/gates` import modules from `scripts/harness`, and they read `.claude/harness` (policy). The CLI copies all managed paths together, including `scripts/harness` and `.claude/harness`.

## Steps

1. **Check the repo uses the framework.** Read `template.json` at the repo root. If it is missing, stop and say so, and point to `npx @k0d3r/specloop adopt` (`/template-migrate`). A project created before the CLI has `template.repo` instead of `framework`: that is fine, the update converts it.

2. **Show the plan.** Run `npx @k0d3r/specloop@latest update` without `--yes` and without answering. It prints the version change and three groups: files to update, files the framework added, and files the framework removed. It writes nothing when the question is not answered. Removed files are never deleted. Ask the user about them.

   Before listing, the CLI runs `migrate.mjs check-update` on a temporary copy. If the result would leave `scripts/gates` without `scripts/harness` or `.claude/harness`, or with a gate import outside managed, it refuses with exit code 1 and names the missing paths. Show the message and point to `npx @k0d3r/specloop adopt` (item `managed`). Do not write anything.

3. **Owned paths.** List what the framework changed in owned paths that the project lacks: `CLAUDE.md`, `docs/agents/`, `.claude/settings.json` and the `checks` field of `template.json`. These never update here. They reach an existing project only by explicit migration: point the user to `npx @k0d3r/specloop adopt` (`/template-migrate`), which adds them with confirmation item by item.

4. **Check the tool versions.**
   - Run `openspec --version`. If it differs from the OpenSpec version in the package's `upstreams`, say so. Installing the CLI (`npm i -g @fission-ai/openspec@<version>`) and running `openspec update` both need explicit confirmation.
   - The OpenSpec workflow profile is global to the machine, not per project, in CLI 1.14.3. Run `openspec config list` and check that `profile: core` is set. If it is not, say so and tell the user to run `openspec config profile core` once on this machine. Do not change it here.

5. **Apply after confirmation.** When the user confirms the list from step 2, run `npx @k0d3r/specloop@latest update --yes`. It copies only the managed files and writes `framework.version` and `upstreams` in `template.json`.

6. **Verify.** Run `openspec validate --all` and `openspec doctor`. Show `git status`. Report anything that could not be verified.

7. **Commit only if the user asks.** Use a `chore(specloop): ...` message that lists the framework version and the files changed. Follow the repo's commit attribution rules.

## Rules

- Never run `update --yes` before the user confirms the list from step 2.
- Never write to an owned path. `.harness-project.json` is owned: never overwrite it, not even when the framework changes its `project_id` (RS-023).
- Never write when `check-update` refuses. A managed update that leaves `scripts/gates` without `scripts/harness` or `.claude/harness` is refused.
- Never copy files by hand or fetch the framework with git: `npx @k0d3r/specloop update` is the only way to update.
- Keep the report short: list files and versions, not full diffs.
