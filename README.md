# ClawHub Desktop

**Autonomous AI Operating System** — A next-generation AI workspace that unifies multi-provider inference, self-improving agents, context memory, scheduled automation, research pipelines, and 32 power tools into a single desktop application.

---

## Quick Start

### One-Command Install (Windows)

```powershell
irm https://raw.githubusercontent.com/rachidSabah/INFOHASCLAWHUB/main/install.bat -OutFile install.bat; .\install.bat
```

### One-Command Install (WSL / Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/rachidSabah/INFOHASCLAWHUB/main/install.sh | bash
```

Each script automatically installs prerequisites (if missing), clones the repo, installs dependencies, sets up the database, and launches at **http://localhost:3000**.

### Manual Install

```bash
git clone https://github.com/rachidSabah/INFOHASCLAWHUB.git
cd INFOHASCLAWHUB
npm install
node push-db.js
npm run dev
```

### Uninstall

```bash
# WSL / Linux
curl -fsSL https://raw.githubusercontent.com/rachidSabah/INFOHASCLAWHUB/main/uninstall.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/rachidSabah/INFOHASCLAWHUB/main/uninstall.bat -OutFile uninstall.bat; .\uninstall.bat
```

---

## Platform Overview

| Category | Detail |
|----------|--------|
| **Framework** | Next.js 15 (App Router) + React 19 |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS v4 + shadcn/ui + Radix UI |
| **Database** | Prisma ORM with SQLite |
| **State Management** | Zustand |
| **API Endpoints** | 70+ route files (100+ HTTP endpoints) |
| **Database Models** | 40 Prisma models |
| **UI Components** | 38 custom components + 37 shadcn/ui primitives |
| **Enhancement Panels** | 36 feature panels across 6 tiers |
| **Core Libraries** | 30 internal modules |
| **Skills** | 50+ built-in skill modules |

---

## Core Capabilities

### AI Inference and Chat

| Feature | Description |
|---------|-------------|
| Multi-Provider AI | Gemini CLI, DeepSeek, BigModel/GLM, OpenAI, Anthropic, Groq, Proxima, and any OpenAI-compatible endpoint |
| OpenAI-Compatible Gateway | Full `/v1/chat/completions` and `/v1/models` endpoints for external integrations |
| Real-Time Streaming | SSE streaming with typing indicators and progressive token delivery |
| Persistent Chat History | SQLite-backed storage — all conversations are saved locally and fully searchable |
| Multi-Tab Chat | Open and switch between multiple conversations like browser tabs |
| Favorites and Rename | Star conversations, rename them, and filter by starred or date |
| Smart Sidebar | Conversations grouped by Today/Yesterday/Date with context-menu actions |
| File Attachments | Attach files to any message for AI processing |
| Markdown Rendering | Full GFM markdown in assistant responses with syntax highlighting |

### Agents and Orchestration

| Feature | Description |
|---------|-------------|
| Custom Agents | Create AI personas with unique system prompts, skills, and behavior profiles |
| Agent Orchestration | Visual pipeline builder for chaining agents in multi-step workflows |
| Agent Import/Seed | Import agent configurations or seed from built-in templates |
| Skills System | 50+ modular skill files for specialized AI behaviors (coding, research, design, finance, etc.) |
| Self-Improving Agents | Agents that record experiences, reflect on outcomes, and evolve their prompts over time |
| Agent Experience Tracking | Execution scoring and performance metrics stored per agent |
| Autonomous Coding | Full Plan-to-Code-to-Test-to-Fix-to-Commit pipeline with rollback support |

### Memory and Knowledge

| Feature | Description |
|---------|-------------|
| Universal Context Memory | Cross-session context retention with semantic vector retrieval |
| Memory Linking | Connect related memories across conversations and agents |
| Context Compression | Automatic compression of long contexts to maintain relevance |
| Context Pruning | Intelligent pruning of stale or low-value memory entries |
| Knowledge Base | Document ingestion, chunking, embedding, and semantic search |
| Memory Statistics | Real-time stats on memory usage, linkage density, and recall accuracy |

### Scheduling and Automation

| Feature | Description |
|---------|-------------|
| Cron Scheduler | Schedule agents and tasks with full cron expression support |
| Cron Workers | Background worker processes for always-on agent execution |
| Self-Healing Tasks | Automatic detection and recovery of failed scheduled tasks |
| Scheduler Panel | Visual UI for managing, monitoring, and testing cron jobs |

---

## 6-Tier Power Tools System

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
| Comms Hub | Unified messaging across WhatsApp, Telegram, Discord, and Slack with broadcast, connect/disconnect, and status monitoring |
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
| Universal Memory | Cross-session context with vector-based semantic recall and intelligent linking |
| Cron Scheduler | Always-on agents and scheduled task execution with worker management and self-healing |
| Deep Research | Multi-source research with citations, source verification, hallucination detection, and export |
| Issue-to-Deploy Pipeline | End-to-end pipeline from GitHub issue through code generation to deployed solution |
| Self-Improving Agents | Prompt optimization through experience recording, reflection, evolution, and recommendation cycles |
| Hybrid Router | Local-to-cloud provider racing — benchmark providers on latency, cost, and quality; auto-select the best |
| Live Sandbox | Instant application preview with isolated execution environments and deployment |
| MCP Hub | Model Context Protocol server registry, tool discovery, execution, and management across transports |
| Compliance Engine | Audit log management, compliance policy enforcement, and automated scanning |
| Collaboration | Real-time multiplayer sessions with shared context and synchronized editing |

---

## AI Provider Configuration

### Gemini CLI (Default — No Setup Needed)

```bash
npm install -g @google/gemini-cli
gemini  # Follow the Google OAuth login
```

### DeepSeek

1. Get an API key from [platform.deepseek.com](https://platform.deepseek.com)
2. Go to **Settings > Providers > Add Provider**
3. Name: `DeepSeek`, Base URL: `https://api.deepseek.com`, paste your API key

