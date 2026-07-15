// Parser: Claude Code JSONL -> unified session model
// Unified model: { source, messages: [{ index, role, blocks: [{ kind, label, text }] }] }
// kinds: system | user_text | assistant_text | tool_use | tool_result | attachment | other

import { readFileSync } from "node:fs";

function truncate(s, n) {
  return s.length > n ? s.slice(0, n) + "..." : s;
}

// Best-effort "what did this tool actually touch" for common tools, so labels
// read like "Read: src/utils.py" instead of a bare tool name.
function extractTarget(name, input) {
  if (!input) return "";
  switch (name) {
    case "Read":
    case "Write":
    case "Edit":
      return typeof input.file_path === "string" ? input.file_path : "";
    case "Bash":
      return typeof input.command === "string" ? truncate(input.command, 30) : "";
    case "Grep":
    case "Glob":
      return typeof input.pattern === "string" ? input.pattern : "";
    default:
      return "";
  }
}

function blockFromContent(part, role, toolMap) {
  if (typeof part === "string") {
    return { kind: role === "user" ? "user_text" : "assistant_text", label: `${role} text`, text: part };
  }
  switch (part.type) {
    case "text":
      return { kind: role === "user" ? "user_text" : "assistant_text", label: `${role} text`, text: part.text ?? "" };
    case "thinking":
      return { kind: "assistant_text", label: "assistant thinking", text: part.thinking ?? "" };
    case "tool_use": {
      const name = part.name ?? "unknown";
      const target = extractTarget(name, part.input);
      if (toolMap && part.id) toolMap.set(part.id, { name, target });
      return {
        kind: "tool_use",
        label: `tool_use: ${name}`,
        text: JSON.stringify(part.input ?? {}),
      };
    }
    case "tool_result": {
      let text = "";
      const c = part.content;
      if (typeof c === "string") text = c;
      else if (Array.isArray(c)) text = c.map((x) => (typeof x === "string" ? x : x.text ?? JSON.stringify(x))).join("\n");
      else if (c != null) text = JSON.stringify(c);
      const tool = toolMap && part.tool_use_id ? toolMap.get(part.tool_use_id) : null;
      const label = tool
        ? (tool.target ? `${tool.name}: ${tool.target}` : tool.name)
        : `tool_result: ${part.tool_use_id ?? ""}`.trim();
      return { kind: "tool_result", label, text };
    }
    case "image":
    case "document":
      return { kind: "attachment", label: part.type, text: JSON.stringify(part.source ?? {}).slice(0, 200) };
    default:
      return { kind: "other", label: part.type ?? "unknown", text: JSON.stringify(part) };
  }
}

export function parseClaudeCodeJsonl(path) {
  const raw = readFileSync(path, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const messages = [];
  const toolMap = new Map(); // tool_use id -> { name, target }, built up as tool_use blocks are seen
  let index = 0;

  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // tolerate junk lines
    }

    // Claude Code wraps API messages: { type, message: { role, content }, ... }
    // Also tolerate raw API messages: { role, content }
    const msg = entry.message ?? entry;
    const role = msg.role ?? entry.type;
    if (!role || !["user", "assistant", "system"].includes(role)) continue;

    const content = msg.content;
    const blocks = [];

    if (role === "system" || typeof content === "string") {
      blocks.push(
        role === "system"
          ? { kind: "system", label: "system prompt", text: typeof content === "string" ? content : JSON.stringify(content ?? "") }
          : blockFromContent(content, role, toolMap)
      );
    } else if (Array.isArray(content)) {
      for (const part of content) blocks.push(blockFromContent(part, role, toolMap));
    }

    for (const b of blocks) if (typeof b.text !== "string") b.text = b.text == null ? "" : String(b.text);
    if (blocks.length > 0) {
      const message = { index: index++, role, blocks };
      if (entry.message && entry.message.usage) message.usage = entry.message.usage;
      messages.push(message);
    }
  }

  return { source: path, adapter: "claude-code", messages };
}
