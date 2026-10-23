---
name: pr
description: Last step of the spec pipeline, run only when the user explicitly asks for a pull request. Runs the PR gate (no active OpenSpec change, clean git status, green suite), drafts the PR body, shows commit, target branch and body, and waits for confirmation before gh pr create. Never runs in headless mode.
metadata:
  origin: local
  adapted-from: mattpocock/skills@5beb35b040e3de97e54fa9e386d7e42d15c295c2 (engineering/pr)
---

# PR

Step 4 of the pipeline `spec-create` → `spec-implement` → `spec-archive` → `pr`.

**Run this skill only on an explicit request from the user** to open a pull request ("abre a PR", "create the PR"). Finishing the pipeline is not a request. This skill never runs in headless mode: if the session is headless (`claude -p`, or the prompt says `--headless`), stop and say a PR needs a person.

## Steps

1. **Run the PR gate.** Run `node scripts/gates/pr-gate.mjs`. It fails when any of these holds:
   - an active change exists in `openspec/changes/` (anything but `archive/`): archive it with `spec-archive` first;
   - `git status` is not clean: commit or discard first, after asking;
   - the suite (`checks.test`) fails: fix it with `spec-implement`.

   On `fail`, report each reason and stop. Do not fix anything inside this skill.

2. **Collect what the PR covers.** The current branch and the target branch (the repo's default branch unless the user named one). Run `git log <target>..HEAD` and `git diff <target>...HEAD --stat`. Read the archived changes in `openspec/changes/archive/` that these commits touched, and their `gates.json`.

3. **Draft the body** with this template. Keep prose short and use the terms from `docs/agents/domain.md`.

   ```markdown
   ## Summary

   <the smallest visual that makes the change clear: pseudocode, a call tree, a file tree, a diff sketch, or Mermaid>

   ## Evidence

   - **Before:** <failing test, output or screenshot>
     **After:** <passing test, output or screenshot>
   - Gates: implementation <score>, archive <score> (from `gates.json`)

   ## Merge Danger

   **Door:** <one-way or two-way>

   **Blast Radius:** <one word>
   ```

   End the body with the repo's PR attribution line.

4. **Show and wait for confirmation.** Print the commits, the head and target branches, the title and the full body. Wait for the user's confirmation. Apply any edits they ask for, and show the result again.

5. **Create the PR, after confirmation only.** Push with `git push -u origin <branch>` if the branch has no upstream, then run `gh pr create --base <target> --head <branch> --title "<title>" --body-file <file>`. Print the PR URL.

## Rules

- No PR, no push and no `gh` call without the confirmation in step 4.
- `gh` is needed only here. If it is missing or not authenticated, say so and stop.
- Do not skip or weaken the PR gate.
