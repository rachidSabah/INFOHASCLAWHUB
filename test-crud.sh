#!/bin/bash
# Comprehensive CRUD Test Suite for INFOHASCLAWHUB
# Tests all API endpoints systematically

BASE="http://localhost:3000"
PASS=0
FAIL=0
ERRORS=""

t() {
  local label="$1"
  local method="$2"
  local url="$3"
  local body="$4"
  local expect="$5"  # expected HTTP status code
  
  local start=$(date +%s%3N)
  if [ "$method" = "GET" ]; then
    RESP=$(curl -s -w "\n%{http_code}" "$BASE$url" 2>&1)
  else
    RESP=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE$url" \
      -H 'Content-Type: application/json' \
      -d "$body" 2>&1)
  fi
  
  local http_code=$(echo "$RESP" | tail -1)
  local body_resp=$(echo "$RESP" | head -n -1)
  local end=$(date +%s%3N)
  local elapsed=$((end - start))
  
  if [ "$http_code" = "$expect" ]; then
    echo "  ✅ $label → $http_code (${elapsed}ms)"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $label → $http_code (expected $expect) (${elapsed}ms)"
    echo "     Response: $(echo "$body_resp" | head -c 200)"
    FAIL=$((FAIL + 1))
    ERRORS="$ERRORS\n  $label: got $http_code, expected $expect"
  fi
  
  # Return the body for chaining
  echo "$body_resp" > /tmp/last_resp.json
}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  INFOHASCLAWHUB — Comprehensive CRUD & Feature Test Suite  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── HEALTH ──────────────────────────────────────────────────────
echo "━━━ HEALTH CHECK ━━━"
t "Health" GET "/api/health" "" "200"
echo ""

