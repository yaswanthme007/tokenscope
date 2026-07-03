// Analyzers: turn an annotated session into (a) a category breakdown and (b) findings.
// Findings are linter-style: { code, severity, title, detail, wastedTokens, fix }

import { createHash } from "node:crypto";

const KIND_LABELS = {
  system: "System prompt",
  user_text: "User messages",
  assistant_text: "Assistant output",
  tool_use: "Tool calls",
  tool_result: "Tool results",
  attachment: "Attachments",
  other: "Other",
};

export function categoryBreakdown(session) {
  const byKind = {};
  for (const msg of session.messages) {
    for (const b of msg.blocks) {
      byKind[b.kind] = (byKind[b.kind] ?? 0) + b.tokens;
    }
  }
  return Object.entries(byKind)
    .map(([kind, tokens]) => ({
      kind,
      label: KIND_LABELS[kind] ?? kind,
      tokens,
      pct: session.totalTokens ? (tokens / session.totalTokens) * 100 : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens);
}

function fingerprint(text) {
  // Normalize whitespace so trivially reformatted content still matches
  const norm = text.replace(/\s+/g, " ").trim();
  return createHash("sha1").update(norm).digest("hex");
}

// W001: content sent multiple times.
// Chunk-level fingerprinting: whole-block hashing misses near-duplicates (e.g. the same
// file pasted with a different intro line), so we hash 20-line windows within each block
// and aggregate duplicated chunks.
export function detectRepetition(session, { chunkLines = 20, minChunkTokens = 50 } = {}) {
  const seen = new Map(); // hash -> { count, tokens, label, preview, messages:Set }
  for (const msg of session.messages) {
    for (const b of msg.blocks) {
      const lines = b.text.split("\n");
      for (let i = 0; i < lines.length; i += chunkLines) {
        const chunk = lines.slice(i, i + chunkLines).join("\n");
        const tokens = Math.ceil(chunk.length / 4); // cheap estimate is fine for gating
        if (tokens < minChunkTokens) continue;
        const h = fingerprint(chunk);
        const cur = seen.get(h);
        if (cur) {
          cur.count += 1;
          cur.messages.add(msg.index);
        } else {
          seen.set(h, { count: 1, tokens, label: b.label, preview: chunk.trim().slice(0, 70), messages: new Set([msg.index]) });
        }
      }
    }
  }

  // Aggregate duplicated chunks by label so one repeated file = one finding
  const byLabel = new Map();
  for (const v of seen.values()) {
    if (v.count < 2) continue;
    const agg = byLabel.get(v.label) ?? { wasted: 0, chunks: 0, maxCount: 0, preview: v.preview, messages: new Set() };
    agg.wasted += (v.count - 1) * v.tokens;
    agg.chunks += 1;
    agg.maxCount = Math.max(agg.maxCount, v.count);
    for (const m of v.messages) agg.messages.add(m);
    byLabel.set(v.label, agg);
  }

  const findings = [];
  for (const [label, a] of byLabel) {
    if (a.wasted < 200) continue; // ignore trivial repetition
    findings.push({
      code: "W001",
      severity: "warn",
      title: "Repeated content",
      detail: `~${a.wasted.toLocaleString()} tokens of identical content (starting "${a.preview.replace(/\n/g, " ")}...") re-sent up to ${a.maxCount}x across messages ${[...a.messages].sort((x, y) => x - y).join(", ")} (${label}).`,
      wastedTokens: a.wasted,
      fix: "Send it once and reference it, or enable prompt caching so repeats are billed at cache rates.",
    });
  }
  return findings.sort((a, b) => b.wastedTokens - a.wastedTokens);
}

// W002: oversized tool results relative to the rest of the session
export function detectBloat(session, { threshold = 2000 } = {}) {
  const findings = [];
  for (const msg of session.messages) {
    for (const b of msg.blocks) {
      if (b.kind !== "tool_result" || b.tokens < threshold) continue;
      const pct = session.totalTokens ? ((b.tokens / session.totalTokens) * 100).toFixed(1) : "?";
      findings.push({
        code: "W002",
        severity: "warn",
        title: "Bloated tool result",
        detail: `A single tool result at message #${msg.index} is ${b.tokens.toLocaleString()} tokens (${pct}% of the whole session).`,
        wastedTokens: Math.round(b.tokens * 0.7), // conservative: most of a bloated result is unused
        fix: "Truncate, filter fields, or summarize the tool output before it enters context (e.g. return only the fields the model needs).",
      });
    }
  }
  return findings.sort((a, b) => b.wastedTokens - a.wastedTokens);
}

export function analyze(session) {
  const breakdown = categoryBreakdown(session);
  const findings = [...detectRepetition(session), ...detectBloat(session)];
  const wastedTokens = findings.reduce((s, f) => s + f.wastedTokens, 0);
  return { breakdown, findings, wastedTokens };
}
