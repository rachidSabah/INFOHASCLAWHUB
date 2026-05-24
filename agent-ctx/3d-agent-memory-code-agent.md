# Task 3d-agent-memory: Persistent Agent Memory with SQLite/Prisma

## Agent: Code Agent
## Date: 2026-05-23

## Summary
Implemented a persistent agent memory system that provides long-term memory persistence for agents using SQLite via Prisma. This complements the existing `enhanced-memory.ts` (generic key-value memory) and `universal-memory.ts` (vector-based semantic memory) with agent-specific memory capabilities.

## Changes Made

### 1. Prisma Schema (`prisma/schema.prisma`)

**Added `AgentMemory` model:**
- `id` (String, cuid, PK)
- `agentId` (String, FK → Agent)
- `category` (String) — "preference" | "lesson" | "pattern" | "context" | "fact" | "skill"
- `key` (String) — unique identifier within agent+category
- `value` (String) — the memory content
- `confidence` (Float, default 0.5) — 0-1 confidence score
- `accessCount` (Int, default 0) — usage tracking
- `sourceConversationId` (String?) — optional conversation reference
- `tags` (String, default "[]") — JSON array for categorization
- `expiresAt` (DateTime?) — optional TTL
- `createdAt` / `updatedAt` — timestamps

**Added relation to `Agent` model:**
- `memories AgentMemory[]` — one-to-many relation with cascade delete

**Added indexes:**
- `@@index([agentId, category])` — fast category filtering
- `@@index([agentId, key])` — fast key lookup
- `@@index([agentId, confidence])` — confidence-based sorting

### 2. Agent Memory Library (`src/lib/agent-memory.ts`)

**Core operations:**
- `storeAgentMemory()` — Upsert memory (updates if same agent+category+key exists)
- `getAgentMemories()` — List memories with filtering (category, tags, confidence, limit)
- `searchAgentMemories()` — Keyword-based relevance search with confidence and recency scoring
- `touchAgentMemory()` — Increment access count for usage tracking
- `deleteAgentMemory()` — Delete a specific memory by ID

**Context injection:**
- `getAgentMemoryContext()` — Returns formatted context string for prompt injection, with token budget control

**Auto-extraction:**
- `extractAndStoreMemories()` — Auto-extract preferences, facts, and error-resolution lessons from conversations using regex patterns

**Utilities:**
- `getAgentMemoryStats()` — Returns stats (total, byCategory, avgConfidence, mostAccessed, recentlyUpdated)
- `cleanupAgentMemories()` — Remove expired and low-confidence unused memories

**Helper:**
- `prismaToMemoryEntry()` — Converts Prisma row to typed `AgentMemoryEntry` interface

### 3. API Route (`src/app/api/agents/[id]/memory/route.ts`)

**GET endpoints:**
- `?action=list` (default) — List memories with optional category/limit/minConfidence/tags filters
- `?action=search&query=...` — Search memories by relevance
- `?action=context&query=...` — Get formatted memory context for prompt injection
- `?action=stats` — Get memory statistics

**POST endpoints:**
- `{ action: "store", category, key, value, ... }` — Store a new memory (201 on success)
- `{ action: "extract", conversationId, userMessage, assistantResponse }` — Auto-extract memories from conversation
- `{ action: "cleanup" }` — Clean up expired/low-confidence memories
- `{ action: "touch", memoryId }` — Track memory access

**DELETE endpoint:**
- `?memoryId=...` — Delete a specific memory

### 4. Database Migration
- Ran `npx prisma db push` successfully — schema synced with SQLite

### 5. Lint Results
- All lint warnings from new files resolved
- No errors in the new code
- Pre-existing warnings in other files unchanged

## Key Design Decisions

1. **Upsert pattern**: `storeAgentMemory()` checks for existing entries with same agentId+category+key and updates rather than duplicates
2. **Relevance scoring**: Combines key matching (0.5 weight), keyword overlap (0.1-0.15 per word), tag matching (0.1), confidence boost (0.5-1.0x), and recency boost (1.1-1.2x)
3. **Expiration filtering**: Both `getAgentMemories` and `searchAgentMemories` exclude expired entries via OR clause
4. **Auto-extraction**: Uses regex patterns to identify preferences, facts, and error resolutions — lightweight approach that doesn't require LLM calls
5. **TypeScript strict typing**: Used `Record<string, unknown>` instead of `any` for where clauses to satisfy ESLint
6. **Complements existing systems**: Does NOT replace `enhanced-memory.ts` or `universal-memory.ts` — those serve different purposes (global memory vs. vector-based semantic search)
