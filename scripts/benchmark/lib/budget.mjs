// Global cap on `claude -p` invocations for one benchmark round.
export const DEFAULT_MAX_INVOCATIONS = 60;

export function createBudget(max = DEFAULT_MAX_INVOCATIONS) {
  let used = 0;
  let closed = false;
  return {
    get max() { return max; },
    get used() { return used; },
    get exhausted() { return closed || used >= max; },
    // Closes the budget early, e.g. when the account hits its usage limit.
    exhaust() { closed = true; },
    tryConsume() {
      if (closed || used >= max) return false;
      used += 1;
      return true;
    },
    toJSON() { return { max, used, exhausted: closed || used >= max }; },
  };
}
