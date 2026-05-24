# Task 2d-swarm-intelligence — Swarm Engine Intelligence Enhancements

**Agent**: Code Agent
**Date**: 2026-05-23
**Status**: ✅ Completed

## Summary

Enhanced the Swarm Engine with four advanced intelligence features: specialist routing, self-healing, knowledge sharing, and weighted consensus voting. Also added a new API route to expose these features.

## Changes Made

### 1. Prisma Schema (`prisma/schema.prisma`)
- **Added** `knowledgeBase String @default("[]")` field to the `Swarm` model
- Stores JSON array of `{ id, category, insight, sourceAgentId, confidence, usageCount, createdAt }[]`
- Schema pushed to database successfully

### 2. Swarm Engine (`src/lib/swarm-engine.ts`)
**Appended** the following after existing code (no modifications to existing functions):

#### New Types
- `AgentCapability` — interface for agent specialty profiles (specialties, successRate, avgResponseTime, currentLoad)
- `SwarmKnowledge` — interface for shared knowledge entries (id, swarmId, category, insight, sourceAgentId, confidence, usageCount, createdAt)

#### New Functions

1. **`routeToSpecialist(swarmId, taskDescription, requiredCapability)`**
   - Scores agents using weighted formula: specialty match (40%) + success rate (30%) + low load (20%) + fast response (10%)
   - Queries `Agent` table for skills and `AgentExperience` for historical performance
   - Returns best agent with confidence score, or null if no match

2. **`selfHealSwarm(swarmId)`**
   - Checks each agent's recent error rate from `AgentExperience` (last 20 records)
   - Marks agents with >50% error rate as "degraded" (status: error)
   - Reassigns degraded agent's pending tasks to least-loaded healthy agents
   - If queen is degraded in hierarchical topology, promotes next senior agent
   - Returns `{ healed, actions }` with list of healing actions taken

3. **`shareKnowledge(swarmId, category, insight, sourceAgentId, confidence)`**
   - Creates a knowledge entry in the swarm's `knowledgeBase` JSON array
   - Categories: "tool_tip", "code_pattern", "error_solution", "best_practice"
   - Returns the created `SwarmKnowledge` entry

4. **`queryKnowledge(swarmId, category?, query?)`**
   - Retrieves knowledge from swarm's `knowledgeBase`
   - Optional filter by category and keyword matching (any query word in insight)
   - Results sorted by confidence (desc) then usageCount (desc)

5. **`weightedConsensus(swarmId, proposal, options)`**
   - Each agent votes on options based on skill matching and historical accuracy
   - Vote weight = 0.5 base + accuracyScore * 0.3 + experienceBonus (up to 1.0)
   - Calculates weighted scores per option; winner needs >50% of total weight
   - Logs the consensus round to the swarm's `consensusLog`
   - Returns `{ decided, winner, votes, confidence }`

### 3. API Route (`src/app/api/swarm/[id]/intelligence/route.ts`)
**New file** with two endpoints:

#### POST `/api/swarm/{id}/intelligence`
Actions:
- `route_specialist` — data: `{ taskDescription, requiredCapability }`
- `self_heal` — no data required
- `share_knowledge` — data: `{ category, insight, sourceAgentId, confidence }`
- `query_knowledge` — data: `{ category?, query? }`
- `weighted_consensus` — data: `{ proposal, options }`

#### GET `/api/swarm/{id}/intelligence`
- Returns `{ knowledgeCount, recentKnowledge }` (last 10 entries)

## Verification
- ✅ Prisma schema pushed successfully (new `knowledgeBase` column added)
- ✅ ESLint passes with no errors (only unrelated warning in FileBrowser.tsx)
- ✅ TypeScript compilation clean
- ✅ No modifications to existing swarm-engine.ts functions
- ✅ All new functions use proper try/catch error handling
