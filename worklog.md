# ClawHub Desktop - Work Log

## Date: 2026-05-23

---

## Bug Fixes

### Bug 1: DeepSeek reasoning_content passthrough
**Status**: ✅ Fixed

**Issue**: The `reasoning_content` from DeepSeek thinking models was being lost when the client regenerated a response, because the `handleRegenerate` function in ChatWindow.tsx didn't save `reasoning_content` in the message metadata.

**Fix**:
- **ChatWindow.tsx** (line 213): Added `reasoning_content` to the metadata in the `handleRegenerate` function's `done` event handler, matching the pattern already used in ChatInput.tsx:
  ```typescript
  metadata: { model, duration, data.duration, tokens: data.tokens, cost: data.cost, 
    ...(data.reasoningContent ? { reasoning_content: data.reasoningContent } : {}) }
  ```

**Verified existing implementations** (all correct):
- route.ts line 556-559: `mappedHistory` handles `reasoning_content` from conversation history ✅
- route.ts line 590-593: assistant message includes `reasoning_content` when pending tool results exist ✅
- route.ts line 744-748: streaming delta captures `reasoning_content` and now streams it to client ✅
- route.ts lines 1388-1391, 1429-1432, 1442-1445: conversation history pushes include `reasoning_content` ✅
- route.ts line 1576: done event includes `reasoningContent` ✅
- ChatInput.tsx line 444: done event handler saves `reasoning_content` in metadata ✅
- ChatInput.tsx lines 239-250: passes `reasoning_content` back in conversation history ✅

---

### Bug 2: Agent loop duplicate user messages when pendingToolResults exist
**Status**: ✅ Fixed

**Issue**: When `pendingToolResults.length > 0` (i.e., the agent loop is continuing after tool calls), line 1503 pushed the continuation prompt to `currentHistory`. However, the `queryLLM` function ALSO adds the prompt as a user message at line 614 (`messages.push({ role: "user", content: prompt })`). This caused consecutive user messages without intervening assistant messages across iterations:

```
Iteration 1: currentHistory gets user:prompt1
Iteration 2: queryLLM sees [...history, user:prompt1, user:continuationPrompt, assistant(tool_calls), tool(results), user:prompt2]
→ Two consecutive user messages (prompt1, continuationPrompt) without assistant between them — INVALID!
```

**Fix**: Removed the `currentHistory.push({ role: "user", content: currentPrompt })` call at line 1503 when there are tool calls. The `pendingToolResults` mechanism already handles the conversation structure correctly for OpenAI/Gemini APIs. Only the `!toolRun` paths (lines 1386, 1407, 1427, 1441) should push user+assistant to history since those don't use `pendingToolResults`.

---

### Bug 3: Artifacts panel shows raw JSON instead of rendered preview
**Status**: ✅ Fixed

**Issue**: 
1. The `isJustToolData` check only checked the START of content, so tool call JSON appearing after other text could still create artifact tabs
2. When the `done` event updated website-type tabs, it overwrote the raw JSON content with stripped content, breaking the WebsiteView parser
3. The WebsiteView component had limited JSON extraction patterns for web_fetch results

**Fixes**:
- **ChatInput.tsx** (lines 299-315): Enhanced `isJustToolData` with `strippedOfAllToolData` check — after stripping ALL tool JSON patterns, if the remaining content is less than 30 characters, skip artifact detection
- **ChatInput.tsx** (lines 428-448): When the `done` event updates artifact tabs, website-type tabs are no longer overwritten with stripped content — they keep their raw JSON for WebsiteView to parse correctly
- **ArtifactPreviewPanel.tsx** (lines 499-512): Enhanced the JSON extraction in WebsiteView with multiple patterns (textContent, url+title, html content) for more robust web_fetch result parsing

---

### Bug 4: Gemini CLI trusted directory error 55
**Status**: ✅ Fixed

**Issue**: The `GEMINI_CLI_TRUST_WORKSPACE` environment variable was set to `"true"`, but newer Gemini CLI versions require the actual workspace path. Additionally, error code 55 (trust error) was not handled with a user-friendly message.

