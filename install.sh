#!/bin/bash
set -e

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ClawHub Desktop - WSL/Linux Installer     ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

INSTALL_DIR="${HOME}/clawhub-desktop"

# Check prerequisites
echo "[*] Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "[!] Node.js not found. Installing via nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install --lts
fi
echo "    [OK] Node.js $(node --version)"

if ! command -v git &> /dev/null; then
    echo "[!] Git not found. Installing..."
    sudo apt-get update -qq && sudo apt-get install -y -qq git
fi
echo "    [OK] Git $(git --version | cut -d' ' -f3)"

echo ""

# Clone or update
if [ -d "$INSTALL_DIR/.git" ]; then
    echo "[*] Updating existing installation..."
    cd "$INSTALL_DIR"
    git pull origin main
    echo "    [OK] Updated"
else
    echo "[*] Cloning repository..."
    git clone https://github.com/rachidSabah/INFOHASCLAWHUB.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    echo "    [OK] Cloned"
fi

echo ""

# Install deps
echo "[*] Installing dependencies..."
npm install
echo "    [OK] Dependencies installed"
echo ""

# Setup database
echo "[*] Setting up database..."
npx prisma db push --accept-data-loss --skip-generate
npx prisma generate 2>/dev/null || echo "    [!] Prisma generate note - may run on first start"
echo "    [OK] Database ready"
echo ""

# Create .env if needed
if [ ! -f ".env" ]; then
    echo 'DATABASE_URL="file:./prisma/db/app.db"' > .env
    echo "[OK] Created .env"
fi

echo "╔══════════════════════════════════════════════╗"
echo "║        Installation Complete!               ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Start:  cd $INSTALL_DIR && npm run dev     ║"
echo "║  URL:    http://localhost:3000              ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Auto-start prompt
read -p "Start dashboard now? (y/n): " START
if [ "$START" = "y" ] || [ "$START" = "Y" ]; then
    echo "[*] Starting at http://localhost:3000 ..."
    npm run dev
fi
