#!/usr/bin/env python3
"""Comprehensive CRUD Test Suite for INFOHASCLAWHUB"""
import requests, json, time, sys

BASE = "http://localhost:3000"
results = {"pass": 0, "fail": 0, "errors": []}
created_ids = {}

def t(label, method, url, body=None, expect=200, base=None):
    b = base or BASE
    try:
        if method == "GET":
            r = requests.get(f"{b}{url}", timeout=30)
        elif method == "POST":
            r = requests.post(f"{b}{url}", json=body, timeout=30, headers={"Content-Type": "application/json"})
        elif method == "PUT":
            r = requests.put(f"{b}{url}", json=body, timeout=30, headers={"Content-Type": "application/json"})
        elif method == "DELETE":
            r = requests.delete(f"{b}{url}", timeout=30)
        else:
            r = requests.request(method, f"{b}{url}", json=body, timeout=30)
        
        if r.status_code == expect:
            print(f"  ✅ {label} → {r.status_code}")
            results["pass"] += 1
            try:
                return r.json()
            except:
                return {}
        else:
            print(f"  ❌ {label} → {r.status_code} (expected {expect})")
            print(f"     Response: {r.text[:200]}")
            results["fail"] += 1
            results["errors"].append(f"{label}: got {r.status_code}, expected {expect}")
            try:
                return r.json()
            except:
                return {}
    except Exception as e:
        print(f"  ❌ {label} → ERROR: {str(e)[:100]}")
        results["fail"] += 1
        results["errors"].append(f"{label}: {str(e)[:100]}")
        return {}
    finally:
        time.sleep(0.3)  # Small delay between requests

print("╔══════════════════════════════════════════════════════════════╗")
print("║  INFOHASCLAWHUB — Comprehensive CRUD & Feature Test Suite  ║")
print("╚══════════════════════════════════════════════════════════════╝")
print()

# ── HEALTH ──
print("━━━ HEALTH CHECK ━━━")
t("Health", "GET", "/api/health")
print()

# ── MEMORIES (original) ──
print("━━━ MEMORIES (Original) ━━━")
t("List memories", "GET", "/api/memories")
d = t("Create memory", "POST", "/api/memories", {"key": "test-key", "content": "Test content from CRUD suite", "source": "test"}, 201)
if d and "id" in d:
    created_ids["memory"] = d["id"]
    t("Get memory", "GET", f"/api/memories/{d['id']}")
t("Search memories", "GET", "/api/memories?search=test")
print()

# ── CONTEXT MEMORY (enhanced) ──
print("━━━ CONTEXT MEMORY (Enhanced) ━━━")
d = t("Store context memory", "POST", "/api/memory/context", {"type": "episodic", "category": "conversation", "content": "Context memory CRUD test entry", "priority": 3}, 201)
if d and "id" in d:
    created_ids["context_memory"] = d["id"]
    t("Get context memory", "GET", f"/api/memory/context/{d['id']}")
t("Search context memory", "GET", "/api/memory/context?query=test")
t("Get memory stats", "GET", "/api/memory/context/stats")
print()

# ── MEMORY OPERATIONS ──
print("━━━ MEMORY OPERATIONS ━━━")
t("Compress memories (dry run)", "POST", "/api/memory/context/compress", {"olderThanDays": 0, "dryRun": True})
t("Prune memories", "POST", "/api/memory/context/prune", {})
t("Link memories", "POST", "/api/memory/context/link", {"sourceId": "test1", "targetId": "test2", "relationType": "related"})
print()

# ── AGENTS ──
print("━━━ AGENTS ━━━")
t("List agents", "GET", "/api/agents")
d = t("Create agent", "POST", "/api/agents", {"name": "TestAgent" + str(int(time.time())), "role": "assistant", "systemPrompt": "You are a test assistant.", "skills": ["chat","code"]}, 201)
if d and "id" in d:
    created_ids["agent"] = d["id"]
    t("Get agent", "GET", f"/api/agents/{d['id']}")
    t("Update agent", "PUT", f"/api/agents/{d['id']}", {"name": "Updated Agent", "description": "Updated"})
print()

