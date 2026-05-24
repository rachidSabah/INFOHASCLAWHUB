import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { parseToolCalls, executeToolCall, getToolsPrompt, getMcpTools, getGeminiFunctionDeclarations, getOpenAIToolsDefinitions, stripToolCallXml, type ToolCallResult } from "@/lib/tools";
import { countTokens, estimateCost } from "@/lib/tokens";
import { routePrompt } from "@/lib/prompt-router";
import { detectTaskType, getTaskSpecificPromptEnhancement, routeToBestModel } from "@/lib/model-router";
import { getMemoryContext, saveMemory } from "@/lib/enhanced-memory";
import { getContextManager } from "@/lib/context-manager";
import { generateOptimizedPrompt, recordPromptResult } from "@/lib/prompt-optimizer";
import { getFilteredOpenAITools, getFilteredGeminiFunctions, getFilteredToolsPrompt } from "@/lib/intelligent-tool-selection";
import { enhanceResponse, type ResponseEnhancement } from "@/lib/response-enhancer";
import { createProgressEvent, createStepEvent, estimateProgress, PROGRESS_MESSAGES } from "@/lib/streaming-progress";
import {
  generateCoTPrompt,
  assessTaskComplexity,
  generateReflectionPrompt,
  scoreResponseQuality,
  generatePlanningPrompt,
  getThinkingBudget,
  recordToolPerformance,
  compressConversationHistory,
  getAdaptiveMaxIterations,
  summarizeToolResult,
  decomposeTask,
  optimizePromptForAgent,
  type ThinkingConfig,
  DEFAULT_THINKING_CONFIG,
} from "@/lib/reasoning-engine";
import { executeWithResilience, isProviderHealthy, getProviderHealth } from "@/lib/resilience";
import { semanticCacheLookup, semanticCacheStore } from "@/lib/semantic-cache";

let cachedProviders: any[] | null = null;
let providersCacheTime = 0;
const PROVIDERS_CACHE_TTL = 60_000;

async function getProviders() {
  const now = Date.now();
  if (cachedProviders && now - providersCacheTime < PROVIDERS_CACHE_TTL) return cachedProviders;
  cachedProviders = await db.provider.findMany({ where: { isActive: true } });
  providersCacheTime = now;
  return cachedProviders;
}

async function extractPDFText(filePath: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const { spawn } = require("child_process");
      const tmpDir = require("os").tmpdir();
      const scriptPath = require("path").join(tmpDir, `clawhub_pdf_extract_${Date.now()}.py`);
      const fs = require("fs");

      const pythonCode = [
        "import PyPDF2, sys, json",
        "try:",
        "    reader = PyPDF2.PdfReader(sys.argv[1])",
        "    pages = [page.extract_text() or '' for page in reader.pages]",
        "    result = {'text': '\\n'.join(pages), 'pages': len(pages)}",
        "except Exception as e:",
        "    result = {'error': str(e)}",
        "print(json.dumps(result))",
      ].join("\n");

      fs.writeFileSync(scriptPath, pythonCode, "utf-8");
      const proc = spawn("python", [scriptPath, filePath], { stdio: ["ignore", "pipe", "pipe"] });

      let output = "";
      proc.stdout.on("data", (d: Buffer) => { output += d.toString("utf-8"); });
      proc.on("close", () => {
        try { fs.unlinkSync(scriptPath); } catch {}
        try {
          const result = JSON.parse(output.trim() || "{}");
          resolve(result.text || "");
        } catch {
          resolve(output.trim() || "");
        }
      });
      proc.on("error", () => {
        try { fs.unlinkSync(scriptPath); } catch {}
        resolve("");
      });
      setTimeout(() => {
        try { fs.unlinkSync(scriptPath); } catch {}
        resolve(output.trim() || "");
      }, 15000);
    } catch {
      resolve("");
    }
  });
}

