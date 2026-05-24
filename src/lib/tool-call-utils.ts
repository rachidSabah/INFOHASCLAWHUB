/**
 * Client-safe utility functions for handling tool call markup.
 * This module has NO server-side imports (fs, child_process, etc.)
 * so it can be safely imported in client components.
 */

/**
 * Find the matching closing brace for a JSON object in a string.
 */
function findMatchingBraceIndex(str: string): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Strip JSON tool call patterns like {"name": "web_fetch", "arguments": {"url": "https://..."}}
 * Uses brace matching to handle nested objects correctly.
 */
function stripJsonToolCalls(text: string): string {
  const marker = '{"name":';
  let result = text;
  let safety = 0;
  while (result.includes(marker) && safety < 20) {
    safety++;
    const startIdx = result.indexOf(marker);
    if (startIdx < 0) break;
    const afterStart = result.substring(startIdx);
    const endIdx = findMatchingBraceIndex(afterStart);
    if (endIdx >= 0) {
      try {
        const jsonStr = afterStart.substring(0, endIdx + 1);
        const parsed = JSON.parse(jsonStr);
        if (parsed.name && (parsed.arguments || parsed.args || parsed.params)) {
          result = result.substring(0, startIdx) + result.substring(startIdx + endIdx + 1);
          continue;
        }
      } catch {
        // Not valid JSON — leave it alone
      }
    }
    break;
  }
  return result;
}

/**
 * Strip "Tool: ... / Status: ... / Result: ..." blocks from text.
 * These are tool result markers that appear in the streaming response.
 * The Result content can be a large JSON blob (e.g., read_file returns
 * the entire file content), so we need to strip the whole block including
 * the result payload.
 */
function stripToolResultBlocks(text: string): string {
  let clean = text;

  // Pattern 1: Multi-line "Tool: xxx\nStatus: xxx\nResult:\n{...}" blocks
  // These can span many lines because the result JSON can be huge
  // We match "Tool:" at the start of a line through the end of the JSON result
  clean = clean.replace(
    /^Tool:\s*\w+.*\nStatus:\s*\w+.*\nResult:\s*\n?[\s\S]*?(?=\n\n|\n(?=Tool:)|$)/gm,
    ""
  );

  // Pattern 2: "Tool: xxx\nStatus: xxx\nResult:\n{...}" with result on same line
  clean = clean.replace(
    /Tool:\s*\w+[\s\S]*?Status:\s*(?:success|error)[\s\S]*?Result:\s*\{[\s\S]*?"(?:path|url|content|textContent|files|query|expression|stdout)"[\s\S]*?\}/g,
    ""
  );

  // Pattern 3: Bullet-separated tool results (• Tool: xxx Status: xxx Result: {...})
  clean = clean.replace(
    /•\s*Tool:\s*\w+[\s\S]*?Status:\s*\w+[\s\S]*?Result:\s*\{[^}]*\}/g,
    ""
  );

  // Pattern 4: Standalone tool result JSON with known tool result keys
  // {"path": "...", "content": "..."} — read_file / list_files results
  // Use iterative brace-matching to handle deeply nested JSON
  const toolResultMarkers = [
    '{"path":',
    '{"url":',
    '{"query":',
    '{"expression":',
    '{"stdout":',
  ];
  for (const marker of toolResultMarkers) {
    let searchFrom = 0;
    let safety = 0;
    while (clean.includes(marker, searchFrom) && safety < 30) {
      safety++;
      const startIdx = clean.indexOf(marker, searchFrom);
      if (startIdx < 0) break;

      // Check context: is this actually a tool result?
      // Look back to see if there's "Result:" or "Tool:" nearby
      const lookback = clean.substring(Math.max(0, startIdx - 200), startIdx);
      const isAfterToolMarker =
        lookback.includes("Result:") ||
        lookback.includes("Tool:") ||
        lookback.includes("Status:");

      if (!isAfterToolMarker) {
        // Not a tool result — skip
        searchFrom = startIdx + marker.length;
        continue;
      }

      // Find matching closing brace using brace-matching
      const afterStart = clean.substring(startIdx);
      const endIdx = findMatchingBraceIndex(afterStart);
      if (endIdx >= 0) {
        clean = clean.substring(0, startIdx) + clean.substring(startIdx + endIdx + 1);
        // Don't advance searchFrom — re-check from same position
      } else {
        searchFrom = startIdx + marker.length;
      }
    }
  }

  return clean;
}

