#!/usr/bin/env node
// tokenscope — see where your AI tokens go.
// Usage: tokenscope <session.jsonl> [--html report.html]

import { statSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseClaudeCodeJsonl } from "./parser/claudeCode.js";
import { annotateTokens } from "./tokenizer.js";
import { analyze } from "./analyzers/index.js";
import { printTerminalReport } from "./report/terminal.js";
import { writeHtmlReport } from "./report/html.js";

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help")) {
  console.log(`
tokenscope — Chrome DevTools for your context window

usage:
  tokenscope <session.jsonl>            profile a Claude Code session log
  tokenscope <dir>                      profile the most recent .jsonl in a directory
  tokenscope <file> --html out.html     also write a shareable HTML report

100% local. No API key. Nothing leaves your machine.
`);
  process.exit(0);
}

let target = resolve(args[0]);
try {
  if (statSync(target).isDirectory()) {
    const jsonls = readdirSync(target)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => ({ f, m: statSync(join(target, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    if (!jsonls.length) {
      console.error(`No .jsonl session files found in ${target}`);
      process.exit(1);
    }
    target = join(target, jsonls[0].f);
  }
} catch (e) {
  console.error(`Cannot read ${target}: ${e.message}`);
  process.exit(1);
}

const session = annotateTokens(parseClaudeCodeJsonl(target));
if (session.messages.length === 0) {
  console.error("Parsed 0 messages — is this a Claude Code session log?");
  process.exit(1);
}
const analysis = analyze(session);
printTerminalReport(session, analysis);

const htmlFlag = args.indexOf("--html");
if (htmlFlag !== -1) {
  const out = args[htmlFlag + 1] ?? "tokenscope-report.html";
  writeHtmlReport(session, analysis, out);
  console.log(`HTML report written to ${out}\n`);
}
