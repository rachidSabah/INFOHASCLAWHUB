# Task: Fix API Routes to Match Prisma Schema

## Summary of All Changes

### 1. `src/app/api/issue-pipeline/route.ts`
- **Removed** dependency on non-existent `@/lib/issue-pipeline` engine
- **Added** `import { db } from '@/lib/db'` for direct database access
- **Added** `export const dynamic = 'force-dynamic'`
- **GET**: Changed from `engine.getAllPipelines()` to `db.issuePipeline.findMany()`
- **POST**: Changed from `engine.startPipeline()` to `db.issuePipeline.create()` with proper field names (issueTitle, issueBody, etc.)
- **Added** `maxIterations` as optional parameter in POST body
- **Removed** `issueUrl` from required fields (it's optional in schema)

### 2. `src/app/api/issue-pipeline/[id]/route.ts`
- **Removed** dependency on non-existent `@/lib/issue-pipeline` engine
- **Added** `import { db } from '@/lib/db'`
- **Added** `export const dynamic = 'force-dynamic'`
- **GET**: Changed from `engine.getStatus(id)` to `db.issuePipeline.findUnique()`
- **Added** `PATCH` handler for updating pipeline fields (status, plan, branchName, prUrl, prNumber, deployUrl, testResults, reviewNotes, iterations, maxIterations, issueUrl, issueBody, repoUrl)
- **DELETE**: Changed from `engine.deletePipeline(id)` to `db.issuePipeline.delete()` with existence check

### 3. `src/app/api/sandbox/route.ts`
- **Added** `export const dynamic = 'force-dynamic'`
- Already correct: uses `db`, `framework`, `files`/`envVars` as JSON strings
- No other changes needed

### 4. `src/app/api/sandbox/[id]/route.ts`
- **Added** `export const dynamic = 'force-dynamic'`
- **PATCH**: Expanded to support all updatable fields (name, framework, port, containerId, previewUrl, in addition to status, files, envVars)
- Already correct: files/envVars handled as JSON strings

### 5. `src/app/api/plugins/route.ts`
- **Changed** from `(db as any).plugin` to `db.plugin` (properly typed)
- **Added** `export const dynamic = 'force-dynamic'`
- **GET**: Changed `where: any` to `where: Record<string, unknown>`
- **POST**: Replaced raw `body` pass-through with explicit field extraction and validation
- **Added** required field validation (name, description, author, version, category)
- **Added** proper `manifest` handling: accepts both object (auto-serializes to JSON string) or string
- **Removed** any "status" field reference (not in Plugin schema)

### 6. `src/app/api/plugins/[id]/route.ts`
- **Added** `export const dynamic = 'force-dynamic'`
- **PATCH**: Replaced raw `body` pass-through with explicit field extraction and validation
- **Added** existence check before PATCH (404 if not found)
- **Added** proper `manifest` handling: accepts both object or string
- **DELETE**: Added existence check before deletion

### 7. `src/app/api/security/audit/route.ts`
- **Changed** model from `(db as any).securityAuditLog` to `db.auditLog` (matches AuditLog model)
- **Changed** filter from `agentId` to `actor` (matches AuditLog schema)
- **Added** `export const dynamic = 'force-dynamic'`
- **GET**: Changed `where: any` to `where: Record<string, unknown>`, added `action` filter
- **Added** `POST` handler for creating audit logs with required fields: actor, action, resource, result; optional: risk, details, ipAddress, sessionId

### 8. `src/app/api/security/compliance/route.ts`
- **Changed** model references from `(db as any).securityAuditLog` to `db.auditLog`
- **Changed** `ZAI: any` to `ZAI: unknown` with proper type narrowing
- **Added** `export const dynamic = 'force-dynamic'`
- **Added** `GET` handler for CompliancePolicy CRUD (filters: ruleType, isEnabled)
- **POST** now dual-purpose:
  - If `framework` is provided: runs AI compliance analysis (existing behavior, fixed model references)
  - Otherwise: creates a CompliancePolicy with proper fields (name, description, ruleType, config as JSON string, severity, isEnabled)
- **Uses** `ruleType` (not `type`) and `config` (JSON string, not `rules`)

### 9. `src/app/api/security/secrets/route.ts`
- **Changed** from `(db as any).exposedSecret` to `db.exposedSecret` (properly typed)
- **Changed** `ZAI: any` to `ZAI: unknown` with proper type narrowing
- **Added** `export const dynamic = 'force-dynamic'`
- **GET**: Changed `where: any` to `where: Record<string, unknown>`
- **POST**: Added proper type annotation for `foundSecrets` array to fix TS error
- Model reference was already correct (`exposedSecret` matches `ExposedSecret` in schema)

### 10. `src/app/api/collab/sessions/route.ts` (NEW FILE)
- **Created** new route for CollabSession CRUD
- **GET**: Lists sessions with optional filters (status, hostId)
- **POST**: Creates session with required fields (name, hostId), optional (peers as JSON array, sharedAgent)
- **Properly** serializes `peers` as JSON string for storage
- **Includes** `export const dynamic = 'force-dynamic'`

### 11. `src/app/api/collab/sessions/[id]/route.ts` (NEW FILE)
- **Created** new route for individual CollabSession operations
- **GET**: Gets single session by ID
- **PATCH**: Updates session fields (name, hostId, peers as JSON string, status, sharedAgent)
- **DELETE**: Deletes session with existence check
- **Includes** `export const dynamic = 'force-dynamic'`

## Common Patterns Applied Across All Routes
- `import { db } from '@/lib/db'` for database access
- `error: unknown` with `error instanceof Error ? error.message : 'Unknown error'` narrowing
- `export const dynamic = 'force-dynamic'` on all routes
- Required fields validated in POST handlers
- Optional fields properly typed as optional
- JSON fields (manifest, config, peers, files, envVars) properly serialized with `JSON.stringify()`
- Existence checks before PATCH/DELETE operations (404 responses)
- `Record<string, unknown>` instead of `any` for where clauses and update data
