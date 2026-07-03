# tokenscope

**Chrome DevTools for your context window.** See exactly where your AI tokens go — and stop wasting them.

<!-- TODO: demo GIF goes here. This is the single most important asset in the repo. -->

Your agent session just burned 500K tokens. Where did they go? tokenscope profiles your session logs and tells you: which files got re-sent six times, which tool result dumped 20K tokens of JSON the model never used, and what it's costing you.

```
npx tokenscope ~/.claude/projects/my-project
```

```
Total context consumed: 33,821 tokens across 8 messages

Where it went
  Tool results       ███████████████████░░░░░░░░░  66.6%  22,518 tok
  User messages      █████████░░░░░░░░░░░░░░░░░░░  33.2%  11,214 tok
  Assistant output   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0.2%      84 tok

Findings
  W001 Repeated content         ~7,142 tokens wasted
       Identical content re-sent 3x across messages 0, 4, 6
       fix: Send it once, or enable prompt caching.

  W002 Bloated tool result      ~15,763 tokens wasted
       A single tool result is 22,518 tokens (66.6% of the session)
       fix: Truncate or filter the tool output before it enters context.

  Estimated waste: ~22,905 tokens (67.7% of session)
```

## Why

- **100% local.** No API key, no account, no telemetry. Your logs never leave your machine.
- **Actionable.** Every finding comes with a concrete fix and an estimated saving — like a linter, not a dashboard.
- **Fast.** Profiles a session in under a second.

## Install

```bash
npx tokenscope <session.jsonl>        # zero-install
npm install -g tokenscope             # or install globally
```

## Usage

```bash
tokenscope ~/.claude/projects/my-project        # newest session in a directory
tokenscope session.jsonl                        # a specific session file
tokenscope session.jsonl --html report.html    # + shareable HTML treemap report
```

The HTML report is a single self-contained file — open it in any browser, share it with your team, attach it to a PR.

## Supported sources

| Source | Status |
|---|---|
| Claude Code session logs (`~/.claude/projects/`) | ✅ v0.1 |
| Universal proxy mode (any tool, any provider) | 🔜 v0.2 |
| OpenAI / raw API JSONL dumps | 🔜 v0.3 |
| Gemini CLI, aider, community adapters | 🔜 [adapter spec](#) |

Token counts use a local tokenizer (o200k) and are estimates (~±5%) — profiling is about proportions and deltas, not billing precision.

## Findings rules

| Code | Detects |
|---|---|
| W001 | Repeated content — the same chunks sent multiple times |
| W002 | Bloated tool results — oversized outputs dominating the context |

More rules (cache-miss analysis, conversation decay, dead-weight system prompt sections) are on the roadmap. Have an idea for a rule? Open an issue.

## Contributing

Adapters are ~100 lines: parse your tool's log format into the unified session model (`src/parser/claudeCode.js` is the reference). PRs welcome.

## License

MIT
