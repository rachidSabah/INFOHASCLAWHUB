import { db } from "@/lib/db";
import { NextResponse } from "next/server";

const PREBUILT_PLUGINS = [
  { name: "Agent Orchestrator", category: "agent", description: "Multi-agent pipeline builder with parallel execution and approval gates. Create complex workflows by chaining agents together.", rating: 4.8, installs: 1240, author: "ClawHub" },
  { name: "AutoCoder Pro", category: "tool", description: "Autonomous coding loop that plans, codes, tests, fixes, and commits automatically. Full CI/CD integration included.", rating: 4.9, installs: 2100, author: "ClawHub" },
  { name: "SmartRouter", category: "tool", description: "AI-powered model router that selects the optimal model based on task type, cost, and latency requirements.", rating: 4.7, installs: 890, author: "ClawHub" },
  { name: "CodeSense", category: "tool", description: "Semantic codebase search, dependency analysis, architecture mapping, and security vulnerability scanning.", rating: 4.6, installs: 1560, author: "ClawHub" },
  { name: "PairTerminal", category: "tool", description: "Split-view terminal with AI pair programmer. Get real-time explanations, error fixes, and command generation.", rating: 4.5, installs: 720, author: "ClawHub" },
  { name: "MultiComms Hub", category: "integration", description: "Connect WhatsApp, Telegram, Discord, and Slack bots. Auto-reply with AI, broadcast messages across platforms.", rating: 4.8, installs: 3300, author: "ClawHub" },
  { name: "UIForge", category: "tool", description: "Generate UI components from descriptions or screenshots. Supports React, Vue, and HTML with live preview.", rating: 4.4, installs: 650, author: "ClawHub" },
  { name: "DB Studio", category: "tool", description: "AI-powered database management. Natural language to SQL, schema visualization, migration generation.", rating: 4.3, installs: 480, author: "ClawHub" },
  { name: "DeployFlow", category: "integration", description: "One-click deployment to Docker, Serverless, VPS, or Static hosting. Rollback support and environment comparison.", rating: 4.6, installs: 920, author: "ClawHub" },
  { name: "SecureVault", category: "utility", description: "Secret scanner, audit logs, and compliance checker. Find hardcoded keys and tokens before they leak.", rating: 4.9, installs: 1100, author: "ClawHub" },
  { name: "Analytics Pro", category: "utility", description: "Token usage dashboard, cost tracking, model breakdown, and AI-powered optimization recommendations.", rating: 4.2, installs: 550, author: "ClawHub" },
  { name: "Plugin Store", category: "utility", description: "Community marketplace for plugins. Browse, install, enable, disable, and publish extensions.", rating: 4.0, installs: 300, author: "ClawHub" },
  { name: "QuickOps", category: "utility", description: "One-click AI operations: explain, refactor, test, document, optimize files. Project-wide actions like dockerize and CI/CD setup.", rating: 4.7, installs: 780, author: "ClawHub" },
  { name: "VoiceCode", category: "tool", description: "Speak code changes and navigate by voice. Meeting note transcription with AI task extraction.", rating: 4.1, installs: 340, author: "ClawHub" },
  { name: "GitSense", category: "tool", description: "AI-generated commit messages, PR code reviews with severity levels, and merge conflict resolution.", rating: 4.5, installs: 670, author: "ClawHub" },
  { name: "MobileLink", category: "integration", description: "Monitor and control your agents from your phone. Push notifications, remote messaging, QR code pairing.", rating: 4.3, installs: 420, author: "ClawHub" },
  { name: "WhatsApp Bot", category: "integration", description: "Auto-reply WhatsApp bot with AI. Connect via QR, configure personality, and get AI responses to messages.", rating: 4.8, installs: 2500, author: "ClawHub" },
  { name: "ClawHub Doctor", category: "utility", description: "System diagnostic tool. Check Node.js, npm, Git, SQLite, skills, dependencies, network, and more.", rating: 4.6, installs: 950, author: "ClawHub" },
];

export async function POST() {
  try {
    let created = 0;
    let updated = 0;

    // Seed plugins
    for (const plugin of PREBUILT_PLUGINS) {
      try {
        await (db as any).plugin.upsert({
          where: { name: plugin.name },
          update: plugin,
          create: { ...plugin, isInstalled: true, isEnabled: true },
        });
        created++;
      } catch { updated++; }
    }

    // Seed prebuilt pipelines
    const prebuiltPipelines = [
      { name: "Code Review Pipeline", description: "Auto code review: lint → test → review → fix", steps: JSON.stringify([{ agentId: "agent1", order: 0, description: "Run linter on changed files", approvalRequired: false }, { agentId: "agent1", order: 1, description: "Run unit tests", approvalRequired: false }, { agentId: "agent1", order: 2, description: "AI code review", approvalRequired: true }, { agentId: "agent1", order: 3, description: "Auto-fix issues", approvalRequired: false }]), status: "draft", currentStep: 0 },
      { name: "Deploy Pipeline", description: "Build → test → deploy to staging → deploy to production", steps: JSON.stringify([{ agentId: "agent1", order: 0, description: "Build project", approvalRequired: false }, { agentId: "agent1", order: 1, description: "Run integration tests", approvalRequired: false }, { agentId: "agent1", order: 2, description: "Deploy to staging", approvalRequired: true }, { agentId: "agent1", order: 3, description: "Smoke tests on staging", approvalRequired: false }, { agentId: "agent1", order: 4, description: "Deploy to production", approvalRequired: true }]), status: "draft", currentStep: 0 },
    ];
    for (const p of prebuiltPipelines) {
      try { await (db as any).agentPipeline.create({ data: p }); } catch {}
    }

    // Seed prebuilt model routes
    const prebuiltRoutes = [
      { name: "Code Generation", taskType: "code", model: "deepseek/deepseek-chat", priority: 1, fallbackChain: JSON.stringify(["openai/gpt-4o", "anthropic/claude-sonnet-4-20250514"]) },
      { name: "Quick Chat", taskType: "chat", model: "gemini-2.0-flash", priority: 1, fallbackChain: JSON.stringify(["gemini-2.5-pro"]) },
      { name: "Code Review", taskType: "analysis", model: "anthropic/claude-sonnet-4-20250514", priority: 1, fallbackChain: JSON.stringify(["openai/gpt-4o"]) },
    ];
    for (const r of prebuiltRoutes) {
      try { await (db as any).modelRoute.create({ data: r }); } catch {}
    }

    return NextResponse.json({ success: true, plugins: created, prebuilts: "Pipeline templates, model routes, and 18 plugins seeded" });
  } catch (error: any) {
    console.error("[Prebuilt Seed Error]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
