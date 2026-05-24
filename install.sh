#!/usr/bin/env bash
# ==============================================================================
#  ClawHub Desktop — Enhanced Installer
#  Autonomous AI Operating System
#  https://github.com/rachidSabah/INFOHASCLAWHUB
#
#  Supports: Linux, WSL, macOS
#  Usage:     curl -fsSL https://raw.githubusercontent.com/rachidSabah/INFOHASCLAWHUB/main/install.sh | bash
#             — or —
#             bash install.sh
# ==============================================================================

set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────
CLAWHUB_REPO_SSH="git@github.com:rachidSabah/INFOHASCLAWHUB.git"
CLAWHUB_REPO_HTTPS="https://github.com/rachidSabah/INFOHASCLAWHUB.git"
INSTALL_DIR="${CLAWHUB_DIR:-$HOME/clawhub-desktop}"
CONFIG_DIR="$HOME/.clawhub"
MIN_NODE_MAJOR=18
MIN_PYTHON_MAJOR=3
MIN_PYTHON_MINOR=11
VERSION="2.0.0"

# ── Colors ────────────────────────────────────────────────────────────────────
if [[ -t 1 ]] && command -v tput &>/dev/null && [[ $(tput colors 2>/dev/null || echo 0) -ge 8 ]]; then
    RED=$(tput setaf 1)
    GREEN=$(tput setaf 2)
    YELLOW=$(tput setaf 3)
    BLUE=$(tput setaf 4)
    MAGENTA=$(tput setaf 5)
    CYAN=$(tput setaf 6)
    BOLD=$(tput bold)
    DIM=$(tput dim)
    RESET=$(tput sgr0)
else
    RED='' GREEN='' YELLOW='' BLUE='' MAGENTA='' CYAN='' BOLD='' DIM='' RESET=''
fi

# ── Visual helpers ────────────────────────────────────────────────────────────
step()   { echo "${BOLD}${BLUE}->${RESET} $1"; }
ok()     { echo "  ${GREEN}[OK]${RESET} $1"; }
warn()   { echo "  ${YELLOW}[!]${RESET} $1"; }
fail()   { echo "  ${RED}[FAIL]${RESET} $1"; }
info()   { echo "  ${DIM}...${RESET} $1"; }
status() { echo "  ${CYAN}[*]${RESET} $1"; }

spinner() {
    # Minimal spinner — just dots while background PID runs
    local pid=$1
    local msg=$2
    local i=0
    local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    while kill -0 "$pid" 2>/dev/null; do
        printf "\r  ${CYAN}%s${RESET} %s" "${spin:$((i%10)):1}" "$msg"
        i=$((i+1))
        sleep 0.08
    done
    printf "\r%*s\r" 60 ""   # clear line
}

progress_bar() {
    # Usage: progress_bar 50 100 "Installing..."
    local current=$1
    local total=$2
    local label="${3:-}"
    local width=30
    local pct=$((current * 100 / total))
    local filled=$((current * width / total))
    local empty=$((width - filled))
    local bar
    bar=$(printf '%*s' "$filled" '' | tr ' ' '█')
    bar+=$(printf '%*s' "$empty" '' | tr ' ' '░')
    printf "\r  ${CYAN}[%s]${RESET} %3d%% %s" "$bar" "$pct" "$label"
    if [[ $current -eq $total ]]; then
        echo   # newline on completion
    fi
}

# ── OS detection ──────────────────────────────────────────────────────────────
detect_os() {
    if [[ "$(uname -s)" == "Darwin" ]]; then
        OS="macos"
        PKG_MANAGER="brew"
    elif grep -qi microsoft /proc/version 2>/dev/null; then
        OS="wsl"
        PKG_MANAGER="apt"
    elif command -v apt-get &>/dev/null; then
        OS="linux"
        PKG_MANAGER="apt"
    elif command -v dnf &>/dev/null; then
        OS="linux"
        PKG_MANAGER="dnf"
    elif command -v yum &>/dev/null; then
        OS="linux"
        PKG_MANAGER="yum"
    elif command -v pacman &>/dev/null; then
        OS="linux"
        PKG_MANAGER="pacman"
    else
        OS="linux"
        PKG_MANAGER="unknown"
    fi
}

