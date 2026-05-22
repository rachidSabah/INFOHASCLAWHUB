const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function test() {
  const tests = [];
  
  const models = [
    'memory', 'contextMemory', 'memoryLink', 'agent', 'schedulerTask',
    'researchSession', 'pipeline', 'issuePipeline', 'mcpServer',
    'plugin', 'prompt', 'workspace', 'settings', 'provider',
    'kanbanBoard', 'knowledgeDocument', 'conversation', 'auditLog',
    'collabSession', 'message', 'skill', 'modelRoute', 'quickAction'
  ];
  
  for (const model of models) {
    try {
      if (db[model] && db[model].findMany) {
        const results = await db[model].findMany({ take: 5 });
        tests.push({ name: model + '.findMany', status: 'PASS', count: results.length });
      } else {
        tests.push({ name: model, status: 'SKIP', error: 'Model not found in Prisma client' });
      }
    } catch(e) {
      tests.push({ name: model + '.findMany', status: 'FAIL', error: e.message.slice(0, 100) });
    }
  }

  // Test CRUD cycle on Memory model
  try {
    const m = await db.memory.create({ data: { key: 'crud-test-' + Date.now(), content: 'Test content', source: 'test' } });
    tests.push({ name: 'Memory.create', status: 'PASS', id: m.id });
    
    const found = await db.memory.findUnique({ where: { id: m.id } });
    tests.push({ name: 'Memory.findUnique', status: found ? 'PASS' : 'FAIL' });
    
    const updated = await db.memory.update({ where: { id: m.id }, data: { content: 'Updated content' } });
    tests.push({ name: 'Memory.update', status: updated.content === 'Updated content' ? 'PASS' : 'FAIL' });
    
    await db.memory.delete({ where: { id: m.id } });
    tests.push({ name: 'Memory.delete', status: 'PASS' });
  } catch(e) {
    tests.push({ name: 'Memory CRUD cycle', status: 'FAIL', error: e.message.slice(0, 100) });
  }

  // Test ContextMemory CRUD
  try {
    const cm = await db.contextMemory.create({
      data: {
        type: 'episodic',
        category: 'conversation',
        content: 'Test context memory',
        priority: 3,
        tags: '["test"]'
      }
    });
    tests.push({ name: 'ContextMemory.create', status: 'PASS', id: cm.id });
    await db.contextMemory.delete({ where: { id: cm.id } });
    tests.push({ name: 'ContextMemory.delete', status: 'PASS' });
  } catch(e) {
    tests.push({ name: 'ContextMemory CRUD', status: 'FAIL', error: e.message.slice(0, 100) });
  }

  // Summary
  const pass = tests.filter(t => t.status === 'PASS').length;
  const fail = tests.filter(t => t.status === 'FAIL').length;
  const skip = tests.filter(t => t.status === 'SKIP').length;
  
  console.log('');
  console.log('=== PRISMA DATABASE CRUD TEST RESULTS ===');
  for (const t of tests) {
    const icon = t.status === 'PASS' ? '✅' : (t.status === 'SKIP' ? '⏭️' : '❌');
    let extra = '';
    if (t.error) extra = ' → ' + t.error;
    else if (t.count !== undefined) extra = ' (' + t.count + ' records)';
    console.log('  ' + icon + ' ' + t.name + extra);
  }
  console.log('');
  console.log('PASSED: ' + pass + ' / FAILED: ' + fail + ' / SKIPPED: ' + skip + ' / TOTAL: ' + tests.length);
  
  await db.$disconnect();
}

test().catch(e => { console.error('Fatal:', e); process.exit(1); });