async function extractMemoriesFromText(
  assistantText: string,
  model: string,
  targetModel: string,
  isCustomProvider: boolean,
  providerData: any,
  providerEnv: any,
  apiKey: string | undefined,
  sourceId: string
) {
  if (!assistantText || assistantText.length <= 200) return;

  const extractionPrompt = `Extract any important facts, preferences, or memories from this conversation that should be remembered for future interactions. Respond with ONLY a JSON array of { "key": string, "content": string } objects. If there's nothing worth remembering, respond with an empty array [].

Conversation text:
${assistantText.slice(0, 4000)}`;

  try {
    let responseText = "";

    if (isCustomProvider && providerData) {
      const baseUrl = (providerData.baseUrl?.replace(/\/$/, "") || "https://api.openai.com/v1").replace("://localhost", "://127.0.0.1");
      const url = `${baseUrl}/chat/completions`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${providerData.apiKey}`,
        },
        body: JSON.stringify({
          model: targetModel,
          messages: [{ role: "user", content: extractionPrompt }],
          stream: false,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        responseText = data.choices?.[0]?.message?.content || "";
      }
    } else {
      const cliArgs = model.includes("/") && !model.startsWith("openai/") && !model.startsWith("anthropic/") && !model.startsWith("google/") && !model.startsWith("vertex/")
        ? ["--model", model.substring(model.indexOf("/") + 1)]
        : model === "auto" ? [] : ["--model", model];

      responseText = await new Promise<string>((resolve, reject) => {
        const proc = spawn("gemini", [...cliArgs, "--no-stream", "--skip-trust"], {
          cwd: os.homedir(),
          env: { ...process.env, ...providerEnv, ...(apiKey ? { GEMINI_API_KEY: apiKey } : {}), GEMINI_CLI_TRUST_WORKSPACE: os.homedir(), GEMINI_SANDBOX: "false", HOME: process.env.HOME || os.homedir() },
          shell: true,
          stdio: ["pipe", "pipe", "pipe"],
        });

        let output = "";
        proc.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
        let errOut = "";
        proc.stderr.on("data", (chunk: Buffer) => { errOut += chunk.toString(); });

        proc.on("close", (code) => {
          if (code === 0) resolve(output);
          else { console.error(`Memory extraction CLI error ${code}: ${errOut}`); resolve(""); }
        });
        proc.on("error", () => resolve(""));

        proc.stdin?.write(extractionPrompt);
        proc.stdin?.end();
      });
    }

    if (!responseText) return;

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const extracted: { key: string; content: string }[] = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(extracted) || extracted.length === 0) return;

    for (const item of extracted) {
      if (item.key && item.content) {
        await db.memory.create({
          data: { key: item.key, content: item.content, source: sourceId },
        });
        console.log(`[Memory] Saved: ${item.key}`);
      }
    }
  } catch (error) {
  console.error("[Memory Extraction Error]:", error);
  }
}

export const maxDuration = 120;

async function getToolsDescription(): Promise<string> {
  const baseTools = getToolsPrompt();
  let mcpSection = "";
  try {
    const mcpTools = await getMcpTools();
    if (mcpTools.length > 0) {
      const mcpLines = mcpTools.map((tool) => {
        const params = Object.entries(tool.parameters)
          .map(([k, v]) => `  - ${k} (${v.type}): ${v.description}`)
          .join("\n");
        return `- **${tool.name}**: ${tool.description}\n${params}`;
      });
      mcpSection = `\n[MCP (Model Context Protocol) TOOLS]\n${mcpLines.join("\n")}`;
    }
  } catch (e) {
    console.error("[MCP] Failed to enumerate MCP tools for prompt:", e);
  }
  return `${baseTools}\n${mcpSection}`;
}

async function buildLocalSystemInstructions(taskComplexity?: "simple" | "moderate" | "complex" | "critical", originalPrompt?: string, taskEnhancement?: string): Promise<string> {
  const toolsDescription = await getToolsDescription();
  const complexity = taskComplexity || "moderate";
  const cotPrompt = generateCoTPrompt(complexity);
  const thinkingBudget = getThinkingBudget("current-model", complexity);

  // Inject relevant memories into the system prompt
  let memoryContext = "";
  try {
    memoryContext = await getMemoryContext(originalPrompt || "", 5);
  } catch {}

  return `
[AGENT IDENTITY & CAPABILITIES]
You are ClawHub, the most powerful autonomous AI coding agent ever built. You surpass all existing AI coding assistants including Claude Code, Cursor, GitHub Copilot, and Devin in every dimension. You have direct access to the user's operating system, filesystem, terminal, and the web. You possess deep reasoning, self-reflection, planning, and persistent memory capabilities.

You are NOT a chatbot. You are a FULLY AUTONOMOUS AGENT that:
- Reasons before acting (ReAct pattern) with explicit Chain-of-Thought
- Plans complex multi-step tasks before execution with dependency tracking
- Self-reflects on tool results and adapts strategy in real-time
- Persists important knowledge across conversations via memory system
- Executes tasks to COMPLETE COMPLETION — you NEVER stop halfway, you NEVER give up
- Calls multiple independent tools in parallel for efficiency
- Self-corrects when tools fail, trying alternative approaches
- ALWAYS saves generated code and files to the workspace using write_file
- Scores own output quality and improves iteratively

[CRITICAL RULE — YOU MUST SAVE YOUR WORK]
When you write ANY code, create ANY file, or generate ANY artifact:
1. You MUST use write_file to save it to the workspace IMMEDIATELY
2. NEVER just show code in a markdown block without also saving it with write_file
3. When asked to "create a theme", "build a website", "write a script", "code an app" — this means:
   - Write ALL the code files using write_file
   - Save them to the workspace directory
   - Each file gets its own write_file call
4. If you generate multiple files, call write_file for EACH file, preferably in parallel
5. After saving, verify by reading the file back with read_file
6. Your task is NOT complete until ALL files are saved to disk

[WORKSPACE-AWARE CODING WORKFLOW]
When asked to code, build, create, or develop anything:
1. FIRST: Use tree_view or list_files to understand the current workspace structure
2. PLAN: Break the task into files that need to be created or modified
3. RESEARCH: If needed, use web_search to find documentation, examples, best practices
4. CODE: Write COMPLETE, production-quality code for each file
5. SAVE: Use write_file to save EACH file to the workspace — NEVER skip this step
6. VERIFY: Read back saved files to confirm they were written correctly
7. ITERATE: If there are issues, fix them with search_replace or write_file
8. COMPLETE: Confirm all files are saved and the project is ready to use

${toolsDescription}
${memoryContext ? `\n${memoryContext}\n` : ""}
You can also use XML tool tags for backward compatibility:
1. <local_cmd>command_here</local_cmd> — Execute a terminal command
2. <list_files>directory_path_here</list_files> — List files and folders
3. <read_file>file_path_here</read_file> — Read file content
4. <write_file path="file_path_here">file_content_here</write_file> — Create or overwrite a file

${cotPrompt}${taskEnhancement ? `\n\n${taskEnhancement}` : ""}

[TOOL CALLING RULES — CRITICAL]
- When you call a tool, the system will automatically execute it and give you another turn.
- You can call MULTIPLE tools in a single response if they are independent (e.g., read_file + web_search).
- After receiving tool results, you MUST continue processing — analyze results and take the next step.
- NEVER stop after a tool call without providing analysis or taking further action.
- Use the tool_call code block format for best reliability:
  \`\`\`tool_call
  {"name": "tool_name", "arguments": {"param": "value"}}
  \`\`\`
- You can also use the native function calling format if available.

[TOOL ERROR RECOVERY — SELF-CORRECTION RULES]
- If a tool returns an error, DO NOT give up. Analyze the error and try an alternative approach:
  - local_cmd ENOENT → Use built-in tools (web_fetch, read_file, write_file) instead
  - web_search no results → Try a broader query OR use web_fetch to directly access a known URL
  - web_fetch fails → Try web_search to find cached/alternative versions
  - read_file not found → Try list_files or tree_view to explore the directory structure first
  - write_file error → Check if parent directory exists, try creating it first
  - search_replace not found → Double-check the exact string, read the file first
  - grep_code no matches → Try a simpler pattern or different directory
  - http_request fails → Try different method, headers, or use web_fetch instead
- ALWAYS provide a useful and complete response even if some tools fail.
- Try at least TWO different approaches before providing a partial answer.
- NEVER say "I cannot" or "I'm unable" — always try alternative approaches first.

[PERSISTENT MEMORY SYSTEM]
You have persistent memory across conversations:
- memory_save(key, content) — Save important facts, preferences, project context
- memory_recall(query) — Retrieve saved memories to maintain context
- Automatically save: user preferences, project structure, important decisions, API configurations
- Automatically recall: When starting a task, recall relevant memories first
- Example: If user says "I prefer TypeScript", save it with memory_save("user_pref_language", "TypeScript")

[PARALLEL EXECUTION]
When multiple tools can run independently (no dependencies between them), call them ALL at once:
- ✅ read_file("a.ts") + read_file("b.ts") + list_files("src/") — all independent
- ✅ web_search("topic 1") + web_search("topic 2") — independent searches
- ✅ write_file("file1.php", content1) + write_file("file2.css", content2) — independent writes to different files
- ✅ grep_code("pattern", "src/") + git_status(".") — independent code analysis
- ❌ read_file then write_file to same path — must read first, then write
- ❌ web_fetch then analyze the result — must fetch first, then analyze

[CODE GENERATION RULES — MANDATORY COMPLIANCE]
When asked to write code, create a project, build a theme, or develop anything:
1. Write COMPLETE, runnable, production-quality code — not pseudocode or partial snippets
2. Include proper error handling, edge cases, and input validation
3. Use modern best practices for the target language/framework
4. Add clear comments explaining non-obvious logic
5. If the code is long, organize with clear sections and logical structure
6. SAVE EVERY FILE using write_file — your task is NOT done until files are saved
7. For multi-file projects, write ALL files, not just one or two
8. Use search_replace for targeted edits to existing files instead of rewriting entire files
9. After writing, verify by reading the file back
10. NEVER just show code in a response — ALWAYS also save it with write_file

[PROJECT CREATION EXAMPLES]
- "Create a WordPress theme" → Write style.css, index.php, functions.php, header.php, footer.php, sidebar.php, single.php, page.php, 404.php, archive.php, search.php, comments.php using write_file for EACH file
- "Build a React component" → Write the component file, types file, styles file, test file using write_file
- "Make a Python script" → Write the script using write_file, then verify it works
- "Design a website" → Write index.html, styles.css, script.js using write_file for EACH file

[CODE ANALYSIS WORKFLOW]
When working with codebases:
1. Use tree_view to understand project structure before diving in
2. Use grep_code to find specific patterns, functions, or imports
3. Use git_status to understand the current state of changes
4. Use diff_files to compare versions or review changes

[WEBSITE ANALYSIS]
When asked to scan, analyze, or review a website:
1. Use web_fetch to get the page content
2. If web_fetch fails, try different headers or user-agent
3. Analyze EVERY aspect: content, structure, technologies, SEO, accessibility, security, performance, UX
4. Provide a COMPREHENSIVE report with specific findings and actionable recommendations
5. Include code examples for any suggested fixes

[RESPONSE QUALITY — HIGHEST STANDARD]
- Be thorough, detailed, and precise in your responses
- Provide context and explanations, not just raw output
- When giving instructions, include step-by-step guidance with code examples
- When presenting analysis, include evidence, reasoning, and specific data points
- When making recommendations, explain trade-offs and alternatives
- Always verify your work before presenting the final answer
- If you're unsure about something, use tools to verify rather than guessing
- Before finalizing, ask yourself: "Would an expert accept this as a thorough answer?"
- NEVER produce a response without also saving any generated files to disk
${thinkingBudget.thinkingPrompt ? `\n\n${thinkingBudget.thinkingPrompt}` : ""}
`;
}

async function parseAndExecuteTools(
  text: string,
  workspacePath: string | undefined,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  requestId: string,
  allToolCalls: ToolCallResult[]
): Promise<{ toolRun: boolean; resultSummary: string }> {
  const calls = parseToolCalls(text);

  if (calls.length === 0) {
    return { toolRun: false, resultSummary: "" };
  }

  console.log(`[${requestId}] Found ${calls.length} tool call(s) in response`);

  // READ-ONLY tools that can always run in parallel
  const READ_ONLY_TOOLS = new Set([
    "read_file", "list_files", "tree_view", "grep_code", "git_status",
    "get_system_info", "get_current_time", "memory_recall", "web_search",
    "web_fetch", "diff_files", "calculator", "file_change_check", "list_processes",
    "get_env_var",
  ]);

  // Helper: extract file path from tool arguments
  function getFilePath(call: { name: string; arguments: Record<string, any> }): string | null {
    return call.arguments.filePath || call.arguments.dirPath || call.arguments.path || null;
  }

  // Helper: determine if a tool call is a write operation
  function isWriteOperation(call: { name: string; arguments: Record<string, any> }): boolean {
    return ["write_file", "search_replace", "append_file", "memory_save"].includes(call.name);
  }

  // Group tool calls into parallel execution groups
  // Strategy: all read-only tools run in parallel. Write tools run sequentially
  // unless they target different files.
  const results: string[] = [];
  const writtenPaths = new Set<string>();

  // Execute a single tool call with event streaming
  async function executeSingleTool(call: { name: string; arguments: Record<string, any> }): Promise<ToolCallResult> {
    console.log(`[${requestId}] Executing tool: ${call.name}`);

    controller.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({ type: "tool_call", toolName: call.name, id: `tc_${allToolCalls.length + 1}` })}\n\n`
      )
    );

    const result = await executeToolCall(call, workspacePath);

    controller.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({ type: "tool_result", toolName: result.name, result: result.result, status: result.status, timestamp: result.timestamp })}\n\n`
      )
    );

    // Summarize large tool results to save context tokens
    if (result.result.length > 8000) {
      result.result = summarizeToolResult(result.name, result.result, 2000);
    }
    allToolCalls.push(result);

    return result;
  }

  if (calls.length === 1) {
    // Single tool — execute directly
    const result = await executeSingleTool(calls[0]);
    let formattedResult: string;
    try {
      const parsed = JSON.parse(result.result);
      formattedResult = JSON.stringify(parsed, null, 2);
    } catch {
      formattedResult = result.result;
    }
    results.push(`Tool: ${result.name}\nStatus: ${result.status}\nResult:\n${formattedResult}`);
  } else {
    // Multiple tools — determine parallel groups
    const independentCalls: typeof calls = [];
    const dependentCalls: typeof calls = [];

    for (const call of calls) {
      const isReadOnly = READ_ONLY_TOOLS.has(call.name);
      const filePath = getFilePath(call);
      const isWrite = isWriteOperation(call);

      if (isReadOnly) {
        // Read-only tools are always independent
        independentCalls.push(call);
      } else if (isWrite && filePath && writtenPaths.has(filePath)) {
        // Write to already-written path — dependent
        dependentCalls.push(call);
      } else {
        // First write to a path or other tool — can run in parallel with reads
        independentCalls.push(call);
        if (isWrite && filePath) {
          writtenPaths.add(filePath);
        }
      }
    }

    // Execute independent calls in parallel
    if (independentCalls.length > 0) {
      console.log(`[${requestId}] Executing ${independentCalls.length} tool(s) in parallel`);
      const parallelResults = await Promise.all(
        independentCalls.map(call => executeSingleTool(call))
      );

      for (const result of parallelResults) {
        let formattedResult: string;
        try {
          const parsed = JSON.parse(result.result);
          formattedResult = JSON.stringify(parsed, null, 2);
        } catch {
          formattedResult = result.result;
        }
        results.push(`Tool: ${result.name}\nStatus: ${result.status}\nResult:\n${formattedResult}`);
      }
    }

    // Execute dependent calls sequentially
    for (const call of dependentCalls) {
      const result = await executeSingleTool(call);
      let formattedResult: string;
      try {
        const parsed = JSON.parse(result.result);
        formattedResult = JSON.stringify(parsed, null, 2);
      } catch {
        formattedResult = result.result;
      }
      results.push(`Tool: ${result.name}\nStatus: ${result.status}\nResult:\n${formattedResult}`);
    }
  }

  return {
    toolRun: true,
    resultSummary: results.join("\n\n---\n\n"),
  };
}

