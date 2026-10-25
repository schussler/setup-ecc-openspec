---
name: template-check
description: Validate the SpecLoop framework itself before it is used as a base for new projects or published. Checks that template.json is valid, managed and owned paths exist, OpenSpec versions match the installed files, and no machine-specific paths or secrets are committed. Use when the user changes the template, before merging to main, or asks whether the template is healthy.
metadata:
  origin: local
---

# Template Check

Check the template repo's own integrity. Run this in the template repo, not in a derived project. Derived projects use `/template-update`. Upstream drift is checked by `/upstream-sync-check`.

This skill only reads and reports. Run each check with read-only commands, and never modify files.

## Checks

1. **Manifest is valid.** `template.json` parses as JSON. It has `framework.package` (`@k0d3r/specloop`), `framework.version`, `upstreams.ecc`, `upstreams.openspec`, `managed` and `owned`. Fail if any of these is missing.

2. **Managed paths exist.** Each entry in `managed` exists in the repo. Fail on any missing entry.

3. **Owned paths are sane.** Each entry in `owned` is not also in `managed`, and no `owned` entry is a prefix of a `managed` entry. Entries that do not exist yet are allowed, because they belong to a new project (`openspec/specs`, `.claude/rules/project`). Report them as notes, not failures.

4. **OpenSpec version matches.** `upstreams.openspec` in `template.json` equals `metadata.generatedBy` in `.claude/skills/openspec-propose/SKILL.md`. Also check every `openspec-*` skill and `.claude/commands/opsx/*.md` says the same. Fail on a mismatch.

5. **Required files are present.** `CLAUDE.md`, `openspec/config.yaml`, `.claude/rules/openspec.md`, `.claude/rules/common/*.md`, and `.claude/rules/README.md` exist. Fail if any is missing.

6. **No machine-specific paths.** Find the current user's home directory (`echo $HOME`) and the session scratch root (any `/private/tmp/claude-` path). Search tracked files for those exact strings with `git grep -nF`. Fail on any hit. Also search for generic absolute paths (`/Users/`, `/home/`, `/private/tmp/`) and report those hits as `NOTE`. Upstream documentation and test fixtures use them as examples. Do not print the user name, only the file and line.

7. **No secrets.** Search tracked files for common key shapes: `sk_live_[A-Za-z0-9]`, `AKIA[0-9A-Z]{16}`, `-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----`, and `ghp_[A-Za-z0-9]{36}`. Treat placeholders like `sk_live_...` as clean. Fail on any real-looking match. Do not print the matched secret. Report only the file and line.

8. **Package version matches.** `framework.version` in `template.json` equals `version` in `package.json`, and `package.json` → `name` equals `framework.package`. Fail on a mismatch: `npx @k0d3r/specloop init` and `update` record `framework.version` from `package.json`.

9. **New manifest fields are sane.** `checks.lint` and `checks.typecheck` are non-empty strings. `checks.test` is a non-empty string or an object `{command, suite}` (check 11). `checks.test_file`, when present, contains `{file}`. No `template_only` entry is in `managed` or a prefix of a `managed` entry. A `template_only` entry that does not exist yet is a `NOTE`, because `openspec/specs` and `openspec/changes/archive` only appear after the first archive. `upstreams.mattpocock-skills` is a 40-character commit hash. Fail on any of these.

10. **Template suite passes.** Run `checks.test`, `checks.lint` and `checks.typecheck` from `template.json`, in the repo root. They only read the repo and write to the system temp directory. Fail on a non-zero exit, and show the failing lines.

11. **Checks formats are authorized (D27).** `checks.test` is either the legacy string, or the object `{"command": "...", "suite": "..."}`. `checks.test_report`, when present, is an object `{"command", "suite", "format"}`, and `format` is `"tap"` only in v1. Any other `format` fails with a message that names `checks.test_report.format`, lists the supported formats (`tap`) and shows the example `"format": "tap"`. When `checks.test_report` exists, `checks.test` must be an object with the same `suite`: a string or a different suite fails. The check is `validateChecksSchema` in `scripts/gates/checks.mjs`, run by `node scripts/harness/template-check.mjs`. It does not duplicate that logic.

12. **Gates are distributed with what they import.** If `managed` includes `scripts/gates`, then `scripts/harness` and `.claude/harness` must exist and be managed too. Every relative import of `scripts/gates/*.mjs`, followed transitively through the imported files, must resolve to an existing file inside a `managed` path. An import that is missing, or that points outside `managed`, fails: a derived project would receive gates that do not import. The check is `distributionGaps` in `.claude/skills/template-migrate/distribution.mjs`, run by `node scripts/harness/template-check.mjs`.

Checks 11 and 12 run with `node scripts/harness/template-check.mjs` in the template root. It prints `READY` or `NOT READY` and the failures. Run it as part of check 10.

## Report

Print one line per check: `PASS`, `FAIL` or `NOTE`, with the reason. Finish with a single verdict: `READY` if no check failed, or `NOT READY` with the list of failures. Do not print the content of any matched secret.

## Rules

- Read only. Do not fix anything in this skill. Propose fixes and wait for the user to confirm.
- Run every check, even after one fails.
- Say what was not checked, for example if `git grep` is unavailable.
