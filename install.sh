#!/bin/bash
set -e
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ClawHub Desktop - WSL/Linux Installer     ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

INSTALL_DIR="${HOME}/clawhub-desktop"
echo "[*] Checking prerequisites..."
command -v node &> /dev/null || { echo "[X] Node.js not found. Install: https://nodejs.org"; exit 1; }
echo "    [OK] Node.js $(node --version)"
command -v git &> /dev/null || { echo "[X] Git not found. Install: sudo apt-get install git"; exit 1; }
echo "    [OK] Git $(git --version | cut -d' ' -f3)"
echo ""

if [ -d "$INSTALL_DIR/.git" ]; then
    echo "[*] Updating..."
    cd "$INSTALL_DIR" && git pull origin main
    echo "    [OK] Updated"
else
    echo "[*] Cloning..."
    git clone https://github.com/rachidSabah/INFOHASCLAWHUB.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    echo "    [OK] Cloned"
fi
echo ""

echo "[*] Installing dependencies..."
npm install
echo "    [OK] Installed"
echo ""

# .env MUST come before Prisma commands
if [ ! -f ".env" ]; then
    echo 'DATABASE_URL="file:./prisma/db/app.db"' > .env
    echo "[*] Created .env"
fi

echo "[*] Setting up database..."
npx prisma db push --accept-data-loss --skip-generate
npx prisma generate 2>/dev/null || echo "    [!] Prisma generate note"
echo "    [OK] Database ready"
echo ""

echo "╔══════════════════════════════════════════════╗"
echo "║        Installation Complete!               ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Start:     cd $INSTALL_DIR && npm run dev  ║"
echo "║  URL:       http://localhost:3000           ║"
echo "║  Uninstall: bash uninstall.sh               ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
read -p "Start now? (y/n): " START
if [ "$START" = "y" ] || [ "$START" = "Y" ]; then
    npm run dev
fi