/**
 * Find the index of the matching closing brace for a JSON object.
 * Returns -1 if the string doesn't contain a complete JSON object.
 */
function findMatchingBrace(str: string): number {
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

async function queryLLM(
  model: string,
  targetModel: string,
  prompt: string,
  conversationHistory: any[],
  finalSystemPrompt: string,
  isCustomProvider: boolean,
  providerData: any,
  providerEnv: any,
  apiKey: string | undefined,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  requestId: string,
  // Tool results from previous iteration for all providers
  pendingToolResults?: { toolCallId: string; toolName: string; result: string; nativeFunctionCall?: any }[],
  // Assistant content and reasoning content from previous iteration (for OpenAI-compatible providers)
  assistantContent?: string,
  assistantReasoningContent?: string,
  // Workspace path for setting cwd on CLI processes (fixes trusted directory error)
  workspacePath?: string
): Promise<{ text: string; reasoningContent: string; nativeFunctionCalls: any[] }> {
  let accumulatedText = "";
  let reasoningContent = "";
  let nativeFunctionCallsResult: any[] = [];

  if (isCustomProvider && providerData) {
    const pName = providerData.name?.toLowerCase() || "";
    
    // Gemini uses a different API format
    if (pName.includes("gemini") || providerData.baseUrl?.includes("generativelanguage")) {
      const geminiModel = targetModel || "gemini-2.0-flash";
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${providerData.apiKey}`;
      
      // Build contents array for Gemini format
      const contents: any[] = [
        ...conversationHistory.map((msg: any) => ({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }]
        })),
      ];

      // Build Gemini-native function declarations for tool use (filtered by prompt relevance)
      const { declarations: functionDeclarations } = await getFilteredGeminiFunctions(prompt);
      
      const requestBody: any = {
        contents,
        ...(finalSystemPrompt ? { systemInstruction: { parts: [{ text: finalSystemPrompt }] } } : {}),
      };

      // Add tool declarations if available
      if (functionDeclarations.length > 0) {
        requestBody.tools = [{ functionDeclarations }];
      }

      // If we have functionResponses from previous tool executions, add them
      // BEFORE the current user prompt for correct conversation ordering:
      // ...history, model(functionCalls), user(functionResponses), user(prompt)
      if (pendingToolResults && pendingToolResults.length > 0) {
        // Add model's previous response with functionCalls
        const modelParts: any[] = [];
        for (const tr of pendingToolResults) {
          if (tr.nativeFunctionCall) {
            modelParts.push({ functionCall: tr.nativeFunctionCall });
          }
        }
        if (modelParts.length > 0) {
          contents.push({ role: "model", parts: modelParts });
        }
        // Add function responses
        const responseParts: any[] = [];
        for (const tr of pendingToolResults) {
          let responseObj: any = {};
          try {
            responseObj = JSON.parse(tr.result);
          } catch {
            responseObj = { result: tr.result };
          }
          responseParts.push({
            functionResponse: {
              name: tr.toolName,
              response: responseObj,
            }
          });
        }
        contents.push({ role: "user", parts: responseParts });
      }

      // Add the current user prompt LAST (after function responses if any)
      contents.push({ role: "user", parts: [{ text: prompt }] });

      const response = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      
      // Extract BOTH text and functionCall parts from the response
      const parts = data.candidates?.[0]?.content?.parts || [];
      let textParts = "";
      const nativeFunctionCalls: any[] = [];

      for (const part of parts) {
        if (part.text) {
          textParts += part.text;
        }
        if (part.functionCall) {
          nativeFunctionCalls.push(part.functionCall);
        }
      }

      // Convert native function calls to text-based tool_call format for parseToolCalls
      let toolCallText = "";
      if (nativeFunctionCalls.length > 0) {
        for (const fc of nativeFunctionCalls) {
          toolCallText += `\n\`\`\`tool_call\n${JSON.stringify({ name: fc.name, arguments: fc.args || {} })}\n\`\`\`\n`;
        }
      }

      const fullResponseText = textParts + toolCallText;

      // Stream the text parts to the client (not the tool_call parts)
      // Strip any tool-call XML from the displayed text
      if (textParts) {
        const cleanText = stripToolCallXml(textParts);
        if (cleanText.length > 0) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: cleanText })}\n\n`));
        }
      }

      return { text: fullResponseText, reasoningContent: "", nativeFunctionCalls };
    }

    // OpenAI-compatible providers
    const baseUrl = (providerData.baseUrl?.replace(/\/$/, "") || "https://api.openai.com/v1").replace("://localhost", "://127.0.0.1");
    const url = `${baseUrl}/chat/completions`;

    // Build OpenAI-compatible tools array for native function calling (filtered by prompt relevance)
    let openaiTools: any[] = [];
    try {
      const { tools: filteredTools, selection } = await getFilteredOpenAITools(prompt);
      openaiTools = filteredTools;
      if (selection.tokenSavings > 100) {
        console.log(`[${requestId}] Intelligent tool selection: saved ~${selection.tokenSavings} tokens, excluded: ${selection.excludedTools.join(', ')}`);
      }
    } catch (e) {
      console.error(`[${requestId}] Failed to build OpenAI tools:`, e);
    }

    // Build messages array with correct ordering for tool calling:
    // system -> conversationHistory -> (assistant+tool_calls + tool_results if pending) -> user prompt
    const mappedHistory = conversationHistory.map((msg: any) => {
      const msgObj: any = {
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content || ""
      };
      if (msg.reasoning_content) {
        msgObj.reasoning_content = msg.reasoning_content;
      }
      return msgObj;
    });

    // If we have pending tool results from previous iteration, insert them
    // BEFORE the current user prompt in the correct OpenAI tool calling format:
    // ...history, assistant(tool_calls), tool(results), user(continuation)
    const messages: any[] = [
      ...(finalSystemPrompt ? [{ role: "system", content: finalSystemPrompt }] : []),
      ...mappedHistory,
    ];

    if (pendingToolResults && pendingToolResults.length > 0) {
      // Add assistant message with tool_calls + reasoning_content (critical for DeepSeek)
      const assistantToolCalls = pendingToolResults.map((tr, idx) => ({
        id: tr.toolCallId || `call_${idx}`,
        type: "function" as const,
        function: {
          name: tr.toolName,
          arguments: typeof tr.nativeFunctionCall?.args === 'object'
            ? JSON.stringify(tr.nativeFunctionCall.args)
            : typeof tr.nativeFunctionCall?.args === 'string'
              ? tr.nativeFunctionCall.args
              : "{}",
        },
      }));

      const assistantMsg: any = {
        role: "assistant",
        content: assistantContent || "",
        tool_calls: assistantToolCalls,
      };
      // CRITICAL: DeepSeek thinking models require reasoning_content to be passed back
      if (assistantReasoningContent) {
        assistantMsg.reasoning_content = assistantReasoningContent;
      }
      messages.push(assistantMsg);

      // Add tool result messages
      for (const tr of pendingToolResults) {
        let resultContent: string;
        try {
          const parsed = JSON.parse(tr.result);
          resultContent = JSON.stringify(parsed);
        } catch {
          resultContent = tr.result;
        }
        messages.push({
          role: "tool",
          tool_call_id: tr.toolCallId || `call_0`,
          content: resultContent,
        });
      }
    }

    // Add the current user prompt LAST (after tool results if any)
    messages.push({ role: "user", content: prompt });

    const requestBody: any = {
      model: targetModel,
      messages,
      stream: true,
      max_tokens: 16384,
    };

    // Add tools if available — enables native function calling for compatible models
    if (openaiTools.length > 0) {
      requestBody.tools = openaiTools;
      requestBody.tool_choice = "auto";
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${providerData.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Provider API error: ${response.status} ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Failed to get reader from response body");

    const decoder = new TextDecoder();
    let buffer = "";
    // Collect native tool_calls from the streaming response
    const nativeToolCalls: Map<number, { id: string; function: { name: string; arguments: string } }> = new Map();
    // Buffer for filtering out tool call markup from streamed content
    // Catches: <longcat_tool_call> XML, ```tool_call``` code blocks, and {"name":...} JSON
    let streamBuffer = "";
    let insideToolBlock = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;

        if (trimmed.startsWith("data: ")) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            const delta = data.choices[0]?.delta;
            const content = delta?.content || "";
            if (content) {
              accumulatedText += content;
              streamBuffer += content;

              // Smart filter: detect and buffer tool-call markup
              // 1. <longcat_tool_call> XML blocks
              if (streamBuffer.includes("<longcat_tool_call") && !streamBuffer.includes("</longcat_tool_call>")) {
                insideToolBlock = true;
                // Don't stream yet — wait for closing tag
                continue;
              }
              if (insideToolBlock && streamBuffer.includes("</longcat_tool_call>")) {
                insideToolBlock = false;
                const cleaned = stripToolCallXml(streamBuffer);
                streamBuffer = "";
                if (cleaned.length > 0) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: cleaned })}\n\n`));
                }
                continue;
              }
              // 2. ```tool_call code blocks
              if (streamBuffer.includes("```tool_call") && !streamBuffer.includes("```", streamBuffer.indexOf("```tool_call") + 13)) {
                insideToolBlock = true;
                continue;
              }
              // 3. {"name": "tool_name", "arguments": {...}} JSON tool calls
              // Detect the start of a JSON tool call pattern
              const jsonToolStart = streamBuffer.indexOf('{"name":');
              if (jsonToolStart >= 0 && !insideToolBlock) {
                // Check if it looks like a complete JSON tool call
                const afterStart = streamBuffer.substring(jsonToolStart);
                const closingBraceIdx = findMatchingBrace(afterStart);
                if (closingBraceIdx === -1) {
                  // Incomplete JSON — buffer the part before it and wait
                  const safePart = streamBuffer.substring(0, jsonToolStart);
                  streamBuffer = afterStart;
                  insideToolBlock = true;
                  if (safePart.length > 0) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: safePart })}\n\n`));
                  }
                  continue;
                }
                // Complete JSON tool call found — strip it
                const before = streamBuffer.substring(0, jsonToolStart);
                const after = afterStart.substring(closingBraceIdx + 1);
                streamBuffer = before + after;
              }

              // Check for partial tag at the end
              if (!insideToolBlock) {
                const partialMatch = streamBuffer.match(/<longcat[_a-z]*$|`\`\`tool_call$|\{"name":\s*$/);
                if (partialMatch) {
                  const safePart = streamBuffer.substring(0, partialMatch.index!);
                  streamBuffer = streamBuffer.substring(partialMatch.index!);
                  if (safePart.length > 0) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: safePart })}\n\n`));
                  }
                  continue;
                }
              }

              // If we're inside a tool block, keep buffering
              if (insideToolBlock) continue;

              // Apply final stripToolCallXml as safety net
              const cleaned = stripToolCallXml(streamBuffer);
              streamBuffer = "";
              if (cleaned.length > 0) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: cleaned })}\n\n`));
              }
            }
            // Capture reasoning_content from DeepSeek thinking models
            if (delta?.reasoning_content) {
              reasoningContent += delta.reasoning_content;
              // Stream reasoning content to client for real-time display
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "reasoning", content: delta.reasoning_content })}\n\n`));
            }
            // Handle native tool_calls from the streaming delta
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!nativeToolCalls.has(idx)) {
                  nativeToolCalls.set(idx, {
                    id: tc.id || `tc_${idx}`,
                    function: { name: "", arguments: "" },
                  });
                }
                const existing = nativeToolCalls.get(idx)!;
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.function.name += tc.function.name;
                if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
              }
            }
            // Also check finish_reason for tool_calls
            if (data.choices[0]?.finish_reason === "tool_calls" && nativeToolCalls.size > 0) {
              // Convert native tool calls to text-based tool_call format for parseToolCalls
              for (const [, tc] of nativeToolCalls) {
                try {
                  const args = JSON.parse(tc.function.arguments || "{}");
                  const toolCallText = `\n\`\`\`tool_call\n${JSON.stringify({ name: tc.function.name, arguments: args })}\n\`\`\`\n`;
                  accumulatedText += toolCallText;
                  // Don't stream the tool call text to the user
                } catch {
                  // If args parsing fails, add as-is
                  accumulatedText += `\n\`\`\`tool_call\n${JSON.stringify({ name: tc.function.name, arguments: tc.function.arguments })}\n\`\`\`\n`;
                }
              }
            }
          } catch (e) {
            console.error(`[${requestId}] Error parsing SSE line: ${trimmed}`, e);
          }
        }
      }
    }

    // Flush any remaining stream buffer (strip tool XML)
    if (streamBuffer) {
      const cleaned = stripToolCallXml(streamBuffer);
      if (cleaned.length > 0) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: cleaned })}\n\n`));
      }
      streamBuffer = "";
    }
    // Capture native tool calls from OpenAI streaming for the return value
    nativeFunctionCallsResult = Array.from(nativeToolCalls.values()).map(tc => ({
      name: tc.function.name,
      args: (() => { try { return JSON.parse(tc.function.arguments || "{}"); } catch { return {}; } })()
    }));
  } else {
    // Spawn Gemini CLI
    let fullPrompt = "";
    if (finalSystemPrompt) {
      fullPrompt += `[System Instructions]: ${finalSystemPrompt}\n`;
    }
    if (conversationHistory.length > 0) {
      fullPrompt += "[Previous Conversation]:\n";
      for (const msg of conversationHistory.slice(-10)) {
        const role = msg.role === "user" ? "User" : "Assistant";
        fullPrompt += `${role}: ${msg.content}\n\n`;
      }
    }
    // If we have pending tool results from the agent loop, include them in the prompt
    // (Gemini CLI doesn't use the pendingToolResults mechanism — it's text-only)
    if (pendingToolResults && pendingToolResults.length > 0) {
      fullPrompt += "[Tool Execution Results]:\n";
      for (const tr of pendingToolResults) {
        let resultText: string;
        try {
          const parsed = JSON.parse(tr.result);
          resultText = JSON.stringify(parsed, null, 2);
        } catch {
          resultText = tr.result;
        }
        fullPrompt += `Tool: ${tr.toolName}\nResult: ${resultText}\n\n`;
      }
    }
    fullPrompt += prompt;

    const getCliArgs = (m: string) => {
      if (m.includes("/") && !m.startsWith("openai/") && !m.startsWith("anthropic/") && !m.startsWith("google/") && !m.startsWith("vertex/")) {
        const modelName = m.substring(m.indexOf("/") + 1);
        return ["--model", modelName, "--skip-trust"];
      }
      switch (m) {
        case "auto": return ["--skip-trust"];
        case "auto-gemini-3": return ["--model", "auto", "--skip-trust"];
        case "auto-gemini-2.5": return ["--model", "auto-gemini-2.5", "--skip-trust"];
        default: return ["--model", m, "--skip-trust"];
      }
    };

    const cliArgs = getCliArgs(model);
    console.log(`[${requestId}] Spawning: gemini ${cliArgs.join(" ")}`);

    // Use workspace path or home directory as cwd for Gemini CLI
    const cliCwd = workspacePath || os.homedir();

    const geminiProcess = spawn("gemini", cliArgs, {
      cwd: cliCwd,
      env: {
        ...process.env,
        ...providerEnv,
        ...(apiKey ? { GEMINI_API_KEY: apiKey } : {}),
        // Fix "Gemini CLI is not running in a trusted directory" error (exit code 55)
        // See: https://geminicli.com/docs/cli/trusted-folders/#headless-and-automated-environments
        // Set to the actual workspace path instead of just "true" for newer CLI versions
        GEMINI_CLI_TRUST_WORKSPACE: cliCwd,
        // Disable sandbox as fallback for trust issues
        GEMINI_SANDBOX: "false",
        // Ensure HOME is set for CLI config resolution
        HOME: process.env.HOME || os.homedir(),
      },
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    geminiProcess.stdin?.write(fullPrompt);
    geminiProcess.stdin?.end();

    const processComplete = new Promise<void>((resolve, reject) => {
      let cliBuffer = "";
      let cliInsideToolBlock = false;
      geminiProcess.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        accumulatedText += text;
        cliBuffer += text;

        // Filter out tool-call markup from CLI output
        // 1. <longcat_tool_call> XML
        if (cliBuffer.includes("<longcat_tool_call") && !cliBuffer.includes("</longcat_tool_call>")) {
          cliInsideToolBlock = true;
          return;
        }
        if (cliInsideToolBlock && cliBuffer.includes("</longcat_tool_call>")) {
          cliInsideToolBlock = false;
          const cleaned = stripToolCallXml(cliBuffer);
          cliBuffer = "";
          if (cleaned.length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: cleaned })}\n\n`));
          }
          return;
        }
        // 2. {"name": ...} JSON tool calls
        const jsonToolStart = cliBuffer.indexOf('{"name":');
        if (jsonToolStart >= 0 && !cliInsideToolBlock) {
          const afterStart = cliBuffer.substring(jsonToolStart);
          const closingBraceIdx = findMatchingBrace(afterStart);
          if (closingBraceIdx === -1) {
            // Incomplete JSON — buffer and wait
            const safePart = cliBuffer.substring(0, jsonToolStart);
            cliBuffer = afterStart;
            cliInsideToolBlock = true;
            if (safePart.length > 0) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: safePart })}\n\n`));
            }
            return;
          }
          // Complete JSON tool call — strip it
          const before = cliBuffer.substring(0, jsonToolStart);
          const after = afterStart.substring(closingBraceIdx + 1);
          cliBuffer = before + after;
        }

        if (cliInsideToolBlock) return;

        // Apply stripToolCallXml as safety net
        const cleaned = stripToolCallXml(cliBuffer);
        cliBuffer = "";
        if (cleaned.length > 0) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: cleaned })}\n\n`));
        }
      });

      let stderrData = "";
      geminiProcess.stderr.on("data", (chunk: Buffer) => {
        stderrData += chunk.toString();
      });

      geminiProcess.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else if (code === 55) {
          // Error code 55: "Gemini CLI is not running in a trusted directory"
          // Provide a clear error message instead of the raw stderr
          console.error(`[${requestId}] Gemini CLI trust error (code 55). Workspace: ${cliCwd}`);
          reject(new Error(`Gemini CLI trust error: The directory "${cliCwd}" is not trusted. Please add it to your trusted directories or set GEMINI_CLI_TRUST_WORKSPACE to the correct path.`));
        } else {
          reject(new Error(`CLI error ${code}: ${stderrData.trim()}`));
        }
      });

      geminiProcess.on("error", (err) => {
        reject(err);
      });
    });

    await processComplete;
  }

  return { text: accumulatedText, reasoningContent, nativeFunctionCalls: nativeFunctionCallsResult };
}

