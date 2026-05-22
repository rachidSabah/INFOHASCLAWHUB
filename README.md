# ClawHub Desktop

**Autonomous AI Operating System** — A next-generation AI workspace that unifies multi-provider inference, self-improving agents, Kanban orchestration, Artifact previews, scheduled automation, research pipelines, and 25+ power tools into a single desktop application.

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

Each script automatically installs prerequisites, clones the repo, installs dependencies, sets up the SQLite database via Prisma, and launches at **http://localhost:3000**.

### Manual Install

```bash
git clone https://github.com/rachidSabah/INFOHASCLAWHUB.git
cd INFOHASCLAWHUB
npm install
npx prisma db push --accept-data-loss
npx prisma generate
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

## Features

### Core AI Dashboard
- Multi-provider AI chat (DeepSeek, Gemini, Qwen, Kimi, Z.AI/GLM + OpenAI-compatible)
- Streaming responses via Server-Sent Events (SSE)
- Multi-agent orchestration with 10 specialized agents (Navigator, Blueprint, Prism, Vertex, Core, Harbor, Stratum, Probe, Cipher, Refine)
- Agent pipeline builder with approval gates, pause/resume, version history
- Conversation branching, regenerate, export (Markdown/JSON)
- Speculative multi-provider inference with latency scoring

### Power Tools (19 tools, Tiers 1-4)
**Tier 1 — Game-Changers:** Agent Orchestration, Autonomous Coding, Model Router, Codebase Intelligence, AI Pair Terminal, Kanban Board, Architecture Mapper
**Tier 2 — Power Features:** Comms Hub (WhatsApp/Telegram/Discord/Slack), Cross-Provider Consensus, Visual UI Builder, Database Studio
**Tier 3 — Pro Features:** Deploy Pipeline, Security Vault, Analytics & Insights, Plugin Marketplace
**Tier 4 — Differentiators:** Quick Actions, Voice-to-Code Pipeline, Git Intelligence, Mobile Companion, Web Bridges

### Advanced Tools (25 tools, Tiers 5-8)
**Creative Suite:** AI Artifacts Studio, LAN Network Access, Visual Canvas
**AI Engine:** Universal Memory, Deep Research, Self-Improving Agents, Hybrid Router, MCP Hub, Goal Planner, Knowledge Graph, Verification Engine
**DevOps:** Issue → Deploy Pipeline, Live Sandbox
**Automation:** Cron Scheduler, Background Workers
**Monitoring:** Compliance Engine, Cost Tracker
**Security:** Zero-Trust Federation, Encryption Vault, AI Defence System
**Multi-Agent:** Swarm Coordination, SONA Self-Learning
**Preconfigured:** Prebuilt Agents, Pipeline Templates
**Orchestration:** Real-time Collaboration

### Artifact System (Claude-Artifacts style)
- Auto-detection engine with 11 artifact types
- Live streaming preview panel (right-side, resizable, fullscreen)
- Multi-tab with pinning/recent/favorites
- Export to DOCX, PDF, XLSX, PPTX, Markdown, HTML, CSV
- Shareable links with view tracking
- Version history with rollback
- Isolated sandbox preview for React/HTML/Tailwind

### Document Generation Engine
- DOCX: reports, proposals, resumes with sections/bullets/tables
- PDF: styled paginated documents with embedded fonts
- XLSX: multi-sheet workbooks with headers and formatting
- PPTX: presentation slides with bullets and layout
- CSV, Markdown, HTML direct exports

### Visual Canvas
- Full drawing editor with Select, Move, Rect, Circle, Line, Text tools
- 12-color palette, grid toggle, zoom controls
- 50-level undo stack
- Export as PNG and SVG

### Prompt Library
- Top-bar dropdown with search, 7 categories, favorites, recents
- One-click insert into chat input
- Create/delete prompts with category tagging

### WebBridge Hub
- Built-in proxy for DeepSeek, Qwen, Gemini, Kimi, Z.AI/GLM
- Console script browser token extraction
- Token validation and auto-configuration

### Collaboration & Multi-Device
- LAN/WiFi network access via `0.0.0.0` binding
- Auto-detected local IP with shareable URL
- CORS headers for cross-origin access
- SSE with hostname-aware reconnection
- Workspace system with artifact collections and member tracking

### Enterprise & Security
- AI Defence: injection detection, PII scanning, threat level monitoring
- Encryption Vault: AES-256-GCM at-rest encryption
- Zero-Trust Federation: cross-machine mTLS
- Compliance Engine: audit logs, policy enforcement

### Self-Healing
- Background health check service (`/api/health`)
- Auto-seeding of agents, plugins, and pipelines
- Prisma SQLite database with automatic migration

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, Zustand, Framer Motion |
| Backend | Next.js API routes (120+ endpoints), Server-Sent Events |
| Database | SQLite via Prisma ORM (30+ models) |
| AI Providers | DeepSeek, Gemini, OpenAI, Anthropic, Groq + OpenAI-compatible |
| Real-time | SSE streaming, in-memory EventBus |
| Canvas | HTML5 Canvas API with custom rendering engine |
| Documents | docx, pdf-lib, exceljs, pptxgenjs |
| PDF Extraction | Python PyPDF2 (via child_process) |
| Network | os.networkInterfaces() for LAN auto-detection |
| Security | CORS, CUID-based share tokens, AES-256-GCM |

---

## Repository

- **GitHub**: [rachidSabah/INFOHASCLAWHUB](https://github.com/rachidSabah/INFOHASCLAWHUB)
- **Branch**: `main`
- **Node**: v18+ required
- **Python**: Required for PDF extraction (PyPDF2)

---

## License

MIT — Built for the AI community.
