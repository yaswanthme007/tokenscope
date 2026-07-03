// HTML report: one self-contained file, zero external requests (works fully offline).
// Design: dark instrument-panel aesthetic — the report should feel like a profiler,
// monospace numerals, heat colors for waste. Treemap is a hand-rolled squarified layout.

import { writeFileSync } from "node:fs";

export function writeHtmlReport(session, analysis, outPath) {
  const data = {
    source: session.source,
    adapter: session.adapter,
    total: session.totalTokens,
    messages: session.messages.length,
    breakdown: analysis.breakdown,
    findings: analysis.findings,
    wasted: analysis.wastedTokens,
    blocks: session.messages.flatMap((m) =>
      m.blocks.map((b) => ({ msg: m.index, role: m.role, kind: b.kind, label: b.label, tokens: b.tokens }))
    ).filter((b) => b.tokens > 0),
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>tokenscope report</title>
<style>
  :root {
    --bg: #101418; --panel: #171d23; --line: #232c34;
    --text: #d7dde3; --muted: #7d8a96;
    --heat0: #2a5d8f; --heat1: #3f8f7a; --heat2: #c9a227; --heat3: #d4622a; --heat4: #c22f2f;
    --accent: #e8b23a;
  }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--bg); color: var(--text); font: 15px/1.6 "SF Mono", "Cascadia Code", Consolas, monospace; padding: 40px 24px 80px; }
  main { max-width: 960px; margin: 0 auto; }
  header { border-bottom: 1px solid var(--line); padding-bottom: 20px; margin-bottom: 28px; }
  h1 { font-size: 20px; font-weight: 600; letter-spacing: .02em; }
  h1 span { color: var(--accent); }
  .src { color: var(--muted); font-size: 12px; margin-top: 4px; word-break: break-all; }
  .stats { display: flex; gap: 32px; margin: 24px 0; flex-wrap: wrap; }
  .stat b { display: block; font-size: 28px; font-weight: 600; }
  .stat.waste b { color: var(--heat3); }
  .stat small { color: var(--muted); font-size: 12px; text-transform: lowercase; }
  h2 { font-size: 13px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .12em; margin: 36px 0 12px; }
  #treemap { width: 100%; height: 380px; position: relative; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; background: var(--panel); }
  .cell { position: absolute; overflow: hidden; padding: 6px 8px; font-size: 11px; line-height: 1.35; border: 1px solid rgba(0,0,0,.35); color: #0e1215; }
  .cell b { display: block; font-weight: 600; }
  .legend { display: flex; gap: 16px; margin-top: 10px; font-size: 12px; color: var(--muted); flex-wrap: wrap; }
  .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; }
  .finding { background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--heat3); border-radius: 0; padding: 14px 16px; margin-bottom: 12px; }
  .finding .code { color: var(--accent); font-weight: 600; margin-right: 10px; }
  .finding .waste { float: right; color: var(--heat3); font-weight: 600; }
  .finding p { color: var(--muted); font-size: 13px; margin-top: 6px; }
  .finding .fix { color: var(--heat1); }
  .clean { color: var(--heat1); }
  footer { margin-top: 48px; color: var(--muted); font-size: 12px; border-top: 1px solid var(--line); padding-top: 16px; }
</style>
</head>
<body>
<main>
  <header>
    <h1>token<span>scope</span></h1>
    <div class="src" id="src"></div>
  </header>
  <div class="stats">
    <div class="stat"><b id="total"></b><small>total tokens</small></div>
    <div class="stat"><b id="msgs"></b><small>messages</small></div>
    <div class="stat waste"><b id="wasted"></b><small>est. tokens wasted</small></div>
  </div>
  <h2>Context treemap — every block, sized by tokens</h2>
  <div id="treemap"></div>
  <div class="legend" id="legend"></div>
  <h2>Findings</h2>
  <div id="findings"></div>
  <footer>Generated locally by tokenscope · nothing left your machine · token counts are estimates (o200k tokenizer)</footer>
