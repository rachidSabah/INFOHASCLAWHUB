const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

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
  console.log('║  INFOHASCLAWHUB — Deep Prisma CRUD Test Suite (v2)        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // ── AGENT CRUD ──
  console.log('━━━ AGENT CRUD ━━━');
  try {
    const a = await db.agent.create({
      data: { name: 'TestAgent-' + Date.now(), role: 'assistant', systemPrompt: 'You are a test assistant.', skills: '["chat","code"]' }
    });
    log('Agent.create', true, 'id=' + a.id);
    const found = await db.agent.findUnique({ where: { id: a.id } });
    log('Agent.findUnique', !!found);
    const updated = await db.agent.update({ where: { id: a.id }, data: { role: 'coder', systemPrompt: 'Updated prompt' } });
    log('Agent.update', updated.role === 'coder');
    await db.agent.delete({ where: { id: a.id } });
    log('Agent.delete', true);
  } catch(e) {
    log('Agent CRUD', false, e.message.slice(0, 120));
  }
  console.log('');

  // ── CRON TASK CRUD ──
  console.log('━━━ CRON TASK CRUD ━━━');
  try {
    const ct = await db.cronTask.create({
      data: { name: 'TestCron-' + Date.now(), cronExpr: '*/5 * * * *', taskType: 'health_check', config: '{}' }
    });
    log('CronTask.create', true, 'id=' + ct.id);
    const found = await db.cronTask.findUnique({ where: { id: ct.id } });
    log('CronTask.findUnique', !!found);
    await db.cronTask.update({ where: { id: ct.id }, data: { status: 'paused' } });
    log('CronTask.update', true);
    await db.cronTask.delete({ where: { id: ct.id } });
    log('CronTask.delete', true);
  } catch(e) {
    log('CronTask CRUD', false, e.message.slice(0, 120));
  }
  console.log('');

  // ── ISSUE PIPELINE CRUD ──
  console.log('━━━ ISSUE PIPELINE CRUD ━━━');
  try {
    const ip = await db.issuePipeline.create({
      data: { issueTitle: 'Test Issue ' + Date.now() }
    });
    log('IssuePipeline.create', true, 'id=' + ip.id);
    const found = await db.issuePipeline.findUnique({ where: { id: ip.id } });
    log('IssuePipeline.findUnique', !!found);
    await db.issuePipeline.update({ where: { id: ip.id }, data: { status: 'coding' } });
    log('IssuePipeline.update', true);
    await db.issuePipeline.delete({ where: { id: ip.id } });
    log('IssuePipeline.delete', true);
  } catch(e) {
    log('IssuePipeline CRUD', false, e.message.slice(0, 120));
  }
  console.log('');

  // ── SANDBOX CRUD ──
  console.log('━━━ SANDBOX CRUD ━━━');
  try {
    const sb = await db.sandbox.create({
      data: { name: 'TestSandbox-' + Date.now(), framework: 'nextjs' }
    });
    log('Sandbox.create', true, 'id=' + sb.id);
    const found = await db.sandbox.findUnique({ where: { id: sb.id } });
    log('Sandbox.findUnique', !!found);
    await db.sandbox.update({ where: { id: sb.id }, data: { status: 'running', port: 3000 } });
    log('Sandbox.update', true);
    await db.sandbox.delete({ where: { id: sb.id } });
    log('Sandbox.delete', true);
  } catch(e) {
    log('Sandbox CRUD', false, e.message.slice(0, 120));
  }
  console.log('');

  // ── PLUGIN CRUD ──
  console.log('━━━ PLUGIN CRUD ━━━');
  try {
    const p = await db.plugin.create({
      data: { name: 'TestPlugin-' + Date.now(), description: 'Test plugin', author: 'test', version: '1.0.0', category: 'tool', manifest: '{}' }
    });
    log('Plugin.create', true, 'id=' + p.id);
    const found = await db.plugin.findUnique({ where: { id: p.id } });
    log('Plugin.findUnique', !!found);
    await db.plugin.update({ where: { id: p.id }, data: { isEnabled: true } });
    log('Plugin.update', true);
    await db.plugin.delete({ where: { id: p.id } });
    log('Plugin.delete', true);
  } catch(e) {
    log('Plugin CRUD', false, e.message.slice(0, 120));
  }
  console.log('');

  // ── AUDIT LOG CRUD ──
  console.log('━━━ AUDIT LOG CRUD ━━━');
  try {
    const al = await db.auditLog.create({
      data: { actor: 'test-user', action: 'CREATE', resource: 'test', result: 'success' }
    });
    log('AuditLog.create', true, 'id=' + al.id);
    const found = await db.auditLog.findUnique({ where: { id: al.id } });
    log('AuditLog.findUnique', !!found);
    await db.auditLog.delete({ where: { id: al.id } });
    log('AuditLog.delete', true);
  } catch(e) {
    log('AuditLog CRUD', false, e.message.slice(0, 120));
  }
  console.log('');

  // ── COMPLIANCE POLICY CRUD ──
  console.log('━━━ COMPLIANCE POLICY CRUD ━━━');
  try {
    const cp = await db.compliancePolicy.create({
      data: { name: 'TestPolicy-' + Date.now(), description: 'Test policy', ruleType: 'rbac', config: '{"checkAccess": true}' }
    });
    log('CompliancePolicy.create', true, 'id=' + cp.id);
    const found = await db.compliancePolicy.findUnique({ where: { id: cp.id } });
    log('CompliancePolicy.findUnique', !!found);
    await db.compliancePolicy.update({ where: { id: cp.id }, data: { isEnabled: false } });
    log('CompliancePolicy.update', true);
    await db.compliancePolicy.delete({ where: { id: cp.id } });
    log('CompliancePolicy.delete', true);
  } catch(e) {
    log('CompliancePolicy CRUD', false, e.message.slice(0, 120));
  }
  console.log('');

  // ── COLLAB SESSION CRUD ──
  console.log('━━━ COLLAB SESSION CRUD ━━━');
  try {
    const cs = await db.collabSession.create({
      data: { name: 'TestSession-' + Date.now(), hostId: 'user-1' }
    });
    log('CollabSession.create', true, 'id=' + cs.id);
    const found = await db.collabSession.findUnique({ where: { id: cs.id } });
    log('CollabSession.findUnique', !!found);
    await db.collabSession.update({ where: { id: cs.id }, data: { status: 'ended' } });
    log('CollabSession.update', true);
    await db.collabSession.delete({ where: { id: cs.id } });
    log('CollabSession.delete', true);
  } catch(e) {
    log('CollabSession CRUD', false, e.message.slice(0, 120));
  }
  console.log('');

  // ── VERIFIED PLUGIN ──
  console.log('━━━ VERIFIED PLUGIN ━━━');
  try {
    const vp = await db.verifiedPlugin.create({
      data: { name: 'TestVerified-' + Date.now(), description: 'Test', author: 'test', version: '1.0.0', category: 'tool', manifest: '{}', checksum: 'abc123' }
    });
    log('VerifiedPlugin.create', true, 'id=' + vp.id);
    await db.verifiedPlugin.delete({ where: { id: vp.id } });
    log('VerifiedPlugin.delete', true);
  } catch(e) {
    log('VerifiedPlugin CRUD', false, e.message.slice(0, 120));
  }
  console.log('');

  // ── RESEARCH SESSION ──
  console.log('━━━ RESEARCH SESSION ━━━');
  try {
    const rs = await db.researchSession.create({
      data: { query: 'Test query ' + Date.now(), depth: 'standard', status: 'pending' }
    });
    log('ResearchSession.create', true, 'id=' + rs.id);
    await db.researchSession.update({ where: { id: rs.id }, data: { status: 'completed' } });
    log('ResearchSession.update', true);
    await db.researchSession.delete({ where: { id: rs.id } });
    log('ResearchSession.delete', true);
  } catch(e) {
    log('ResearchSession CRUD', false, e.message.slice(0, 120));
  }
  console.log('');

  // ── EXISTING MODELS ──
  console.log('━━━ EXISTING MODEL CRUD ━━━');
  try {
    const m = await db.memory.create({ data: { key: 'crud-' + Date.now(), content: 'test', source: 'test' } });
    log('Memory CRUD', true);
    await db.memory.delete({ where: { id: m.id } });
  } catch(e) { log('Memory CRUD', false, e.message.slice(0, 80)); }

  try {
    const cm = await db.contextMemory.create({ data: { type: 'episodic', category: 'conversation', content: 'test', tags: '[]' } });
    log('ContextMemory CRUD', true);
    await db.contextMemory.delete({ where: { id: cm.id } });
  } catch(e) { log('ContextMemory CRUD', false, e.message.slice(0, 80)); }

  try {
    const s = await db.settings.create({ data: { key: 'test-' + Date.now(), value: '1' } });
    log('Settings CRUD', true);
    await db.settings.delete({ where: { id: s.id } });
  } catch(e) { log('Settings CRUD', false, e.message.slice(0, 80)); }

  try {
    const p = await db.provider.create({ data: { name: 'TestProv-' + Date.now(), baseUrl: 'https://test.com', apiKey: 'k', isActive: true } });
    log('Provider CRUD', true);
    await db.provider.delete({ where: { id: p.id } });
  } catch(e) { log('Provider CRUD', false, e.message.slice(0, 80)); }

  try {
    const pr = await db.prompt.create({ data: { title: 'Test-' + Date.now(), content: 'test' } });
    log('Prompt CRUD', true);
    await db.prompt.delete({ where: { id: pr.id } });
  } catch(e) { log('Prompt CRUD', false, e.message.slice(0, 80)); }

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

  await db.$disconnect();
  process.exit(results.fail > 0 ? 1 : 0);
}

test().catch(e => { console.error('Fatal:', e); process.exit(1); });
