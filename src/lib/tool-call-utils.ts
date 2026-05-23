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
  // 7. Clean up extra whitespace and empty lines
  clean = clean.replace(/\n{3,}/g, "\n\n").trim();
  return clean;
}
