# Task 2: Preconfigured Orchestration, Pipeline & Agent System

**Agent**: Task-2-Agent
**Task**: Create the CORE data definitions file that powers the entire preconfigured system

## Work Log

- Read worklog.md for project context (Prisma schema, existing agents, provider router, orchestrator, pipeline store)
- Read agent-definitions.ts — 35+ agents defined with full system prompts
- Read provider-router.ts — DEFAULT_PROVIDERS array with 11 provider/model/taskType combos
- Read db.ts — PrismaClient singleton with query logging
- Read orchestrator.ts — existing orchestrator with project planning and agent roles
- Read Prisma schema — all models including AgentPipeline, ProviderScore, ModelRoute, PromptTemplate, Agent

- Created `/home/z/my-project/src/lib/preconfigured-system.ts` (~1100 lines) with all 5 required sections:

### §1 Pipeline Template Definitions (7 pipelines)
1. **Full-Stack SaaS Builder** — 9 steps: Issue → Architecture → Code Frontend → Code Backend → Database → Test → Review → Deploy → Monitor
2. **Security Audit Fortress** — 8 steps: Recon → Scan → Vulnerability Assessment → Exploit Test → Report → Fix → Verify → Compliance Check
3. **Deep Research Engine** — 8 steps: Query → Search → Source Analysis → Citation Extraction → Hallucination Check → Synthesis → Report → Export
4. **Data Pipeline Architect** — 7 steps: Schema Design → Extract → Transform → Validate → Load → Monitor → Alert Setup
5. **Incident Command** — 8 steps: Detect → Triage → Contain → Root Cause → Fix → Verify → Post-Mortem → Prevention Rules
6. **Code Modernization** — 7 steps: Legacy Analysis → Migration Plan → Refactor → Test → Performance Bench → Deploy → Cleanup
7. **Product Launch Pad** — 8 steps: Requirements → Design → Build → QA → Staging → Launch → Monitor → Iterate

Each pipeline step has: id, name, agentName, description, inputMapping, outputMapping, approvalRequired, retryCount, timeout. All steps reference actual agent names from the system.

### §2 Orchestration Rules
- **taskRouting**: 28 task type → preferred agent + fallback chain mappings
- **executionStrategies**: 5 strategies (parallel, sequential, consensus, race, waterfall) with configs
- **fallbackChains**: 10 agent category chains
- **autoScalingRules**: 6 rules (queue_depth, wait_time, error_rate, cpu_usage triggers)
- **qualityGates**: 8 gates (test pass rate, code review score, no critical vulns, deploy success, P95 latency, coverage, hallucination rate, data freshness)

### §3 Preconfigured Agent Enhancements
- Full AGENT_ENHANCEMENTS for all 35+ agents
- Each has: executionStrategy, preferredModel, fallbackModels, maxConcurrentTasks, timeout, retryPolicy, qualityThreshold, memoryScope, toolAccess, costLimit

### §4 Default Provider Scores
- 27 provider/model/taskType combinations across: Z.AI (9), OpenAI (5), Anthropic (3), DeepSeek (3), Groq (2), Local (5)
- Same data as provider-router.ts but structured for DB seeding

### §5 Seed Function
- `seedPreconfiguredSystem()` async function that:
  - Upserts all 35+ agents using AGENT_DEFINITIONS
  - Seeds all 7 pipeline templates into AgentPipeline table
  - Seeds 27 provider scores into ProviderScore table
  - Seeds 7 model routes into ModelRoute table
  - Seeds 10 prompt templates into PromptTemplate table
  - Returns SeedSummary: { agents, pipelines, providers, routes, templates }
  - Uses upsert pattern throughout for idempotency

## Verification
- TypeScript compilation: zero errors from preconfigured-system.ts
- Transpile success confirmed (91,745 chars output)
- All pre-existing TS errors from other files confirmed unchanged

## Stage Summary
- Created comprehensive preconfigured-system.ts with 5 major sections
- 7 production-ready pipeline templates with 55 total steps
- 28 task routing rules, 5 execution strategies, 6 auto-scaling rules, 8 quality gates
- 35+ agent enhancements with model routing, retry policies, and cost limits
- 27 provider scores for hybrid router seeding
- Idempotent seed function for database population
