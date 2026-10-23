# Interview script

Fallback for when `grill-me` is not available. It is adapted from `mattpocock/skills` `productivity/grilling` (MIT, see [NOTICE.md](NOTICE.md)).

Interview the user until you reach a shared understanding. Map the feature as a **design tree**: every decision branches into the decisions that hang off it.

## Rounds

Work in rounds. The **frontier** is every decision whose prerequisites are already settled, that is, the questions you can ask now without guessing answers you have not heard yet. Ask the whole frontier in one round, numbered, each with your recommended answer. Then wait.

```
❓ **Q1** - **<title>**: <question, with the options when there are any>

➡️ <recommended answer>
```

Word each question so "yes" accepts your recommendation. After each round, recompute the frontier. A question that depends on another one still open in this round belongs to a later round.

Finding **facts** is your job: read the code, `docs/agents/`, `openspec/specs/` and the tools before asking. The **decisions** belong to the user.

## Branches to cover

Visit each branch and mark it settled, or explicitly out of scope:

1. **Problem.** What fails or is missing today? Who notices it, and how?
2. **Outcome.** What is observably different when this is done? Write it as behavior, not as an implementation.
3. **Scope.** What is in this change? What is explicitly out (non-goals)?
4. **Inputs and outputs.** Formats, limits, defaults, and what callers depend on.
5. **Errors.** Invalid input, missing data, external failure. For each one: the message, the status, and what is logged.
6. **Domain rules.** Rules the code does not make obvious. Check them against `docs/agents/domain.md` and flag a conflict.
7. **Constraints.** Security, performance, compatibility, migration of existing data or callers.
8. **Acceptance.** The scenarios: for each one, WHEN … THEN …, with a name that can become a test name.
9. **Risks.** What could go wrong, and how it is detected.

## Done

The interview ends when the frontier is empty and the user confirms the summary. Do not create the change before that confirmation.
