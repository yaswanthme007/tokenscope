// Persists the user's Pro/Max/API plan choice across runs so --plan doesn't need to
// be passed every time. Separate from the session analysis code — this is a small,
// user-level preference file, not derived from any session log.

import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { PLANS } from "./plan.js";

const CONFIG_DIR = join(homedir(), ".tokenscope");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function loadSavedPlan() {
  try {
    const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    return typeof cfg.plan === "string" && PLANS[cfg.plan] ? cfg.plan : null;
  } catch {
    return null; // no config file yet, or it's unreadable/corrupt — treat as unset
  }
}

export function saveSavedPlan(planKey) {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify({ plan: planKey }, null, 2) + "\n", "utf8");
  } catch {
    /* best-effort: a failed save just means we'll ask again next run */
  }
}

export function resetSavedPlan() {
  try {
    unlinkSync(CONFIG_PATH);
  } catch {
    /* nothing to delete */
  }
}

const ANSWER_TO_PLAN = { "1": "api", "2": "pro", "3": "max5x", "4": "max20x" };

export function mapAnswerToPlan(answer) {
  return ANSWER_TO_PLAN[(answer ?? "").trim()] ?? "api";
}

// Asks which plan the user is on, saves the answer, and returns it.
// Callers must check process.stdin.isTTY before calling this — this module doesn't
// re-check so it stays easy to test without a real terminal attached.
export function promptAndSavePlan() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log(`\nWhich plan are you on? This affects how costs are displayed.`);
    console.log(`  1. API (pay per token)`);
    console.log(`  2. Pro ($${PLANS.pro.pricePerMonth}/mo)`);
    console.log(`  3. Max 5x ($${PLANS.max5x.pricePerMonth}/mo)`);
    console.log(`  4. Max 20x ($${PLANS.max20x.pricePerMonth}/mo)`);
    rl.question("Enter 1-4 (default: 1): ", (answer) => {
      rl.close();
      const planKey = mapAnswerToPlan(answer);
      saveSavedPlan(planKey);
      console.log(`Saved "${PLANS[planKey].label}" to ${CONFIG_PATH}. Use --plan to override any run, --reset-plan to be asked again.\n`);
      resolve(planKey);
    });
  });
}

export { CONFIG_PATH };