/**
 * Strip tool-call XML/JSON markup from model response text so the user
 * doesn't see raw <longcat_tool_call>, ```tool_call```, {"name":...}, etc.
 */
export function stripToolCallXml(text: string): string {
  let clean = text;
  // 1. Remove <longcat_tool_call>...</longcat_tool_call> blocks (including nested tags)
  clean = clean.replace(/<longcat_tool_call>[\s\S]*?<\/longcat_tool_call>/g, "");
  // 2. Remove orphaned <longcat_arg_key>/<longcat_arg_value> tags
  clean = clean.replace(/<longcat_arg_key>[\s\S]*?<\/longcat_arg_key>/g, "");
  clean = clean.replace(/<longcat_arg_value>[\s\S]*?<\/longcat_arg_value>/g, "");
  // 3. Remove ```tool_call ... ``` code blocks
  clean = clean.replace(/```tool_call\s*\n[\s\S]*?```/g, "");
  // 4. Remove inline JSON tool calls: {"name": "...", "arguments": {...}}
  clean = stripJsonToolCalls(clean);
  // 5. Remove action/tool JSON pattern: {"action": "...", "params": {...}}
  clean = clean.replace(/\{\s*"(?:action|tool)"\s*:\s*"[^"]*"\s*,\s*"(?:params|input|arguments|args)"\s*:\s*\{[\s\S]*?\}\s*\}/g, "");
  // 6. Remove <local_cmd>...</local_cmd>, <list_files>...</list_files>, etc.
  clean = clean.replace(/<local_cmd>[\s\S]*?<\/local_cmd>/g, "");
  clean = clean.replace(/<list_files>[\s\S]*?<\/list_files>/g, "");
  clean = clean.replace(/<read_file>[\s\S]*?<\/read_file>/g, "");
  clean = clean.replace(/<write_file\s+path="[\s\S]*?">[\s\S]*?<\/write_file>/g, "");
  // 7. Remove "Tool: / Status: / Result:" blocks (read_file, list_files, etc.)
  clean = stripToolResultBlocks(clean);
  // 8. Remove ⚙️ **[Executed System Action]** blocks with their tool result content
  // These blocks contain raw tool execution results that should never be shown to users
  clean = clean.replace(/⚙️\s*\*\*\[Executed System Action\]\**\*:[\s\S]*?```/g, "");
  clean = clean.replace(/⚙️[\s\S]*?```/g, "");
  // 9. Remove "*Running tool: ...*" indicators
  clean = clean.replace(/\*Running tool: \w+\.\.\.\*/g, "");
  // 10. Clean up excessive empty lines (but preserve spaces — critical for streaming!)
  // DO NOT use .trim() here — during streaming, spaces between words arrive as leading
  // spaces on tokens (e.g., " how", " are", " you"), and trimming them concatenates
  // all words together (e.g., "Hellohowareyoutoday").
  clean = clean.replace(/\n{3,}/g, "\n\n");
  return clean;
}

/**
 * Extract code blocks from content, returning only the meaningful code artifacts.
 * Strips out all tool call markup, reasoning text, and intermediate output
 * so the artifact preview shows ONLY the actual code content.
 */
export function extractCodeArtifacts(content: string): Array<{language: string; code: string}> {
  const codeBlocks: Array<{language: string; code: string}> = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const language = match[1] || "text";
    const code = match[2].trim();
    // Skip tool_call blocks, tiny blocks, and blocks that are just tool results
    if (language === "tool_call") continue;
    if (code.length < 20) continue;
    // Skip blocks that are just tool result JSON
    if (code.trim().startsWith('{"path":') || code.trim().startsWith('{"url":') ||
        code.trim().startsWith('{"query":') || code.trim().startsWith('{"stdout"')) continue;
    // Skip blocks that contain Tool:/Status:/Result: markers
    if (/^Tool:\s*\w+/m.test(code) && /Status:\s*(success|error)/m.test(code)) continue;
    codeBlocks.push({ language, code });
  }
  return codeBlocks;
}