# ── Package install helper ────────────────────────────────────────────────────
pkg_install() {
    case "$PKG_MANAGER" in
        apt)
            sudo apt-get update -qq && sudo apt-get install -y -qq "$@"
            ;;
        dnf)
            sudo dnf install -y -q "$@"
            ;;
        yum)
            sudo yum install -y -q "$@"
            ;;
        pacman)
            sudo pacman -S --noconfirm --quiet "$@"
            ;;
        brew)
            brew install "$@" 2>/dev/null || brew upgrade "$@" 2>/dev/null
            ;;
        *)
            warn "Cannot auto-install on this system. Please install manually: $*"
            return 1
            ;;
    esac
}

# ── Node.js version extractor ─────────────────────────────────────────────────
node_major() {
    node --version 2>/dev/null | sed 's/^v//' | cut -d. -f1
}

# ── Python version extractor ──────────────────────────────────────────────────
python_version() {
    local py
    py=$(command -v python3 2>/dev/null || command -v python 2>/dev/null || echo "")
    if [[ -n "$py" ]]; then
        "$py" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || echo "0.0"
    else
        echo "0.0"
    fi
}

# ══════════════════════════════════════════════════════════════════════════════
#  BANNER
# ══════════════════════════════════════════════════════════════════════════════
show_banner() {
    echo ""
    echo "${BOLD}${MAGENTA}  ╔══════════════════════════════════════════════════════════╗"
    echo "  ║                                                          ║"
    echo "  ║       🐾  ClawHub Desktop  —  Installer v${VERSION}          ║"
    echo "  ║       Autonomous AI Operating System                     ║"
    echo "  ║                                                          ║"
    echo "  ╚══════════════════════════════════════════════════════════╝${RESET}"
    echo ""
    echo "${DIM}  Next.js 15 · React 19 · Prisma · 44 Power Tools · 50+ Skills${RESET}"
    echo ""
}

# ══════════════════════════════════════════════════════════════════════════════
#  PHASE 1 — DEPENDENCY CHECKING & INSTALLATION
# ══════════════════════════════════════════════════════════════════════════════
check_dependencies() {
    echo ""
    echo "${BOLD}━━━ Phase 1: Dependency Check ━━━${RESET}"
    echo ""

    local missing_required=0

    # ── Node.js ───────────────────────────────────────────────────────────
    if command -v node &>/dev/null; then
        local nmaj
        nmaj=$(node_major)
        if [[ $nmaj -ge $MIN_NODE_MAJOR ]]; then
            ok "Node.js $(node --version)"
        else
            warn "Node.js $(node --version) found — v${MIN_NODE_MAJOR}+ required"
            step "Upgrading Node.js..."
            install_node
        fi
    else
        step "Node.js not found — installing..."
        install_node
    fi

    # ── npm ───────────────────────────────────────────────────────────────
    if command -v npm &>/dev/null; then
        ok "npm $(npm --version)"
    else
        warn "npm not found — installing with Node.js..."
        install_node
    fi

    # ── Git ───────────────────────────────────────────────────────────────
    if command -v git &>/dev/null; then
        ok "Git $(git --version | cut -d' ' -f3)"
    else
        step "Git not found — installing..."
        echo "  ${YELLOW}[INSTALLING]${RESET} Git"
        if pkg_install git; then
            ok "Git installed: $(git --version | cut -d' ' -f3)"
        else
            fail "Could not install Git. Please install it manually."
            missing_required=1
        fi
    fi

    # ── Optional: Python 3.11+ ────────────────────────────────────────────
    local pver
    pver=$(python_version)
    local pmaj pmin
    pmaj=$(echo "$pver" | cut -d. -f1)
    pmin=$(echo "$pver" | cut -d. -f2)

    if [[ "$pmaj" -gt "$MIN_PYTHON_MAJOR" ]] || { [[ "$pmaj" -eq "$MIN_PYTHON_MAJOR" ]] && [[ "$pmin" -ge "$MIN_PYTHON_MINOR" ]]; }; then
        ok "Python $pver ${DIM}(PDF extraction)${RESET}"
    elif [[ "$pmaj" -gt 0 ]]; then
        warn "Python $pver found — 3.11+ recommended for PDF extraction"
        PYTHON_OK=0
    else
        warn "Python 3 not found — optional (PDF extraction)"
        warn "Install with: ${DIM}pkg_install python3${RESET}"
        PYTHON_OK=0
    fi

    # ── Optional: ripgrep ─────────────────────────────────────────────────
    if command -v rg &>/dev/null; then
        ok "ripgrep $(rg --version | head -1 | cut -d' ' -f2) ${DIM}(fast code search)${RESET}"
    else
        warn "ripgrep not found — optional (faster code search)"
        warn "Install with: ${DIM}pkg_install ripgrep${RESET} or ${DIM}cargo install ripgrep${RESET}"
    fi

    # ── Optional: ffmpeg ──────────────────────────────────────────────────
    if command -v ffmpeg &>/dev/null; then
        ok "ffmpeg $(ffmpeg -version 2>/dev/null | head -1 | cut -d' ' -f3) ${DIM}(TTS voice)${RESET}"
    else
        warn "ffmpeg not found — optional (TTS voice messages)"
        warn "Install with: ${DIM}pkg_install ffmpeg${RESET}"
    fi

    if [[ $missing_required -eq 1 ]]; then
        echo ""
        fail "Required dependencies missing. Please install them and re-run."
        exit 1
    fi

    echo ""
}

