@echo off
setlocal enabledelayedexpansion

echo.
echo ╔══════════════════════════════════════════════╗
echo ║     ClawHub Desktop - Quick Installer        ║
echo ╚══════════════════════════════════════════════╝
echo.

REM ─── Detect environment ───
set IS_WSL=0
set IS_WINDOWS=0
set IS_LINUX=0

wsl --version >nul 2>&1
if %errorlevel% equ 0 set IS_WSL=1

if "%PROCESSOR_ARCHITECTURE%" neq "" set IS_WINDOWS=1
if exist /etc/os-release set IS_LINUX=1

echo [*] Environment: 
if %IS_WSL% equ 1 echo     WSL detected
if %IS_WINDOWS% equ 1 echo     Windows native
if %IS_LINUX% equ 1 echo     Linux native
echo.

REM ─── Check prerequisites ───
echo [*] Checking prerequisites...

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] Node.js not found. Installing...
    if %IS_WSL% equ 1 (
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    ) else (
        echo     Please install Node.js from https://nodejs.org (v18+)
        echo     After installing, run this script again.
        pause
        exit /b 1
    )
)
echo     [OK] Node.js found

where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] Git not found. Installing...
    if %IS_WSL% equ 1 (
        sudo apt-get install -y git
    ) else (
        echo     Please install Git from https://git-scm.com
        pause
        exit /b 1
    )
)
echo     [OK] Git found

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] npm not found
    pause
    exit /b 1
)
echo     [OK] npm found
echo.

REM ─── Set install directory ───
if %IS_WSL% equ 1 (
    set INSTALL_DIR=%HOME%/clawhub-desktop
) else if %IS_LINUX% equ 1 (
    set INSTALL_DIR=%HOME%/clawhub-desktop
) else (
    set INSTALL_DIR=%USERPROFILE%\clawhub-desktop
)

echo [*] Install directory: %INSTALL_DIR%
echo.

REM ─── Clone or pull ───
if exist "%INSTALL_DIR%\.git" (
    echo [*] Existing installation found. Updating...
    cd /d "%INSTALL_DIR%"
    git pull origin main
    if %errorlevel% neq 0 (
        echo [X] Update failed.
        pause
        exit /b 1
    )
    echo     [OK] Updated to latest version
) else (
    echo [*] Cloning repository...
    git clone https://github.com/rachidSabah/INFOHASCLAWHUB.git "%INSTALL_DIR%"
    if %errorlevel% neq 0 (
        echo [X] Clone failed.
        pause
        exit /b 1
    )
    cd /d "%INSTALL_DIR%"
    echo     [OK] Repository cloned
)
echo.

REM ─── Install dependencies ───
echo [*] Installing npm dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [X] npm install failed.
    pause
    exit /b 1
)
echo     [OK] Dependencies installed
echo.

REM ─── Setup database ───
echo [*] Setting up database...
call npx prisma db push --accept-data-loss --skip-generate
if %errorlevel% neq 0 (
    echo [X] Database setup failed.
    pause
    exit /b 1
)
echo     [OK] Database ready

call npx prisma generate
if %errorlevel% neq 0 (
    echo [!] Prisma generate warning — may need to run manually
)
echo     [OK] Prisma client generated
echo.

REM ─── Create .env if missing ───
if not exist "%INSTALL_DIR%\.env" (
    echo DATABASE_URL="file:./prisma/db/app.db" > "%INSTALL_DIR%\.env"
    echo [OK] Created .env file
)
echo.

REM ─── Done ───
echo ╔══════════════════════════════════════════════╗
echo ║         Installation Complete!              ║
echo ╠══════════════════════════════════════════════╣
echo ║  Start:  cd %INSTALL_DIR% ^&^& npm run dev  ║
echo ║  URL:    http://localhost:3000              ║
echo ║  Update: run this script again              ║
echo ╚══════════════════════════════════════════════╝
echo.

REM ─── Auto-start? ───
set /p START="Start dashboard now? (y/n): "
if /i "%START%"=="y" (
    echo.
    echo [*] Starting ClawHub Desktop...
    start "" http://localhost:3000
    call npm run dev
)

endlocal
