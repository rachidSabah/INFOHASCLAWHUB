# Task 5 — System Seed API Route

## Task
Create the API route `/src/app/api/system/seed/route.ts` that provides a one-click setup endpoint.

## Work Log
- Read `/home/z/my-project/worklog.md` for project context
- Studied existing seed route pattern at `/src/app/api/agents/seed/route.ts`
- Analyzed `seedPreconfiguredSystem()` function in `/src/lib/preconfigured-system.ts`:
  - Returns `SeedSummary` with counts: agents, pipelines, providers, routes, templates
  - Seeds 5 entity types: Agents, AgentPipelines, ProviderScores, ModelRoutes, PromptTemplates
- Checked Prisma schema for model names: Agent, AgentPipeline, ProviderScore, ModelRoute, PromptTemplate
- Found existing `/src/app/api/system/seed/route.ts` with old `pipelineStore`-based implementation
- Overwrote with new implementation using `seedPreconfiguredSystem()` and `db` from Prisma
- Implemented all 3 HTTP handlers:
  1. **POST**: Calls `seedPreconfiguredSystem()` and returns the summary
  2. **GET**: Returns current seed status with counts from DB (Promise.all for parallel queries)
  3. **DELETE**: Resets the system by deleting all seeded data in dependency order
- Added `export const dynamic = "force-dynamic"` 
- Proper error handling with try/catch and appropriate status codes
- Followed the same patterns as existing routes

## Summary
- Created `/src/app/api/system/seed/route.ts` with POST, GET, DELETE handlers
- POST seeds the entire preconfigured system and returns summary counts
- GET returns current DB counts for agents, pipelines, providers, routes, templates
- DELETE removes all seeded data in safe dependency order
- Uses `force-dynamic` for fresh data on every request
- Clean, production-ready code following existing project patterns
