#!/usr/bin/env node
// tokenscope-ai — see where your AI tokens go.

import { statSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { parseClaudeCodeJsonl } from "./parser/claudeCode.js";
import { annotateTokens, computeExactUsage } from "./tokenizer.js";
import { analyze } from "./analyzers/index.js";
import { estimateCost, wastedCostFor, MODELS } from "./cost.js";
import { PLANS } from "./plan.js";
import { loadSavedPlan, resetSavedPlan, promptAndSavePlan } from "./planConfig.js";
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

const resetPlanFlag = args.includes("--reset-plan");
if (resetPlanFlag) resetSavedPlan();

const savedPlanKey = loadSavedPlan(); // null if never set (or just reset above)

const planIdx = args.indexOf("--plan");
const rawPlan = args[planIdx + 1];
const planExplicit = planIdx !== -1;
const planKey = planExplicit
  ? ((rawPlan && !rawPlan.startsWith("--")) ? rawPlan : "pro")
  : (savedPlanKey ?? "api");

if (planExplicit && !PLANS[planKey]) {
  console.error(`Unknown plan "${planKey}". Valid options: ${Object.keys(PLANS).join(", ")}`);
  process.exit(1);
}

// Positional args: skip flags and their values
const FLAGS_WITH_VALUES = new Set(["--html", "--model", "--plan"]);
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
  tokenscope-ai --plan pro                   show budget usage instead of dollar cost
  tokenscope-ai --reset-plan                 forget saved plan and ask again next run

models (--model):
  sonnet   $${m.sonnet.inputPer1M.toFixed(2)} / $${m.sonnet.outputPer1M.toFixed(2)} per M tokens  (default)
  opus     $${m.opus.inputPer1M.toFixed(2)} / $${m.opus.outputPer1M.toFixed(2)} per M tokens
  haiku    $${m.haiku.inputPer1M.toFixed(2)} / $${m.haiku.outputPer1M.toFixed(2)} per M tokens

plans (--plan):
  api      pay-as-you-go dollar cost  (default)
  pro      $${PLANS.pro.pricePerMonth}/mo  ~${PLANS.pro.opusMsgsPerDay} Opus or ~${PLANS.pro.sonnetMsgsPerDay} Sonnet messages/day
  max5x    $${PLANS.max5x.pricePerMonth}/mo  ~${PLANS.max5x.opusMsgsPerDay} Opus or ~${PLANS.max5x.sonnetMsgsPerDay} Sonnet messages/day
  max20x   $${PLANS.max20x.pricePerMonth}/mo  ~${PLANS.max20x.opusMsgsPerDay} Opus or ~${PLANS.max20x.sonnetMsgsPerDay} Sonnet messages/day

On first run (no --plan, no saved preference, interactive terminal), tokenscope asks
which plan you're on and remembers it in ~/.tokenscope/config.json.

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
const exactUsage = computeExactUsage(session);
const analysis = analyze(session, exactUsage);
const costInfo = estimateCost(session, modelKey, exactUsage);
const wastedCost = wastedCostFor(analysis.wastedTokens, costInfo);

printTerminalReport(session, analysis, { ...costInfo, wastedCost }, { htmlOut, exactUsage, planKey, modelKey });

if (htmlOut) {
  writeHtmlReport(session, analysis, htmlOut, { ...costInfo, wastedCost }, exactUsage, { planKey, modelKey });
  console.log(`HTML report written to ${htmlOut}\n`);
}

// First run: no --plan given, nothing saved yet, and there's an actual human to ask.
// Piped/CI stdin isn't a TTY, so this is skipped there and we silently keep the API view.
if (!planExplicit && savedPlanKey == null && process.stdin.isTTY) {
  await promptAndSavePlan();
}
