// Global cap on `claude -p` invocations for one benchmark round.
export const DEFAULT_MAX_INVOCATIONS = 60;

export function createBudget(max = DEFAULT_MAX_INVOCATIONS) {
  let used = 0;
  return {
    get max() { return max; },
    get used() { return used; },
    get exhausted() { return used >= max; },
    tryConsume() {
      if (used >= max) return false;
      used += 1;
      return true;
    },
    toJSON() { return { max, used, exhausted: used >= max }; },
  };
}
