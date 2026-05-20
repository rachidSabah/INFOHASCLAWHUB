#!/bin/bash
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ClawHub Desktop - Uninstaller             ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

INSTALL_DIR="${HOME}/clawhub-desktop"

if [ ! -d "$INSTALL_DIR" ]; then
    echo "[!] Installation not found at $INSTALL_DIR"
    echo "    Checking %USERPROFILE%..."
    INSTALL_DIR="${USERPROFILE}/clawhub-desktop"
    if [ ! -d "$INSTALL_DIR" ]; then
        echo "[X] No installation found."
        exit 0
    fi
fi

echo "[*] Found: $INSTALL_DIR"
echo ""

read -p "Remove ClawHub Desktop completely? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Cancelled."
    exit 0
fi

echo "[*] Removing files..."
rm -rf "$INSTALL_DIR"
echo "    [OK] Files removed"

echo ""
echo "[*] Removing database..."
rm -f "${HOME}/.clawhub-db" 2>/dev/null
echo "    [OK] Database cleaned"

echo ""
echo "[*] Removing npm cache..."
rm -rf "${HOME}/.npm/_cacache" 2>/dev/null
echo "    [OK] Cache cleaned"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║        Uninstall Complete!                  ║"
echo "║        Reinstall: curl | bash script        ║"
echo "╚══════════════════════════════════════════════╝"
