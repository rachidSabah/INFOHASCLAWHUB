/**
 * HTTP API Test - starts server, runs tests, captures results
 */
const { execSync, spawn } = require('child_process');
const http = require('http');

function httpRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: data.slice(0, 500) });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  const results = { pass: 0, fail: 0, errors: [] };

  function log(name, passed, detail) {
    const icon = passed ? '✅' : '❌';
    const extra = detail ? ' → ' + detail : '';
    console.log('  ' + icon + ' ' + name + extra);
    if (passed) results.pass++;
    else { results.fail++; results.errors.push(name + ': ' + (detail || '')); }
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  INFOHASCLAWHUB — HTTP API Route Test Suite                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Start server
  console.log('Starting server...');
  const server = spawn('node', ['-e', `
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const app = next({ dev: false });
const handle = app.getRequestHandler();
app.prepare().then(() => {
  createServer(async (req, res) => {
    try { await handle(req, res, parse(req.url, true)); }
    catch (err) { res.statusCode = 500; res.end('error'); }
  }).listen(3000, () => console.log('SERVER_READY'));
}).catch(e => { console.error(e); process.exit(1); });
`], { stdio: ['pipe', 'pipe', 'pipe'], detached: false });

  let serverReady = false;
  server.stdout.on('data', (d) => {
    if (d.toString().includes('SERVER_READY')) serverReady = true;
  });

  // Wait for server
  for (let i = 0; i < 30; i++) {
    if (serverReady) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!serverReady) {
    console.log('Server failed to start!');
    process.exit(1);
  }
  console.log('Server ready!');
  console.log('');

  // ── HEALTH ──
  console.log('━━━ HEALTH CHECK ━━━');
  try {
    const r = await httpRequest('GET', '/api/health');
    log('Health', r.status === 200, r.status === 200 ? 'OK' : 'status=' + r.status);
  } catch(e) { log('Health', false, e.message.slice(0, 80)); }
  console.log('');

  // ── MEMORIES ──
  console.log('━━━ MEMORIES ━━━');
  let memId;
  try {
    const r = await httpRequest('GET', '/api/memories');
    log('List memories', r.status === 200);
  } catch(e) { log('List memories', false, e.message.slice(0, 80)); }
  try {
    const r = await httpRequest('POST', '/api/memories', { key: 'http-test-' + Date.now(), content: 'HTTP test', source: 'test' });
    log('Create memory', r.status === 201, r.data && r.data.id ? 'id=' + r.data.id : 'status=' + r.status);
    if (r.data && r.data.id) memId = r.data.id;
  } catch(e) { log('Create memory', false, e.message.slice(0, 80)); }
  if (memId) {
    try {
      const r = await httpRequest('GET', '/api/memories/' + memId);
      log('Get memory', r.status === 200);
    } catch(e) { log('Get memory', false, e.message.slice(0, 80)); }
    try {
      const r = await httpRequest('DELETE', '/api/memories/' + memId);
      log('Delete memory', r.status === 200 || r.status === 204);
    } catch(e) { log('Delete memory', false, e.message.slice(0, 80)); }
  }
  console.log('');

  // ── CONTEXT MEMORY ──
  console.log('━━━ CONTEXT MEMORY ━━━');
  let cmemId;
  try {
    const r = await httpRequest('POST', '/api/memory/context', { type: 'episodic', category: 'conversation', content: 'HTTP test context memory', priority: 3 });
    log('Store context memory', r.status === 201, r.data && r.data.id ? 'id=' + r.data.id : 'status=' + r.status);
    if (r.data && r.data.id) cmemId = r.data.id;
  } catch(e) { log('Store context memory', false, e.message.slice(0, 80)); }
  try {
    const r = await httpRequest('GET', '/api/memory/context?query=test');
    log('Search context memory', r.status === 200);
  } catch(e) { log('Search context memory', false, e.message.slice(0, 80)); }
  try {
    const r = await httpRequest('GET', '/api/memory/context/stats');
    log('Memory stats', r.status === 200);
  } catch(e) { log('Memory stats', false, e.message.slice(0, 80)); }
  if (cmemId) {
    try {
      const r = await httpRequest('GET', '/api/memory/context/' + cmemId);
      log('Get context memory', r.status === 200);
    } catch(e) { log('Get context memory', false, e.message.slice(0, 80)); }
    try {
      const r = await httpRequest('DELETE', '/api/memory/context/' + cmemId);
      log('Delete context memory', r.status === 200 || r.status === 204);
    } catch(e) { log('Delete context memory', false, e.message.slice(0, 80)); }
  }
  console.log('');

  // ── AGENTS ──
  console.log('━━━ AGENTS ━━━');
  let agentId;
  try {
    const r = await httpRequest('GET', '/api/agents');
    log('List agents', r.status === 200);
  } catch(e) { log('List agents', false, e.message.slice(0, 80)); }
  try {
    const r = await httpRequest('POST', '/api/agents', { name: 'HTTPAgent-' + Date.now(), role: 'assistant', systemPrompt: 'You are a test agent.' });
    log('Create agent', r.status === 201, r.data && r.data.id ? 'id=' + r.data.id : 'status=' + r.status);
    if (r.data && r.data.id) agentId = r.data.id;
  } catch(e) { log('Create agent', false, e.message.slice(0, 80)); }
  if (agentId) {
    try {
      const r = await httpRequest('GET', '/api/agents/' + agentId);
      log('Get agent', r.status === 200);
    } catch(e) { log('Get agent', false, e.message.slice(0, 80)); }
    try {
      const r = await httpRequest('PUT', '/api/agents/' + agentId, { name: 'UpdatedAgent', role: 'coder' });
      log('Update agent', r.status === 200);
    } catch(e) { log('Update agent', false, e.message.slice(0, 80)); }
    try {
      const r = await httpRequest('DELETE', '/api/agents/' + agentId);
      log('Delete agent', r.status === 200 || r.status === 204);
    } catch(e) { log('Delete agent', false, e.message.slice(0, 80)); }
  }
  console.log('');

  // ── SCHEDULER/CRON ──
  console.log('━━━ SCHEDULER/CRON ━━━');
  let taskId;
  try {
    const r = await httpRequest('GET', '/api/scheduler/tasks');
    log('List scheduler tasks', r.status === 200);
  } catch(e) { log('List scheduler tasks', false, e.message.slice(0, 80)); }
  try {
    const r = await httpRequest('POST', '/api/scheduler/tasks', { name: 'HTTPTask-' + Date.now(), cronExpr: '*/5 * * * *', taskType: 'health_check', config: '{}' });
    log('Create scheduler task', r.status === 201, r.data && r.data.id ? 'id=' + r.data.id : 'status=' + r.status);
    if (r.data && r.data.id) taskId = r.data.id;
  } catch(e) { log('Create scheduler task', false, e.message.slice(0, 80)); }
  if (taskId) {
    try {
      const r = await httpRequest('GET', '/api/scheduler/tasks/' + taskId);
      log('Get scheduler task', r.status === 200);
    } catch(e) { log('Get scheduler task', false, e.message.slice(0, 80)); }
    try {
      const r = await httpRequest('DELETE', '/api/scheduler/tasks/' + taskId);
      log('Delete scheduler task', r.status === 200 || r.status === 204);
    } catch(e) { log('Delete scheduler task', false, e.message.slice(0, 80)); }
  }
  console.log('');

  // ── RESEARCH ──
  console.log('━━━ RESEARCH ━━━');
  let researchId;
  try {
    const r = await httpRequest('GET', '/api/research');
    log('List research', r.status === 200);
  } catch(e) { log('List research', false, e.message.slice(0, 80)); }
  try {
    const r = await httpRequest('POST', '/api/research', { query: 'Test query ' + Date.now(), depth: 'standard' });
    log('Create research', r.status === 201, r.data && r.data.id ? 'id=' + r.data.id : 'status=' + r.status);
    if (r.data && r.data.id) researchId = r.data.id;
  } catch(e) { log('Create research', false, e.message.slice(0, 80)); }
  if (researchId) {
    try {
      const r = await httpRequest('GET', '/api/research/' + researchId);
      log('Get research', r.status === 200);
    } catch(e) { log('Get research', false, e.message.slice(0, 80)); }
    try {
      const r = await httpRequest('DELETE', '/api/research/' + researchId);
      log('Delete research', r.status === 200 || r.status === 204);
    } catch(e) { log('Delete research', false, e.message.slice(0, 80)); }
  }
  console.log('');

  // ── ISSUE PIPELINE ──
  console.log('━━━ ISSUE PIPELINE ━━━');
  let issueId;
  try {
    const r = await httpRequest('GET', '/api/issue-pipeline');
    log('List issues', r.status === 200);
  } catch(e) { log('List issues', false, e.message.slice(0, 80)); }
  try {
    const r = await httpRequest('POST', '/api/issue-pipeline', { issueTitle: 'HTTP Test Issue ' + Date.now() });
    log('Create issue', r.status === 201, r.data && r.data.id ? 'id=' + r.data.id : 'status=' + r.status);
    if (r.data && r.data.id) issueId = r.data.id;
  } catch(e) { log('Create issue', false, e.message.slice(0, 80)); }
  if (issueId) {
    try {
      const r = await httpRequest('GET', '/api/issue-pipeline/' + issueId);
      log('Get issue', r.status === 200);
    } catch(e) { log('Get issue', false, e.message.slice(0, 80)); }
    try {
      const r = await httpRequest('DELETE', '/api/issue-pipeline/' + issueId);
      log('Delete issue', r.status === 200 || r.status === 204);
    } catch(e) { log('Delete issue', false, e.message.slice(0, 80)); }
  }
  console.log('');

  // ── SANDBOX ──
  console.log('━━━ SANDBOX ━━━');
  let sandboxId;
  try {
    const r = await httpRequest('GET', '/api/sandbox');
    log('List sandboxes', r.status === 200);
  } catch(e) { log('List sandboxes', false, e.message.slice(0, 80)); }
  try {
    const r = await httpRequest('POST', '/api/sandbox', { name: 'HTTPSandbox-' + Date.now(), framework: 'nextjs' });
    log('Create sandbox', r.status === 201, r.data && r.data.id ? 'id=' + r.data.id : 'status=' + r.status);
    if (r.data && r.data.id) sandboxId = r.data.id;
  } catch(e) { log('Create sandbox', false, e.message.slice(0, 80)); }
  if (sandboxId) {
    try {
      const r = await httpRequest('GET', '/api/sandbox/' + sandboxId);
      log('Get sandbox', r.status === 200);
    } catch(e) { log('Get sandbox', false, e.message.slice(0, 80)); }
    try {
      const r = await httpRequest('DELETE', '/api/sandbox/' + sandboxId);
      log('Delete sandbox', r.status === 200 || r.status === 204);
    } catch(e) { log('Delete sandbox', false, e.message.slice(0, 80)); }
  }
  console.log('');

  // ── PLUGINS ──
  console.log('━━━ PLUGINS ━━━');
  let pluginId;
  try {
    const r = await httpRequest('GET', '/api/plugins');
    log('List plugins', r.status === 200);
  } catch(e) { log('List plugins', false, e.message.slice(0, 80)); }
  try {
    const r = await httpRequest('POST', '/api/plugins', { name: 'HTTPPlugin-' + Date.now(), description: 'Test', author: 'test', version: '1.0.0', category: 'tool', manifest: '{}' });
    log('Create plugin', r.status === 201, r.data && r.data.id ? 'id=' + r.data.id : 'status=' + r.status);
    if (r.data && r.data.id) pluginId = r.data.id;
  } catch(e) { log('Create plugin', false, e.message.slice(0, 80)); }
  if (pluginId) {
    try {
      const r = await httpRequest('GET', '/api/plugins/' + pluginId);
      log('Get plugin', r.status === 200);
    } catch(e) { log('Get plugin', false, e.message.slice(0, 80)); }
    try {
      const r = await httpRequest('DELETE', '/api/plugins/' + pluginId);
      log('Delete plugin', r.status === 200 || r.status === 204);
    } catch(e) { log('Delete plugin', false, e.message.slice(0, 80)); }
  }
  console.log('');

  // ── SECURITY ──
  console.log('━━━ SECURITY / COMPLIANCE ━━━');
  try {
    const r = await httpRequest('GET', '/api/security/audit');
    log('Audit log', r.status === 200);
  } catch(e) { log('Audit log', false, e.message.slice(0, 80)); }
  try {
    const r = await httpRequest('GET', '/api/security/compliance');
    log('Compliance', r.status === 200);
  } catch(e) { log('Compliance', false, e.message.slice(0, 80)); }
  try {
    const r = await httpRequest('GET', '/api/security/secrets');
    log('Secrets scan', r.status === 200);
  } catch(e) { log('Secrets scan', false, e.message.slice(0, 80)); }
  console.log('');

  // ── PROVIDERS ──
  console.log('━━━ PROVIDERS ━━━');
  try {
    const r = await httpRequest('GET', '/api/providers');
    log('List providers', r.status === 200);
  } catch(e) { log('List providers', false, e.message.slice(0, 80)); }
  try {
    const r = await httpRequest('GET', '/api/providers/models');
    log('Provider models', r.status === 200);
  } catch(e) { log('Provider models', false, e.message.slice(0, 80)); }
  console.log('');

  // ── MCP ──
  console.log('━━━ MCP ━━━');
  try {
    const r = await httpRequest('GET', '/api/mcp/servers');
    log('MCP servers', r.status === 200);
  } catch(e) { log('MCP servers', false, e.message.slice(0, 80)); }
  try {
    const r = await httpRequest('GET', '/api/mcp/tools');
    log('MCP tools', r.status === 200);
  } catch(e) { log('MCP tools', false, e.message.slice(0, 80)); }
  console.log('');

  // ── SETTINGS ──
  console.log('━━━ SETTINGS ━━━');
  try {
    const r = await httpRequest('GET', '/api/settings');
    log('Get settings', r.status === 200);
  } catch(e) { log('Get settings', false, e.message.slice(0, 80)); }
  console.log('');

  // ── MODELS ──
  console.log('━━━ MODELS ━━━');
  try {
    const r = await httpRequest('GET', '/api/models');
    log('List models', r.status === 200);
  } catch(e) { log('List models', false, e.message.slice(0, 80)); }
  console.log('');

  // ── PROMPTS ──
  console.log('━━━ PROMPTS ━━━');
  let promptId;
  try {
    const r = await httpRequest('GET', '/api/prompts');
    log('List prompts', r.status === 200);
  } catch(e) { log('List prompts', false, e.message.slice(0, 80)); }
  try {
    const r = await httpRequest('POST', '/api/prompts', { title: 'HTTPTest-' + Date.now(), content: 'Test prompt', category: 'system' });
    log('Create prompt', r.status === 201);
    if (r.data && r.data.id) promptId = r.data.id;
  } catch(e) { log('Create prompt', false, e.message.slice(0, 80)); }
  if (promptId) {
    try {
      const r = await httpRequest('DELETE', '/api/prompts/' + promptId);
      log('Delete prompt', r.status === 200 || r.status === 204);
    } catch(e) { log('Delete prompt', false, e.message.slice(0, 80)); }
  }
  console.log('');

  // ── KNOWLEDGE ──
  console.log('━━━ KNOWLEDGE ━━━');
  try {
    const r = await httpRequest('GET', '/api/knowledge/documents');
    log('List documents', r.status === 200);
  } catch(e) { log('List documents', false, e.message.slice(0, 80)); }
  console.log('');

  // ── SELF-IMPROVING ──
  console.log('━━━ SELF-IMPROVING ━━━');
  try {
    const r = await httpRequest('GET', '/api/self-improving/record');
    log('Self-improving records', r.status === 200);
  } catch(e) { log('Self-improving records', false, e.message.slice(0, 80)); }
  try {
    const r = await httpRequest('GET', '/api/self-improving/recommend');
    log('Self-improving recommend', r.status === 200);
  } catch(e) { log('Self-improving recommend', false, e.message.slice(0, 80)); }
  console.log('');

  // ── UI BUILDER ──
  console.log('━━━ UI BUILDER ━━━');
  try {
    const r = await httpRequest('GET', '/api/ui-builder/projects');
    log('UI Builder projects', r.status === 200);
  } catch(e) { log('UI Builder projects', false, e.message.slice(0, 80)); }
  console.log('');

  // ── SYSTEM ──
  console.log('━━━ SYSTEM ━━━');
  try {
    const r = await httpRequest('GET', '/api/system/monitor');
    log('System monitor', r.status === 200);
  } catch(e) { log('System monitor', false, e.message.slice(0, 80)); }
  try {
    const r = await httpRequest('GET', '/api/network/status');
    log('Network status', r.status === 200);
  } catch(e) { log('Network status', false, e.message.slice(0, 80)); }
  console.log('');

  // ── SUMMARY ──
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  TEST SUMMARY                                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('  PASSED: ' + results.pass);
  console.log('  FAILED: ' + results.fail);
  console.log('  TOTAL:  ' + (results.pass + results.fail));
  if (results.errors.length > 0) {
    console.log('');
    console.log('  FAILED TESTS:');
    results.errors.forEach(e => console.log('    • ' + e));
  }

  // Kill server
  server.kill('SIGTERM');
  process.exit(results.fail > 0 ? 1 : 0);
}

test().catch(e => { console.error('Fatal:', e); process.exit(1); });
