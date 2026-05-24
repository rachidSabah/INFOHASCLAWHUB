# Task: Agent Strength Upgrades - Work Record

## Task ID: agent-strength-upgrades
## Agent: main-agent
## Date: 2024-03-05

## Summary
Implemented comprehensive agent strength upgrades to make all models think and act like Claude Code. This included fixing 3 critical bugs and adding 6 new power tools plus an enhanced system prompt.

## Changes Made

### Bug 1: Gemini CLI `--skip-trust` flag (FIXED)
- **File**: `/home/z/my-project/src/app/api/gemini/chat/route.ts`
- **Changes**:
  - Added `"--skip-trust"` to `extractMemoriesFromText` spawn call (line 116): `[...cliArgs, "--no-stream", "--skip-trust"]`
  - Updated `getCliArgs` function to include `"--skip-trust"` in ALL return paths:
    - `"auto"` case returns `["--skip-trust"]`
    - `"auto-gemini-3"` case returns `["--model", "auto", "--skip-trust"]`
    - `"auto-gemini-2.5"` case returns `["--model", "auto-gemini-2.5", "--skip-trust"]`
    - default case returns `["--model", m, "--skip-trust"]`
    - provider slash path returns `["--model", modelName, "--skip-trust"]`

### Bug 2: Artifacts panel showing raw JSON (FIXED)
- **File**: `/home/z/my-project/src/lib/artifact-detector.ts`
  - Rewrote `isToolCallContent` with robust pattern detection
  - Added more patterns to `TOOL_CALL_PATTERNS` (⚙️, `[Executed System Action]`, JSON result patterns)
  - Added JSON tool result detection in `detectArtifact` function
  - Checks for keys: url, textContent, path, content, query, results, stdout, exitCode, error, hint, files, written, replacements, appended, exists, memories, iso, timezone, platform, cpus, fetched

- **File**: `/home/z/my-project/src/components/ChatInput.tsx`
  - Added extra JSON stripping filter before calling `detectArtifact` in BOTH streaming and done handlers
  - Strips `{"name": "...", "arguments": {...}}` patterns
  - Strips `{"(url|path|query|expression|stdout|error)":...}` tool result JSON patterns

### Bug 3: Agent loop pendingToolResults matching (FIXED)
- **File**: `/home/z/my-project/src/app/api/gemini/chat/route.ts`
- **Change**: Replaced name-based `allToolCalls.find()` with index-based matching using `usedIndices` Set
  - First tries: match by name in the new tool calls range, preferring not-yet-used indices
  - Fallback: match by index position (i-th native call → i-th new tool call)
  - Text-based tool calls also use `usedIndices` to avoid duplication
  - This correctly handles multiple calls to the same tool (e.g., two web_fetch calls)

### 6 New Power Tools (ADDED)
- **File**: `/home/z/my-project/src/lib/tools.ts`
  1. `search_replace` - Search and replace strings in files with regex-escaped search
  2. `get_env_var` - Get environment variable values with security masking for keys/secrets/tokens/passwords
  3. `memory_save` - Save persistent memories to SQLite using dynamic require("@/lib/db")
  4. `memory_recall` - Recall saved memories with optional search query
  5. `diff_files` - Compare two files and show differences
  6. `append_file` - Append content to existing files (creates if not exists)

### Enhanced System Prompt (REPLACED)
- **File**: `/home/z/my-project/src/app/api/gemini/chat/route.ts`
- **Function**: `buildLocalSystemInstructions`
- **New features**:
  - ReAct (Reasoning + Acting) pattern with 5-step framework: ANALYZE → PLAN → EXECUTE → VERIFY → RESPOND
  - Self-correction rules with specific error-to-alternative mappings
  - Persistent memory system documentation (memory_save/memory_recall)
  - Parallel execution awareness with examples
  - Code generation rules including search_replace recommendation
  - Website analysis comprehensive approach
  - Enhanced identity as "supreme autonomous AI agent"

### Updated Tool Categories (ENHANCED)
- **File**: `/home/z/my-project/src/lib/tools.ts`
- **Function**: `getToolsPrompt`
- Added `[TOOL CATEGORIES]` section with emoji headers:
  - 📄 FILE OPERATIONS: read_file, write_file, append_file, search_replace, list_files, diff_files
  - 🌐 WEB: web_search, web_fetch
  - 🧠 MEMORY: memory_save, memory_recall
  - 💻 SYSTEM: local_cmd, get_system_info, get_env_var, calculator, get_current_time

## TypeScript Check
- All modified files pass TypeScript type checking (no new errors introduced)
- ESLint passes with only pre-existing warnings

## Notes
- `memory_save` and `memory_recall` use dynamic `require("@/lib/db")` to avoid client-side Prisma import issues
- New tools automatically appear in `getGeminiFunctionDeclarations()` and `getOpenAIToolsDefinitions()` since they iterate `availableTools`
- The `search_replace` tool uses `content.split(search).join(replace)` instead of regex for exact string matching