# ── CRON / SCHEDULER ──
print("━━━ CRON / SCHEDULER ━━━")
t("List scheduler tasks", "GET", "/api/scheduler/tasks")
d = t("Create scheduler task", "POST", "/api/scheduler/tasks", {"name": "TestTask" + str(int(time.time())), "cronExpr": "*/5 * * * *", "taskType": "health_check", "config": "{}"}, 201)
if d and "id" in d:
    created_ids["task"] = d["id"]
    t("Get scheduler task", "GET", f"/api/scheduler/tasks/{d['id']}")
print()

# ── RESEARCH ──
print("━━━ RESEARCH ━━━")
t("List research sessions", "GET", "/api/research")
d = t("Create research session", "POST", "/api/research", {"query": "Test research query " + str(int(time.time())), "depth": "standard"}, 201)
if d and "id" in d:
    created_ids["research"] = d["id"]
    t("Get research session", "GET", f"/api/research/{d['id']}")
print()

# ── PIPELINES ──
print("━━━ PIPELINES ━━━")
t("List pipelines", "GET", "/api/pipelines")
d = t("Create pipeline", "POST", "/api/pipelines", {"name": "TestPipeline" + str(int(time.time())), "description": "CRUD test"}, 201)
if d and "id" in d:
    created_ids["pipeline"] = d["id"]
    t("Get pipeline", "GET", f"/api/pipelines/{d['id']}")
print()

# ── ISSUE PIPELINE ──
print("━━━ ISSUE PIPELINE ━━━")
t("List issue pipelines", "GET", "/api/issue-pipeline")
d = t("Create issue pipeline", "POST", "/api/issue-pipeline", {"issueTitle": "Test Issue " + str(int(time.time())), "issueBody": "CRUD test issue"}, 201)
if d and "id" in d:
    created_ids["issue"] = d["id"]
    t("Get issue pipeline", "GET", f"/api/issue-pipeline/{d['id']}")
print()

# ── SELF-IMPROVING ──
print("━━━ SELF-IMPROVING ━━━")
t("List self-improving records", "GET", "/api/self-improving/record")
t("Get recommendations", "GET", "/api/self-improving/recommend")
t("Self-improving reflect", "POST", "/api/self-improving/reflect", {"area": "performance"})
print()

# ── MCP ──
print("━━━ MCP ━━━")
t("List MCP servers", "GET", "/api/mcp/servers")
t("List MCP tools", "GET", "/api/mcp/tools")
t("MCP registry", "GET", "/api/mcp-registry")
print()

# ── SANDBOX ──
print("━━━ SANDBOX ━━━")
t("List sandboxes", "GET", "/api/sandbox")
d = t("Create sandbox", "POST", "/api/sandbox", {"name": "TestSandbox" + str(int(time.time())), "framework": "nextjs"}, 201)
if d and "id" in d:
    created_ids["sandbox"] = d["id"]
    t("Get sandbox", "GET", f"/api/sandbox/{d['id']}")
print()

# ── COMPLIANCE / SECURITY ──
print("━━━ COMPLIANCE / SECURITY ━━━")
t("Audit log", "GET", "/api/security/audit")
t("Compliance check", "GET", "/api/security/compliance")
t("Secrets scan", "GET", "/api/security/secrets")
print()

# ── PLUGINS ──
print("━━━ PLUGINS ━━━")
t("List plugins", "GET", "/api/plugins")
t("Seed plugins", "POST", "/api/plugins/seed", {})
d_list = t("List plugins (after seed)", "GET", "/api/plugins")
if d_list and isinstance(d_list, list) and len(d_list) > 0:
    created_ids["plugin"] = d_list[0]["id"]
    t("Get plugin", "GET", f"/api/plugins/{d_list[0]['id']}")
print()

# ── PROVIDERS ──
print("━━━ PROVIDERS ━━━")
t("List providers", "GET", "/api/providers")
t("Provider models", "GET", "/api/providers/models")
t("Provider router", "GET", "/api/provider-router")
print()

# ── KNOWLEDGE ──
print("━━━ KNOWLEDGE ━━━")
t("List documents", "GET", "/api/knowledge/documents")
t("Search knowledge", "GET", "/api/knowledge/search?q=test")
print()

