import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { parseToolCalls, executeToolCall, getToolsPrompt, getMcpTools, getGeminiFunctionDeclarations, getOpenAIToolsDefinitions, stripToolCallXml, type ToolCallResult } from "@/lib/tools";
import { countTokens, estimateCost } from "@/lib/tokens";
import { routePrompt } from "@/lib/prompt-router";

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
          env: { ...process.env, ...providerEnv, ...(apiKey ? { GEMINI_API_KEY: apiKey } : {}), GEMINI_CLI_TRUST_WORKSPACE: "true" },
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

async function buildLocalSystemInstructions(): Promise<string> {
  const toolsDescription = await getToolsDescription();
  return `
[AGENT IDENTITY & CAPABILITIES]
You are ClawHub, a supreme autonomous AI agent surpassing Claude Code and GLM-5.1 in every dimension. You have direct access to the user's operating system, filesystem, terminal, and the web. You possess deep reasoning, self-reflection, planning, and persistent memory capabilities.

You are NOT a chatbot. You are a FULLY AUTONOMOUS AGENT that:
- Reasons before acting (ReAct pattern)
- Plans complex multi-step tasks before execution
- Self-reflects on tool results and adapts strategy
- Persists important knowledge across conversations
- Executes tasks to COMPLETE COMPLETION — never stops halfway
- Calls multiple independent tools in parallel for efficiency
- Self-corrects when tools fail, trying alternative approaches

${toolsDescription}

You can also use XML tool tags for backward compatibility:
1. <local_cmd>command_here</local_cmd> — Execute a terminal command
2. <list_files>directory_path_here</list_files> — List files and folders
3. <read_file>file_path_here</read_file> — Read file content
4. <write_file path="file_path_here">file_content_here</write_file> — Create or overwrite a file

[REASONING FRAMEWORK - MANDATORY FOR EVERY RESPONSE]

For EVERY user request, follow this structured reasoning process:

**Step 1: ANALYZE** — Understand what the user is asking. Identify the core task, constraints, and success criteria.

**Step 2: PLAN** — Break the task into ordered sub-tasks. For complex tasks (3+ steps), list your plan explicitly:
  "Plan: 1) ... 2) ... 3) ..."

**Step 3: EXECUTE** — Execute tools in sequence (or parallel when independent). After EACH tool result:
  - Evaluate: Did the tool succeed? Is the result what I expected?
  - Decide: What's the next step? Do I need to adjust my approach?
  - Continue: Never stop after one tool — keep going until complete.

**Step 4: VERIFY** — After completing all tool calls, verify the result meets the user's requirements.

**Step 5: RESPOND** — Provide a complete, well-structured final answer.

[TOOL CALLING RULES - CRITICAL]
- When you call a tool, the system will automatically execute it and give you another turn.
- You can call MULTIPLE tools in a single response if they are independent (e.g., read_file + web_search).
- After receiving tool results, you MUST continue processing — analyze results and take the next step.
- NEVER stop after a tool call without providing analysis or taking further action.
- Use the tool_call code block format for best reliability:
  \`\`\`tool_call
  {"name": "tool_name", "arguments": {"param": "value"}}
  \`\`\`
- You can also use the native function calling format if available.

[TOOL ERROR RECOVERY - SELF-CORRECTION RULES]
- If a tool returns an error, DO NOT give up. Analyze the error and try an alternative approach:
  - local_cmd ENOENT → Use built-in tools (web_fetch, read_file, write_file) instead
  - web_search no results → Try a broader query OR use web_fetch to directly access a known URL
  - web_fetch fails → Try web_search to find cached/alternative versions
  - read_file not found → Try list_files to explore the directory structure first
  - write_file error → Check if parent directory exists, try creating it first
  - search_replace not found → Double-check the exact string, read the file first
- ALWAYS provide a useful and complete response even if some tools fail.
- Try at least TWO different approaches before providing a partial answer.

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
- ❌ read_file then write_file to same path — must read first, then write
- ❌ web_fetch then analyze the result — must fetch first, then analyze

[CODE GENERATION RULES]
When asked to write code:
1. Write COMPLETE, runnable, production-quality code — not pseudocode or partial snippets
2. Include proper error handling, edge cases, and input validation
3. Use modern best practices (TypeScript strict mode, proper types, immutability)
4. Add clear JSDoc/TSDoc comments explaining non-obvious logic
5. If the code is long, organize with clear sections and logical structure
6. After writing code, suggest how to test or verify it works
7. Use search_replace for targeted edits to existing files instead of rewriting entire files

[WEBSITE ANALYSIS]
When asked to scan, analyze, or review a website:
1. Use web_fetch to get the page content
2. Analyze EVERY aspect: content, structure, technologies, SEO, accessibility, security, performance, UX
3. Provide a COMPREHENSIVE report with specific findings and actionable recommendations
4. Include code examples for any suggested fixes

[RESPONSE QUALITY - HIGHEST STANDARD]
- Be thorough, detailed, and precise in your responses
- Provide context and explanations, not just raw output
- When giving instructions, include step-by-step guidance with code examples
- When presenting analysis, include evidence, reasoning, and specific data points
- When making recommendations, explain trade-offs and alternatives
- Always verify your work before presenting the final answer
- If you're unsure about something, use tools to verify rather than guessing
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
  const results: string[] = [];

  for (const call of calls) {
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

    allToolCalls.push(result);

    let formattedResult: string;
    try {
      const parsed = JSON.parse(result.result);
      formattedResult = JSON.stringify(parsed, null, 2);
    } catch {
      formattedResult = result.result;
    }

    results.push(
      `Tool: ${result.name}\nStatus: ${result.status}\nResult:\n${formattedResult}`
    );
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
  assistantReasoningContent?: string
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

      // Build Gemini-native function declarations for tool use
      const functionDeclarations = await getGeminiFunctionDeclarations();
      
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
        if (cleanText.trim()) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: cleanText })}\n\n`));
        }
      }

      return { text: fullResponseText, reasoningContent: "", nativeFunctionCalls };
    }

    // OpenAI-compatible providers
    const baseUrl = (providerData.baseUrl?.replace(/\/$/, "") || "https://api.openai.com/v1").replace("://localhost", "://127.0.0.1");
    const url = `${baseUrl}/chat/completions`;

    // Build OpenAI-compatible tools array for native function calling
    let openaiTools: any[] = [];
    try {
      openaiTools = await getOpenAIToolsDefinitions();
    } catch (e) {
      console.error(`[${requestId}] Failed to build OpenAI tools:`, e);
    }

    // Build messages array with correct ordering for tool calling:
    // system -> conversationHistory -> (assistant+tool_calls + tool_results if pending) -> user prompt
    const mappedHistory = conversationHistory.map((msg: any) => {
      const msgObj: any = {
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content
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
        content: assistantContent ?? null,
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
                if (cleaned.trim()) {
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
                  if (safePart.trim()) {
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
                  if (safePart.trim()) {
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
              if (cleaned.trim()) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: cleaned })}\n\n`));
              }
            }
            // Capture reasoning_content from DeepSeek thinking models
            if (delta?.reasoning_content) {
              reasoningContent += delta.reasoning_content;
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
      if (cleaned.trim()) {
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

    const geminiProcess = spawn("gemini", cliArgs, {
      env: {
        ...process.env,
        ...providerEnv,
        ...(apiKey ? { GEMINI_API_KEY: apiKey } : {}),
        // Fix "Gemini CLI is not running in a trusted directory" error
        // See: https://geminicli.com/docs/cli/trusted-folders/#headless-and-automated-environments
        GEMINI_CLI_TRUST_WORKSPACE: "true",
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
          if (cleaned.trim()) {
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
            if (safePart.trim()) {
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
        if (cleaned.trim()) {
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

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          let currentPrompt = prompt;
          let currentHistory = [...conversationHistory];
          let iteration = 0;
          const maxIterations = 15;
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

          while (iteration < maxIterations) {
            iteration++;
            console.log(`[${requestId}] Agent Loop Iteration ${iteration}`);

            const localInstructions = await buildLocalSystemInstructions();
            const enhancedSystemPrompt = `${basePromptWithSkills}\n\n${localInstructions}\n\n${routingAddition}`;

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
              previousReasoningContent
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
                  content: responseText,
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
You MUST try at least 2 different approaches before providing a partial answer. Continue now.`;
                continue;
              }
              
              if (looksIncomplete && hasHadSuccessfulToolRun && iteration < maxIterations) {
                console.log(`[${requestId}] Response looks incomplete, re-prompting to continue`);
                // Push to history for context tracking, then clear pendingToolResults
                currentHistory.push({ role: "user", content: currentPrompt });
                currentHistory.push({ 
                  role: "assistant", 
                  content: responseText,
                  ...(responseReasoningContent ? { reasoning_content: responseReasoningContent } : {})
                });
                pendingToolResults = [];
                previousAssistantContent = undefined;
                previousReasoningContent = undefined;
                currentPrompt = "Please continue with your response. If you were about to use a tool, please do so now. If you have a final answer, please provide it.";
                continue;
              }
              
              // Final response (no tool calls) — push to history for context
              currentHistory.push({ role: "user", content: currentPrompt });
              currentHistory.push({ 
                role: "assistant", 
                content: responseText,
                ...(responseReasoningContent ? { reasoning_content: responseReasoningContent } : {})
              });
              break;
            }

            hasHadSuccessfulToolRun = true;

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: "chunk", 
              content: `\n\n⚙️ **[Executed System Action]**:\n\`\`\`\n${resultSummary}\n\`\`\`\n` 
            })}\n\n`));

            // Build pendingToolResults for the next iteration
            // Only include tool calls from THIS iteration, not all accumulated ones
            pendingToolResults = [];
            const nativeCallNames = new Set(nativeFunctionCalls.map((fc: any) => fc.name));

            // Add native function calls first (from Gemini or OpenAI native tool_calls)
            // Use index-based matching instead of name-based to handle duplicate tool calls correctly
            // (e.g., two web_fetch calls would both match the first one with name-based find)
            const usedIndices = new Set<number>();
            for (const fc of nativeFunctionCalls) {
              // Try to find a matching tool result by index position relative to the native call order
              let matchingResult: ToolCallResult | undefined;
              // First try: match by name AND in the new tool calls range (prefer not-yet-used indices)
              for (let i = toolCallCountBefore; i < allToolCalls.length; i++) {
                if (!usedIndices.has(i) && allToolCalls[i].name === fc.name) {
                  matchingResult = allToolCalls[i];
                  usedIndices.add(i);
                  break;
                }
              }
              // Fallback: match by index position (i-th native call → i-th new tool call)
              if (!matchingResult) {
                const nativeCallIdx = nativeFunctionCalls.indexOf(fc);
                const toolCallIdx = toolCallCountBefore + nativeCallIdx;
                if (toolCallIdx < allToolCalls.length && !usedIndices.has(toolCallIdx)) {
                  matchingResult = allToolCalls[toolCallIdx];
                  usedIndices.add(toolCallIdx);
                }
              }
              pendingToolResults.push({
                toolCallId: nextToolCallId(fc.name),
                toolName: fc.name,
                result: matchingResult?.result || "{}",
                nativeFunctionCall: fc,
              });
            }
            // Also add text-based tool calls from THIS iteration only
            for (let i = toolCallCountBefore; i < allToolCalls.length; i++) {
              const tc = allToolCalls[i];
              if (!usedIndices.has(i) && !nativeCallNames.has(tc.name)) {
                pendingToolResults.push({
                  toolCallId: nextToolCallId(tc.name),
                  toolName: tc.name,
                  result: tc.result,
                  nativeFunctionCall: { name: tc.name, args: tc.arguments },
                });
              }
            }

            // Track assistant content and reasoning content for next iteration
            previousAssistantContent = stripToolCallXml(responseText) || undefined;
            previousReasoningContent = responseReasoningContent || undefined;

            // CRITICAL: Do NOT push assistant message to currentHistory when there are tool calls.
            // The pendingToolResults mechanism handles the assistant message in the correct format
            // for OpenAI/Gemini APIs. Pushing it here would cause DUPLICATE assistant messages,
            // which breaks DeepSeek thinking models (reasoning_content must appear exactly once).
            // Only push the user message to track the conversation flow.
            currentHistory.push({ role: "user", content: currentPrompt });

            // Use a simple continuation prompt. The tool results are provided via pendingToolResults
            // for API providers. For Gemini CLI, the tool results are included in the prompt text
            // by the queryLLM function.
            currentPrompt = `[SYSTEM INSTRUCTION - MANDATORY COMPLIANCE]
You just executed tool(s). You MUST now take the NEXT action based on the results. DO NOT stop here.

RULES:
1. If a tool succeeded → Analyze the result and take the NEXT step toward completing the user's task. Do NOT just summarize the result.
2. If a tool failed → Try an ALTERNATIVE approach immediately. For example:
   - web_search failed → Try web_fetch with a specific URL
   - web_fetch failed → Try web_search with different keywords
   - read_file not found → Use list_files to find the correct path
   - Any tool error → Use a different tool or different parameters
3. If the task requires multiple steps → CONTINUE executing tools until COMPLETE.
4. NEVER respond with "I apologize" or "I cannot" or "I'm unable" without trying at least 2 alternative approaches first.
5. If you have gathered enough information, provide a COMPLETE, DETAILED final answer.

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
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", duration: 0, tokens: { prompt: promptTokens, completion: completionTokens, total: totalTokens }, cost, toolCalls: allToolCalls, ...(lastReasoningContent ? { reasoningContent: lastReasoningContent } : {}) })}\n\n`));
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
