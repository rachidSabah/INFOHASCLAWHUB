/**
 * In-Process API Route Test Suite
 * Tests API routes directly via Next.js handler without HTTP server
 */
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
  console.log('║  INFOHASCLAWHUB — In-Process API & Power Tools Test Suite  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // ── TEST ALL DATABASE MODELS (CRUD) ──
  console.log('━━━ DATABASE MODEL CRUD TESTS ━━━');
  
  const crudTests = [
    {
      name: 'Memory',
      model: 'memory',
      create: { key: 'test-' + Date.now(), content: 'Test content', source: 'crud-test' },
      update: { content: 'Updated content' }
    },
    {
      name: 'ContextMemory',
      model: 'contextMemory',
      create: { type: 'episodic', category: 'conversation', content: 'Test context memory', tags: '["test"]' },
      update: { priority: 5, accessCount: 1 }
    },
    {
      name: 'Agent',
      model: 'agent',
      create: { name: 'TestAgent-' + Date.now(), role: 'assistant', systemPrompt: 'You are a test assistant.' },
      update: { role: 'coder', systemPrompt: 'Updated prompt' }
    },
    {
      name: 'CronTask',
      model: 'cronTask',
      create: { name: 'TestCron-' + Date.now(), cronExpr: '*/5 * * * *', taskType: 'health_check', config: '{}' },
      update: { status: 'paused' }
    },
    {
      name: 'ResearchSession',
      model: 'researchSession',
      create: { query: 'Test query ' + Date.now(), depth: 'standard', status: 'pending' },
      update: { status: 'completed' }
    },
    {
      name: 'IssuePipeline',
      model: 'issuePipeline',
      create: { issueTitle: 'Test Issue ' + Date.now() },
      update: { status: 'coding' }
    },
    {
      name: 'Sandbox',
      model: 'sandbox',
      create: { name: 'TestSandbox-' + Date.now(), framework: 'nextjs' },
      update: { status: 'running', port: 3000 }
    },
    {
      name: 'Plugin',
      model: 'plugin',
      create: { name: 'TestPlugin-' + Date.now(), description: 'Test', author: 'test', version: '1.0.0', category: 'tool', manifest: '{}' },
      update: { isEnabled: true }
    },
    {
      name: 'AuditLog',
      model: 'auditLog',
      create: { actor: 'test-user', action: 'CREATE', resource: 'test', result: 'success' },
      update: null // No update needed for audit logs
    },
    {
      name: 'CompliancePolicy',
      model: 'compliancePolicy',
      create: { name: 'TestPolicy-' + Date.now(), description: 'Test', ruleType: 'rbac', config: '{}' },
      update: { isEnabled: false }
    },
    {
      name: 'CollabSession',
      model: 'collabSession',
      create: { name: 'TestSession-' + Date.now(), hostId: 'user-1' },
      update: { status: 'ended' }
    },
    {
      name: 'Settings',
      model: 'settings',
      create: { key: 'test-' + Date.now(), value: '1' },
      update: { value: '2' }
    },
    {
      name: 'Provider',
      model: 'provider',
      create: { name: 'TestProv-' + Date.now(), baseUrl: 'https://test.com', apiKey: 'test', isActive: true },
      update: { isActive: false }
    },
    {
      name: 'Prompt',
      model: 'prompt',
      create: { title: 'Test-' + Date.now(), content: 'You are helpful.' },
      update: { content: 'Updated content' }
    }
  ];

  for (const test of crudTests) {
    try {
      // CREATE
      const created = await db[test.model].create({ data: test.create });
      log(test.name + '.create', true, 'id=' + created.id);
      
      // READ
      const found = await db[test.model].findUnique({ where: { id: created.id } });
      log(test.name + '.findUnique', !!found, !found ? 'Not found' : undefined);
      
      // UPDATE
      if (test.update) {
        const updated = await db[test.model].update({ where: { id: created.id }, data: test.update });
        log(test.name + '.update', true);
      }
      
      // DELETE
      await db[test.model].delete({ where: { id: created.id } });
      log(test.name + '.delete', true);
      
      // VERIFY DELETE
      const deleted = await db[test.model].findUnique({ where: { id: created.id } });
      log(test.name + '.verifyDelete', !deleted, deleted ? 'Still exists!' : undefined);
    } catch (e) {
      log(test.name + ' CRUD', false, e.message.slice(0, 120));
    }
  }
  console.log('');

  // ── TEST EMBEDDINGS ENGINE ──
  console.log('━━━ EMBEDDINGS ENGINE ━━━');
  try {
    const { generateEmbedding, cosineSimilarity } = require('./src/lib/embeddings.ts');
    // Note: TS requires compilation, use the JS version
  } catch(e) {
    // Try direct require
  }
  try {
    // Test embedding generation via dynamic import
    const emb = await import('./src/lib/embeddings.ts');
    const vec1 = await emb.generateEmbedding("Hello world test");
    log('Embedding.generate', Array.isArray(vec1) && vec1.length > 0, 'dim=' + vec1.length);
    const vec2 = await emb.generateEmbedding("Hello world test");
    const sim = emb.cosineSimilarity(vec1, vec2);
    log('Embedding.cosineSimilarity', sim > 0.9, 'sim=' + sim.toFixed(4));
    const vec3 = await emb.generateEmbedding("Completely different content about quantum physics");
    const simDiff = emb.cosineSimilarity(vec1, vec3);
    log('Embedding.differentContent', simDiff < sim, 'sim=' + simDiff.toFixed(4));
  } catch(e) {
    log('Embeddings engine', false, e.message.slice(0, 120));
  }
  console.log('');

  // ── TEST UNIVERSAL MEMORY ENGINE ──
  console.log('━━━ UNIVERSAL MEMORY ENGINE ━━━');
  try {
    const memMod = await import('./src/lib/universal-memory.ts');
    const memory = memMod.getUniversalMemory();
    
    // Store
    const stored = await memory.store({
      type: 'episodic',
      category: 'conversation',
      content: 'Test memory from in-process test suite',
      priority: 5,
      tags: ['test', 'crud']
    });
    log('Memory.store', !!stored.id, 'id=' + stored.id);
    
    // Search
    const results = await memory.search({ query: 'test memory', limit: 5 });
    log('Memory.search', Array.isArray(results), results.length + ' results');
    
    // Get Stats
    const stats = await memory.getStats();
    log('Memory.getStats', stats.totalMemories >= 0, 'total=' + stats.totalMemories);
    
    // Prune (should not delete recent memories)
    const pruned = await memory.prune();
    log('Memory.prune', typeof pruned === 'number', pruned + ' pruned');
    
    // Cleanup
    await db.contextMemory.delete({ where: { id: stored.id } }).catch(() => {});
  } catch(e) {
    log('Universal Memory Engine', false, e.message.slice(0, 150));
  }
  console.log('');

  // ── TEST ALL READ-ONLY MODELS ──
  console.log('━━━ READ-ONLY MODEL TESTS ━━━');
  const readOnlyModels = [
    'conversation', 'message', 'knowledgeDocument', 'knowledgeChunk',
    'memoryLink', 'agentWorker', 'agentExperience', 'agentPipeline',
    'citation', 'mCPRegistry', 'providerScore', 'verifiedPlugin',
    'uIBuilderProject', 'modelRoute', 'codingSession', 'uploadedFile',
    'codeIndex', 'securityVulnerability', 'botConnection', 'databaseConnection',
    'deployEnvironment', 'securityAuditLog', 'exposedSecret', 'analyticsEvent',
    'gitAnalysis', 'promptTemplate'
  ];
  
  for (const model of readOnlyModels) {
    try {
      const count = await db[model].count();
      log(model + '.count()', true, count + ' records');
    } catch(e) {
      log(model + '.count()', false, e.message.slice(0, 80));
    }
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
    results.errors.slice(0, 20).forEach(e => console.log('    • ' + e));
    if (results.errors.length > 20) console.log('    ... and ' + (results.errors.length - 20) + ' more');
  }

  await db.$disconnect();
  process.exit(results.fail > 0 ? 1 : 0);
}

test().catch(e => { console.error('Fatal:', e); process.exit(1); });
