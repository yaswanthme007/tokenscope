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
