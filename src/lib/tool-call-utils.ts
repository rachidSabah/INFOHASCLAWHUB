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
  // 8. Clean up excessive empty lines (but preserve spaces — critical for streaming!)
  // DO NOT use .trim() here — during streaming, spaces between words arrive as leading
  // spaces on tokens (e.g., " how", " are", " you"), and trimming them concatenates
  // all words together (e.g., "Hellohowareyoutoday").
  clean = clean.replace(/\n{3,}/g, "\n\n");
  return clean;
}