### BigModel / GLM

1. Get an API key from [open.bigmodel.cn](https://open.bigmodel.cn)
2. Go to **Settings > Providers > Add Provider**
3. Name: `BigModel`, Base URL: `https://open.bigmodel.cn/api/paas/v4`

### Proxima (Local Browser Gateway)

1. Install and start Proxima locally on port `3210`
2. Automatically detected — no key needed

### Hybrid Router

The Hybrid Router benchmarks all configured providers in real time, scoring them on latency, cost, and quality. It auto-selects the best provider for each request or races multiple providers and returns the fastest response.

---

## Integration Ecosystem

### Chat Bot Integrations (WhatsApp, Telegram, Discord)

Unified messaging across all major chat platforms — WhatsApp, Telegram, and Discord — with full bot mode, per-channel personality, broadcast messaging, and real-time status monitoring.

**WhatsApp** — Full WhatsApp Web integration via Baileys with QR code pairing, message send/receive, bot mode, and personality configuration per channel.

| Endpoint | Function |
|----------|----------|
| `/api/whatsapp/connect` | Generate QR code for pairing |
| `/api/whatsapp/send` | Send messages to contacts or groups |
| `/api/whatsapp/status` | Check connection status |
| `/api/whatsapp/disconnect` | End the WhatsApp session |
| `/api/whatsapp/bot` | Configure bot mode and personality |

**Telegram** — Native Telegram Bot API integration with command handling, inline queries, group management, and AI-powered auto-responses.

**Discord** — Full Discord bot integration with slash commands, server management, channel monitoring, and AI-driven conversation capabilities.

All platforms share the Comms Hub endpoints for unified management:

| Endpoint | Function |
|----------|----------|
| `/api/bots/connections` | List and create bot connections |
| `/api/bots/connections/[id]/connect` | Establish connection |
| `/api/bots/connections/[id]/send` | Send message |
| `/api/bots/connections/[id]/toggle` | Toggle connection on/off |
| `/api/bots/connections/[id]/status` | Connection status |
| `/api/bots/broadcast` | Broadcast to all channels |

### MCP (Model Context Protocol)

Full MCP server registry with tool discovery and execution across Stdio, HTTP, and WebSocket transports.

| Endpoint | Function |
|----------|----------|
| `/api/mcp/servers` | List registered MCP servers |
| `/api/mcp/tools` | Discover available tools |
| `/api/mcp/execute` | Execute an MCP tool call |
| `/api/mcp-registry` | Manage the server registry |

### Browser Token Extraction (WebBridge)

Automated browser token extraction for free AI access through existing browser sessions.

| Endpoint | Function |
|----------|----------|
| `/api/browser/tokens` | List discovered tokens |
| `/api/browser/tokens/autograb` | Auto-extract tokens from browser |
| `/api/browser/tokens/validate` | Validate a token |
| `/api/browser/tokens/submit` | Submit a token for use |
| `/api/browser/playwright` | Playwright browser automation |

### Artifact System

Generate, detect, preview, and share AI artifacts.

| Endpoint | Function |
|----------|----------|
| `/api/artifacts` | List and create artifacts |
| `/api/artifacts/stream` | Streaming artifact generation |
| `/api/artifacts/[id]/share` | Share artifact via token link |
| `/api/share/[token]` | Public access to shared artifact |

---

## API Surface (70+ Routes)

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
| `/api/agents/run/[id]` | GET | Get agent execution status |
| `/api/agents/import` | POST | Import agent configuration |
| `/api/agents/seed` | POST | Seed built-in agents |

### Memory and Knowledge

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/memories` | GET, POST | List and create memories |
| `/api/memories/[id]` | GET, PATCH, DELETE | Memory CRUD |
| `/api/memory/context` | GET, POST | Get or set active context |
| `/api/memory/context/[id]` | GET, DELETE | Context entry management |
| `/api/memory/context/compress` | POST | Compress context window |
| `/api/memory/context/prune` | POST | Prune stale entries |
| `/api/memory/context/stats` | GET | Memory statistics |
| `/api/memory/context/link` | POST | Link related memories |
| `/api/knowledge/documents` | GET, POST | Knowledge base documents |
| `/api/knowledge/documents/[id]` | GET, DELETE | Document management |
| `/api/knowledge/search` | POST | Semantic knowledge search |

### Orchestration and Pipelines

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/pipelines` | GET, POST | List and create agent pipelines |
| `/api/pipelines/[id]` | GET, PATCH, DELETE | Pipeline CRUD |
| `/api/pipelines/[id]/run` | POST | Execute a pipeline |
| `/api/pipelines/[id]/approve` | POST | Approve a pipeline step |
| `/api/pipelines/[id]/pause` | POST | Pause pipeline execution |
| `/api/pipelines/[id]/resume` | POST | Resume paused pipeline |
| `/api/orchestrator/start` | POST | Start orchestration session |
| `/api/orchestrator/status/[id]` | GET | Orchestration status |

### Autonomous Coding

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/coding-sessions` | GET, POST | List and create coding sessions |
| `/api/coding-sessions/[id]` | GET, DELETE | Session management |
| `/api/coding-sessions/[id]/iterate` | POST | Iterate on code |
| `/api/coding-sessions/[id]/plan` | POST | Generate code plan |
| `/api/coding-sessions/[id]/rollback` | POST | Rollback to previous state |

### Model Routing

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/model-routes` | GET, POST | Model route configuration |
| `/api/model-routes/route` | POST | Route a request to best model |
| `/api/model-routes/[id]` | GET, PATCH, DELETE | Route CRUD |
| `/api/provider-router` | GET | Provider router status |
| `/api/provider-router/record` | POST | Record provider performance |
| `/api/provider-router/race` | POST | Race providers and return fastest |
| `/api/providers` | GET, POST | Provider management |
| `/api/providers/[id]` | GET, PATCH, DELETE | Provider CRUD |
| `/api/providers/models` | GET | List available models |
| `/api/models` | GET | All models across providers |

### Codebase Intelligence

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/codebase/index` | POST | Index codebase for search |
| `/api/codebase/search` | POST | Semantic code search |
| `/api/codebase/security` | GET | Security vulnerability scan |
| `/api/codebase/dependencies` | GET | Dependency analysis |

### Git Intelligence

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/git/analyze` | POST | Analyze repository |
| `/api/git/review` | POST | AI-powered PR review |
| `/api/git/conflict` | POST | Conflict analysis |

### Comms Hub

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/bots/connections` | GET, POST | List and create bot connections |
| `/api/bots/connections/[id]` | GET, DELETE | Connection management |
| `/api/bots/connections/[id]/connect` | POST | Establish connection |
| `/api/bots/connections/[id]/send` | POST | Send message |
| `/api/bots/connections/[id]/toggle` | POST | Toggle connection on/off |
| `/api/bots/connections/[id]/status` | GET | Connection status |
| `/api/bots/connections/[id]/disconnect` | POST | Disconnect |
| `/api/bots/broadcast` | POST | Broadcast to all channels |

### Research and Self-Improvement

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/research` | GET, POST | List and start research sessions |
| `/api/research/[id]` | GET | Research session details |
| `/api/research/[id]/verify` | POST | Verify research citations |
| `/api/research/[id]/export` | POST | Export research results |
| `/api/research/[id]/hallucinate` | POST | Run hallucination detection |
| `/api/self-improving/record` | POST | Record agent experience |
| `/api/self-improving/reflect` | POST | Reflect on experiences |
| `/api/self-improving/evolve` | POST | Evolve agent prompts |
| `/api/self-improving/optimize` | POST | Optimize agent parameters |
| `/api/self-improving/recommend` | POST | Get improvement recommendations |

### Scheduling and Automation

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/cron/tasks` | GET, POST | List and create cron tasks |
| `/api/cron/tasks/[id]` | GET, PATCH, DELETE | Task CRUD |
| `/api/cron/workers` | GET, POST | Worker management |
| `/api/cron/workers/[id]` | GET, DELETE | Worker CRUD |
| `/api/cron/execute` | POST | Execute a cron task immediately |
| `/api/cron/self-heal` | POST | Self-heal failed tasks |
| `/api/scheduler/tasks` | GET, POST | Scheduler task management |
| `/api/scheduler/tasks/[id]` | GET, PATCH, DELETE | Scheduler CRUD |
| `/api/scheduler/run` | POST | Run a scheduled task |

### Issue-to-Deploy Pipeline

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/issue-pipeline` | GET, POST | List and create pipelines |
| `/api/issue-pipeline/[id]` | GET, DELETE | Pipeline management |
| `/api/issue-pipeline/[id]/run` | POST | Execute the pipeline |
| `/api/issue-pipeline/[id]/rollback` | POST | Rollback deployment |

### Sandbox

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/sandbox` | GET, POST | List and create sandboxes |
| `/api/sandbox/[id]` | GET, DELETE | Sandbox management |

### UI Builder

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/ui-builder/screenshot` | POST | Capture screenshot for analysis |
| `/api/ui-builder/generate` | POST | Generate component from description |
| `/api/ui-builder/projects` | GET, POST | List and create projects |
| `/api/ui-builder/projects/[id]` | GET, DELETE | Project management |

### Database Studio

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/db-studio/connections` | GET, POST | Database connections |
| `/api/db-studio/connections/[id]` | GET, DELETE | Connection management |
| `/api/db-studio/query` | POST | Execute SQL query |
| `/api/db-studio/schema` | GET | Inspect database schema |
| `/api/db-studio/migrate` | POST | Run migration |

### Deployment

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/deploy/environments` | GET, POST | Environment management |
| `/api/deploy/environments/[id]` | GET, DELETE | Environment CRUD |
| `/api/deploy/deploy` | POST | Execute deployment |
| `/api/deploy/rollback` | POST | Rollback deployment |
| `/api/deploy/logs` | GET | Deployment logs |

### Security and Compliance

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/security/compliance` | GET | Compliance status |
| `/api/security/audit` | GET, POST | Audit logs |
| `/api/security/secrets` | GET, POST | Secret scanning |
| `/api/compliance` | GET | Compliance overview |
| `/api/compliance/policies` | GET, POST | Policy management |

### Collaboration

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/collab` | GET | Collaboration overview |
| `/api/collab/sessions` | GET, POST | List and create sessions |
| `/api/collab/sessions/[id]` | GET, DELETE | Session management |

### Analytics

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/analytics/events` | GET, POST | Analytics events |
| `/api/analytics/insights` | GET | AI-powered insights |

### Plugins

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/plugins` | GET, POST | List and create plugins |
| `/api/plugins/[id]` | GET, DELETE | Plugin management |
| `/api/plugins/install` | POST | Install a plugin |
| `/api/plugins/seed` | POST | Seed built-in plugins |

### System and Utilities

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/health` | GET | Health check |
| `/api/doctor` | GET | Diagnostic report |
| `/api/system/monitor` | GET | System resource monitoring |
| `/api/network/status` | GET | Network/LAN status |
| `/api/settings` | GET, PATCH | Application settings |
| `/api/skills` | GET, POST | Skill management |
| `/api/skills/[id]` | GET, DELETE | Skill CRUD |
| `/api/prompts` | GET, POST | Prompt template library |
| `/api/prompts/[id]` | GET, DELETE | Prompt CRUD |
| `/api/upload` | POST | File upload |
| `/api/import` | POST | Data import |
| `/api/export` | POST | Data export |
| `/api/search` | POST | Global search |
| `/api/quick-actions` | POST | Execute quick actions |
| `/api/voice-coding` | POST | Voice-to-code |
| `/api/kanban/boards` | GET | Kanban boards |
| `/api/kanban/cards` | GET, POST | Card management |
| `/api/kanban/cards/[id]` | GET, PATCH, DELETE | Card CRUD |
| `/api/kanban/cards/[id]/move` | POST | Move card between columns |
| `/api/mobile/register` | POST | Register mobile device |
| `/api/mobile/notify` | POST | Push notification |
| `/api/local/cmd` | POST | Execute shell command |
| `/api/local/files` | GET | Local file browser |
| `/api/bridge/proxy` | POST | API bridge proxy |
| `/api/workspaces` | GET, POST | Workspace management |
| `/api/workspaces/[id]` | GET, DELETE | Workspace CRUD |
| `/api/updater/check` | GET | Check for updates |
| `/api/updater/apply` | POST | Apply update |

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
│   │   │   ├── whatsapp/               # WhatsApp integration
│   │   │   ├── telegram/               # Telegram bot integration
│   │   │   ├── discord/                # Discord bot integration
│   │   │   └── ...                     # Additional routes
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                    # Main dashboard
│   ├── components/
│   │   ├── enhancements/               # 36 feature panels (6 tiers)
│   │   ├── ui/                         # 37 shadcn/ui primitives
│   │   ├── ChatWindow.tsx              # Main chat interface
│   │   ├── ChatInput.tsx               # Message input with attachments
│   │   ├── ChatSidebar.tsx             # Conversation list sidebar
│   │   ├── TopBar.tsx                  # Navigation bar and power tools
│   │   ├── SettingsPanel.tsx           # Application settings
│   │   ├── CommandPalette.tsx          # Ctrl+K command palette
│   │   ├── MemoryPanel.tsx             # Memory management
│   │   ├── KnowledgePanel.tsx          # Knowledge base
│   │   ├── AgentRunnerPanel.tsx        # Agent execution
│   │   ├── SchedulerPanel.tsx          # Cron scheduling UI
│   │   ├── MCPServerPanel.tsx          # MCP server management
│   │   ├── WhatsAppPanel.tsx           # WhatsApp/Telegram/Discord integration
│   │   ├── TokenDashboard.tsx          # Token usage analytics
│   │   ├── SystemMonitor.tsx           # System resource monitor
│   │   ├── DoctorPanel.tsx             # Health diagnostics
│   │   ├── OnboardingWizard.tsx        # First-run setup
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
│       ├── issue-pipeline.ts           # Issue to deploy pipeline
│       ├── self-improving.ts           # Agent self-improvement
│       ├── self-healer.ts              # Auto-heal and recovery
│       ├── embeddings.ts               # Embedding generation
│       ├── tokens.ts                   # Token counting (tiktoken)
│       ├── mcp.ts                      # MCP protocol client
│       ├── whatsapp.ts                 # WhatsApp Web (Baileys)
│       ├── telegram.ts                 # Telegram Bot API
│       ├── discord.ts                  # Discord bot client
│       ├── artifact-store.ts           # Artifact state management
│       ├── events.ts                   # Event bus / pub-sub
│       ├── updater.ts                  # Auto-update system
│       ├── network.ts                  # LAN/multi-device networking
│       └── ...                         # Additional modules
├── prisma/
│   └── schema.prisma                   # 40 database models
├── skills/                             # 50+ skill modules
├── db/                                 # SQLite database (auto-created)
├── .env                                # Environment config
└── install.sh / install.bat            # One-command installers
```

---

## Environment Variables

Create a `.env` file in the project root (defaults are included):

```env
DATABASE_URL="file:./db/clawhub.db"
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `gemini is not recognized` | Run `npm install -g @google/gemini-cli`, restart terminal, then `gemini --version` |
| Database errors | Run `node push-db.js` to reset the database |
| Port 3000 already in use | `netstat -ano \| findstr :3000` then `taskkill /PID <PID> /F` |
| Provider connection failures | Check API keys in **Settings > Providers** and verify base URLs |

---

## License

MIT — free for personal and commercial use.
