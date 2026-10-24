---
name: handoff
description: Summarise the current state of the work, update docs/agents/issue-tracker.md and write a restore point so the next session can continue without losing anything. Use when a session is ending, the context is getting full, or the user says "handoff".
metadata:
  origin: local
  adapted-from: mattpocock/skills@5beb35b040e3de97e54fa9e386d7e42d15c295c2 (productivity/handoff)
---

# Handoff

Leave the work so a fresh session can pick it up from `docs/agents/issue-tracker.md` alone.

## Modo da execução

The handoff writes context only. Counters and verdicts come from the state and are never typed by hand:

- **runner**: `.harness-local/<change>/run-state.json` holds the counters and verdicts. Read them with `node scripts/harness/cli.mjs summary --change <change>`, which writes the handoff view (`summary.json`) from the state. A step that stopped mid-way is recorded with `node scripts/harness/cli.mjs fail` or `interrupt`; the next session continues with `node scripts/harness/cli.mjs resume --change <change>`.
- **legacy** (the mode in use today): `openspec/changes/<change>/gates.json`, written by the gate CLIs with `--legacy-write`, holds them.

Without the adoption milestone (marco de adoção) recorded in `docs/agents/issue-tracker.md` by a human decision, no execution is assigned to the runner. Every execution stays `legacy`, whatever else exists on disk. Read `run-state.json` only to report what it says, and never to decide the mode.

## Steps

1. **Collect the state.** Run `git status`, `git log --oneline -10` and `openspec list`. Read the active change's `tasks.md`, and its counters and verdicts from the state of its mode (see **Modo da execução**).

2. **Update the restore point.** In `docs/agents/issue-tracker.md`, rewrite the **Ponto de restauração** section:
   - **Change ativa**: the change, or `nenhuma`;
   - **Branch**: the branch and the last commit;
   - **Próximo passo**: the exact next action, for example `spec-implement add-x, tarefa 2.3 (Red: teste "rejeita texto")`;
   - **Bloqueios**: anything that needs a person, a credential or a decision, or `nenhum`;
   - **Atualizado em**: today's date.

3. **Add a log entry.** Under **Log**, newest first: what was done in this session, decisions taken and why, and what was tried and failed. Point to commits, specs and `gates.json` instead of repeating them.

4. **Suggest the next skills.** End the log entry with the skills the next session should call, for example `spec-implement` or `spec-archive`.

5. **Uncommitted work.** If `git status` is not clean, say so in **Bloqueios** and list the files. Do not commit unless the user asks.

## Rules

- Redact secrets, tokens and personal data.
- Do not duplicate what other artifacts already hold. Link to them.
- Write to `docs/agents/issue-tracker.md` only. Do not save the handoff outside the repo.
