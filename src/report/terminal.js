// Terminal report: totals, category bars, findings, cost. Plain ANSI, CI-safe.

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", yellow: "\x1b[33m", green: "\x1b[32m",
};

function bar(pct, width = 28) {
  const filled = Math.round((pct / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function fmtCost(n) {
  if (n >= 1)      return "$" + n.toFixed(2);
  if (n >= 0.0001) return "$" + n.toFixed(4);
  return "<$0.0001";
}

export function printTerminalReport(session, analysis, cost, opts = {}) {
  const { breakdown, findings, wastedTokens } = analysis;
  const { exactUsage } = opts;
  const total = exactUsage ? exactUsage.totalTokens : session.totalTokens;
  const totalLabel = exactUsage ? "exact (from API usage data)" : "estimated";

  console.log(`\n${c.bold}token${c.yellow}scope${c.reset} ${c.dim}· ${session.adapter} · ${session.source}${c.reset}\n`);
  console.log(`${c.bold}Total context consumed:${c.reset} ${total.toLocaleString()} tokens across ${session.messages.length} messages ${c.dim}(${totalLabel})${c.reset}\n`);

  console.log(`${c.bold}Where it went${c.reset}`);
  for (const row of breakdown) {
    const pct = row.pct.toFixed(1).padStart(5);
    console.log(`  ${row.label.padEnd(18)} ${c.yellow}${bar(row.pct)}${c.reset} ${pct}%  ${c.dim}${row.tokens.toLocaleString()} tok${c.reset}`);
  }

  if (cost) {
    const costLabel = cost.exact ? "exact, from API usage data" : "estimates";
    console.log(`\n${c.bold}Cost${c.reset}  ${c.dim}(${cost.label} · $${cost.inputPer1M.toFixed(2)}/$${cost.outputPer1M.toFixed(2)} per M tokens — ${costLabel})${c.reset}`);
    console.log(`  Session cost:     ~${fmtCost(cost.sessionCost)}`);
    console.log(`  Estimated waste:  ~${fmtCost(cost.wastedCost)}`);
    if (cost.cache) {
      console.log(`  Cache: ${cost.cache.pct.toFixed(1)}% of input tokens served from cache (saved ~${fmtCost(cost.cache.savings)})`);
    }
  }

  console.log(`\n${c.bold}Findings${c.reset}`);
  if (findings.length === 0) {
    console.log(`  ${c.green}No waste detected. Clean session.${c.reset}`);
  } else {
    for (const f of findings) {
      console.log(`  ${c.yellow}${f.code}${c.reset} ${c.bold}${f.title}${c.reset} ${c.red}~${f.wastedTokens.toLocaleString()} tokens wasted${c.reset}`);
      console.log(`       ${f.detail}`);
      console.log(`       ${c.dim}fix:${c.reset} ${f.fix}\n`);
    }
    const pct = total ? ((wastedTokens / total) * 100).toFixed(1) : "0";
    console.log(`  ${c.bold}${c.red}Estimated waste: ~${wastedTokens.toLocaleString()} tokens (${pct}% of session)${c.reset}`);
  }

  if (!opts.htmlOut) console.log(`\n${c.dim}→ add --html report.html for the visual treemap${c.reset}`);
  if (findings.length > 0) console.log(`${c.dim}→ fix these and run again to compare${c.reset}`);
  console.log();
}
