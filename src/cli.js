#!/usr/bin/env node
// tokenscope-ai — see where your AI tokens go.

import { statSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { parseClaudeCodeJsonl } from "./parser/claudeCode.js";
import { annotateTokens } from "./tokenizer.js";
import { analyze } from "./analyzers/index.js";
import { estimateCost, wastedCostFor, MODELS } from "./cost.js";
import { printTerminalReport } from "./report/terminal.js";
import { writeHtmlReport } from "./report/html.js";

// --- Arg parsing ---
const args = process.argv.slice(2);
const helpFlag = args.includes("--help");

const htmlIdx = args.indexOf("--html");
const rawHtmlOut = args[htmlIdx + 1];
const htmlOut = htmlIdx !== -1
  ? ((rawHtmlOut && !rawHtmlOut.startsWith("--")) ? rawHtmlOut : "tokenscope-report.html")
  : null;

const modelIdx = args.indexOf("--model");
const rawModel = args[modelIdx + 1];
const modelKey = modelIdx !== -1
  ? ((rawModel && !rawModel.startsWith("--")) ? rawModel : "sonnet")
  : "sonnet";

if (modelIdx !== -1 && !MODELS[modelKey]) {
  console.error(`Unknown model "${modelKey}". Valid options: ${Object.keys(MODELS).join(", ")}`);
  process.exit(1);
}

// Positional args: skip flags and their values
const FLAGS_WITH_VALUES = new Set(["--html", "--model"]);
const positional = [];
let i = 0;
while (i < args.length) {
  if (args[i].startsWith("--")) {
    i += FLAGS_WITH_VALUES.has(args[i]) ? 2 : 1;
  } else {
    positional.push(args[i]);
    i++;
  }
}

if (helpFlag) {
  const m = MODELS;
  console.log(`
tokenscope-ai — Chrome DevTools for your context window

usage:
  tokenscope-ai                              auto-detect latest Claude Code session
  tokenscope-ai ~/.claude/projects           profile newest session in directory
  tokenscope-ai session.jsonl                profile a specific file
  tokenscope-ai session.jsonl --html r.html  generate visual HTML report
  tokenscope-ai --model opus                 use Opus pricing ($15/$75 per M tokens)

models (--model):
  sonnet   $${m.sonnet.inputPer1M.toFixed(2)} / $${m.sonnet.outputPer1M.toFixed(2)} per M tokens  (default)
  opus     $${m.opus.inputPer1M.toFixed(2)} / $${m.opus.outputPer1M.toFixed(2)} per M tokens
  haiku    $${m.haiku.inputPer1M.toFixed(2)} / $${m.haiku.outputPer1M.toFixed(2)} per M tokens

100% local. No API key. Nothing leaves your machine.
`);
  process.exit(0);
}

// --- Find target file ---
function findJsonlFiles(dir) {
  const results = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) results.push(...findJsonlFiles(full));
      else if (entry.name.endsWith(".jsonl")) results.push(full);
    }
  } catch { /* skip unreadable dirs */ }
  return results;
}

let target;

if (positional.length === 0) {
  const defaultDir = join(homedir(), ".claude", "projects");
  const jsonls = findJsonlFiles(defaultDir)
    .map((f) => { try { return { f, m: statSync(f).mtimeMs }; } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => b.m - a.m);
  if (!jsonls.length) {
    console.error(`No Claude Code session files found in ${defaultDir}`);
    console.error(`Tip: pass a path manually — tokenscope-ai <session.jsonl> or tokenscope-ai <directory>`);
    process.exit(1);
  }
  target = jsonls[0].f;
  console.log(`Auto-detected session: ${target}\n`);
} else {
  target = resolve(positional[0]);
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
}

// --- Analyze ---
const session = annotateTokens(parseClaudeCodeJsonl(target));
if (session.messages.length === 0) {
  console.error("Parsed 0 messages — is this a Claude Code session log?");
  process.exit(1);
}
const analysis = analyze(session);
const costInfo = estimateCost(session, modelKey);
const wastedCost = wastedCostFor(analysis.wastedTokens, costInfo);

printTerminalReport(session, analysis, { ...costInfo, wastedCost });

if (htmlOut) {
  writeHtmlReport(session, analysis, htmlOut, { ...costInfo, wastedCost });
  console.log(`HTML report written to ${htmlOut}\n`);
}
