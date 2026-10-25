---
name: new-project
description: Bootstrap a new project with the SpecLoop framework. Collects the project inputs and runs `npx @k0d3r/specloop init`, which creates the directory, copies the toolset from the package, prunes language rules the project does not use, installs docs/agents from the models, records the framework version and the chosen rules in template.json, rewrites the project CLAUDE.md and README, and makes the first commit. Use when the user asks to create, start, or bootstrap a new project with SpecLoop.
metadata:
  origin: local
---

# New Project

Create a new project with the SpecLoop framework. This skill is a thin wrapper over `npx @k0d3r/specloop init`: the CLI does the work, so creating a project from the terminal or from Claude Code gives the same result. Projects keep a `template.json` with `framework.package` and `framework.version`, so `npx @k0d3r/specloop update` (or `/template-update`) can update them later.

Do the steps in order. Confirm with the user where the step says so, except in non-interactive mode.

## Non-interactive mode (`--non-interactive`)

Used by automation and the benchmark (`claude -p`). All inputs come from arguments, and there are no questions:

```
--non-interactive --target <abs path> --name <name> --description "<text>" --languages "<lang ...>"
--checks-test "<cmd>" --checks-lint "<cmd>" --checks-typecheck "<cmd>"
[--checks-test-file "<cmd with {file}>"] [--checks-coverage "<cmd>"]
[--checks-test-report "<cmd that prints TAP>"] [--suite <id, default unit>]
[--template-source <local path of a SpecLoop checkout>]
```

- `--target` and `--name` are required. A missing one is an error: stop, list it, and create nothing.
- `--description` defaults to the name. `--languages` defaults to none (`common` only). A missing `checks-*` argument is written as an empty string.
- `--template-source <path>` runs the CLI of that local checkout (`node <path>/bin/specloop.mjs init ...`) instead of `npx @k0d3r/specloop@latest init`. It lets a benchmark run against an unpublished branch. `template.json` in the new project still records `framework.package` and the version of that checkout.
- The CLI runs with `--yes`: no questions, and the first commit is made without waiting for confirmation.
- Permissions match each command literally. Run one plain command per Bash call, with absolute paths. Do not use shell variables (`T=...`), `;`, `&&` or subshells. A denied command will not be allowed on a retry: report it and stop.
- End with one line: `NEW-PROJECT: <target> <created|failed>`.

## Inputs

Collect these before creating anything. Ask for any that are missing:

- **Target directory**: absolute path. It must not exist, or it must exist and be empty. The CLI refuses a directory with files.
- **Project name**: used in `CLAUDE.md`, `README.md` and `template.json`.
- **One-line description**: used in `README.md`.
- **Languages**: any of the language directories under `.claude/rules/` in the framework, for example `typescript python`. `common` is always kept. Pick only what the project uses.
- **Check commands**: the project's `test`, `lint` and `typecheck` commands, plus the optional `test_file` (runs one test file, contains `{file}`) and `coverage`. The gates in `scripts/gates/` read them from `template.json` → `checks`. If the user has no command yet for a field, leave it empty: the CLI writes an empty string, and the gate then fails with a message that names the field.

## Steps

1. **Show the plan and confirm.** Show the target, the name, the languages and the check commands. Ask the user to confirm before creating anything.

2. **Run the CLI.** One command, with the confirmed inputs:
   ```bash
   npx @k0d3r/specloop@latest init <target> --yes --name <name> --description "<text>" --languages "<langs>" --checks-test "<cmd>" --checks-lint "<cmd>" --checks-typecheck "<cmd>"
   ```
   Add `--checks-test-file`, `--checks-coverage`, `--checks-test-report` and `--suite` when given. With `--template-source <path>`, run `node <path>/bin/specloop.mjs init ...` with the same arguments.

   What the CLI does, so you can check the result:
   - `git init -q -b main <target>` and a copy of the toolset from the package. The repo has no framework history and no remote.
   - The managed paths, among them `scripts/gates` together with `scripts/harness` (necessary for the gates to import) and `.claude/harness`, plus the rules of the chosen languages only.
   - `<target>/docs/agents/` from the models in `templates/docs/agents/`, with their `TBD` fields for the team to fill.
   - No path of `template_only` (`templates`, `scripts/benchmark`, `scripts/test`, `bin`, `scripts/cli`), and empty `openspec/specs/` and `openspec/changes/`: the project inherits no spec and no change.
   - `template.json` with `project.name`, `framework`, `upstreams`, `managed`, `owned`, `rules` and `checks` (`checks.test`, `checks.lint`, `checks.typecheck`; an empty string for a command not given, never `TBD`). With `--checks-test-report`, `checks.test` is `{"command": "<test cmd>", "suite": "<suite>"}` and `checks.test_report` is `{"command": "<TAP cmd>", "suite": "<same suite>", "format": "tap"}` (D27).
   - A new `project_id` in `.harness-project.json`, written with `renew-id.mjs` (RS-019): the project does not inherit the framework's `project_id`.
   - `.harness-local/` in `.gitignore`: the harness run state is local evidence and never goes to git.
   - `# <name>` as the first line of `CLAUDE.md`, a short `README.md`, and the first commit.

   If the CLI exits with code 1, show its message and stop. It wrote nothing when it refused the target directory.

3. **Validate.** In `<target>`, run `openspec --version`, `openspec validate --all` and `openspec config list`. Check that `profile: core` is set. If it is not, say so and tell the user to run `openspec config profile core` once on this machine. Do not change it from here.

4. **Report.** Print the target path, the rules kept, any empty `checks` field and `git -C <target> log --oneline`. Report anything that could not be verified, for example if the OpenSpec CLI is not installed.

## Rules

- Never create or write into a directory that already has files.
- Never write outside `<target>`.
- Never copy files by hand or fetch the framework with git: `npx @k0d3r/specloop init` is the only way to create a project.
