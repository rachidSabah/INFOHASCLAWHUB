# Task 3c - AIDefence Engine & Cost Tracker Engine

## Agent: Core Engine Agent
## Status: COMPLETED

## Work Summary

Created two comprehensive core engine libraries following existing codebase patterns.

### File 1: `/src/lib/ai-defence-engine.ts` (~1100 lines)

**Features implemented:**
- Prompt injection detection (7 built-in patterns: system prompt override, extraction, jailbreak, role manipulation, delimiter injection, output manipulation, context boundary violation)
- PII detection: 14 types (email, SSN, phone, credit card, API key, password, IP, DOB, address, passport, license, medical record, bank account, crypto wallet)
- Unsafe content detection (5 patterns: harmful instructions, XSS, SQL injection, self-harm, illegal activity)
- Data exfiltration detection (4 patterns: credentials, DB strings, AWS keys, private keys)
- Command injection detection (4 patterns: shell exec, chaining, privilege escalation, reverse shell)
- Path traversal detection (4 patterns: directory traversal, sensitive files, file URI, env files)
- Per-rule sensitivity levels: low, medium, high, critical, paranoid
- Actions: block, redact, flag, hash
- False positive tracking with adaptive confidence calibration
- Scan sources: user_input, api_request, agent_output, file_upload
- Redaction engine with both built-in and DB-based rules
- 20 default defence rules for seeding
- 16 exported async functions

**Database models used:** AIDefenceEvent, DefenceRule (already in schema)

### File 2: `/src/lib/cost-tracker-engine.ts` (~1070 lines)

**Features implemented:**
- Budget management at 5 scopes: global, provider, agent, project, user
- Token tracking with model and provider metadata
- Cost calculation with incremental tracking
- Period tracking: daily, weekly, monthly with auto-reset
- Alert system: 4 types (threshold, limit_reached, anomaly, spike)
- Spending analytics: breakdown by scope, period, top budgets
- Budget enforcement: block over-limit requests
- Cost spike detection (3x expected rate)
- Anomaly detection: z-score based (2σ threshold)
- Cost forecasting: linear extrapolation, recommended daily limit
- Budget fallback chain: agent → project → provider → global
- 3 default budgets for seeding
- 14 exported async functions

**Database models used:** CostBudget, CostAlert (already in schema)

### Quality Checks
- TypeScript type check: PASS (0 errors in new files)
- Followed existing patterns: `import { db } from '@/lib/db'`, try/catch on all DB ops, parseJsonSafe, async exported functions
- Fixed variable shadowing issue (resetBudget local var conflicted with function name)
- Fixed SensitivityLevel type to include 'critical'