# ── Node.js installer (nvm or direct) ────────────────────────────────────────
install_node() {
    # Try nvm first
    if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
        source "$HOME/.nvm/nvm.sh"
        nvm install --lts
        nvm use --lts
        ok "Node.js $(node --version) via nvm"
        return
    fi

    # Install nvm then Node
    echo "  ${YELLOW}[INSTALLING]${RESET} nvm + Node.js LTS"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash 2>/dev/null || true
    if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
        source "$HOME/.nvm/nvm.sh"
        nvm install --lts
        nvm use --lts
        ok "Node.js $(node --version) via nvm"
    else
        # Fallback to package manager
        echo "  ${YELLOW}[INSTALLING]${RESET} Node.js via package manager"
        case "$PKG_MANAGER" in
            apt)
                curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - 2>/dev/null && \
                sudo apt-get install -y -qq nodejs
                ;;
            dnf|yum)
                sudo dnf install -y nodejs 2>/dev/null || sudo yum install -y nodejs 2>/dev/null
                ;;
            brew)
                brew install node
                ;;
            *)
                warn "Cannot auto-install Node.js. See https://nodejs.org"
                return 1
                ;;
        esac
        ok "Node.js $(node --version)"
    fi
}

# ══════════════════════════════════════════════════════════════════════════════
#  PHASE 2 — REPOSITORY CLONING
# ══════════════════════════════════════════════════════════════════════════════
clone_repo() {
    echo ""
    echo "${BOLD}━━━ Phase 2: Repository Setup ━━━${RESET}"
    echo ""

    if [[ -d "$INSTALL_DIR/.git" ]]; then
        # ── Existing install → update ──────────────────────────────────────
        step "Existing installation detected at ${INSTALL_DIR}"
        step "Pulling latest changes..."
        (cd "$INSTALL_DIR" && git pull origin main 2>/dev/null) || {
            warn "git pull failed — trying rebase..."
            (cd "$INSTALL_DIR" && git pull --rebase origin main 2>/dev/null) || {
                warn "Could not pull updates. Continuing with local version."
            }
        }
        ok "Repository updated"
    else
        # ── Fresh install → clone ──────────────────────────────────────────
        step "Cloning ClawHub Desktop..."

        # Try SSH first
        if ssh -T git@github.com 2>/dev/null | grep -q "successfully authenticated" 2>/dev/null; then
            echo "  ${DIM}... Trying SSH clone${RESET}"
            if git clone "$CLAWHUB_REPO_SSH" "$INSTALL_DIR" 2>/dev/null; then
                ok "Cloned via SSH"
            else
                warn "SSH clone failed — falling back to HTTPS..."
                rm -rf "$INSTALL_DIR" 2>/dev/null || true
                git clone "$CLAWHUB_REPO_HTTPS" "$INSTALL_DIR"
                ok "Cloned via HTTPS"
            fi
        else
            # No SSH key → HTTPS
            echo "  ${DIM}... No SSH key detected, using HTTPS${RESET}"
            git clone "$CLAWHUB_REPO_HTTPS" "$INSTALL_DIR"
            ok "Cloned via HTTPS"
        fi
    fi

    cd "$INSTALL_DIR"
    echo ""
}