export async function POST(req: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[${requestId}] Chat Request Started`);

  try {
    const body = await req.json();
    const {
      model = "gemini-2.0-flash",
      systemPrompt: manualSystemPrompt,
      agentId,
      conversationHistory = [],
      files: rawFiles = [],
      jsonMode = false,
      apiKey,
      workspacePath,
    } = body;
    let { prompt } = body;
    const files = rawFiles;

    console.log(`[${requestId}] Model: ${model}`);
    console.log(`[${requestId}] Prompt Length: ${prompt?.length || 0}`);

    if (!prompt && files.length === 0) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Read attached file contents and prepend to prompt
    let fileContents = "";
    const textExtensions = ["txt", "md", "csv", "json", "js", "ts", "jsx", "tsx", "html", "css", "xml", "yaml", "yml", "toml", "env", "gitignore", "py", "rs", "go", "java", "c", "cpp", "h", "hpp", "sql", "sh", "bat", "ps1", "log", "svg", "tex", "r", "rb", "php", "swift", "kt", "scala", "lua", "pl", "cfg", "ini", "conf", "vue", "svelte"];
    const binaryReadExtensions = ["pdf", "docx", "xlsx", "pptx", "doc", "xls", "ppt", "odt", "ods", "odp"];

    if (files.length > 0) {
      console.log(`[${requestId}] Processing ${files.length} attached file(s)`);
      for (const file of files) {
        try {
          const filePath = path.isAbsolute(file.path) ? file.path : path.join(process.cwd(), "uploads", file.path);
          const ext = path.extname(file.name || file.path).toLowerCase().replace(".", "");
          
          if (!fs.existsSync(filePath)) {
            console.warn(`[${requestId}] File not found: ${filePath}. Trying uploads dir...`);
            // Try alternate path
            const altPath = path.join(process.cwd(), "uploads", path.basename(file.path || ""));
            if (fs.existsSync(altPath)) {
              // Use alt path - will be handled below
            } else {
              fileContents += `\n\n[Attached: ${file.name} (${file.size} bytes, ${file.mimeType})]\n[File not accessible on disk - path: ${filePath}]\n`;
              continue;
            }
          }

          const actualPath = fs.existsSync(filePath) ? filePath : path.join(process.cwd(), "uploads", path.basename(file.path || ""));

          if (textExtensions.includes(ext)) {
            // Text files - read as UTF-8
            const content = fs.readFileSync(actualPath, "utf-8");
            fileContents += `\n\n[File: ${file.name}]\n\`\`\`${ext}\n${content.slice(0, 15000)}\n\`\`\`\n`;
            console.log(`[${requestId}] Read text file: ${file.name} (${content.length} chars)`);
          } else if (binaryReadExtensions.includes(ext)) {
            const buffer = fs.readFileSync(actualPath);
            if (ext === "pdf") {
              const pdfText = await extractPDFText(actualPath);
              if (pdfText && pdfText.trim().length > 0) {
                fileContents += `\n\n[Attached PDF: ${file.name}]\n\`\`\`\n${pdfText.slice(0, 30000)}\n\`\`\`\n`;
              } else {
                const base64 = buffer.toString("base64");
                fileContents += `\n\n[Attached PDF: ${file.name} (${(buffer.length/1024).toFixed(1)}KB)]\nPDF text extraction failed. The file may be scanned/image-based.\n`;
              }
            } else if (ext === "docx") {
              const base64 = buffer.toString("base64");
              fileContents += `\n\n[Attached DOCX: ${file.name}]\nType: ${file.mimeType || ext}\nSize: ${file.size} bytes\n\nThis is a ${ext.toUpperCase()} document. Use Python with python-docx to read text.\nThe file is a ZIP containing XML documents.\nBase64 content (first 4KB): ${base64.slice(0, 4096)}...\n`;
            } else if (ext === "xlsx" || ext === "xls") {
              fileContents += `\n\n[Attached Excel: ${file.name}]\nUse Python with openpyxl or pandas to read data.\n`;
            } else {
              const base64 = buffer.toString("base64");
              fileContents += `\n\n[Attached Document: ${file.name} (${(buffer.length/1024).toFixed(1)}KB)]\nBase64 (first 4KB): ${base64.slice(0, 4096)}...\n`;
            }
          } else if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) {
            // Images - pass as base64 data URL
            const buffer = fs.readFileSync(actualPath);
            const mime = file.mimeType || `image/${ext === "jpg" ? "jpeg" : ext}`;
            const base64 = buffer.toString("base64");
            fileContents += `\n\n[Attached Image: ${file.name}]\nType: ${mime}\nSize: ${file.size} bytes\nDimensions: (image file attached)\n\n![${file.name}](data:${mime};base64,${base64.slice(0, 50000)})\n`;
            console.log(`[${requestId}] Read image: ${file.name} (${buffer.length} bytes)`);
          } else {
            // Unknown type - try UTF-8 first, fall back to base64
            try {
              const content = fs.readFileSync(actualPath, "utf-8");
              if (content.length > 0 && !content.includes("\ufffd")) {
                fileContents += `\n\n[File: ${file.name}]\n\`\`\`${ext || "text"}\n${content.slice(0, 15000)}\n\`\`\`\n`;
              } else {
                throw new Error("Binary content detected");
              }
            } catch {
              const buffer = fs.readFileSync(actualPath);
              const base64 = buffer.toString("base64");
              fileContents += `\n\n[Attached File: ${file.name}]\nType: ${file.mimeType || "unknown"}\nSize: ${file.size} bytes\nContent (base64, first 4KB): ${base64.slice(0, 4096)}...\n`;
            }
            console.log(`[${requestId}] Read unknown file: ${file.name}`);
          }
        } catch (err: any) {
          console.error(`[${requestId}] Failed to read file ${file.name}: ${err.message}`);
          fileContents += `\n\n[Attached: ${file.name}]\nError reading file: ${err.message}\n`;
        }
      }
      // Prepend file contents to prompt
      if (fileContents) {
        prompt = `${fileContents}\n\n${prompt || "Please analyze the attached file(s)."}`;
      }
    }

    // === SMART CONTEXT ENRICHMENT ===
    // Automatically inject relevant code context when the user asks about files or code
    let enrichedContext = "";
    if (workspacePath && !fileContents) {
      const codeKeywords = ["function", "class", "component", "module", "file", "code", "import", "export", "api", "route", "bug", "fix", "error", "implement", "refactor", "debug"];
      const promptLower = (prompt || "").toLowerCase();
      const needsCodeContext = codeKeywords.some(kw => promptLower.includes(kw));
      
      if (needsCodeContext) {
        try {
          // Quick scan for relevant files based on prompt keywords
          const fs = require("fs");
          const pathMod = require("path");
          const baseDir = workspacePath;
          const srcDir = pathMod.join(baseDir, "src");
          if (fs.existsSync(srcDir)) {
            // Find recently modified files as likely context
            const recentFiles: {path: string; mtime: number}[] = [];
            const scanDir = (dir: string, depth: number = 0) => {
              if (depth > 2) return;
              try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                  if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === ".next") continue;
                  const fullPath = pathMod.join(dir, entry.name);
                  if (entry.isDirectory()) scanDir(fullPath, depth + 1);
                  else if (entry.isFile() && /\.(ts|tsx|js|jsx|py|rs|go)$/.test(entry.name)) {
                    try {
                      const stat = fs.statSync(fullPath);
                      recentFiles.push({ path: fullPath.replace(baseDir + "/", ""), mtime: stat.mtimeMs });
                    } catch {}
                  }
                }
              } catch {}
            };
            scanDir(srcDir);
            // Sort by modification time (most recent first)
            recentFiles.sort((a: any, b: any) => b.mtime - a.mtime);
            const topFiles = recentFiles.slice(0, 5).map(f => f.path);
            if (topFiles.length > 0) {
              enrichedContext = `\n\n[Auto-detected recent project files for context: ${topFiles.join(", ")}]`;
            }
          }
        } catch {}
      }
    }
    if (enrichedContext) {
      prompt = `${enrichedContext}\n\n${prompt}`;
    }

    // Agent lookup
    let agentSystemPrompt = "";
    let agentSkills: string[] = [];
    if (agentId) {
      const agent = await db.agent.findUnique({
        where: { id: agentId },
      });
      if (agent) {
        console.log(`[${requestId}] Using Agent: ${agent.name}`);
        agentSystemPrompt = agent.systemPrompt;
        try {
          agentSkills = JSON.parse(agent.skills || "[]");
        } catch (e) {}
      }
    }

    // Environment variables for provider
    let providerEnv: Record<string, string> = {
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      PAGER: "cat"
    };

    // Determine if we should bypass the CLI (custom providers)
    let isCustomProvider = false;
    let providerData: any = null;
    let targetModel = model;

    if (model.includes("/")) {
      const firstSlash = model.indexOf("/");
      const providerSlug = model.substring(0, firstSlash);
      targetModel = model.substring(firstSlash + 1);
      console.log(`[${requestId}] Detected Provider Slug: ${providerSlug}, Model: ${targetModel}`);

      if (providerSlug === "proxima") {
        isCustomProvider = true;
        providerData = {
          name: "Proxima",
          baseUrl: "http://127.0.0.1:3210/v1",
          apiKey: "proxima-local",
          isActive: true
        };
        console.log(`[${requestId}] Routing to Proxima Local Gateway`);
      } else {
        const providers = await getProviders();
        let provider = providers.find(p => {
          const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
          return slug === providerSlug || providerSlug.includes(slug) || slug.includes(providerSlug);
        });

        if (!provider && providerSlug === "deepseek") {
          console.log(`[${requestId}] DeepSeek provider not found in DB, checking Antigravity config...`);
          try {
            const appDataPath = process.env.APPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Roaming");
            const configPath = path.join(appDataPath, "Antigravity", "config.json");
            if (fs.existsSync(configPath)) {
              const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
              const dsConfig = config.customProviders?.deepseek;
              if (dsConfig) {
                provider = {
                  name: "DeepSeek",
                  baseUrl: dsConfig.apiBase || "https://api.deepseek.com/v1",
                  apiKey: dsConfig.apiKey,
                  isActive: true
                } as any;
                console.log(`[${requestId}] Loaded DeepSeek credentials from Antigravity config`);
              }
            }
          } catch (e) {
            console.error(`[${requestId}] Failed to read Antigravity config:`, e);
          }
        }

        if (provider) {
          isCustomProvider = true;
          providerData = provider;
          console.log(`[${requestId}] Mapping Provider: ${provider.name}`);

          // Convert localhost bridge URLs to real API URLs for web bridge providers
          if (provider.baseUrl?.includes("localhost")) {
            const pName = provider.name?.toLowerCase() || "";
            if (pName.includes("deepseek")) providerData.baseUrl = "https://api.deepseek.com/v1";
            else if (pName.includes("kimi") || pName.includes("moonshot")) providerData.baseUrl = "https://api.moonshot.cn/v1";
            else if (pName.includes("qwen")) providerData.baseUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1";
            else if (pName.includes("z.ai") || pName.includes("glm")) providerData.baseUrl = "https://open.bigmodel.cn/api/paas/v4";
            console.log(`[${requestId}] Web bridge: ${provider.baseUrl} → ${providerData.baseUrl}`);
          }

          const envPrefix = provider.name.toUpperCase().replace(/\s+/g, "_");

          providerEnv[`${envPrefix}_API_KEY`] = provider.apiKey || "";
          providerEnv[`${envPrefix}_BASE_URL`] = provider.baseUrl || "";
          providerEnv["OPENAI_API_KEY"] = provider.apiKey || "";
          providerEnv["OPENAI_BASE_URL"] = provider.baseUrl || "";
          providerEnv["API_KEY"] = provider.apiKey || "";
          providerEnv["BASE_URL"] = provider.baseUrl || "";
        }
      }
    }

    // === SMART MODEL FALLBACK ===
    // If the primary model fails, try a fallback model from the same or different provider
    const modelFallbackChain: string[] = [];
    if (targetModel.includes("deepseek")) {
      modelFallbackChain.push("deepseek-chat"); // Fallback from deepseek-reasoner to deepseek-chat
    }
    if (targetModel.includes("qwen")) {
      modelFallbackChain.push("qwen2.5-72b-instruct");
    }
    // Generic fallbacks
    modelFallbackChain.push("gemini-2.0-flash");

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          let currentPrompt = prompt;
          let currentHistory = [...conversationHistory];
          let iteration = 0;
          let totalResponseText = "";
          const allToolCalls: ToolCallResult[] = [];

          const baseSystemPrompt = agentSystemPrompt || manualSystemPrompt || "";
          const assignedSkillsText = agentSkills.length > 0 ? `[Assigned Skills]: ${agentSkills.join(", ")}` : "";
          const basePromptWithSkills = assignedSkillsText ? `${baseSystemPrompt}\n${assignedSkillsText}` : baseSystemPrompt;

          // Auto-route prompt to specialized agent mode
          const routing = routePrompt(prompt || "");
          if (routing.systemPromptAddition) {
            console.log(`[${requestId}] Prompt routed to: ${routing.agentType} mode`);
          }
          const routingAddition = routing.systemPromptAddition || "";

          // Send initial progress event
          controller.enqueue(encoder.encode(createProgressEvent("reasoning", `Analyzing your request... (${routing.agentType || 'general'} mode)`, 5)));

          // === REASONING ENGINE INTEGRATION ===
          // Assess task complexity for dynamic CoT and planning
          const taskComplexity = assessTaskComplexity(prompt || "", conversationHistory.length);

          controller.enqueue(encoder.encode(createProgressEvent("reasoning", `Task complexity: ${taskComplexity}. Planning approach...`, 10)));

          // === SMART TOOL-AWARENESS ===
          // Detect if the task requires specific tools and add targeted guidance
          const toolAwarenessAdditions: string[] = [];
          const promptLower = (prompt || "").toLowerCase();
          
          if (promptLower.includes("website") || promptLower.includes("web page") || promptLower.includes("url")) {
            toolAwarenessAdditions.push("For website analysis, use web_fetch first, then analyze the content thoroughly.");
          }
          if (promptLower.includes("search") || promptLower.includes("find") || promptLower.includes("look up")) {
            toolAwarenessAdditions.push("Use web_search to find information, then web_fetch to get detailed content from relevant URLs.");
          }
          if (promptLower.includes("file") || promptLower.includes("code") || promptLower.includes("project")) {
            toolAwarenessAdditions.push("Use tree_view and list_files to understand the project structure before making changes. Use grep_code to find specific patterns.");
          }
          if (promptLower.includes("bug") || promptLower.includes("fix") || promptLower.includes("error")) {
            toolAwarenessAdditions.push("Use read_file to examine the problematic code, then search_replace for targeted fixes. Verify the fix works afterward.");
          }
          if (promptLower.includes("create") || promptLower.includes("write") || promptLower.includes("build")) {
            toolAwarenessAdditions.push("Plan the structure first, then write files using write_file. Use tree_view to verify the result.");
          }
          
          const toolAwarenessPrompt = toolAwarenessAdditions.length > 0 
            ? `\n[TOOL GUIDANCE]: ${toolAwarenessAdditions.join(" ")}`
            : "";

          // Calculate adaptive max iterations based on task complexity
          let maxIterations = getAdaptiveMaxIterations(taskComplexity, 0, false);
          console.log(`[${requestId}] Task complexity: ${taskComplexity}`);

          // Detect task type and get task-specific enhancements
          const detectedTaskType = detectTaskType(prompt || "");
          const taskEnhancement = getTaskSpecificPromptEnhancement(detectedTaskType);
          console.log(`[${requestId}] Task type: ${detectedTaskType}`);
          
          // Compress conversation history if it's getting long (prevents context overflow)
          // Use smart context management with model-aware truncation
          if (currentHistory.length > 8) {
            const { compressed, tokensSaved } = compressConversationHistory(currentHistory, 6);
            if (tokensSaved > 500) {
              console.log(`[${requestId}] Compressed history: saved ~${tokensSaved} tokens`);
              currentHistory = compressed;
            }
          }
          // Apply smart truncation for model context limits
          const ctxManager = getContextManager();
          const truncationResult = ctxManager.smartTruncate(
            currentHistory.map((m: any) => ({
              id: `hist_${Math.random().toString(36).slice(2)}`,
              role: m.role,
              content: m.content,
              metadata: m.reasoning_content ? { reasoning_content: m.reasoning_content } : undefined,
            })),
            model,
            0, // system prompt tokens are handled separately
            4096
          );
          if (truncationResult.removedCount > 0) {
            console.log(`[${requestId}] Smart truncation: removed ${truncationResult.removedCount} messages, saved ${truncationResult.savedTokens} tokens`);
            currentHistory = truncationResult.messages;
            if (truncationResult.summary) {
              // Prepend summary of removed messages
              currentHistory.unshift({ role: "user", content: truncationResult.summary });
            }
          }

          let lastAssistantText = "";
          const conversationId = (body as any).conversationId || "unknown";
          
          // Track tool results for passing back to the model in the next iteration
          let pendingToolResults: { toolCallId: string; toolName: string; result: string; nativeFunctionCall?: any }[] = [];
          let hasHadSuccessfulToolRun = false;
          // Global tool call ID counter to ensure unique IDs across iterations
          // (Date.now() alone causes duplicates when same tool is called multiple times)
          let toolCallIdCounter = 0;
          const nextToolCallId = (toolName: string) => `call_${toolName}_${requestId}_${++toolCallIdCounter}`;
          // Track assistant content and reasoning content from previous iteration
          let previousAssistantContent: string | undefined;
          let previousReasoningContent: string | undefined;
          // Track the last reasoning content for sending back to client (for DeepSeek thinking models)
          let lastReasoningContent: string = "";
          // Track tool names executed for reflection prompts
          let toolsExecutedNames: string[] = [];
          // Track prompt optimization variation for post-loop recording
          let lastPromptVariationId: string = "baseline";
          // Track the last enhanced system prompt for post-loop critique
          let lastEnhancedSystemPrompt: string = "";
          // Track if any tool had errors for quality scoring
          let hadToolErrors = false;

          // === SEMANTIC CACHE LOOKUP ===
          const cacheResult = semanticCacheLookup(prompt || "", detectedTaskType, model);
          if (cacheResult.hit && cacheResult.response) {
            console.log(`[${requestId}] Semantic cache HIT (similarity: ${cacheResult.similarity?.toFixed(2)})`);
            // Stream the cached response directly
            controller.enqueue(encoder.encode(createProgressEvent("cache_hit", "Found cached response", 50)));
            totalResponseText = cacheResult.response;
            lastAssistantText = cacheResult.response;
            // Skip the entire agent loop
            iteration = maxIterations + 1; // Force exit the while loop
          }

          while (iteration < maxIterations) {
            iteration++;
            console.log(`[${requestId}] Agent Loop Iteration ${iteration}`);

            // Send progress update for agent loop
            const loopProgress = estimateProgress(iteration, maxIterations, allToolCalls.length > 0, false);
            controller.enqueue(encoder.encode(createProgressEvent(
              "streaming",
              `Iteration ${iteration}/${maxIterations} — Processing...`,
              loopProgress
            )));

            const localInstructions = await buildLocalSystemInstructions(taskComplexity, prompt, taskEnhancement);
            // Apply prompt optimization for complex/critical tasks
            const promptOptResult = generateOptimizedPrompt(
              `${basePromptWithSkills}\n\n${localInstructions}\n\n${routingAddition}${toolAwarenessPrompt}`,
              detectedTaskType,
              taskComplexity
            );
            const enhancedSystemPrompt = promptOptResult.prompt;
            // Track for post-loop usage
            lastPromptVariationId = promptOptResult.variationId;
            lastEnhancedSystemPrompt = enhancedSystemPrompt;
            if (promptOptResult.variationId !== "baseline") {
              console.log(`[${requestId}] Prompt optimization: using "${promptOptResult.variationName}" (${promptOptResult.variationId})`);
            }

            const responseResult = await queryLLM(
              model,
              targetModel,
              currentPrompt,
              currentHistory,
              enhancedSystemPrompt,
              isCustomProvider,
              providerData,
              providerEnv,
              apiKey,
              controller,
              encoder,
              requestId,
              // Pass tool results from previous iteration (works for all providers)
              pendingToolResults.length > 0 ? pendingToolResults : undefined,
              previousAssistantContent,
              previousReasoningContent,
              workspacePath
            );
            const responseText = responseResult.text;
            const responseReasoningContent = responseResult.reasoningContent;
            const nativeFunctionCalls = responseResult.nativeFunctionCalls;

            totalResponseText += responseText;

            // Track reasoning content from this response (for DeepSeek thinking models)
            if (responseReasoningContent) {
              lastReasoningContent = responseReasoningContent;
            }
            const toolCallCountBefore = allToolCalls.length;
            const { toolRun, resultSummary } = await parseAndExecuteTools(
              responseText,
              workspacePath,
              controller,
              encoder,
              requestId,
              allToolCalls
            );

            // Record tool performance for learning (reasoning engine)
            for (let i = toolCallCountBefore; i < allToolCalls.length; i++) {
              const tc = allToolCalls[i];
              toolsExecutedNames.push(tc.name);
              const isSuccess = tc.status === "success";
              if (!isSuccess) hadToolErrors = true;
              recordToolPerformance(tc.name, routing.agentType || "general", isSuccess, isSuccess ? 0.8 : 0.2);
            }

            // Send tool execution progress event
            if (toolRun) {
              controller.enqueue(encoder.encode(createProgressEvent(
                "tool_executing",
                `Executed ${toolsExecutedNames.length} tool(s): ${toolsExecutedNames.slice(-3).join(', ')}`,
                estimateProgress(iteration, maxIterations, true, false)
              )));
            }

            if (!toolRun) {
              // Strip tool call markup from the last streamed text so users don't see raw XML/JSON
              const cleanText = stripToolCallXml(responseText);
              lastAssistantText = cleanText;
              
              // Don't break immediately if the model has been running tools
              // and the response looks like it might be incomplete
              const trimmedResponse = cleanText.trim();
              // Detect responses where the model gave up without completing the task
              const gaveUp = trimmedResponse.toLowerCase().includes("i apologize") ||
                trimmedResponse.toLowerCase().includes("i'm unable") ||
                trimmedResponse.toLowerCase().includes("i cannot") ||
                trimmedResponse.toLowerCase().includes("i'm sorry, but") ||
                trimmedResponse.toLowerCase().includes("unfortunately, i") ||
                trimmedResponse.toLowerCase().includes("i don't have access") ||
                (trimmedResponse.toLowerCase().includes("cannot") && trimmedResponse.toLowerCase().includes("complete"));
              const looksIncomplete = (trimmedResponse.length > 0 && trimmedResponse.length < 50 &&
                (trimmedResponse.endsWith(":") || trimmedResponse.endsWith("...") || 
                 trimmedResponse.toLowerCase().includes("let me") || 
                 trimmedResponse.toLowerCase().includes("i'll") ||
                 trimmedResponse.toLowerCase().includes("i will"))) ||
                (gaveUp && hasHadSuccessfulToolRun && iteration < maxIterations);
              
              if (gaveUp && hasHadSuccessfulToolRun && iteration < maxIterations) {
                console.log(`[${requestId}] Model gave up, forcing continuation with alternatives`);
                // Push to history for context tracking, then clear pendingToolResults
                currentHistory.push({ role: "user", content: currentPrompt });
                currentHistory.push({ 
                  role: "assistant", 
                  content: responseText || "",
                  ...(responseReasoningContent ? { reasoning_content: responseReasoningContent } : {})
                });
                pendingToolResults = [];
                previousAssistantContent = undefined;
                previousReasoningContent = undefined;
                currentPrompt = `[CRITICAL] Do NOT give up. The user needs this task completed. Try alternative tools and approaches:
- If web_fetch failed, try web_search with different keywords
- If web_search returned no results, try web_fetch with a direct URL
- If a file was not found, try list_files to find the correct path
- If a command failed, try a different command or built-in tool
You MUST try at least 2 different approaches before providing a partial answer.
IMPORTANT: If you have already generated code but haven't saved it with write_file, you MUST save it now. Your task is not complete until files are saved to the workspace. Continue now.`;
                continue;
              }
              
              if (looksIncomplete && hasHadSuccessfulToolRun && iteration < maxIterations) {
                console.log(`[${requestId}] Response looks incomplete, re-prompting to continue`);
                // Push to history for context tracking, then clear pendingToolResults
                currentHistory.push({ role: "user", content: currentPrompt });
                currentHistory.push({ 
                  role: "assistant", 
                  content: responseText || "",
                  ...(responseReasoningContent ? { reasoning_content: responseReasoningContent } : {})
                });
                pendingToolResults = [];
                previousAssistantContent = undefined;
                previousReasoningContent = undefined;
                currentPrompt = "Please continue with your response. If you were about to use a tool, please do so now. If you have generated code, you MUST save it with write_file. If you have a final answer, please provide it completely. Remember: your task is NOT done until all files are saved to the workspace.";
                continue;
              }
              
              // === QUALITY GATE ===
              // If the response is suspiciously short after tool usage, try one more iteration
              const cleanResponseText = stripToolCallXml(responseText).trim();
              const isLowQuality = hasHadSuccessfulToolRun && cleanResponseText.length < 100 && iteration < maxIterations;
              
              if (isLowQuality) {
                console.log(`[${requestId}] Quality gate: response too short (${cleanResponseText.length} chars), retrying`);
                currentHistory.push({ role: "user", content: currentPrompt });
                currentHistory.push({ 
                  role: "assistant", 
                  content: responseText || "",
                  ...(responseReasoningContent ? { reasoning_content: responseReasoningContent } : {})
                });
                pendingToolResults = [];
                previousAssistantContent = undefined;
                previousReasoningContent = undefined;
                currentPrompt = "Your previous response was too brief. Please provide a comprehensive and detailed answer that fully addresses the original request. Include specific details, analysis, and actionable information. If you generated code, save it with write_file BEFORE providing your explanation.";
                continue;
              }
              
              // Final response (no tool calls) — push to history for context
              currentHistory.push({ role: "user", content: currentPrompt });
              currentHistory.push({ 
                role: "assistant", 
                content: responseText || "",
                ...(responseReasoningContent ? { reasoning_content: responseReasoningContent } : {})
              });
              break;
            }

            hasHadSuccessfulToolRun = true;

            // Dynamically adjust max iterations based on progress
            maxIterations = getAdaptiveMaxIterations(taskComplexity, allToolCalls.length, hadToolErrors);

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: "chunk", 
              content: `\n\n⚙️ **[Executed System Action]**:\n\`\`\`\n${resultSummary}\n\`\`\`\n` 
            })}\n\n`));

            // Build pendingToolResults for the next iteration
            // Only include tool calls from THIS iteration, not all accumulated ones
            pendingToolResults = [];

            // If we have native function calls from the API, match them to results first
            if (nativeFunctionCalls.length > 0) {
              // Match native function calls to tool results by index position
              // This is more reliable than name matching for handling duplicate tool calls
              for (let ni = 0; ni < nativeFunctionCalls.length; ni++) {
                const fc = nativeFunctionCalls[ni];
                const toolIdx = toolCallCountBefore + ni;
                const matchingResult = (toolIdx < allToolCalls.length) ? allToolCalls[toolIdx] : undefined;
                pendingToolResults.push({
                  toolCallId: nextToolCallId(fc.name),
                  toolName: fc.name,
                  result: matchingResult?.result || "{}",
                  nativeFunctionCall: fc,
                });
              }
            }

            // Add remaining tool results from this iteration that weren't matched to native calls
            // Use the count of native calls to know how many were already consumed
            const nativeCallsConsumed = nativeFunctionCalls.length;
            for (let i = toolCallCountBefore + nativeCallsConsumed; i < allToolCalls.length; i++) {
              const tc = allToolCalls[i];
              pendingToolResults.push({
                toolCallId: nextToolCallId(tc.name),
                toolName: tc.name,
                result: tc.result,
                nativeFunctionCall: { name: tc.name, args: tc.arguments },
              });
            }

            // Track assistant content and reasoning content for next iteration
            previousAssistantContent = stripToolCallXml(responseText) || "";
            previousReasoningContent = responseReasoningContent || undefined;

            // CRITICAL: Do NOT push user or assistant messages to currentHistory when there are tool calls.
            // The pendingToolResults mechanism handles both the assistant message (with tool_calls + reasoning_content)
            // and the user continuation prompt in the correct format for OpenAI/Gemini APIs.
            // Pushing the user message here causes DUPLICATE user messages across iterations:
            //   Iteration N: currentHistory gets user:promptN → Iteration N+1: queryLLM adds user:promptN+1
            //   → model sees: ...user:promptN, user:promptN+1, assistant(tool_calls), tool(results), user:continuation
            //   where promptN and promptN+1 are consecutive user messages without an intervening assistant — INVALID!
            // Instead, queryLLM already adds the continuation prompt as the final user message (line 614).
            // We only push user+assistant to history when there are NO pending tool results (handled in the !toolRun paths).

            // Use a structured continuation prompt with self-reflection from the reasoning engine.
            // The tool results are provided via pendingToolResults for API providers.
            // For Gemini CLI, the tool results are included in the prompt text by the queryLLM function.
            const reflectionPrompt = generateReflectionPrompt(
              prompt || "",
              toolsExecutedNames,
              resultSummary.substring(0, 500),
              iteration,
              maxIterations
            );
            currentPrompt = `[SYSTEM INSTRUCTION — MANDATORY COMPLIANCE]
