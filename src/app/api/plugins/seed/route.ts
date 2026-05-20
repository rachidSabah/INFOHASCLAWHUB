import { db } from "@/lib/db";
import { NextResponse } from "next/server";

const PREBUILT_PLUGINS = [
  { name: "Agent Orchestrator", category: "agent", description: "Multi-agent pipeline builder with parallel execution and approval gates.", rating: 4.8, installs: 1240, author: "ClawHub", version: "1.0.0", manifest: "{}" },
  { name: "AutoCoder Pro", category: "tool", description: "Autonomous coding loop that plans, codes, tests, fixes, and commits.", rating: 4.9, installs: 2100, author: "ClawHub", version: "1.0.0", manifest: "{}" },
  { name: "SmartRouter", category: "tool", description: "AI model router that selects optimal model by task type.", rating: 4.7, installs: 890, author: "ClawHub", version: "1.0.0", manifest: "{}" },
  { name: "CodeSense", category: "tool", description: "Semantic code search, dependency analysis, security scanning.", rating: 4.6, installs: 1560, author: "ClawHub", version: "1.0.0", manifest: "{}" },
  { name: "PairTerminal", category: "tool", description: "Split-view terminal with AI pair programmer.", rating: 4.5, installs: 720, author: "ClawHub", version: "1.0.0", manifest: "{}" },
  { name: "MultiComms Hub", category: "integration", description: "Connect WhatsApp, Telegram, Discord, Slack bots.", rating: 4.8, installs: 3300, author: "ClawHub", version: "1.0.0", manifest: "{}" },
  { name: "UIForge", category: "tool", description: "Generate UI components from descriptions or screenshots.", rating: 4.4, installs: 650, author: "ClawHub", version: "1.0.0", manifest: "{}" },
  { name: "DB Studio", category: "tool", description: "AI-powered database management with NL-to-SQL.", rating: 4.3, installs: 480, author: "ClawHub", version: "1.0.0", manifest: "{}" },
  { name: "DeployFlow", category: "integration", description: "One-click deploy to Docker, Serverless, VPS, Static.", rating: 4.6, installs: 920, author: "ClawHub", version: "1.0.0", manifest: "{}" },
  { name: "SecureVault", category: "utility", description: "Secret scanner, audit logs, and compliance checker.", rating: 4.9, installs: 1100, author: "ClawHub", version: "1.0.0", manifest: "{}" },
  { name: "Analytics Pro", category: "utility", description: "Token usage, cost tracking, model breakdown dashboard.", rating: 4.2, installs: 550, author: "ClawHub", version: "1.0.0", manifest: "{}" },
  { name: "Plugin Store", category: "utility", description: "Community marketplace for plugins and extensions.", rating: 4.0, installs: 300, author: "ClawHub", version: "1.0.0", manifest: "{}" },
  { name: "QuickOps", category: "utility", description: "One-click AI ops: explain, refactor, test, document, optimize.", rating: 4.7, installs: 780, author: "ClawHub", version: "1.0.0", manifest: "{}" },
  { name: "VoiceCode", category: "tool", description: "Speak code changes, navigate by voice, meeting transcription.", rating: 4.1, installs: 340, author: "ClawHub", version: "1.0.0", manifest: "{}" },
  { name: "GitSense", category: "tool", description: "AI commit messages, PR reviews, conflict resolution.", rating: 4.5, installs: 670, author: "ClawHub", version: "1.0.0", manifest: "{}" },
  { name: "MobileLink", category: "integration", description: "Monitor and control agents from your phone.", rating: 4.3, installs: 420, author: "ClawHub", version: "1.0.0", manifest: "{}" },
  { name: "WhatsApp Bot", category: "integration", description: "Auto-reply WhatsApp bot with AI, QR scan, multi-personality.", rating: 4.8, installs: 2500, author: "ClawHub", version: "1.0.0", manifest: "{}" },
  { name: "ClawHub Doctor", category: "utility", description: "System diagnostic tool. Check Node, npm, Git, DB, network.", rating: 4.6, installs: 950, author: "ClawHub", version: "1.0.0", manifest: "{}" },
];

export async function POST() {
  try {
    let created = 0;
    let updated = 0;

    // Seed plugins
    for (const plugin of PREBUILT_PLUGINS) {
      try {
        const existing = await (db as any).plugin.findFirst({ where: { name: plugin.name } });
        if (existing) {
          await (db as any).plugin.update({ where: { id: existing.id }, data: { ...plugin, isInstalled: true, isEnabled: true } });
        } else {
          await (db as any).plugin.create({ data: { ...plugin, isInstalled: true, isEnabled: true } });
        }
        created++;
      } catch (e: any) { 
        console.error(`Plugin seed error for ${plugin.name}:`, e.message);
      }
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