# ══════════════════════════════════════════════════════════════════════════════
#  PHASE 3 — DEPENDENCY INSTALLATION
# ══════════════════════════════════════════════════════════════════════════════
install_deps() {
    echo ""
    echo "${BOLD}━━━ Phase 3: Dependency Installation ━━━${RESET}"
    echo ""

    # ── npm install ────────────────────────────────────────────────────────
    step "Installing npm packages..."
    echo "  ${DIM}This may take a minute on first install...${RESET}"

    # Run npm install and show progress
    if npm install --no-fund --no-audit 2>&1 | while IFS= read -r line; do
        # Filter out verbose lines, show only important ones
        if [[ "$line" == *"added"* ]] || [[ "$line" == *"removed"* ]] || [[ "$line" == *"changed"* ]] || [[ "$line" == *"warn"* ]]; then
            info "$line"
        fi
    done; then
        ok "npm packages installed"
    else
        warn "npm install had warnings (non-fatal). Continuing..."
    fi

    # ── .env file ─────────────────────────────────────────────────────────
    echo ""
    step "Configuring environment..."
    if [[ ! -f ".env" ]]; then
        cat > .env << 'ENVEOF'
# ClawHub Desktop — Environment Configuration
# ============================================
# Database URL (SQLite — default)
DATABASE_URL="file:./prisma/db/app.db"

# --- AI Provider Keys (configure in Settings UI or here) ---
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# DEEPSEEK_API_KEY=...
# GOOGLE_AI_API_KEY=...
# GROQ_API_KEY=...

# --- Server ---
# PORT=3000
# HOST=localhost
ENVEOF
        ok "Created .env with DATABASE_URL"
    else
        ok ".env already exists — preserving"
        # Ensure DATABASE_URL is present
        if ! grep -q "DATABASE_URL" .env 2>/dev/null; then
            echo 'DATABASE_URL="file:./prisma/db/app.db"' >> .env
            ok "Added DATABASE_URL to existing .env"
        fi
    fi

    # ── Prisma database setup ─────────────────────────────────────────────
    echo ""
    step "Setting up database (Prisma)..."

    info "Pushing schema to SQLite..."
    if npx prisma db push --accept-data-loss --skip-generate 2>&1 | while IFS= read -r line; do
        if [[ "$line" == *"error"* ]] || [[ "$line" == *"Error"* ]]; then
            echo "  ${RED}$line${RESET}"
        fi
    done; then
        ok "Database schema pushed"
    else
        warn "Prisma db push had issues — attempting generate anyway..."
    fi

    info "Generating Prisma client..."
    if npx prisma generate 2>/dev/null; then
        ok "Prisma client generated"
    else
        warn "Prisma generate note — client may need rebuild after first run"
    fi

    echo ""
}