# ── MEMORIES (original) ────────────────────────────────────────
echo "━━━ MEMORIES (Original) ━━━"
t "List memories" GET "/api/memories" "" "200"
t "Create memory" POST "/api/memories" '{"key":"test-key","content":"Test content from CRUD suite","source":"test"}' "201"
MEM_ID=$(cat /tmp/last_resp.json | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
if [ -n "$MEM_ID" ]; then
  t "Get memory" GET "/api/memories/$MEM_ID" "" "200"
fi
t "Search memories" GET "/api/memories?search=test" "" "200"
echo ""

# ── CONTEXT MEMORY (enhanced) ──────────────────────────────────
echo "━━━ CONTEXT MEMORY (Enhanced) ━━━"
t "Store context memory" POST "/api/memory/context" '{"type":"episodic","category":"conversation","content":"Context memory CRUD test entry","priority":3}' "201"
CMEM_ID=$(cat /tmp/last_resp.json | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
t "Search context memory" GET "/api/memory/context?query=test" "" "200"
t "Get memory stats" GET "/api/memory/context/stats" "" "200"
if [ -n "$CMEM_ID" ]; then
  t "Get single context memory" GET "/api/memory/context/$CMEM_ID" "" "200"
fi
echo ""

# ── MEMORY COMPRESS & PRUNE ────────────────────────────────────
echo "━━━ MEMORY OPERATIONS ━━━"
t "Compress memories" POST "/api/memory/context/compress" '{"olderThanDays":0,"dryRun":true}' "200"
t "Prune memories" POST "/api/memory/context/prune" '{}' "200"
echo ""

# ── AGENTS ─────────────────────────────────────────────────────
echo "━━━ AGENTS ━━━"
t "List agents" GET "/api/agents" "" "200"
t "Create agent" POST "/api/agents" '{"name":"Test Agent","description":"A CRUD test agent","type":"assistant","capabilities":["chat","code"]}' "201"
AGENT_ID=$(cat /tmp/last_resp.json | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
if [ -n "$AGENT_ID" ]; then
  t "Get agent" GET "/api/agents/$AGENT_ID" "" "200"
  t "Update agent" PUT "/api/agents/$AGENT_ID" '{"name":"Updated Test Agent","description":"Updated description"}' "200"
fi
echo ""

# ── CRON / SCHEDULER ──────────────────────────────────────────
echo "━━━ CRON / SCHEDULER ━━━"
t "List scheduler tasks" GET "/api/scheduler/tasks" "" "200"
t "Create scheduler task" POST "/api/scheduler/tasks" '{"name":"Test Task","schedule":"*/5 * * * *","action":"health_check","enabled":true}' "201"
TASK_ID=$(cat /tmp/last_resp.json | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
if [ -n "$TASK_ID" ]; then
  t "Get scheduler task" GET "/api/scheduler/tasks/$TASK_ID" "" "200"
fi
echo ""

# ── RESEARCH ───────────────────────────────────────────────────
echo "━━━ RESEARCH ━━━"
t "List research sessions" GET "/api/research" "" "200"
t "Create research session" POST "/api/research" '{"query":"Test research query","depth":"standard"}' "201"
RESEARCH_ID=$(cat /tmp/last_resp.json | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
if [ -n "$RESEARCH_ID" ]; then
  t "Get research session" GET "/api/research/$RESEARCH_ID" "" "200"
fi
echo ""

# ── PIPELINE ───────────────────────────────────────────────────
echo "━━━ PIPELINE ━━━"
t "List pipelines" GET "/api/pipelines" "" "200"
t "Create pipeline" POST "/api/pipelines" '{"name":"Test Pipeline","description":"CRUD test pipeline","steps":[{"name":"Step 1","type":"transform","config":{}}]}' "201"
PIPE_ID=$(cat /tmp/last_resp.json | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
if [ -n "$PIPE_ID" ]; then
  t "Get pipeline" GET "/api/pipelines/$PIPE_ID" "" "200"
fi
echo ""

# ── ISSUE PIPELINE ─────────────────────────────────────────────
echo "━━━ ISSUE PIPELINE ━━━"
t "List issue pipelines" GET "/api/issue-pipeline" "" "200"
t "Create issue pipeline" POST "/api/issue-pipeline" '{"title":"Test Issue","description":"CRUD test issue","type":"bug","priority":"high"}' "201"
ISSUE_ID=$(cat /tmp/last_resp.json | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
if [ -n "$ISSUE_ID" ]; then
  t "Get issue pipeline" GET "/api/issue-pipeline/$ISSUE_ID" "" "200"
fi
echo ""

# ── SELF-IMPROVING ─────────────────────────────────────────────
echo "━━━ SELF-IMPROVING ━━━"
t "List self-improving records" GET "/api/self-improving/record" "" "200"
t "Get recommendations" GET "/api/self-improving/recommend" "" "200"
echo ""

# ── MCP ────────────────────────────────────────────────────────
echo "━━━ MCP ━━━"
t "List MCP servers" GET "/api/mcp/servers" "" "200"
t "List MCP tools" GET "/api/mcp/tools" "" "200"
t "MCP registry" GET "/api/mcp-registry" "" "200"
echo ""

# ── SANDBOX ────────────────────────────────────────────────────
echo "━━━ SANDBOX ━━━"
t "List sandboxes" GET "/api/sandbox" "" "200"
t "Create sandbox" POST "/api/sandbox" '{"name":"Test Sandbox","template":"node","description":"CRUD test sandbox"}' "201"
SANDBOX_ID=$(cat /tmp/last_resp.json | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
if [ -n "$SANDBOX_ID" ]; then
  t "Get sandbox" GET "/api/sandbox/$SANDBOX_ID" "" "200"
fi
echo ""

# ── COMPLIANCE / SECURITY ─────────────────────────────────────
echo "━━━ COMPLIANCE / SECURITY ━━━"
t "Audit log" GET "/api/security/audit" "" "200"
t "Compliance check" GET "/api/security/compliance" "" "200"
t "Secrets scan" GET "/api/security/secrets" "" "200"
echo ""

# ── PLUGINS ────────────────────────────────────────────────────
echo "━━━ PLUGINS ━━━"
t "List plugins" GET "/api/plugins" "" "200"
t "Seed plugins" POST "/api/plugins/seed" '{}' "200"
t "List plugins (after seed)" GET "/api/plugins" "" "200"
PLUGIN_ID=$(cat /tmp/last_resp.json | python3 -c "
import sys,json
data=json.load(sys.stdin)
if isinstance(data, list) and len(data) > 0:
  print(data[0].get('id',''))
else:
  print('')" 2>/dev/null)
if [ -n "$PLUGIN_ID" ]; then
  t "Get plugin" GET "/api/plugins/$PLUGIN_ID" "" "200"
fi
echo ""

# ── PROVIDERS ──────────────────────────────────────────────────
echo "━━━ PROVIDERS ━━━"
t "List providers" GET "/api/providers" "" "200"
t "Provider models" GET "/api/providers/models" "" "200"
t "Provider router" GET "/api/provider-router" "" "200"
echo ""

# ── KNOWLEDGE ──────────────────────────────────────────────────
echo "━━━ KNOWLEDGE ━━━"
t "List documents" GET "/api/knowledge/documents" "" "200"
t "Search knowledge" GET "/api/knowledge/search?q=test" "" "200"
echo ""

# ── KANBAN ────────────────────────────────────────────────────
echo "━━━ KANBAN ━━━"
t "List boards" GET "/api/kanban/boards" "" "200"
t "Create board" POST "/api/kanban/boards" '{"title":"Test Board","description":"CRUD test board"}' "201"
echo ""

# ── PROMPTS ────────────────────────────────────────────────────
echo "━━━ PROMPTS ━━━"
t "List prompts" GET "/api/prompts" "" "200"
t "Create prompt" POST "/api/prompts" '{"title":"Test Prompt","content":"You are a helpful assistant.","category":"system"}' "201"
PROMPT_ID=$(cat /tmp/last_resp.json | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
if [ -n "$PROMPT_ID" ]; then
  t "Get prompt" GET "/api/prompts/$PROMPT_ID" "" "200"
fi
echo ""

# ── SETTINGS ───────────────────────────────────────────────────
echo "━━━ SETTINGS ━━━"
t "Get settings" GET "/api/settings" "" "200"
t "Update settings" POST "/api/settings" '{"key":"test_setting","value":"test_value"}' "200"
echo ""

# ── WORKSPACES ─────────────────────────────────────────────────
echo "━━━ WORKSPACES ━━━"
t "List workspaces" GET "/api/workspaces" "" "200"
t "Create workspace" POST "/api/workspaces" '{"name":"Test Workspace","description":"CRUD test workspace"}' "201"
WS_ID=$(cat /tmp/last_resp.json | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
if [ -n "$WS_ID" ]; then
  t "Get workspace" GET "/api/workspaces/$WS_ID" "" "200"
fi
echo ""

# ── SKILLS ─────────────────────────────────────────────────────
echo "━━━ SKILLS ━━━"
t "List skills" GET "/api/skills" "" "200"
echo ""

# ── QUICK ACTIONS ──────────────────────────────────────────────
echo "━━━ QUICK ACTIONS ━━━"
t "List quick actions" GET "/api/quick-actions" "" "200"
echo ""

# ── MODELS ─────────────────────────────────────────────────────
echo "━━━ MODELS ━━━"
t "List models" GET "/api/models" "" "200"
echo ""

# ── UI BUILDER ─────────────────────────────────────────────────
echo "━━━ UI BUILDER ━━━"
t "List projects" GET "/api/ui-builder/projects" "" "200"
echo ""

# ── SYSTEM MONITOR ─────────────────────────────────────────────
echo "━━━ SYSTEM MONITOR ━━━"
t "System monitor" GET "/api/system/monitor" "" "200"
echo ""

# ── NETWORK ────────────────────────────────────────────────────
echo "━━━ NETWORK ━━━"
t "Network status" GET "/api/network/status" "" "200"
echo ""

# ── DEPLOY ─────────────────────────────────────────────────────
echo "━━━ DEPLOY ━━━"
t "Deploy logs" GET "/api/deploy/logs" "" "200"
echo ""

# ── CLEANUP (DELETE) ───────────────────────────────────────────
echo "━━━ CLEANUP / DELETE TESTS ━━━"
if [ -n "$MEM_ID" ]; then
  t "Delete memory" DELETE "/api/memories/$MEM_ID" "" "200"
fi
if [ -n "$CMEM_ID" ]; then
  t "Delete context memory" DELETE "/api/memory/context/$CMEM_ID" "" "200"
fi
if [ -n "$AGENT_ID" ]; then
  t "Delete agent" DELETE "/api/agents/$AGENT_ID" "" "200"
fi
if [ -n "$TASK_ID" ]; then
  t "Delete scheduler task" DELETE "/api/scheduler/tasks/$TASK_ID" "" "200"
fi
if [ -n "$PIPE_ID" ]; then
  t "Delete pipeline" DELETE "/api/pipelines/$PIPE_ID" "" "200"
fi
if [ -n "$PROMPT_ID" ]; then
  t "Delete prompt" DELETE "/api/prompts/$PROMPT_ID" "" "200"
fi
if [ -n "$WS_ID" ]; then
  t "Delete workspace" DELETE "/api/workspaces/$WS_ID" "" "200"
fi
echo ""

# ── SUMMARY ────────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  TEST SUMMARY                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo "  PASSED: $PASS"
echo "  FAILED: $FAIL"
echo "  TOTAL:  $((PASS + FAIL))"
if [ $FAIL -gt 0 ]; then
  echo ""
  echo "  FAILED TESTS:"
  echo -e "$ERRORS"
fi
