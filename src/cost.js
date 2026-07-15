// Cost estimation: classify tokens as input/output and apply per-model pricing.
// Token counts are estimates (~±5%), so dollar amounts are estimates too.

export const MODELS = {
  sonnet: { label: "Sonnet", inputPer1M: 3.00,  outputPer1M: 15.00 },
  opus:   { label: "Opus",   inputPer1M: 15.00, outputPer1M: 75.00 },
  haiku:  { label: "Haiku",  inputPer1M: 0.25,  outputPer1M: 1.25  },
};

const INPUT_KINDS  = new Set(["system", "user_text", "tool_result"]);
const OUTPUT_KINDS = new Set(["assistant_text", "tool_use"]);

// Cache tokens are billed off the input price: reads are cheap (10%), writes cost more (125%).
const CACHE_READ_MULTIPLIER = 0.10;
const CACHE_CREATION_MULTIPLIER = 1.25;

export function estimateCost(session, modelKey = "sonnet", exactUsage = null) {
  const model = MODELS[modelKey] ?? MODELS.sonnet;
  let inputTokens, outputTokens, cacheReadTokens = 0, cacheCreationTokens = 0;
  const exact = !!exactUsage;

  if (exact) {
    inputTokens = exactUsage.inputTokens;
    outputTokens = exactUsage.outputTokens;
    cacheReadTokens = exactUsage.cacheReadTokens;
    cacheCreationTokens = exactUsage.cacheCreationTokens;
  } else {
    inputTokens = 0;
    outputTokens = 0;
    for (const msg of session.messages) {
      for (const b of msg.blocks) {
        if (INPUT_KINDS.has(b.kind))       inputTokens  += b.tokens;
        else if (OUTPUT_KINDS.has(b.kind)) outputTokens += b.tokens;
      }
    }
  }

  const cacheReadPer1M = model.inputPer1M * CACHE_READ_MULTIPLIER;
  const cacheCreationPer1M = model.inputPer1M * CACHE_CREATION_MULTIPLIER;

  const sessionCost = (
    inputTokens * model.inputPer1M +
    outputTokens * model.outputPer1M +
    cacheReadTokens * cacheReadPer1M +
    cacheCreationTokens * cacheCreationPer1M
  ) / 1_000_000;

  let cache = null;
  if (cacheReadTokens > 0) {
    const cacheEligibleTokens = inputTokens + cacheReadTokens + cacheCreationTokens;
    const savings = (cacheReadTokens * (model.inputPer1M - cacheReadPer1M)) / 1_000_000;
    cache = { pct: cacheEligibleTokens ? (cacheReadTokens / cacheEligibleTokens) * 100 : 0, savings };
  }

  return {
    label: model.label, inputPer1M: model.inputPer1M, outputPer1M: model.outputPer1M,
    inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens,
    sessionCost, exact, cache,
  };
}

// Wasted tokens are predominantly input (repeated context, bloated tool results).
export function wastedCostFor(wastedTokens, costInfo) {
  return (wastedTokens * costInfo.inputPer1M) / 1_000_000;
}