**Fixes**:
- **route.ts** (line 137): Changed `GEMINI_CLI_TRUST_WORKSPACE` from `"true"` to `os.homedir()` for the memory extraction CLI process
- **route.ts** (line 856): Changed `GEMINI_CLI_TRUST_WORKSPACE` from `"true"` to `cliCwd` (the actual workspace path) for the main CLI process
- **route.ts** (line 858): Added `GEMINI_SANDBOX: "false"` as a fallback for trust issues
- **route.ts** (lines 931-935): Added specific handling for error code 55 with a clear error message explaining the trust directory issue

---

## Enhancement Features

### Enhancement 1: Smart Context Window Management
**Status**: ✅ Implemented

**File**: `/home/z/my-project/src/lib/context-manager.ts` (enhanced existing file)

**Features added**:
- `MODEL_CONTEXT_WINDOWS` lookup table with context sizes for Gemini, OpenAI, Anthropic, DeepSeek, and Qwen models
- `getContextWindowSize(model)`: Returns context window size with fuzzy matching for model name variants
- `getMaxPromptTokens(model, reservedForCompletion)`: Calculates safe prompt token budget (75% of context window)
- `classifyMessages(messages)`: Priority-based message classification (system > critical > recent > tool_result > older)
- `smartTruncate(messages, model, systemPromptTokens, reservedForCompletion)`: Intelligently truncates conversation history preserving important context, with summary generation for removed messages

**Integration**: Integrated into the chat route's conversation history management (line 1298-1318)

---

### Enhancement 2: Multi-Model Consensus for Critical Tasks
**Status**: ✅ Implemented

**File**: `/home/z/my-project/src/app/api/consensus/route.ts` (enhanced existing file)

**Features added**:
- `scoreResponse(content, prompt)`: Quality scoring heuristics for comparing model outputs
- `compareResponses(primary, verification, prompt)`: Identifies disagreements between model responses and merges insights
- `extractClaims(text)`: Extracts key factual claims from text for comparison
- `isSimilar(a, b)`: Jaccard similarity-based text comparison
- **Verify mode** (`mode: "verify"`): Compares primary and verification models, returns merged content with identified disagreements
- **Consensus mode** (default): Returns all results ranked by quality score with best model recommendation
- Added `qualityScore` field to ConsensusResult
- Added `VerificationResult` interface with `verified`, `primaryScore`, `verificationScore`, `mergedContent`, `disagreement` fields

---

### Enhancement 3: Self-Improving Prompt Optimization
**Status**: ✅ Implemented

**File**: `/home/z/my-project/src/lib/prompt-optimizer.ts` (new file)

**Features**:
- `PROMPT_VARIATIONS` library with 7 tested variations across categories: CoT, planning, reflection, tool_guidance, quality
- `getBestPromptVariation(taskType, complexity)`: Selects optimal prompt variation based on task complexity and historical performance
- `recordPromptResult(variationId, qualityScore, success)`: Records results for learning
- `getOptimizationStats()`: Returns stats for all variations sorted by average score
- `generateOptimizedPrompt(basePrompt, taskType, complexity)`: Generates an optimized system prompt combining base + best variation
- `abTestPrompt(basePrompt, variationId, testProbability)`: A/B testing with random assignment
- Database persistence via `persistResult()` and `loadOptimizationHistory()`

**Integration**: Integrated into the chat route's agent loop (lines 1345-1354) — prompt optimization is applied per iteration based on task complexity

---

### Enhancement 4: Intelligent Tool Selection
**Status**: ✅ Implemented

**File**: `/home/z/my-project/src/lib/intelligent-tool-selection.ts` (new file)

**Features**:
- `TOOL_PROFILES` with 15 tool definitions including keywords, categories, and estimated token costs
- `scoreToolRelevance(prompt)`: Scores each tool's relevance based on prompt keyword matching
- `selectRelevantTools(prompt, minRelevanceScore, maxTools)`: Selects relevant tools with universal tools always included
- `getFilteredOpenAITools(prompt, maxTools)`: Returns filtered OpenAI tool definitions
- `getFilteredGeminiFunctions(prompt, maxTools)`: Returns filtered Gemini function declarations
- `getFilteredToolsPrompt(prompt, fullToolsPrompt)`: Returns a filtered tools prompt text

