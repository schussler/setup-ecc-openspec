---
name: spec-create
description: First step of the spec pipeline. Interviews the user about a feature with grill-me (or the built-in interview script), then creates the OpenSpec change through /opsx:propose and validates it. Use when the user wants to start a feature, write a spec, or says "spec-create".
metadata:
  origin: local
  adapted-from: mattpocock/skills@5beb35b040e3de97e54fa9e386d7e42d15c295c2 (productivity/grilling)
---

# Spec Create

Step 1 of the pipeline `spec-create` → `spec-implement` → `spec-archive` → `pr`. This skill writes the spec and nothing else. It never writes code.

It is a thin wrapper over `/opsx:propose`. It adds the interview, the scenario naming rule and the record in `docs/agents/issue-tracker.md`. It does not reimplement how OpenSpec creates artifacts.

## Input

A feature description, and optionally a change name in kebab-case. If the name is missing, derive it from the description (`add-…`, `fix-…`, `refactor-…`).

## Steps

1. **Read the context first.** Read `docs/agents/architecture.md`, `docs/agents/domain.md` and the **Ponto de restauração** in `docs/agents/issue-tracker.md`. Skip a file that does not exist. Run `openspec list --specs` and read the specs that touch the feature. Use the glossary's terms in everything you write.

2. **Interview.** If the `grill-me` skill is available (as `grill-me` or `anthropic-skills:grill-me`), call it with the feature description. Otherwise follow [interview.md](interview.md), the built-in interview script. Either way:
   - look up facts yourself (code, docs, `openspec`); ask the user only for decisions;
   - stop when every branch of the design tree is settled and the user confirms the shared understanding.

3. **Create the change.** Run `/opsx:propose <change-name>` with the settled understanding as its input. It writes `proposal.md`, the delta specs, `design.md` and `tasks.md`. If `/opsx:propose` is not available, use the CLI: `openspec new change <change-name>`, then for each artifact `openspec instructions <artifact> --change <change-name>` and write it as instructed. Record in `issue-tracker.md` that the CLI fallback was used.

4. **Name scenarios for their tests.** Each `#### Scenario:` name is short, unique within the change, and describes observable behavior. The archive gate matches each scenario to a test with the same name, so write the name you want to see on the test. Each scenario needs a test that can prove it.

5. **Validate.** Run `openspec validate <change-name> --strict`. If it fails, fix the artifacts and run it again, at most 3 times. If it still fails, stop and record the failure under **Paradas** in `issue-tracker.md`.

6. **Record the restore point.** In `docs/agents/issue-tracker.md`, set **Change ativa** to the change, **Próximo passo** to `spec-implement <change-name>`, and add a log entry with the decisions taken in the interview.

## Headless mode (`--headless`)

When the input contains `--headless`, or the session runs under `claude -p`, nobody can answer questions. Run the same steps, with these changes:

- **No interview rounds.** Do not call `grill-me` and do not wait for answers. Walk the branches of [interview.md](interview.md) yourself. For each decision that the brief, the code and `docs/agents/` do not settle, take your recommended answer as a premise.
- **Record every premise.** `proposal.md` must have a `## Premissas` section, with one bullet per premise: the decision, the premise assumed, why, and what would change if it is wrong. If no premise was needed, write `- Nenhuma: o brief resolve todas as decisões.`
- **Use the CLI when needed.** If `/opsx:propose` is not available, use the CLI fallback from step 3.
- **Gates stay the same.** Step 5 (`openspec validate --strict`, at most 3 corrections) and step 6 still run.
- **End with one line:** `SPEC-CREATE: <change-name> <valid|invalid>`.

Permissions in headless mode match each command literally. Run one plain command per Bash call: no `;`, `&&`, `cd`, `$?` or shell variables. The exit status is already in the tool result. If a compound command is denied, retry it as separate plain commands before concluding that a tool is unavailable.

## Rules

- No code, no tests, no commits of implementation in this skill.
- The validation gate cannot be skipped, also not in headless mode. Do not weaken a spec to make it validate.
- Do not change the global OpenSpec configuration.
