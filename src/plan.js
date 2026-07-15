// Subscription plan budgets: reframes cost as "% of your daily allocation" for
// Pro/Max users instead of a dollar figure, since they aren't billed per token.
//
// Anthropic publishes these limits in "messages per day" terms, which vary hugely
// with conversation length. We approximate one message as a fixed token count
// (input + output combined) so a session's real token usage can be compared
// against the daily allocation. This is a coarse, documented approximation —
// not an official figure — good enough for "am I anywhere near my limit," not
// for billing precision.

const AVG_TOKENS_PER_MESSAGE = 4000;

export const PLANS = {
  api:    { label: "API (pay-as-you-go)" },
  pro:    { label: "Pro",     pricePerMonth: 20,  opusMsgsPerDay: 45,       sonnetMsgsPerDay: 225 },
  max5x:  { label: "Max 5x",  pricePerMonth: 100, opusMsgsPerDay: 45 * 5,   sonnetMsgsPerDay: 225 * 5 },
  max20x: { label: "Max 20x", pricePerMonth: 200, opusMsgsPerDay: 45 * 20, sonnetMsgsPerDay: 225 * 20 },
};

// Daily token budget for a plan, sized to whichever model was used for cost estimation.
// Only opus and sonnet allocations are published, so any other model (e.g. haiku) borrows
// the sonnet allocation.
export function dailyBudgetTokens(planKey, modelKey) {
  const plan = PLANS[planKey];
  if (!plan || planKey === "api") return null;
  const msgsPerDay = modelKey === "opus" ? plan.opusMsgsPerDay : plan.sonnetMsgsPerDay;
  return msgsPerDay * AVG_TOKENS_PER_MESSAGE;
}

export function estimateBudgetUsage(totalTokens, wastedTokens, planKey, modelKey) {
  const budgetTokens = dailyBudgetTokens(planKey, modelKey);
  if (budgetTokens == null) return null;
  return {
    planLabel: PLANS[planKey].label,
    budgetTokens,
    usedPct: (totalTokens / budgetTokens) * 100,
    wastedPct: (wastedTokens / budgetTokens) * 100,
  };
}