**Key design decisions**:
- Universal tools (web_search, read_file, write_file, list_files, local_cmd) are always included
- Multi-word keyword matches get higher scores than single-word matches
- Category-level matching provides a baseline relevance signal
- Falls back to all tools if filtering results in zero matches

---

### Enhancement 5: Response Quality Self-Critique
**Status**: ✅ Implemented

**File**: Integrated into `/home/z/my-project/src/app/api/gemini/chat/route.ts` (lines 1604-1668)

**Features**:
- After the agent loop completes, the quality score is evaluated against a threshold (40/100)
- If below threshold, a self-critique prompt is generated with specific improvement suggestions:
  - Completeness score and whether the answer is incomplete
  - Depth score and whether the answer is too shallow
  - Tool usage feedback
  - Error recovery suggestions
- The model gets one additional LLM call with the critique prompt
- The improved response is appended to the total response only if it's substantial (>50% of original length)
- Critique failures are non-critical — the original response is preserved

---

### Enhancement 6: Streaming Reasoning Display
**Status**: ✅ Implemented

**Files modified**:
- **route.ts** (lines 744-748): Added streaming of `reasoning_content` as `type: "reasoning"` events to the client
- **stores.ts**: Added `streamingReasoning`, `appendStreamingReasoning`, and `clearStreamingReasoning` to the chat store
- **ChatInput.tsx** (lines 340-342): Added handler for `type: "reasoning"` events that appends to `streamingReasoning` state
- **ChatWindow.tsx** (lines 331-352): Added a collapsible "Thinking..." indicator that:
  - Shows when `streamingReasoning` is present and generation is in progress
  - Displays an orange pulsing dot with "Thinking..." label
  - Shows character count of reasoning content
  - Has a collapsible `<details>` element showing the last 1000 characters of reasoning
  - Uses orange accent color to distinguish from normal generation

---

## Summary

| Category | Count | Status |
|----------|-------|--------|
| Bug Fixes | 4 | ✅ All fixed |
| Enhancements | 6 | ✅ All implemented |
| New Files | 2 | prompt-optimizer.ts, intelligent-tool-selection.ts |
| Modified Files | 6 | route.ts, ChatInput.tsx, ChatWindow.tsx, stores.ts, context-manager.ts, consensus/route.ts, ArtifactPreviewPanel.tsx |

---

## Date: 2026-05-24

---

### Phase 2-3: Complete Feature Implementation

**Status**: ✅ All Phases Complete

#### P1 Phase: Semantic Cache + Conversation Recovery + Multi-Tab Artifact + Swarm Intelligence

1. **Semantic Cache Integration** — Already integrated into gemini/chat/route.ts:
   - Cache lookup before agent loop (line ~1440)
   - Cache store after agent loop (line ~1733)
   - Similarity-based matching (Jaccard + bigram + substring)
   - Per-task-type TTL (research: 1hr, coding: 10min, creative: never)

2. **Conversation State Recovery** — Enhanced with client-side persistence:
   - `saveUIState()` — localStorage-based UI state persistence
   - `restoreUIState()` — Recover UI state after crash/refresh (24hr TTL)
   - `clearUIState()` — Clean up on new conversation
   - `autoSaveConversation()` — Server-side conversation backup

3. **Multi-Tab Artifact Viewer** — Major ArtifactPreviewPanel.tsx enhancements:
   - Version History dropdown with rollback support
   - Export system with format detection and one-click download
   - Enhanced tab bar with type icons, streaming indicators, close-on-hover
   - Artifact type indicator bar below tabs

4. **Swarm Intelligence** — New features in swarm-engine.ts (~500 lines added):
   - `routeToSpecialist()` — Capability-based agent selection with scoring
   - `selfHealSwarm()` — Auto-detect degraded agents, reassign tasks, promote new queen
   - `shareKnowledge()` / `queryKnowledge()` — Cross-agent knowledge sharing
   - `weightedConsensus()` — Expertise-weighted voting for consensus decisions
   - New API route: `/api/swarm/[id]/intelligence`