# ── KANBAN ──
print("━━━ KANBAN ━━━")
t("List boards", "GET", "/api/kanban/boards")
d = t("Create board", "POST", "/api/kanban/boards", {"title": "Test Board", "description": "CRUD test"}, 201)
print()

# ── PROMPTS ──
print("━━━ PROMPTS ━━━")
t("List prompts", "GET", "/api/prompts")
d = t("Create prompt", "POST", "/api/prompts", {"title": "TestPrompt" + str(int(time.time())), "content": "You are helpful.", "category": "system"}, 201)
if d and "id" in d:
    created_ids["prompt"] = d["id"]
    t("Get prompt", "GET", f"/api/prompts/{d['id']}")
print()

# ── SETTINGS ──
print("━━━ SETTINGS ━━━")
t("Get settings", "GET", "/api/settings")
t("Update settings", "POST", "/api/settings", {"key": "test_setting", "value": "test_value"})
print()

# ── WORKSPACES ──
print("━━━ WORKSPACES ━━━")
t("List workspaces", "GET", "/api/workspaces")
d = t("Create workspace", "POST", "/api/workspaces", {"name": "TestWorkspace" + str(int(time.time()))}, 201)
if d and "id" in d:
    created_ids["workspace"] = d["id"]
    t("Get workspace", "GET", f"/api/workspaces/{d['id']}")
print()

# ── SKILLS ──
print("━━━ SKILLS ━━━")
t("List skills", "GET", "/api/skills")
print()

# ── QUICK ACTIONS ──
print("━━━ QUICK ACTIONS ━━━")
t("List quick actions", "GET", "/api/quick-actions")
print()

# ── MODELS ──
print("━━━ MODELS ━━━")
t("List models", "GET", "/api/models")
print()

# ── UI BUILDER ──
print("━━━ UI BUILDER ━━━")
t("List projects", "GET", "/api/ui-builder/projects")
print()

# ── SYSTEM MONITOR ──
print("━━━ SYSTEM MONITOR ━━━")
t("System monitor", "GET", "/api/system/monitor")
print()

# ── NETWORK ──
print("━━━ NETWORK ━━━")
t("Network status", "GET", "/api/network/status")
print()

# ── DEPLOY ──
print("━━━ DEPLOY ━━━")
t("Deploy logs", "GET", "/api/deploy/logs")
print()

# ── CLEANUP (DELETE) ──
print("━━━ CLEANUP / DELETE TESTS ━━━")
for name, id_val in created_ids.items():
    if name == "memory":
        t(f"Delete memory ({id_val[:8]}...)", "DELETE", f"/api/memories/{id_val}")
    elif name == "context_memory":
        t(f"Delete context memory ({id_val[:8]}...)", "DELETE", f"/api/memory/context/{id_val}")
    elif name == "agent":
        t(f"Delete agent ({id_val[:8]}...)", "DELETE", f"/api/agents/{id_val}")
    elif name == "task":
        t(f"Delete task ({id_val[:8]}...)", "DELETE", f"/api/scheduler/tasks/{id_val}")
    elif name == "pipeline":
        t(f"Delete pipeline ({id_val[:8]}...)", "DELETE", f"/api/pipelines/{id_val}")
    elif name == "prompt":
        t(f"Delete prompt ({id_val[:8]}...)", "DELETE", f"/api/prompts/{id_val}")
    elif name == "workspace":
        t(f"Delete workspace ({id_val[:8]}...)", "DELETE", f"/api/workspaces/{id_val}")
    elif name == "sandbox":
        t(f"Delete sandbox ({id_val[:8]}...)", "DELETE", f"/api/sandbox/{id_val}")
print()

# ── SUMMARY ──
print("╔══════════════════════════════════════════════════════════════╗")
print("║  TEST SUMMARY                                              ║")
print("╚══════════════════════════════════════════════════════════════╝")
print(f"  PASSED: {results['pass']}")
print(f"  FAILED: {results['fail']}")
print(f"  TOTAL:  {results['pass'] + results['fail']}")
if results["errors"]:
    print()
    print("  FAILED TESTS:")
    for e in results["errors"]:
        print(f"    • {e}")

sys.exit(0 if results["fail"] == 0 else 1)
