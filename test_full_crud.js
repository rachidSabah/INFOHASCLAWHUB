const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function test() {
  const results = { pass: 0, fail: 0, errors: [] };

  function logTest(name, passed, detail) {
    const icon = passed ? '✅' : '❌';
    const extra = detail ? ' → ' + detail : '';
    console.log('  ' + icon + ' ' + name + extra);
    if (passed) results.pass++;
    else { results.fail++; results.errors.push(name + ': ' + (detail || '')); }
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  INFOHASCLAWHUB — Deep Database & API Route Test Suite     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // ── 1. PRISMA MODEL READ TESTS ──
  console.log('━━━ PRISMA MODEL READ TESTS ━━━');
  const models = {
    'conversation': 'conversation',
    'message': 'message', 
    'memory': 'memory',
    'settings': 'settings',
    'provider': 'provider',
    'agent': 'agent',
    'prompt': 'prompt',
    'knowledgeDocument': 'knowledgeDocument',
    'contextMemory': 'contextMemory',
    'memoryLink': 'memoryLink',
    'cronTask': 'cronTask',
    'agentWorker': 'agentWorker',
    'agentExperience': 'agentExperience',
    'researchSession': 'researchSession',
    'citation': 'citation',
    'issuePipeline': 'issuePipeline',
    'sandbox': 'sandbox',
    'mCPRegistry': 'mCPRegistry',
    'providerScore': 'providerScore',
    'plugin': 'plugin',
    'verifiedPlugin': 'verifiedPlugin',
    'collabSession': 'collabSession',
    'auditLog': 'auditLog',
    'compliancePolicy': 'compliancePolicy',
    'uIBuilderProject': 'uIBuilderProject',
    'modelRoute': 'modelRoute',
    'agentPipeline': 'agentPipeline',
    'codingSession': 'codingSession',
    'uploadedFile': 'uploadedFile',
    'knowledgeChunk': 'knowledgeChunk',
    'codeIndex': 'codeIndex',
    'securityVulnerability': 'securityVulnerability',
    'botConnection': 'botConnection',
    'databaseConnection': 'databaseConnection',
    'deployEnvironment': 'deployEnvironment',
    'securityAuditLog': 'securityAuditLog',
    'exposedSecret': 'exposedSecret',
    'analyticsEvent': 'analyticsEvent',
    'gitAnalysis': 'gitAnalysis',
    'promptTemplate': 'promptTemplate'
  };

  for (const [name, model] of Object.entries(models)) {
    try {
      const count = await db[model].count();
      logTest(name + '.count()', true, count + ' records');
    } catch(e) {
      logTest(name + '.count()', false, e.message.slice(0, 80));
    }
  }
  console.log('');

  // ── 2. MEMORY CRUD CYCLE ──
  console.log('━━━ MEMORY CRUD CYCLE ━━━');
  try {
    const m = await db.memory.create({ data: { key: 'crud-test-' + Date.now(), content: 'Test content from CRUD suite', source: 'crud-test' } });
    logTest('Memory.create', true, 'id=' + m.id);
    
    const found = await db.memory.findUnique({ where: { id: m.id } });
    logTest('Memory.findUnique', !!found);
    
    const updated = await db.memory.update({ where: { id: m.id }, data: { content: 'Updated content' } });
    logTest('Memory.update', updated.content === 'Updated content');
    
    await db.memory.delete({ where: { id: m.id } });
    logTest('Memory.delete', true);
  } catch(e) {
    logTest('Memory CRUD cycle', false, e.message.slice(0, 100));
  }
  console.log('');

  // ── 3. CONTEXT MEMORY CRUD ──
  console.log('━━━ CONTEXT MEMORY CRUD ━━━');
  try {
    const cm = await db.contextMemory.create({
      data: {
        type: 'episodic',
        category: 'conversation',
        content: 'Context memory CRUD test',
        priority: 3,
        tags: '["test","crud"]'
      }
    });
    logTest('ContextMemory.create', true, 'id=' + cm.id);
    
    const found = await db.contextMemory.findUnique({ where: { id: cm.id } });
    logTest('ContextMemory.findUnique', !!found);
    
    const updated = await db.contextMemory.update({ where: { id: cm.id }, data: { priority: 5, accessCount: 1 } });
    logTest('ContextMemory.update', updated.priority === 5);
    
    // Test embedding storage
    const withEmb = await db.contextMemory.update({ 
      where: { id: cm.id }, 
      data: { embedding: JSON.stringify([0.1, 0.2, 0.3]) } 
    });
    logTest('ContextMemory.embedding storage', !!withEmb.embedding);
    
    await db.contextMemory.delete({ where: { id: cm.id } });
    logTest('ContextMemory.delete', true);
  } catch(e) {
    logTest('ContextMemory CRUD', false, e.message.slice(0, 100));
  }
  console.log('');

  // ── 4. AGENT CRUD ──
  console.log('━━━ AGENT CRUD ━━━');
  try {
    const a = await db.agent.create({
      data: {
        name: 'Test Agent',
        description: 'CRUD test agent',
        type: 'assistant',
        capabilities: '["chat","code"]',
        status: 'idle'
      }
    });
    logTest('Agent.create', true, 'id=' + a.id);
    
    const found = await db.agent.findUnique({ where: { id: a.id } });
    logTest('Agent.findUnique', !!found);
    
    const updated = await db.agent.update({ where: { id: a.id }, data: { name: 'Updated Agent' } });
    logTest('Agent.update', updated.name === 'Updated Agent');
    
    await db.agent.delete({ where: { id: a.id } });
    logTest('Agent.delete', true);
  } catch(e) {
    logTest('Agent CRUD', false, e.message.slice(0, 100));
  }
  console.log('');

  // ── 5. CRON TASK CRUD ──
  console.log('━━━ CRON TASK CRUD ━━━');
  try {
    const ct = await db.cronTask.create({
      data: {
        name: 'Test Cron Task',
        schedule: '*/5 * * * *',
        action: 'health_check',
        enabled: true
      }
    });
    logTest('CronTask.create', true, 'id=' + ct.id);
    
    const found = await db.cronTask.findUnique({ where: { id: ct.id } });
    logTest('CronTask.findUnique', !!found);
    
    await db.cronTask.delete({ where: { id: ct.id } });
    logTest('CronTask.delete', true);
  } catch(e) {
    logTest('CronTask CRUD', false, e.message.slice(0, 100));
  }
  console.log('');

  // ── 6. RESEARCH SESSION CRUD ──
  console.log('━━━ RESEARCH SESSION CRUD ━━━');
  try {
    const rs = await db.researchSession.create({
      data: {
        query: 'Test research query',
        depth: 'standard',
        status: 'pending'
      }
    });
    logTest('ResearchSession.create', true, 'id=' + rs.id);
    await db.researchSession.delete({ where: { id: rs.id } });
    logTest('ResearchSession.delete', true);
  } catch(e) {
    logTest('ResearchSession CRUD', false, e.message.slice(0, 100));
  }
  console.log('');

  // ── 7. ISSUE PIPELINE CRUD ──
  console.log('━━━ ISSUE PIPELINE CRUD ━━━');
  try {
    const ip = await db.issuePipeline.create({
      data: {
        title: 'Test Issue',
        description: 'CRUD test issue',
        type: 'bug',
        priority: 'high',
        status: 'open'
      }
    });
    logTest('IssuePipeline.create', true, 'id=' + ip.id);
    await db.issuePipeline.delete({ where: { id: ip.id } });
    logTest('IssuePipeline.delete', true);
  } catch(e) {
    logTest('IssuePipeline CRUD', false, e.message.slice(0, 100));
  }
  console.log('');

  // ── 8. SANDBOX CRUD ──
  console.log('━━━ SANDBOX CRUD ━━━');
  try {
    const sb = await db.sandbox.create({
      data: {
        name: 'Test Sandbox',
        template: 'node',
        description: 'CRUD test sandbox',
        status: 'created'
      }
    });
    logTest('Sandbox.create', true, 'id=' + sb.id);
    await db.sandbox.delete({ where: { id: sb.id } });
    logTest('Sandbox.delete', true);
  } catch(e) {
    logTest('Sandbox CRUD', false, e.message.slice(0, 100));
  }
  console.log('');

  // ── 9. PLUGIN CRUD ──
  console.log('━━━ PLUGIN CRUD ━━━');
  try {
    const p = await db.plugin.create({
      data: {
        name: 'Test Plugin',
        description: 'CRUD test plugin',
        version: '1.0.0',
        author: 'test',
        status: 'available'
      }
    });
    logTest('Plugin.create', true, 'id=' + p.id);
    await db.plugin.delete({ where: { id: p.id } });
    logTest('Plugin.delete', true);
  } catch(e) {
    logTest('Plugin CRUD', false, e.message.slice(0, 100));
  }
  console.log('');

  // ── 10. PROMPT CRUD ──
  console.log('━━━ PROMPT CRUD ━━━');
  try {
    const p = await db.prompt.create({
      data: {
        title: 'Test Prompt',
        content: 'You are a helpful assistant.',
        category: 'system'
      }
    });
    logTest('Prompt.create', true, 'id=' + p.id);
    await db.prompt.delete({ where: { id: p.id } });
    logTest('Prompt.delete', true);
  } catch(e) {
    logTest('Prompt CRUD', false, e.message.slice(0, 100));
  }
  console.log('');

  // ── 11. PROVIDER CRUD ──
  console.log('━━━ PROVIDER CRUD ━━━');
  try {
    const p = await db.provider.create({
      data: {
        name: 'Test Provider',
        baseUrl: 'https://api.test.com',
        apiKey: 'test-key',
        isActive: true
      }
    });
    logTest('Provider.create', true, 'id=' + p.id);
    await db.provider.delete({ where: { id: p.id } });
    logTest('Provider.delete', true);
  } catch(e) {
    logTest('Provider CRUD', false, e.message.slice(0, 100));
  }
  console.log('');

  // ── 12. SETTINGS CRUD ──
  console.log('━━━ SETTINGS CRUD ━━━');
  try {
    const s = await db.settings.create({
      data: { key: 'crud_test_' + Date.now(), value: 'test_value' }
    });
    logTest('Settings.create', true, 'id=' + s.id);
    await db.settings.delete({ where: { id: s.id } });
    logTest('Settings.delete', true);
  } catch(e) {
    logTest('Settings CRUD', false, e.message.slice(0, 100));
  }
  console.log('');

  // ── 13. AUDIT LOG ──
  console.log('━━━ AUDIT LOG ━━━');
  try {
    const al = await db.auditLog.create({
      data: {
        action: 'TEST',
        resource: 'test_resource',
        details: 'CRUD test audit log'
      }
    });
    logTest('AuditLog.create', true, 'id=' + al.id);
    await db.auditLog.delete({ where: { id: al.id } });
    logTest('AuditLog.delete', true);
  } catch(e) {
    logTest('AuditLog CRUD', false, e.message.slice(0, 100));
  }
  console.log('');

  // ── 14. COMPLIANCE POLICY ──
  console.log('━━━ COMPLIANCE POLICY ━━━');
  try {
    const cp = await db.compliancePolicy.create({
      data: {
        name: 'Test Policy',
        type: 'security',
        rules: '{"checkSecrets": true}',
        enabled: true
      }
    });
    logTest('CompliancePolicy.create', true, 'id=' + cp.id);
    await db.compliancePolicy.delete({ where: { id: cp.id } });
    logTest('CompliancePolicy.delete', true);
  } catch(e) {
    logTest('CompliancePolicy CRUD', false, e.message.slice(0, 100));
  }
  console.log('');

  // ── 15. COLLAB SESSION ──
  console.log('━━━ COLLAB SESSION ━━━');
  try {
    const cs = await db.collabSession.create({
      data: {
        name: 'Test Collab Session',
        status: 'active'
      }
    });
    logTest('CollabSession.create', true, 'id=' + cs.id);
    await db.collabSession.delete({ where: { id: cs.id } });
    logTest('CollabSession.delete', true);
  } catch(e) {
    logTest('CollabSession CRUD', false, e.message.slice(0, 100));
  }
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