/**
 * Aggressively strip all tool execution artifacts from content.
 * This is the nuclear option — removes everything that looks like
 * tool calls, tool results, system action markers, and intermediate
 * reasoning output, leaving ONLY the actual user-facing content.
 */
function aggressiveStripToolArtifacts(text: string): string {
  let clean = text;

  // 1. Remove <longcat_tool_call>...</longcat_tool_call> blocks
  clean = clean.replace(/<longcat_tool_call>[\s\S]*?<\/longcat_tool_call>/g, "");
  clean = clean.replace(/<longcat_arg_key>[\s\S]*?<\/longcat_arg_key>/g, "");
  clean = clean.replace(/<longcat_arg_value>[\s\S]*?<\/longcat_arg_value>/g, "");

  // 2. Remove ```tool_call ... ``` code blocks
  clean = clean.replace(/```tool_call\s*\n[\s\S]*?```/g, "");

  // 3. Remove ⚙️ system action blocks (including everything until the next code block or double newline)
  clean = clean.replace(/⚙️[\s\S]*?```/g, "");
  clean = clean.replace(/⚙️[\s\S]*?(?=\n\n|```|$)/g, "");

  // 4. Remove "*Running tool: ...*" indicators
  clean = clean.replace(/\*Running tool: \w+\.\.\.\*/g, "");

  // 5. Remove "[Executed System Action]" blocks
  clean = clean.replace(/\*\*\[Executed System Action\]\*\*[\s\S]*?```/g, "");
  clean = clean.replace(/\[Executed System Action\][\s\S]*?```/g, "");

  // 6. Remove Tool:/Status:/Result: blocks (multi-line, handles large JSON payloads)
  clean = clean.replace(/Tool:\s*\w+[^\n]*\nStatus:\s*(?:success|error)[^\n]*\nResult:\s*\n?[\s\S]*?(?=\n\n|\n(?=Tool:)|$)/gm, "");
  clean = clean.replace(/Tool:\s*\w+[\s\S]*?Status:\s*(?:success|error)[\s\S]*?Result:\s*\{[\s\S]*?\}/g, "");

  // 7. Remove • bullet-separated tool results
  clean = clean.replace(/•\s*\n?Tool:\s*\w+[\s\S]*?Result:\s*\{[\s\S]*?\}/g, "");

  // 8. Remove standalone JSON tool results with known keys
  // Use brace-matching for correctness with nested objects
  const toolResultMarkers = ['{"path":', '{"url":', '{"query":', '{"expression":', '{"stdout":'];
  for (const marker of toolResultMarkers) {
    let searchFrom = 0;
    let safety = 0;
    while (clean.includes(marker, searchFrom) && safety < 30) {
      safety++;
      const startIdx = clean.indexOf(marker, searchFrom);
      if (startIdx < 0) break;
      const afterStart = clean.substring(startIdx);
      const endIdx = findMatchingBraceIndex(afterStart);
      if (endIdx >= 0) {
        // Check if the surrounding context suggests this is a tool result
        const lookback = clean.substring(Math.max(0, startIdx - 200), startIdx);
        if (lookback.includes("Result:") || lookback.includes("Tool:") || lookback.includes("Status:")) {
          clean = clean.substring(0, startIdx) + clean.substring(startIdx + endIdx + 1);
        } else {
          searchFrom = startIdx + marker.length;
        }
      } else {
        searchFrom = startIdx + marker.length;
      }
    }
  }

  // 9. Remove JSON tool calls: {"name": ..., "arguments": ...}
  clean = stripJsonToolCalls(clean);

  // 10. Remove <local_cmd>, <list_files>, <read_file>, <write_file> XML tags
  clean = clean.replace(/<local_cmd>[\s\S]*?<\/local_cmd>/g, "");
  clean = clean.replace(/<list_files>[\s\S]*?<\/list_files>/g, "");
  clean = clean.replace(/<read_file>[\s\S]*?<\/read_file>/g, "");
  clean = clean.replace(/<write_file\s+path="[\s\S]*?">[\s\S]*?<\/write_file>/g, "");

  // 11. Remove action/tool JSON: {"action": ..., "params": ...}
  clean = clean.replace(/\{\s*"(?:action|tool)"\s*:\s*"[^"]*"\s*,\s*"(?:params|input|arguments|args)"\s*:\s*\{[\s\S]*?\}\s*\}/g, "");

  // 12. Remove lines that are purely tool execution markers
  clean = clean.replace(/^Tool:\s*\w+.*$/gm, "");
  clean = clean.replace(/^Status:\s*(?:success|error).*$/gm, "");
  clean = clean.replace(/^Result:\s*$/gm, "");

  // 13. Remove reasoning/thinking text patterns ("Let me explore...", "Now I have a clear picture...", etc.)
  // These are intermediate reasoning steps that should NOT appear in the artifact preview
  clean = clean.replace(/^(?:Let me|I'll|I will|Now I|First,? let me|I need to|I should|Let's)\s+[^\n]{0,200}\n/gm, "");

  // 14. Clean up excessive whitespace
  clean = clean.replace(/\n{3,}/g, "\n\n").trim();

  return clean;
}