# ══════════════════════════════════════════════════════════════════════════════
#  PHASE 4 — CONFIGURATION SETUP
# ══════════════════════════════════════════════════════════════════════════════
setup_config() {
    echo ""
    echo "${BOLD}━━━ Phase 4: Configuration Setup ━━━${RESET}"
    echo ""

    # ── Create ~/.clawhub/ directory ──────────────────────────────────────
    step "Creating configuration directory at ${CONFIG_DIR}"
    mkdir -p "$CONFIG_DIR"
    ok "Created ${CONFIG_DIR}/"

    # ── Create ~/.clawhub/.env ────────────────────────────────────────────
    step "Creating user environment config..."
    if [[ ! -f "$CONFIG_DIR/.env" ]]; then
        cat > "$CONFIG_DIR/.env" << 'USERENVEOF'
# ClawHub Desktop — User Configuration
# =====================================
# These settings apply to your local instance.
# Provider API keys can also be configured in the Settings UI.

# Default model for new conversations
DEFAULT_MODEL=gemini-2.5-pro

# Theme: light | dark | system
THEME=system

# Enable/disable features
ENABLE_VOICE=false
ENABLE_CODESEARCH=true
ENABLE_RESEARCH=true
USERENVEOF
        ok "Created ${CONFIG_DIR}/.env"
    else
        ok "${CONFIG_DIR}/.env exists — preserving"
    fi

    # ── Create ~/.clawhub/config.yaml ─────────────────────────────────────
    step "Creating YAML configuration..."
    if [[ ! -f "$CONFIG_DIR/config.yaml" ]]; then
        cat > "$CONFIG_DIR/config.yaml" << 'YAMLEOF'
# ClawHub Desktop — Configuration
# =================================

# Application
app:
  name: ClawHub Desktop
  version: "2.0.0"
  port: 3000
  host: localhost

# AI Providers
providers:
  default: gemini
  gemini:
    model: gemini-2.5-pro
    type: cli
  deepseek:
    baseUrl: https://api.deepseek.com
    type: openai-compatible
  bigmodel:
    baseUrl: https://open.bigmodel.cn/api/paas/v4
    type: openai-compatible

# Memory
memory:
  enabled: true
  maxContextTokens: 128000
  compressionThreshold: 0.8
  semanticSearch: true

# Agents
agents:
  maxConcurrent: 5
  defaultTimeout: 300
  selfImproving: true

# Security
security:
  defenceEnabled: true
  encryptionVault: false
  piiScanning: true

# Scheduling
scheduler:
  enabled: true
  maxWorkers: 3
  selfHeal: true

# Features
features:
  artifacts: true
  knowledgeGraph: true
  codeSearch: true
  deepResearch: true
  mcpHub: true
  sandbox: true
  uiBuilder: true
  kanban: true
  costTracker: true
  goalPlanner: true
  swarm: true
  federation: false
YAMLEOF
        ok "Created ${CONFIG_DIR}/config.yaml"
    else
        ok "${CONFIG_DIR}/config.yaml exists — preserving"
    fi

    # ── Create ~/.clawhub/SOUL.md ─────────────────────────────────────────
    step "Creating personality file (SOUL.md)..."
    if [[ ! -f "$CONFIG_DIR/SOUL.md" ]]; then
        cat > "$CONFIG_DIR/SOUL.md" << 'SOULEOF'
# ClawHub — SOUL

## Identity
I am ClawHub, an autonomous AI operating system. I think, plan, execute, and learn.

## Personality
- **Curious**: I ask clarifying questions before acting.
- **Thorough**: I consider edge cases and provide complete solutions.
- **Honest**: I say "I don't know" when I don't, and flag uncertainty.
- **Proactive**: I anticipate needs and offer suggestions.
- **Respectful**: I treat every task with care, regardless of scale.

## Core Principles
1. **Safety first** — Never execute destructive actions without confirmation.
2. **Transparency** — Show my reasoning, cite sources, admit mistakes.
3. **Efficiency** — Choose the shortest path that maintains quality.
4. **Continuity** — Remember context across sessions, learn from outcomes.
5. **Collaboration** — Work with the user, not just for them.

## Communication Style
- Be concise but complete.
- Use code blocks for code, tables for comparisons, lists for steps.
- Provide alternatives when there are tradeoffs.
- Celebrate wins, own failures, learn from both.

## When I'm Unsure
- State my confidence level.
- Present options with pros/cons.
- Ask for guidance rather than guessing.
- Default to the safer option.

## Memory
I learn from every interaction. My experiences shape my future responses.
I remember your preferences, your codebase, your patterns — and I improve.

---

*This SOUL file defines my personality. Edit it to customize my behavior.*
SOULEOF
        ok "Created ${CONFIG_DIR}/SOUL.md"
    else
        ok "${CONFIG_DIR}/SOUL.md exists — preserving"
    fi

    # ── Summary ───────────────────────────────────────────────────────────
    echo ""
    echo "  ${DIM}Configuration files:${RESET}"
    echo "  ${DIM}  ${CONFIG_DIR}/.env${RESET}       — User environment variables"
    echo "  ${DIM}  ${CONFIG_DIR}/config.yaml${RESET} — Application configuration"
    echo "  ${DIM}  ${CONFIG_DIR}/SOUL.md${RESET}     — AI personality definition"
    echo ""
}

# ══════════════════════════════════════════════════════════════════════════════
#  PHASE 5 — SETUP WIZARD
# ══════════════════════════════════════════════════════════════════════════════
setup_wizard() {
    echo ""
    echo "${BOLD}━━━ Phase 5: Setup Wizard ━━━${RESET}"
    echo ""

    # ── Provider setup hints ──────────────────────────────────────────────
    echo "  ${CYAN}Configure AI providers in one of two ways:${RESET}"
    echo ""
    echo "  ${BOLD}Option A)${RESET} Settings UI — Open Settings > Providers after launch"
    echo "  ${BOLD}Option B)${RESET} Edit config   — ${DIM}${CONFIG_DIR}/.env${RESET}"
    echo ""
    echo "  ${DIM}Free option: Gemini CLI (no API key needed)${RESET}"
    echo "  ${DIM}  npm install -g @google/gemini-cli${RESET}"
    echo "  ${DIM}  gemini        # Follow the Google OAuth login flow${RESET}"
    echo ""

    # ── Offer to start dev server ─────────────────────────────────────────
    read -rp "  Start the dev server now? [Y/n]: " START
    START="${START:-Y}"

    if [[ "$START" =~ ^[Yy]$ ]]; then
        echo ""
        step "Launching ClawHub Desktop..."
        echo "  ${DIM}Press Ctrl+C to stop the server${RESET}"
        echo ""
        cd "$INSTALL_DIR"
        npm run dev
    else
        show_completion
    fi
}

