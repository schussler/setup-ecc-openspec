---
name: template-check
description: Validate the setup-ecc-openspec template itself before it is used as a base for new projects or published. Checks that template.json is valid, managed and owned paths exist, OpenSpec versions match the installed files, and no machine-specific paths or secrets are committed. Use when the user changes the template, before merging to main, or asks whether the template is healthy.
metadata:
  origin: local
---

# Template Check

Check the template repo's own integrity. Run this in the template repo, not in a derived project. Derived projects use `/template-update`. Upstream drift is checked by `/upstream-sync-check`.

This skill only reads and reports. Run each check with read-only commands, and never modify files.

## Checks

1. **Manifest is valid.** `template.json` parses as JSON. It has `template.repo`, `template.branch`, `upstreams.ecc`, `upstreams.openspec`, `managed` and `owned`. Fail if any of these is missing.

2. **Managed paths exist.** Each entry in `managed` exists in the repo. Fail on any missing entry.

3. **Owned paths are sane.** Each entry in `owned` is not also in `managed`, and no `owned` entry is a prefix of a `managed` entry. Entries that do not exist yet are allowed, because they belong to a new project (`openspec/specs`, `.claude/rules/project`). Report them as notes, not failures.

4. **OpenSpec version matches.** `upstreams.openspec` in `template.json` equals `metadata.generatedBy` in `.claude/skills/openspec-propose/SKILL.md`. Also check every `openspec-*` skill and `.claude/commands/opsx/*.md` says the same. Fail on a mismatch.

5. **Required files are present.** `CLAUDE.md`, `openspec/config.yaml`, `.claude/rules/openspec.md`, `.claude/rules/common/*.md`, and `.claude/rules/README.md` exist. Fail if any is missing.

6. **No machine-specific paths.** Find the current user's home directory (`echo $HOME`) and the session scratch root (any `/private/tmp/claude-` path). Search tracked files for those exact strings with `git grep -nF`. Fail on any hit. Also search for generic absolute paths (`/Users/`, `/home/`, `/private/tmp/`) and report those hits as `NOTE`. Upstream documentation and test fixtures use them as examples. Do not print the user name, only the file and line.

7. **No secrets.** Search tracked files for common key shapes: `sk_live_[A-Za-z0-9]`, `AKIA[0-9A-Z]{16}`, `-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----`, and `ghp_[A-Za-z0-9]{36}`. Treat placeholders like `sk_live_...` as clean. Fail on any real-looking match. Do not print the matched secret. Report only the file and line.

8. **Template is on the branch that will be used.** Compare the current branch with `template.branch` in `template.json`. Warn, do not fail, if the current branch has commits that the template branch does not have. A new project clones from `template.branch`, so unmerged template work will not reach it.

9. **New manifest fields are sane.** `checks.test`, `checks.lint` and `checks.typecheck` are non-empty strings, and `checks.test_file`, when present, contains `{file}`. No `template_only` entry is in `managed` or a prefix of a `managed` entry. A `template_only` entry that does not exist yet is a `NOTE`, because `openspec/specs` and `openspec/changes/archive` only appear after the first archive. `upstreams.mattpocock-skills` is a 40-character commit hash. Fail on any of these.

10. **Template suite passes.** Run `checks.test`, `checks.lint` and `checks.typecheck` from `template.json`, in the repo root. They only read the repo and write to the system temp directory. Fail on a non-zero exit, and show the failing lines.

## Report

Print one line per check: `PASS`, `FAIL` or `NOTE`, with the reason. Finish with a single verdict: `READY` if no check failed, or `NOT READY` with the list of failures. Do not print the content of any matched secret.

## Rules

- Read only. Do not fix anything in this skill. Propose fixes and wait for the user to confirm.
- Run every check, even after one fails.
- Say what was not checked, for example if `git grep` is unavailable.
