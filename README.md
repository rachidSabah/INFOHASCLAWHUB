<div align="center">

# ClawHub Desktop

**Autonomous AI Operating System**

A next-generation AI workspace that unifies multi-provider inference, self-improving agents, context memory, scheduled automation, research pipelines, and 44 power tools into a single desktop application.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748)](https://www.prisma.io/)

[Getting Started](#getting-started) · [Features](#features) · [AI Providers](#ai-provider-setup) · [Architecture](#architecture) · [API Reference](#api-reference)

</div>

---

## Getting Started

### Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| **Node.js** | v18+ | Runtime environment |
| **npm** | v9+ | Package manager |
| **Python 3** | 3.8+ | PDF extraction (PyPDF2) |
| **Git** | v2+ | Version control |

### One-Command Install (Windows PowerShell)

```powershell
irm https://raw.githubusercontent.com/rachidSabah/INFOHASCLAWHUB/main/install.bat -OutFile install.bat; .\install.bat
```

The script automatically installs Node.js (via winget), clones the repo, installs dependencies, sets up the SQLite database, and launches the dashboard at **http://localhost:3000**.

### One-Command Install (WSL / Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/rachidSabah/INFOHASCLAWHUB/main/install.sh | bash
```

The script installs Node.js (via nvm if missing), clones the repo, installs dependencies, runs Prisma migrations, and starts the dev server.

### Manual Install

```bash
git clone https://github.com/rachidSabah/INFOHASCLAWHUB.git
cd INFOHASCLAWHUB
npm install
npx prisma db push --accept-data-loss
npx prisma generate
npm run dev
```

### Starting the Dashboard

After installation completes, the dashboard starts automatically. If you need to start it manually:

```bash
# Development mode (recommended)
cd INFOHASCLAWHUB
npm run dev

# Production mode (faster, more stable)
npm run build
npx next start
```

Then open your browser to **http://localhost:3000**

**LAN access from other devices:**
```bash
npm run dev:lan    # Binds to 0.0.0.0:3000 for network access
```

**WSL users accessing from Windows browser:**
```bash
hostname -I        # Get your WSL IP, then browse to http://<WSL-IP>:3000
```

### Uninstall

```bash
# WSL / Linux
curl -fsSL https://raw.githubusercontent.com/rachidSabah/INFOHASCLAWHUB/main/uninstall.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/rachidSabah/INFOHASCLAWHUB/main/uninstall.bat -OutFile uninstall.bat; .\uninstall.bat
```

---

## AI Provider Setup

ClawHub supports multiple AI providers. You can configure them in **Settings > Providers** or via environment variables.

### Gemini CLI (Default — Free, No API Key Needed)

Gemini CLI provides free access to Google's Gemini models through your Google account. No API key or credit card required.

**Install on Windows:**

```powershell
npm install -g @google/gemini-cli
```

**Install on WSL / Linux:**

```bash
npm install -g @google/gemini-cli
```

**Authenticate:**

```bash
gemini    # Follow the Google OAuth login flow in your browser
```

**Verify installation:**

```bash
gemini --version
```

Once authenticated, Gemini CLI is automatically detected by ClawHub. No further configuration needed — just select a Gemini model from the model dropdown in the top bar.

> **Troubleshooting:** If `gemini` is not recognized after installation, restart your terminal/WSL session to refresh the PATH. On Windows, ensure `%APPDATA%\npm` is in your system PATH.

### DeepSeek

1. Create an account at [platform.deepseek.com](https://platform.deepseek.com)
2. Generate an API key from the dashboard
3. In ClawHub, go to **Settings > Providers > Add Provider**
4. Name: `DeepSeek`, Base URL: `https://api.deepseek.com`, paste your API key

### BigModel / GLM (Z.AI)

1. Create an account at [open.bigmodel.cn](https://open.bigmodel.cn)
2. Generate an API key
3. In ClawHub, go to **Settings > Providers > Add Provider**
4. Name: `BigModel`, Base URL: `https://open.bigmodel.cn/api/paas/v4`, paste your API key

### OpenAI / Anthropic / Groq

1. Obtain an API key from the respective provider
2. In ClawHub, go to **Settings > Providers > Add Provider**
3. Enter the provider name, base URL, and API key

### Proxima (Local Browser Gateway)

1. Install and start Proxima locally on port `3210`
2. Automatically detected — no key needed

### Hybrid Router

The Hybrid Router benchmarks all configured providers in real time, scoring them on latency, cost, and quality. It auto-selects the best provider for each request or races multiple providers and returns the fastest response. Enable it from the Power Tools menu.

---

## Features

### AI Inference and Chat

| Feature | Description |
|---------|-------------|
| Multi-Provider AI | Gemini CLI, DeepSeek, BigModel/GLM, OpenAI, Anthropic, Groq, Proxima, and any OpenAI-compatible endpoint |
| OpenAI-Compatible Gateway | Full `/v1/chat/completions` and `/v1/models` endpoints for external integrations |
| Real-Time Streaming | Server-Sent Events (SSE) streaming with typing indicators and progressive token delivery |
| Persistent Chat History | SQLite-backed storage — all conversations are saved locally and fully searchable |
| Multi-Tab Chat | Open and switch between multiple conversations like browser tabs |
| Favorites and Rename | Star conversations, rename them, and filter by starred or date |
| Smart Sidebar | Conversations grouped by Today/Yesterday/Date with context-menu actions |
| File Attachments | Attach files to any message for AI processing |
| Markdown Rendering | Full GFM markdown in assistant responses with syntax highlighting |
| Conversation Export | Export any conversation as Markdown or JSON |

### Agents and Orchestration

| Feature | Description |
|---------|-------------|
| Custom Agents | Create AI personas with unique system prompts, skills, and behavior profiles |
| Agent Orchestration | Visual pipeline builder for chaining agents in multi-step workflows |
| Agent Import/Seed | Import agent configurations or seed from 46 built-in agent templates |
| Skills System | 50+ modular skill files for specialized AI behaviors (coding, research, design, finance, etc.) |
| Self-Improving Agents | Agents that record experiences, reflect on outcomes, and evolve their prompts over time |
| Agent Experience Tracking | Execution scoring and performance metrics stored per agent |
| Autonomous Coding | Full Plan-to-Code-to-Test-to-Fix-to-Commit pipeline with rollback support |
| Swarm Coordination | Queen-led agent swarms with consensus-based decision making |
| SONA Self-Learning | Neural pattern recognition and trajectory learning for adaptive agent behavior |

### Memory and Knowledge

| Feature | Description |
|---------|-------------|
| Universal Context Memory | Cross-session context retention with HNSW vector-based semantic retrieval |
| Memory Linking | Connect related memories across conversations and agents |
| Context Compression | Automatic compression of long contexts to maintain relevance |
| Context Pruning | Intelligent pruning of stale or low-value memory entries |
| Knowledge Base | Document ingestion, chunking, embedding, and semantic search |
| Knowledge Graph | Entity-relationship mapping with graph traversal and visualization |
| Memory Statistics | Real-time stats on memory usage, linkage density, and recall accuracy |

### Artifact System (Claude-Artifacts Style)

| Feature | Description |
|---------|-------------|
| Auto-Detection Engine | Automatically detects 11 artifact types in AI responses |
| Live Streaming Preview | Right-side resizable preview panel with fullscreen mode |
| Multi-Tab Interface | Pin, favorite, and navigate recent artifacts |
| Document Export | Export to DOCX, PDF, XLSX, PPTX, Markdown, HTML, CSV |
| Shareable Links | Generate shareable links with view tracking |
| Version History | Full version history with rollback capability |
| Sandbox Preview | Isolated sandbox for React/HTML/Tailwind code rendering |

### Document Generation Engine

| Format | Capabilities |
|--------|-------------|
| DOCX | Reports, proposals, resumes with sections, bullets, tables, and styling |
| PDF | Styled paginated documents with embedded fonts and layout control |
| XLSX | Multi-sheet workbooks with headers, formatting, and formulas |
| PPTX | Presentation slides with bullets, layouts, and speaker notes |
| CSV / Markdown / HTML | Direct flat-file exports with automatic format detection |

### Scheduling and Automation

| Feature | Description |
|---------|-------------|
| Cron Scheduler | Schedule agents and tasks with full cron expression support |
| Cron Workers | Background worker processes for always-on agent execution |
| Self-Healing Tasks | Automatic detection and recovery of failed scheduled tasks |
| Scheduler Panel | Visual UI for managing, monitoring, and testing cron jobs |

### Enterprise and Security

| Feature | Description |
|---------|-------------|
| AI Defence System | Prompt injection detection, PII scanning, and threat level monitoring |
| Encryption Vault | AES-256-GCM at-rest encryption for sensitive data |
| Zero-Trust Federation | Cross-machine mutual TLS with Ed25519 key verification |
| Compliance Engine | Audit log management, policy enforcement, and automated compliance scanning |
| Security Vault | Secret scanning, exposure detection, and vulnerability tracking |

### Collaboration and Multi-Device

| Feature | Description |
|---------|-------------|
| LAN Network Access | Run the dashboard on your machine, access from any device on the network |
| Auto-Detected IP | Local IP automatically discovered with shareable URL |
| CORS Headers | Cross-origin access support for web integrations |
| Real-Time Collaboration | Shared sessions with synchronized editing and context |
| Mobile Companion | Monitor your dashboard from a mobile device with push notifications |

---

## 8-Tier Power Tools System

### Tier 1 — Game Changers

| Tool | Description |
|------|-------------|
| Agent Orchestration | Visual multi-step pipeline builder for chaining agents, with approval gates, pause/resume, and status tracking |
| Autonomous Coding | Full software development loop — Plan, Code, Test, Fix, Commit — with iteration, rollback, and plan management |
| Model Router | Smart AI model switching based on task type, latency, and cost; per-conversation model selection with grouped dropdowns |
| Codebase Intelligence | Semantic code search, security vulnerability scanning, dependency analysis, and code indexing across your project |
| AI Pair Terminal | AI monitors your terminal output in real time, suggests commands, and detects errors proactively |
| Kanban Board | Task management board with AI agent assignment, card movement, and progress tracking |
| Architecture Mapper | Codebase visualization, dependency graphing, and architectural pattern detection |

### Tier 2 — Power Features

| Tool | Description |
|------|-------------|
| Comms Hub | Unified messaging across WhatsApp, Telegram, Discord, and Slack with broadcast and status monitoring |
| Cross-Provider Consensus | Ensemble voting — send a prompt to multiple AI providers simultaneously and aggregate the best answer |
| Visual UI Builder | Screenshot-to-component pipeline; generate React/Next.js components from visual mockups with AI |
| Database Studio | AI-powered database management — connect, query, schema inspection, and migration execution |

### Tier 3 — Pro Features

| Tool | Description |
|------|-------------|
| Deploy Pipeline | One-click deployment with environment management, rollback, and real-time log streaming |
| Security Vault | Secret scanning, exposure detection, compliance auditing, and security vulnerability tracking |
| Analytics and Insights | Token usage analytics, AI performance metrics, and event tracking with visualization |
| Plugin Marketplace | Community extension registry with install, seed, and management capabilities |

### Tier 4 — Differentiators

| Tool | Description |
|------|-------------|
| Quick Actions | Right-click context AI actions for instant transformations on selected text or code |
| Voice-to-Code Pipeline | Speak natural language and have AI generate production code in real time |
| Git Intelligence | AI-powered commit messages, PR reviews, conflict analysis, and repository insights |
| Mobile Companion | Monitor your dashboard from a mobile device with push notifications |
| Web Bridges (WebBridge) | Free AI access via browser token extraction — auto-grab, validate, and use tokens from browser sessions |

### Tier 5 — New Generation

| Tool | Description |
|------|-------------|
| AI Artifacts Studio | Generate and preview documents, spreadsheets, slides, and visual canvases with streaming AI output |
| LAN Network Access | Multi-device WiFi access — run the dashboard on your machine, access from any device on the network |
| Visual Canvas | Fabric-like design editor for drag-and-drop layout creation and visual editing |

### Tier 6 — Next-Gen OS

| Tool | Description |
|------|-------------|
| Universal Memory | Cross-session context with HNSW vector-based semantic recall and intelligent linking |
| Cron Scheduler | Always-on agents and scheduled task execution with worker management and self-healing |
| Deep Research | Multi-source research with citations, source verification, hallucination detection, and export |
| Issue-to-Deploy Pipeline | End-to-end pipeline from GitHub issue through code generation to deployed solution |
| Self-Improving Agents | Prompt optimization through experience recording, reflection, evolution, and recommendation cycles |
| Hybrid Router | Local-to-cloud provider racing — benchmark providers on latency, cost, and quality; auto-select the best |
| Live Sandbox | Instant application preview with isolated execution environments and deployment |
| MCP Hub | Model Context Protocol server registry, tool discovery, execution, and management across transports |
| Compliance Engine | Audit log management, compliance policy enforcement, and automated scanning |
| Collaboration | Real-time multiplayer sessions with shared context and synchronized editing |

### Tier 7 — Preconfigured OS

| Tool | Description |
|------|-------------|
| Prebuilt Agents | One-click activation of 46 specialized agents across 10 categories |
| Pipeline Templates | 7 production-ready pipeline configurations for common workflows |

### Tier 8 — Enterprise AI Engine

| Tool | Description |
|------|-------------|
| Swarm Coordination | Queen-led agent swarms with consensus-based decision making and task distribution |
| SONA Self-Learning | Neural pattern recognition, trajectory learning, and adaptive behavior optimization |
| Zero-Trust Federation | Cross-machine mutual TLS with Ed25519 key verification and PII scanning |
| Encryption Vault | AES-256-GCM at-rest encryption for sensitive data and credentials |
| AI Defence System | Prompt injection detection, PII scanning, threat level monitoring, and safety guardrails |
| Cost Tracker | Real-time token cost tracking, budget alerts, and provider cost comparison |
| Goal Planner | Strategic goal decomposition with action plans, progress tracking, and milestones |
| Knowledge Graph | Entity-relationship mapping with graph traversal, visualization, and semantic queries |
| Background Workers | Always-on worker processes for scheduled tasks, health checks, and autonomous operations |
| Verification Engine | Cryptographic verification, witness attestation, and integrity proof generation |

---

## Platform Overview

| Category | Detail |
|----------|--------|
| **Framework** | Next.js 15 (App Router) + React 19 |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS + shadcn/ui + Radix UI |
| **Database** | Prisma ORM with SQLite |
| **State Management** | Zustand |
| **API Endpoints** | 70+ route files (100+ HTTP endpoints) |
| **Database Models** | 40 Prisma models |
| **UI Components** | 38 custom components + 37 shadcn/ui primitives |
| **Enhancement Panels** | 44 feature panels across 8 tiers |
| **Core Libraries** | 30 internal modules |
| **Skills** | 50+ built-in skill modules |
| **Prebuilt Agents** | 46 agents across 10 categories |
| **Pipelines** | 7 production-ready pipeline templates |

---

## Architecture

```
INFOHASCLAWHUB/
├── src/
│   ├── app/
│   │   ├── api/                        # 70+ API route files
│   │   │   ├── agents/                 # Agent CRUD, run, import, seed
│   │   │   ├── artifacts/              # Artifact generation and sharing
│   │   │   ├── bots/                   # Comms hub connections and broadcast
│   │   │   ├── browser/                # Token extraction and Playwright
│   │   │   ├── codebase/               # Code indexing, search, security
│   │   │   ├── coding-sessions/        # Autonomous coding pipeline
│   │   │   ├── collab/                 # Collaboration sessions
│   │   │   ├── compliance/             # Compliance engine and policies
│   │   │   ├── conversations/          # Chat history and messages
│   │   │   ├── cron/                   # Scheduling, workers, self-heal
│   │   │   ├── db-studio/              # Database connections and queries
│   │   │   ├── deploy/                 # Deploy pipeline and rollback
│   │   │   ├── gemini/                 # Gemini CLI chat
│   │   │   ├── git/                    # Git intelligence
│   │   │   ├── inference/              # Streaming inference
│   │   │   ├── issue-pipeline/         # Issue to deploy
│   │   │   ├── kanban/                 # Kanban boards and cards
│   │   │   ├── knowledge/              # Knowledge base documents
│   │   │   ├── mcp/                    # MCP server management
│   │   │   ├── memories/               # Memory CRUD
│   │   │   ├── memory/                 # Context memory engine
│   │   │   ├── model-routes/           # Model routing
│   │   │   ├── orchestrator/           # Agent orchestration
│   │   │   ├── pipelines/              # Pipeline execution
│   │   │   ├── plugins/                # Plugin marketplace
│   │   │   ├── provider-router/        # Hybrid provider racing
│   │   │   ├── providers/              # Provider management
│   │   │   ├── research/               # Deep research with citations
│   │   │   ├── sandbox/                # Live sandbox environments
│   │   │   ├── scheduler/              # Task scheduling
│   │   │   ├── security/               # Security scanning and audit
│   │   │   ├── self-improving/         # Agent self-improvement loop
│   │   │   ├── ui-builder/             # Visual UI builder
│   │   │   ├── v1/                     # OpenAI-compatible gateway
│   │   │   ├── whatsapp/               # WhatsApp integration
│   │   │   ├── telegram/               # Telegram bot integration
│   │   │   └── discord/                # Discord bot integration
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                    # Main dashboard
│   ├── components/
│   │   ├── enhancements/               # 44 feature panels (8 tiers)
│   │   ├── ui/                         # 37 shadcn/ui primitives
│   │   ├── ChatWindow.tsx              # Main chat interface
│   │   ├── ChatInput.tsx               # Message input with attachments
│   │   ├── ChatSidebar.tsx             # Conversation list sidebar
│   │   ├── TopBar.tsx                  # Navigation bar and power tools
│   │   ├── SettingsPanel.tsx           # Application settings
│   │   ├── CommandPalette.tsx          # Ctrl+K command palette
│   │   └── ...                         # Additional components
│   └── lib/
│       ├── stores.ts                   # Zustand global state
│       ├── db.ts                       # Prisma client singleton
│       ├── inference.ts                # AI inference engine
│       ├── openai-gateway.ts           # OpenAI-compatible gateway
│       ├── provider-router.ts          # Hybrid provider routing
│       ├── orchestrator.ts             # Agent orchestration engine
│       ├── agent-runner.ts             # Agent execution runtime
│       ├── universal-memory.ts         # Context memory engine
│       ├── cron-engine.ts              # Cron scheduling engine
│       ├── research-engine.ts          # Deep research with citations
│       ├── self-improving.ts           # Agent self-improvement
│       └── ...                         # Additional modules
├── prisma/
│   └── schema.prisma                   # 40 database models
├── skills/                             # 50+ skill modules
└── db/                                 # SQLite database (auto-created)
```

---

## API Reference

### Chat and Inference

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/run` | POST | Execute AI inference |
| `/api/inference/stream` | POST | Stream AI inference response |
| `/api/generate` | POST | Generate AI completion |
| `/api/v1/chat/completions` | POST | OpenAI-compatible chat endpoint |
| `/api/v1/models` | GET | OpenAI-compatible model listing |
| `/api/gemini/chat` | POST | Gemini CLI chat interface |
| `/api/consensus` | POST | Multi-model consensus voting |

### Conversations and Messages

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/conversations` | GET, POST | List and create conversations |
| `/api/conversations/[id]` | GET, PATCH, DELETE | Get, update, or delete a conversation |
| `/api/conversations/[id]/messages` | GET, POST | Get or add messages |
| `/api/messages/[id]` | PATCH, DELETE | Update or delete a message |

### Agents

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/agents` | GET, POST | List and create agents |
| `/api/agents/[id]` | GET, PATCH, DELETE | Agent CRUD operations |
| `/api/agents/run` | POST | Execute an agent |
| `/api/agents/import` | POST | Import agent configuration |
| `/api/agents/seed` | POST | Seed built-in agents |

### Memory and Knowledge

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/memories` | GET, POST | List and create memories |
| `/api/memory/context` | GET, POST | Get or set active context |
| `/api/memory/context/compress` | POST | Compress context window |
| `/api/memory/context/prune` | POST | Prune stale entries |
| `/api/memory/context/stats` | GET | Memory statistics |
| `/api/knowledge/documents` | GET, POST | Knowledge base documents |
| `/api/knowledge/search` | POST | Semantic knowledge search |

### Orchestration and Pipelines

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/pipelines` | GET, POST | List and create agent pipelines |
| `/api/pipelines/[id]/run` | POST | Execute a pipeline |
| `/api/pipelines/[id]/approve` | POST | Approve a pipeline step |
| `/api/orchestrator/start` | POST | Start orchestration session |

### Scheduling and Automation

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/cron/tasks` | GET, POST | List and create cron tasks |
| `/api/cron/workers` | GET, POST | Worker management |
| `/api/cron/execute` | POST | Execute a cron task immediately |
| `/api/cron/self-heal` | POST | Self-heal failed tasks |

### Comms Hub

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/bots/connections` | GET, POST | List and create bot connections |
| `/api/bots/connections/[id]/connect` | POST | Establish connection |
| `/api/bots/connections/[id]/send` | POST | Send message |
| `/api/bots/broadcast` | POST | Broadcast to all channels |

### Security and Compliance

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/security/compliance` | GET | Compliance status |
| `/api/security/audit` | GET, POST | Audit logs |
| `/api/security/secrets` | GET, POST | Secret scanning |
| `/api/compliance/policies` | GET, POST | Policy management |

### System and Utilities

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/health` | GET | Health check |
| `/api/doctor` | GET | Diagnostic report |
| `/api/system/monitor` | GET | System resource monitoring |
| `/api/settings` | GET, PATCH | Application settings |
| `/api/skills` | GET, POST | Skill management |
| `/api/prompts` | GET, POST | Prompt template library |
| `/api/search` | POST | Global search |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `Ctrl+N` | New chat |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+K` | Open command palette |
| `Ctrl+,` | Open settings |
| `Escape` | Close dialogs |

---

## Environment Variables

Create a `.env` file in the project root (defaults are included):

```env
DATABASE_URL="file:./db/clawhub.db"
```

Additional provider keys can be configured through the **Settings > Providers** UI — no environment variables needed for most setups.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `gemini is not recognized` | Run `npm install -g @google/gemini-cli`, restart terminal, then `gemini --version` |
| Gemini auth fails on WSL | Run `gemini` in WSL terminal and complete the browser OAuth flow |
| Database errors | Run `npx prisma db push --accept-data-loss` to reset the database |
| Port 3000 already in use | `lsof -i :3000` then `kill -9 <PID>` (Linux/WSL) or `netstat -ano \| findstr :3000` then `taskkill /PID <PID> /F` (Windows) |
| Provider connection failures | Check API keys in **Settings > Providers** and verify base URLs |
| Dashboard too large on small screen | The layout auto-scales for screens 1280px and below. Ensure browser zoom is at 100% |
| WSL can't access localhost:3000 | Use `hostname -I` to get WSL IP, then access `http://<WSL-IP>:3000` from Windows |

---

## License

MIT — Free for personal and commercial use.
