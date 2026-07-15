// Local, offline token counting. No API key, nothing leaves the machine.
// Uses o200k_base as a cross-model approximation; Claude counts are estimates (~±5%),
// which is fine — profiling is about proportions and deltas, not billing precision.

import { Tiktoken } from "js-tiktoken/lite";
import o200k_base from "js-tiktoken/ranks/o200k_base";

const enc = new Tiktoken(o200k_base);

export function countTokens(text) {
  if (!text) return 0;
  try {
    return enc.encode(text).length;
  } catch {
    // Fallback heuristic for pathological inputs
    return Math.ceil(text.length / 4);
  }
}

export function annotateTokens(session) {
  let total = 0;
  for (const msg of session.messages) {
    let msgTotal = 0;
    for (const block of msg.blocks) {
      block.tokens = countTokens(block.text);
      msgTotal += block.tokens;
    }
    msg.tokens = msgTotal;
    total += msgTotal;
  }
  session.totalTokens = total;
  return session;
}

// Aggregates real API usage numbers (when the log has them) into exact session totals.
// Usage is per-message (each API call bills its own input/output/cache tokens), so unlike
// the estimated block-level counts above, this cannot be broken down per-block — it's used
// for session totals and cost, not for the treemap.
export function computeExactUsage(session) {
  let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheCreationTokens = 0;
  let found = false;
  for (const msg of session.messages) {
    const u = msg.usage;
    if (!u) continue;
    found = true;
    inputTokens += u.input_tokens ?? 0;
    outputTokens += u.output_tokens ?? 0;
    cacheReadTokens += u.cache_read_input_tokens ?? 0;
    cacheCreationTokens += u.cache_creation_input_tokens ?? 0;
  }
  if (!found) return null;
  const totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
  return { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, totalTokens };
}