</main>
<script>
const DATA = ${JSON.stringify(data)};
const KIND_COLOR = { system: "#8fa8c9", user_text: "#7fc9b4", assistant_text: "#c9c07f", tool_use: "#c99a7f", tool_result: "#d4713f", attachment: "#b07fc9", other: "#8a949e" };
const KIND_NAME = { system: "system", user_text: "user", assistant_text: "assistant", tool_use: "tool calls", tool_result: "tool results", attachment: "attachments", other: "other" };

document.getElementById("src").textContent = DATA.adapter + " · " + DATA.source;
document.getElementById("total").textContent = DATA.total.toLocaleString();
document.getElementById("msgs").textContent = DATA.messages;
document.getElementById("wasted").textContent = "~" + DATA.wasted.toLocaleString();

// Squarified treemap (Bruls et al.) — dependency-free.
function squarify(items, x, y, w, h, out) {
  if (!items.length) return;
  const total = items.reduce((s, i) => s + i.tokens, 0);
  let row = [], rest = items.slice();
  const shortest = () => Math.min(w, h);
  function worst(row, len) {
    const s = row.reduce((a, b) => a + b._area, 0);
    const max = Math.max(...row.map(r => r._area)), min = Math.min(...row.map(r => r._area));
    return Math.max((len * len * max) / (s * s), (s * s) / (len * len * min));
  }
  const area = w * h;
  rest.forEach(i => (i._area = (i.tokens / total) * area));
  while (rest.length) {
    const next = rest[0];
    if (!row.length || worst(row.concat(next), shortest()) <= worst(row, shortest())) {
      row.push(rest.shift());
    } else {
      layoutRow(row); row = [];
    }
  }
  if (row.length) layoutRow(row);
  function layoutRow(row) {
    const s = row.reduce((a, b) => a + b._area, 0);
    if (w >= h) {
      const cw = s / h; let cy = y;
      for (const r of row) { const ch = r._area / cw; out.push({ ...r, x, y: cy, w: cw, h: ch }); cy += ch; }
      x += cw; w -= cw;
    } else {
      const ch = s / w; let cx = x;
      for (const r of row) { const cw2 = r._area / ch; out.push({ ...r, x: cx, y, w: cw2, h: ch }); cx += cw2; }
      y += ch; h -= ch;
    }
  }
}

const el = document.getElementById("treemap");
function render() {
  el.innerHTML = "";
  const W = el.clientWidth, H = el.clientHeight;
  const items = DATA.blocks.slice().sort((a, b) => b.tokens - a.tokens);
  const cells = [];
  squarify(items, 0, 0, W, H, cells);
  for (const cel of cells) {
    const d = document.createElement("div");
    d.className = "cell";
    d.style.cssText = \`left:\${cel.x}px;top:\${cel.y}px;width:\${cel.w}px;height:\${cel.h}px;background:\${KIND_COLOR[cel.kind] || "#888"}\`;
    d.title = \`#\${cel.msg} \${cel.label} — \${cel.tokens.toLocaleString()} tokens\`;
    if (cel.w > 70 && cel.h > 30) d.innerHTML = \`<b>\${cel.label}</b>\${cel.tokens.toLocaleString()} tok\`;
    el.appendChild(d);
  }
}
render();
addEventListener("resize", render);

const legend = document.getElementById("legend");
for (const row of DATA.breakdown) {
  const s = document.createElement("span");
  s.innerHTML = \`<i style="background:\${KIND_COLOR[row.kind] || "#888"}"></i>\${KIND_NAME[row.kind] || row.kind} \${row.pct.toFixed(1)}%\`;
  legend.appendChild(s);
}

const fEl = document.getElementById("findings");
if (!DATA.findings.length) {
  fEl.innerHTML = '<p class="clean">✓ No waste detected. Clean session.</p>';
} else {
  for (const f of DATA.findings) {
    const d = document.createElement("div");
    d.className = "finding";
    d.innerHTML = \`<span class="waste">~\${f.wastedTokens.toLocaleString()} tok</span><span class="code">\${f.code}</span><b>\${f.title}</b><p>\${f.detail}</p><p class="fix">fix: \${f.fix}</p>\`;
    fEl.appendChild(d);
  }
}
</script>
</body>
</html>`;

  writeFileSync(outPath, html, "utf8");
  return outPath;
}