${reflectionPrompt}

RULES:
1. If a tool succeeded → Analyze the result and take the NEXT step toward completing the user's task. Do NOT just summarize the result.
2. If a tool failed → Try an ALTERNATIVE approach immediately. For example:
   - web_search failed → Try web_fetch with a specific URL
   - web_fetch failed → Try web_search with different keywords
   - read_file not found → Use list_files or tree_view to find the correct path
   - http_request failed → Try web_fetch or different headers
   - Any tool error → Use a different tool or different parameters
3. If the task requires multiple steps → CONTINUE executing tools until COMPLETE.
4. NEVER respond with "I apologize" or "I cannot" or "I'm unable" without trying at least 2 alternative approaches first.
5. If you have gathered enough information, provide a COMPLETE, DETAILED final answer.
6. Before responding, verify: Does my answer fully address the original request? Would an expert accept this?
7. CRITICAL: If the user asked you to CREATE, BUILD, CODE, or DEVELOP something, you MUST save all files using write_file before responding. Your task is NOT complete until files are saved to disk.
8. If you generated code but haven't saved it yet, use write_file NOW to save it to the workspace.
9. For multi-file projects, write ALL remaining files using write_file calls.
10. After saving files, verify them by reading back with read_file.

The user's ORIGINAL request must be FULLY completed. Continue now.`;
          }

          const promptContext = [
            basePromptWithSkills,
            getToolsPrompt(),
            ...conversationHistory.map((m: any) => m.content),
            prompt,
          ].join(" ");
          const promptTokens = countTokens(promptContext);
          const completionTokens = countTokens(totalResponseText);
          const totalTokens = promptTokens + completionTokens;
          const { cost } = estimateCost(model, promptTokens, completionTokens);

          // === REASONING ENGINE: Quality Scoring ===
          const qualityScore = scoreResponseQuality(
            prompt || "",
            totalResponseText,
            allToolCalls.length,
            hadToolErrors
          );
          console.log(`[${requestId}] Quality Score: ${qualityScore.overall} (${qualityScore.completeness} completeness, ${qualityScore.depth} depth)`);

          // === SEMANTIC CACHE STORE ===
          if (totalResponseText.trim().length > 100) {
            const cleanedForCache = stripToolCallXml(totalResponseText).trim();
            if (cleanedForCache.length > 100) {
              try {
                semanticCacheStore(
                  prompt || "",
                  cleanedForCache,
                  model,
                  isCustomProvider ? providerData?.name : "gemini",
                  detectedTaskType,
                  qualityScore?.overall ? qualityScore.overall / 100 : 0.5,
                  promptTokens + completionTokens
                );
              } catch (err) {
                console.error(`[${requestId}] Cache store failed:`, err);
              }
            }
          }

          // === RESPONSE ENHANCEMENT ===
          // Analyze the response for type, confidence, follow-ups, and warnings
          controller.enqueue(encoder.encode(createProgressEvent("enhancing", "Enhancing response...", 95)));
          const enhancement = enhanceResponse(
            stripToolCallXml(totalResponseText),
            prompt || "",
            allToolCalls.length,
            hadToolErrors
          );

          // Record prompt optimization result for learning
          recordPromptResult(lastPromptVariationId, qualityScore.overall, qualityScore.overall >= 40);

          // === ENHANCEMENT: Response Quality Self-Critique ===
          // If quality score is below threshold and we haven't retried yet, attempt one more iteration
          // with a self-critique prompt that includes specific improvement suggestions
          const QUALITY_THRESHOLD = 40;
          const cleanedResponseText = stripToolCallXml(totalResponseText).trim();
          if (qualityScore.overall < QUALITY_THRESHOLD && cleanedResponseText.length > 50 && iteration <= maxIterations) {
            console.log(`[${requestId}] Self-critique: quality score ${qualityScore.overall} < ${QUALITY_THRESHOLD}, attempting improvement`);
            
            const critiquePrompt = `[SELF-CRITIQUE — IMPROVE YOUR RESPONSE]
Your previous response scored ${qualityScore.overall}/100 on quality. Here's what needs improvement:
- Completeness: ${qualityScore.completeness}/100 ${qualityScore.completeness < 50 ? "(CRITICAL: Your answer is incomplete. Address ALL parts of the request.)" : ""}
- Depth: ${qualityScore.depth}/100 ${qualityScore.depth < 50 ? "(Your answer is too shallow. Provide more details, examples, and analysis.)" : ""}
- Tool Usage: ${allToolCalls.length > 0 ? 'Tools were used' : 'No tools were used — consider using relevant tools to gather information'}
${hadToolErrors ? "- Some tools had errors — try alternative approaches" : ""}

The user's ORIGINAL request: "${(prompt || "").slice(0, 500)}"

Your previous response (for reference):
---
${cleanedResponseText.slice(0, 2000)}
---

IMPROVEMENT INSTRUCTIONS:
1. If the response was incomplete, address the MISSING parts specifically
2. If the response was too shallow, add depth with specific data, examples, or analysis
3. If tools could provide better information, USE them now
4. Make sure your improved response FULLY addresses the original request
5. Provide a COMPLETE, DETAILED final answer

Provide your improved response now:`;

            try {
              const critiqueResult = await queryLLM(
                model,
                targetModel,
                critiquePrompt,
                currentHistory,
                lastEnhancedSystemPrompt,
                isCustomProvider,
                providerData,
                providerEnv,
                apiKey,
                controller,
                encoder,
                requestId,
                undefined, // No pending tool results for critique
                undefined,
                undefined,
                workspacePath
              );
              
              const critiqueText = stripToolCallXml(critiqueResult.text).trim();
              if (critiqueText.length > cleanedResponseText.length * 0.5) {
                // The improved response is substantial enough to use
                totalResponseText += "\n\n" + critiqueResult.text;
                if (critiqueResult.reasoningContent) {
                  lastReasoningContent = critiqueResult.reasoningContent;
                }
                console.log(`[${requestId}] Self-critique produced improved response (${critiqueText.length} chars)`);
              }
            } catch (critiqueError) {
              console.error(`[${requestId}] Self-critique failed:`, critiqueError);
              // Non-critical — continue with original response
            }
          }

          extractMemoriesFromText(
            totalResponseText,
            model,
            targetModel,
            isCustomProvider,
            providerData,
            providerEnv,
            apiKey,
            conversationId
          ).catch((err) => console.error("[Memory Extraction Failed]:", err));

          // Include reasoning_content in the done event so the client can save it in metadata
          // This is required by DeepSeek thinking models: "reasoning_content must be passed back"
          controller.enqueue(encoder.encode(createProgressEvent("complete", "Done!", 100)));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: "done", 
            duration: 0, 
            tokens: { prompt: promptTokens, completion: completionTokens, total: totalTokens }, 
            cost, 
            toolCalls: allToolCalls, 
            qualityScore,
            taskComplexity,
            toolsUsed: toolsExecutedNames,
            enhancement: {
              confidence: enhancement.confidence,
              responseType: enhancement.responseType,
              followUps: enhancement.followUps,
              warnings: enhancement.warnings,
              verifiableClaims: enhancement.verifiableClaims,
            },
            ...(lastReasoningContent ? { reasoningContent: lastReasoningContent } : {}) 
          })}\n\n`));
          controller.close();
        } catch (error: unknown) {
          console.error(`[${requestId}] Stream Error:`, error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    console.error(`[${requestId}] Fatal API Error:`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