/**
 * Clean content for artifact preview display.
 * Returns content suitable for showing in the artifact panel,
 * with all tool execution artifacts stripped out.
 * If the content contains code blocks, returns ONLY the code blocks
 * (which is what the user actually wants to see as an artifact).
 *
 * IMPORTANT: This function is designed to be very aggressive in filtering
 * out tool call content, reasoning text, and intermediate output.
 * Only actual code artifacts and meaningful responses should survive.
 */
export function cleanContentForArtifactDisplay(fullContent: string): { content: string; type: string; title: string } | null {
  // First, do an aggressive strip of all tool artifacts
  let cleaned = aggressiveStripToolArtifacts(fullContent);

  // Additional pass: strip any remaining tool result JSON objects
  cleaned = cleaned.replace(/\{"(url|path|query|expression|stdout|error|textContent|title|description|content|truncated|totalLength|files|written|replacements|appended|fetched|memories)"\s*:[^}]*(?:\{[^}]*\}[^}]*)*\}/g, "");

  // Clean up
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  // Check if this is primarily tool data — no artifact to show
  const isOnlyToolData = cleaned.length < 30 ||
    cleaned.startsWith('{"path":') ||
    cleaned.startsWith('{"url":') ||
    cleaned.startsWith('{"query":') ||
    cleaned.startsWith('Tool:');
  if (isOnlyToolData) return null;

  // Extract code blocks from the cleaned content
  const codeBlocks = extractCodeArtifacts(cleaned);

  if (codeBlocks.length > 0) {
    // If there are code blocks, use the largest/most meaningful one
    // Sort by code length descending — the main artifact is usually the largest block
    const sorted = [...codeBlocks].sort((a, b) => b.code.length - a.code.length);
    const mainBlock = sorted[0];
    const language = mainBlock.language;

    // Determine artifact type from language
    let type = "code";
    let title = mainBlock.code.split('\n')[0]?.substring(0, 60) || "Code Artifact";

    if (language === "html" || mainBlock.code.includes("<!DOCTYPE") || mainBlock.code.includes("<html")) {
      type = "html";
      title = "HTML Preview";
    } else if (language === "css" || language === "scss") {
      type = "css";
      title = "Stylesheet";
    } else if (language === "python" || language === "py") {
      type = "python";
      title = "Python Script";
    } else if (language === "typescript" || language === "ts" || language === "tsx") {
      type = "typescript";
      title = "TypeScript Module";
    } else if (language === "javascript" || language === "js" || language === "jsx") {
      type = "javascript";
      title = "JavaScript Module";
    } else if (language === "php") {
      type = "code";
      title = "PHP Script";
    } else if (language === "sql") {
      type = "sql";
      title = "SQL Query";
    } else if (language === "json") {
      type = "json";
      title = "JSON Data";
    } else if (language === "yaml" || language === "yml") {
      type = "yaml";
      title = "YAML Config";
    } else if (language === "markdown" || language === "md") {
      type = "markdown";
      title = "Document";
    } else if (language === "shell" || language === "bash" || language === "sh") {
      type = "shell";
      title = "Shell Script";
    } else if (language === "mermaid") {
      type = "diagram";
      title = "Diagram";
    }

    return { content: mainBlock.code, type, title };
  }

  // No code blocks — return cleaned content as-is if it's substantial
  if (cleaned.length < 50) return null;
  return { content: cleaned, type: "markdown", title: "Response" };
}