#### P2 Phase: Monaco Editor + WebSocket + Agent Memory

5. **Monaco Editor** — Professional code editing in ArtifactPreviewPanel:
   - Dynamic import with SSR-safe loading
   - vs-dark theme, minimap disabled, word wrap, 14px font
   - Edit/View toggle, Ctrl+S save, auto-language detection
   - Version creation on save via /api/artifacts/versions
   - Split-pane mode (Editor + Live Preview side-by-side)

6. **WebSocket Transport** — Optional real-time communication:
   - WebSocket server singleton (`websocket-server.ts`) with heartbeat, reconnection buffering
   - Client hook (`use-websocket.ts`) with auto-reconnect + exponential backoff
   - SSE fallback always available
   - API route: `/api/ws/chat` for status discovery

7. **Persistent Agent Memory** — Long-term memory for agents:
   - `storeAgentMemory()` — Upsert with confidence, tags, TTL
   - `getAgentMemories()` — Filtered retrieval with confidence thresholds
   - `searchAgentMemories()` — Keyword relevance search + recency boost
   - `getAgentMemoryContext()` — Prompt-injectable context string (token-budgeted)
   - `extractAndStoreMemories()` — Auto-extract preferences, facts, lessons from conversations
   - Prisma model: AgentMemory with indexes on agentId, category, confidence
   - API route: `/api/agents/[id]/memory`

#### P3 Phase: Adaptive Token Management

8. **Adaptive Token Management** — Dynamic context allocation:
   - Task-specific allocation profiles (coding, research, creative, analysis, conversation, debugging)
   - `getAdaptiveTokenBudget()` — Dynamic prompt/completion/tool token allocation
   - `getOptimizedContextConfig()` — Combined usage + budget + recommendations
   - Conversation length adjustments (compression at 20+, aggressive at 50+ messages)
   - Tool-aware reserve allocation (2x reserve when tools are active)
   - Enhanced API: `/api/context-manager?action=optimized|budget|cost`

#### Bug Fixes During Integration:
- Fixed PreviewTab type union (added sql, yaml, xml, json, mermaid, latex, python, typescript, javascript, css, shell)
- Fixed `prismaToMemoryEntry()` type errors (unknown → proper type assertions)
- Removed unused eslint-disable directive in use-websocket.ts

#### Build Verification:
- TypeScript: 0 errors (excluding skill files)
- Next.js build: Success
- ESLint: 1 pre-existing warning (FileBrowser.tsx alt text)

---

### Summary Table

| Phase | Features | Status |
|-------|----------|--------|
| P0 | Parallel Tools, Retry/Circuit Breaker, Agent Orchestration | ✅ Complete |
| P1 | Semantic Cache, Conversation Recovery, Multi-Tab Artifacts, Swarm Intelligence | ✅ Complete |
| P2 | Monaco Editor, WebSocket Transport, Persistent Agent Memory, Live Preview | ✅ Complete |
| P3 | Adaptive Token Management, Version History, Export System | ✅ Complete |

**New Files Created:**
- `src/lib/agent-memory.ts` — Persistent agent memory system
- `src/lib/websocket-server.ts` — WebSocket server singleton
- `src/lib/use-websocket.ts` — Client-side WebSocket hook
- `src/app/api/swarm/[id]/intelligence/route.ts` — Swarm intelligence API
- `src/app/api/agents/[id]/memory/route.ts` — Agent memory API
- `src/app/api/ws/chat/route.ts` — WebSocket status API

**Files Modified:**
- `src/lib/artifact-store.ts` — Extended PreviewTab type union
- `src/lib/context-manager.ts` — Added adaptive token management
- `src/lib/conversation-recovery.ts` — Added client-side persistence
- `src/lib/swarm-engine.ts` — Added specialist routing, self-healing, knowledge sharing, weighted consensus
- `src/lib/agent-memory.ts` — Fixed type errors in prismaToMemoryEntry
- `src/components/enhancements/ArtifactPreviewPanel.tsx` — Monaco editor, version history, export, split-pane
- `src/app/api/context-manager/route.ts` — Enhanced with budget/cost/optimized endpoints
- `prisma/schema.prisma` — Added AgentMemory model
