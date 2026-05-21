"use client";

import { useState } from "react";
import { Lightbulb, X } from "lucide-react";

const HINTS: Record<string, { title: string; steps: string[] }> = {
  "Agent Orchestration": {
    title: "Multi-Agent Pipeline Builder",
    steps: [
      "1. Click '+' to create a new pipeline",
      "2. Add steps — each step assigns an agent, a task, and optional approval gate",
      "3. Drag steps to reorder or group them for parallel execution",
      "4. Click 'Run Pipeline' — watch live progress per step",
      "5. Approve/reject steps manually or set auto-approve mode",
      "6. View final results with duration, output, and status per step",
    ],
  },
  "Autonomous Coding": {
    title: "AI-Driven Coding Loop (Plan → Code → Test → Fix → Commit)",
    steps: [
      "1. Enter a task description — what do you want to build or fix?",
      "2. Set your workspace path so the AI knows where to write files",
      "3. Choose approval mode: Auto (fully autonomous) or Manual (review each step)",
      "4. Click 'Start Session' — the AI plans, codes, tests, and fixes automatically",
      "5. Review diffs at each phase in the progress panel",
      "6. Use checkpoints to rollback if needed",
    ],
  },
  "Model Router": {
    title: "Smart Model Selection Engine",
    steps: [
      "1. Create a route — give it a name and task type (code, chat, analysis, etc.)",
      "2. Assign a primary model and fallback chain",
      "3. Test your route by describing a task — the AI picks the best model",
      "4. View benchmarks: latency, success rate, and cost per model",
      "5. The router auto-selects models when paired with Autonomous Coding",
    ],
  },
  "Codebase Intelligence": {
    title: "Semantic Search + Dependency Analysis + Security Scan",
    steps: [
      "1. Search: Type a query to find relevant code with relevance scores",
      "2. Dependencies: Load the dependency graph to see what depends on what",
      "3. Impact Analysis: 'If I change this file, what breaks?'",
      "4. Architecture Map: Visualize your codebase structure",
      "5. Security Scanner: Find vulnerabilities with severity levels and fix actions",
    ],
  },
  "AI Pair Terminal": {
    title: "Split-View Terminal + AI Chat",
    steps: [
      "1. Left panel: Run terminal commands — output appears with exit codes",
      "2. Right panel: Chat with the AI assistant for help and explanations",
      "3. Click 'Explain Last' to understand what a command did",
      "4. On errors, click 'Suggest Fix' for AI-powered troubleshooting",
      "5. 'Generate Command': Describe what you need in natural language",
    ],
  },
  "Comms Hub": {
    title: "Multi-Platform Bot Manager",
    steps: [
      "1. Add connections for WhatsApp, Telegram, Discord, or Slack",
      "2. WhatsApp: Scan the QR code to link your account",
      "3. Toggle AI auto-reply per platform — bot responds automatically",
      "4. Set personality/tone per channel for consistent branding",
      "5. Broadcast messages to all connected platforms at once",
    ],
  },
  "UI Builder": {
    title: "AI-Powered Component Generator",
    steps: [
      "1. Create a new project with a name and framework (React/Vue/HTML)",
      "2. Describe your component in natural language — AI generates the code",
      "3. Or upload a screenshot to convert it to code automatically",
      "4. Preview the component live in the iframe panel",
      "5. Optimize, copy, or download the generated code",
    ],
  },
  "Database Studio": {
    title: "AI Database Management",
    steps: [
      "1. Add a database connection (SQLite, PostgreSQL, MySQL, or MongoDB)",
      "2. Write queries in natural language — AI translates to SQL",
      "3. Use the raw SQL editor for direct queries",
      "4. Explore schema visually with expandable tables and relationships",
      "5. Generate migrations from natural language descriptions",
    ],
  },
  "Deploy Pipeline": {
    title: "One-Click Deploy Manager",
    steps: [
      "1. Add deployment environments (Docker, Serverless, VPS, or Static)",
      "2. Click 'Deploy' to push to your selected environment",
      "3. View real-time deploy logs",
      "4. Rollback to a previous version if needed",
      "5. Compare environment statuses side-by-side",
    ],
  },
  "Security Vault": {
    title: "Secret Scanner + Audit + Compliance",
    steps: [
      "1. Run the secret scanner to find hardcoded API keys and tokens",
      "2. Review audit logs for all agent actions with risk levels",
      "3. Check compliance score against security standards",
      "4. Revoke any exposed secrets with one click",
    ],
  },
  "Analytics & Insights": {
    title: "Token Usage & Cost Dashboard",
    steps: [
      "1. View KPIs: total cost, tokens used, average duration, success rate",
      "2. Filter by time period to analyze trends",
      "3. See model breakdown — which models use the most tokens",
      "4. Review AI-powered recommendations for cost optimization",
    ],
  },
  "Plugin Marketplace": {
    title: "Community Extension Store",
    steps: [
      "1. Browse plugins by category (Integration, Tool, Agent, Theme, Utility)",
      "2. Search for specific plugins",
      "3. Click Install to add a plugin — Uninstall to remove",
      "4. Enable/disable plugins without uninstalling",
      "5. Create and publish your own plugins for the community",
    ],
  },
  "Quick Actions": {
    title: "One-Click AI Operations",
    steps: [
      "1. Select a file from your workspace",
      "2. Choose an action: Explain, Refactor, Test, Document, or Optimize",
      "3. For project-wide actions: Add Auth, Dockerize, Set Up CI/CD, etc.",
      "4. AI executes the action immediately and shows the result",
    ],
  },
  "Voice Coding": {
    title: "Speak Code Changes",
    steps: [
      "1. Click the microphone to start recording",
      "2. Speak your command: 'Create a login form' or 'Refactor this function'",
      "3. AI transcribes and classifies the command type",
      "4. Review the generated code or refactored result",
      "5. Use for meeting notes — AI extracts action items with priorities",
    ],
  },
  "Git Intelligence": {
    title: "AI Commits & PR Reviews",
    steps: [
      "1. Paste your git diff — AI generates a meaningful commit message",
      "2. Use PR Review to get AI feedback on pull requests",
      "3. Issues are ranked: Critical, High, Medium, Low",
      "4. Resolve merge conflicts by pasting conflict markers — AI resolves them",
    ],
  },
  "Mobile Companion": {
    title: "Monitor from Your Phone",
    steps: [
      "1. Register your mobile device (iOS or Android)",
      "2. Choose which notifications to receive (agent done, errors, approvals, etc.)",
      "3. Scan the QR code to pair your device",
      "4. Send remote messages to agents from your phone",
      "5. View the activity log for all remote interactions",
    ],
  },
  "Kanban Board": {
    title: "Task Management + Agent Assignments",
    steps: [
      "1. Drag-and-drop cards between 8 columns (Backlog → Completed/Failed)",
      "2. Click any card to edit details, priority, labels, assignee, and due date",
      "3. Manage subtasks with checklists and track progress per card",
      "4. Link git branches, PRs, token usage, logs, and artifacts in the Meta tab",
      "5. Assign agents to cards for AI-driven execution tracking",
      "6. Cards auto-refresh every 5 seconds for a real-time feel",
    ],
  },
  "Browser Token Extractor": {
    title: "Extract DeepSeek Session Tokens from Browser",
    steps: [
      "1. Log into chat.deepseek.com in Chrome/Edge/Brave first",
      "2. Click Scan to read browser cookie databases",
      "3. Tokens are decrypted using Windows DPAPI",
      "4. Click the eye icon to reveal, copy icon to copy",
      "5. Click Configure to auto-create ds2api provider",
      "6. Use Model Router to route deepseek-chat to ds2api",
    ],
  },
  "Voice-to-Code Pipeline": {
    title: "Voice-Driven AI Code Generation",
    steps: [
      "1. Click the large microphone button to start recording",
      "2. Speak your code request in natural language",
      "3. Watch real-time transcription as you speak",
      "4. Click 'Generate Code' to send transcription to AI",
      "5. Review the generated code with syntax highlighting",
      "6. Use 'Execute' to run in terminal or 'Insert' to add to editor",
    ],
  },
  "Live Architecture Mapper": {
    title: "Codebase Visualization & Dependency Graph",
    steps: [
      "1. Click 'Scan Workspace' to analyze your codebase",
      "2. Browse the file tree with color-coded categories",
      "3. Blue = Components, Green = Pages, Orange = API, Purple = Lib",
      "4. Click any file to see its imports, exports, and dependencies",
      "5. Use the search bar to find specific files instantly",
      "6. Trace dependency chains by clicking linked files",
    ],
  },
};

interface PowerToolHintProps {
  name: string;
}

export function PowerToolHint({ name }: PowerToolHintProps) {
  const [visible, setVisible] = useState(true);
  const hint = HINTS[name];

  if (!hint || !visible) return null;

  return (
    <div className="mb-4 p-3 rounded-xl bg-primary/5 border border-primary/10 relative animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-start gap-2.5">
        <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground mb-1.5">{hint.title}</p>
          <ul className="space-y-0.5">
            {hint.steps.map((step, i) => (
              <li key={i} className="text-[11px] text-muted-foreground leading-relaxed">{step}</li>
            ))}
          </ul>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
