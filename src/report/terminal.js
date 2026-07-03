// Terminal report: totals, category bars, findings. Plain ANSI, CI-safe.

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", yellow: "\x1b[33m", green: "\x1b[32m", cyan: "\x1b[36m",
};

function bar(pct, width = 28) {
  const filled = Math.round((pct / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

export function printTerminalReport(session, analysis) {
  const { breakdown, findings, wastedTokens } = analysis;
  const total = session.totalTokens;

  console.log(`\n${c.bold}tokenscope${c.reset} ${c.dim}· ${session.adapter} · ${session.source}${c.reset}\n`);
  console.log(`${c.bold}Total context consumed:${c.reset} ${total.toLocaleString()} tokens across ${session.messages.length} messages\n`);

  console.log(`${c.bold}Where it went${c.reset}`);
  for (const row of breakdown) {
    const pct = row.pct.toFixed(1).padStart(5);
    console.log(`  ${row.label.padEnd(18)} ${c.cyan}${bar(row.pct)}${c.reset} ${pct}%  ${c.dim}${row.tokens.toLocaleString()} tok${c.reset}`);
  }

  console.log(`\n${c.bold}Findings${c.reset}`);
  if (findings.length === 0) {
    console.log(`  ${c.green}✓ No waste detected. Clean session.${c.reset}`);
  } else {
    for (const f of findings) {
      console.log(`  ${c.yellow}${f.code}${c.reset} ${c.bold}${f.title}${c.reset} ${c.red}~${f.wastedTokens.toLocaleString()} tokens wasted${c.reset}`);
      console.log(`       ${f.detail}`);
      console.log(`       ${c.dim}fix:${c.reset} ${f.fix}\n`);
    }
    const pct = total ? ((wastedTokens / total) * 100).toFixed(1) : "0";
    console.log(`  ${c.bold}${c.red}Estimated waste: ~${wastedTokens.toLocaleString()} tokens (${pct}% of session)${c.reset}`);
  }
  console.log();
}
