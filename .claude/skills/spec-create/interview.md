# Interview script

Fallback for when `grill-me` is not available. It is adapted from `mattpocock/skills` `productivity/grilling` (MIT, see [NOTICE.md](NOTICE.md)).

Interview the user until you reach a shared understanding. Map the feature as a **design tree**: every decision branches into the decisions that hang off it.

## Investigate before asking

Investigate before asking. Find every fact in the repository and in the documentation first: existing modules and their boundaries, the commands that run tests, lint and typecheck (`template.json` → `checks`), existing specs, shared rules, interfaces, examples with a reliable source, the environment and the sandbox. Ask only about decisions, and about information that is not available in the repository.

## Rounds

Work in rounds, in small groups. The **frontier** is every decision whose prerequisites are already settled, that is, the questions you can ask now without guessing answers you have not heard yet. Ask the frontier in a round of at most four questions, numbered, each with your recommended answer, its justification and its tradeoffs. Then wait.

```
❓ **Q1** - **<title>**: <question, with the options when there are any>

➡️ Recommended: <recommended answer>
Justification: <why this one>
Tradeoffs: <what each option costs or gives up>
```

Word each question so "yes" accepts your recommendation. After each round, recompute the frontier. A question that depends on another one still open in this round belongs to a later round.

Finding **facts** is your job. The **decisions** belong to the user. A decision the user does not answer becomes a premise, recorded in `## Premissas`, not an approved decision.

## Branches to cover

Visit each branch and mark it settled, or explicitly out of scope:

1. **Problem.** What fails or is missing today? Who notices it, and how?
2. **Outcome.** What is observably different when this is done? Write it as behavior, not as an implementation.
3. **Scope.** What is in this change? What is explicitly out (non-goals)?
4. **Inputs and outputs.** Formats, limits, defaults, and what callers depend on.
5. **Errors.** Invalid input, missing data, external failure. For each one: the message, the status, and what is logged.
6. **Domain rules.** Rules the code does not make obvious. Check them against `docs/agents/domain.md` and flag a conflict.
7. **Constraints.** Security, performance, compatibility, migration of existing data or callers, and the pre-existing behavior that must be kept.
8. **Acceptance.** The scenarios: for each one, WHEN … THEN …, with an ID, a revision (starting at 1), a name that can become a test name, and a verification form:
   - `teste` (the default): a test with the scenario's ID will prove it;
   - `check:<name>`: only when a functional test is not adequate. Ask for the justification and the human approval, and use a check declared in `checks`. Never fabricate a functional test to replace it;
   - not applicable: only with a trigger condition that the runner can evaluate, for example "quando houver formato JUnit". Never mark a scenario not applicable without a trigger condition.
9. **Interfaces and slices.** Shared rules, interfaces, the order of the slices, and their dependencies.
10. **Risks.** What could go wrong, and how it is detected.
11. **Environment and sandbox.** Which commands run, which files they may touch, and what the runner must not do.
12. **New behavior.** Does this change add behavior? Declare `Comportamento novo: sim` or `Comportamento novo: não`. A change without new behavior is verified by the existing suite and the declared checks, and it gets no fabricated functional tests. The declaration needs human approval.

Refer to the policy in `.claude/harness/policy.md` and the parameters in `.claude/harness/policy.json`. Do not repeat them in the contract.

## Done

The interview ends when the frontier is empty and the user confirms the summary as the behavior of the change. Confirming the summary does not mean approving each test. Do not create the change before that confirmation.