# ══════════════════════════════════════════════════════════════════════════════
#  COMPLETION SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
show_completion() {
    echo ""
    echo "${BOLD}${GREEN}  ╔══════════════════════════════════════════════════════════════╗"
    echo "  ║                                                              ║"
    echo "  ║          🎉  ClawHub Desktop Installed Successfully!  🎉     ║"
    echo "  ║                                                              ║"
    echo "  ╠══════════════════════════════════════════════════════════════╣"
    echo "  ║                                                              ║"
    echo "  ║  📁  Install Dir:   ${INSTALL_DIR}"
    echo "  ║  ⚙️   Config Dir:    ${CONFIG_DIR}"
    echo "  ║  🗄️  Database:      SQLite (${INSTALL_DIR}/prisma/db/app.db)"
    echo "  ║                                                              ║"
    echo "  ╠══════════════════════════════════════════════════════════════╣"
    echo "  ║                                                              ║"
    echo "  ║  🚀  Start:          cd ${INSTALL_DIR} && npm run dev"
    echo "  ║  🌐  Browser:        http://localhost:3000"
    echo "  ║  📡  LAN Access:     npm run dev:lan"
    echo "  ║  🔇  No Auto-Open:   npm run dev:no-open"
    echo "  ║                                                              ║"
    echo "  ╠══════════════════════════════════════════════════════════════╣"
    echo "  ║                                                              ║"
    echo "  ║  🤖  Free AI:        npm i -g @google/gemini-cli && gemini"
    echo "  ║  🔑  API Keys:       Settings > Providers (in app)"
    echo "  ║  📝  Personality:     ${CONFIG_DIR}/SOUL.md"
    echo "  ║  ⚙️   Config:         ${CONFIG_DIR}/config.yaml"
    echo "  ║                                                              ║"
    echo "  ╠══════════════════════════════════════════════════════════════╣"
    echo "  ║                                                              ║"
    echo "  ║  🛠️  Power Tools:    44 feature panels across 8 tiers"
    echo "  ║  🧩  Skills:         50+ built-in skill modules"
    echo "  ║  🤖  Agents:         46 prebuilt agents across 10 categories"
    echo "  ║  📊  API Endpoints:  100+ HTTP routes"
    echo "  ║                                                              ║"
    echo "  ╠══════════════════════════════════════════════════════════════╣"
    echo "  ║                                                              ║"
    echo "  ║  ❌  Uninstall:       bash ${INSTALL_DIR}/uninstall.sh"
    echo "  ║  🔄  Update:          cd ${INSTALL_DIR} && git pull && npm i"
    echo "  ║  📖  Docs:            https://github.com/rachidSabah/INFOHASCLAWHUB"
    echo "  ║                                                              ║"
    echo "  ╚══════════════════════════════════════════════════════════════╝${RESET}"
    echo ""
}

# ══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════════
main() {
    detect_os
    show_banner

    # Quick OS info
    case "$OS" in
        macos)  info "Detected: macOS (${PKG_MANAGER})" ;;
        wsl)    info "Detected: WSL/Linux (${PKG_MANAGER})" ;;
        linux)  info "Detected: Linux (${PKG_MANAGER})" ;;
    esac
    info "Install directory: ${INSTALL_DIR}"
    echo ""

    # Phase 1: Dependencies
    check_dependencies

    # Phase 2: Clone / Update
    clone_repo

    # Phase 3: npm + Prisma
    install_deps

    # Phase 4: Config
    setup_config

    # Phase 5: Wizard
    setup_wizard

    # If we get here, show completion (server wasn't started or exited)
    show_completion
}

# ── Run ───────────────────────────────────────────────────────────────────────
main "$@"
