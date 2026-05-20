@echo off
setlocal enabledelayedexpansion
echo.
echo ╔══════════════════════════════════════════════╗
echo ║   ClawHub Desktop - Quick Installer         ║
echo ╚══════════════════════════════════════════════╝
echo.

set IS_WSL=0 & set IS_WINDOWS=0 & set IS_LINUX=0
wsl --version >nul 2>&1 && set IS_WSL=1
if "%PROCESSOR_ARCHITECTURE%" neq "" set IS_WINDOWS=1
if exist /etc/os-release set IS_LINUX=1

echo [*] Environment: 
if %IS_WSL% equ 1 echo     WSL detected
if %IS_WINDOWS% equ 1 echo     Windows native
if %IS_LINUX% equ 1 echo     Linux native
echo.

echo [*] Checking prerequisites...
where node >nul 2>&1 || (echo [X] Install Node.js v18+ from https://nodejs.org & pause & exit /b 1)
echo     [OK] Node.js found
where git >nul 2>&1 || (echo [X] Install Git from https://git-scm.com & pause & exit /b 1)
echo     [OK] Git found
echo.

if %IS_WSL% equ 1 (set INSTALL_DIR=%HOME%/clawhub-desktop) else if %IS_LINUX% equ 1 (set INSTALL_DIR=%HOME%/clawhub-desktop) else (set INSTALL_DIR=%USERPROFILE%\clawhub-desktop)
echo [*] Directory: %INSTALL_DIR%
echo.

if exist "%INSTALL_DIR%\.git" (
    echo [*] Updating...
    cd /d "%INSTALL_DIR%" && git pull origin main || (echo [X] Update failed & pause & exit /b 1)
    echo     [OK] Updated
) else (
    echo [*] Cloning...
    git clone https://github.com/rachidSabah/INFOHASCLAWHUB.git "%INSTALL_DIR%" || (echo [X] Clone failed & pause & exit /b 1)
    cd /d "%INSTALL_DIR%"
    echo     [OK] Cloned
)
echo.

echo [*] Installing dependencies...
call npm install || (echo [X] npm install failed & pause & exit /b 1)
echo     [OK] Dependencies installed
echo.

echo [*] Creating .env...
if not exist ".env" (echo DATABASE_URL="file:./prisma/db/app.db" > .env & echo     [OK] Created) else (echo     [OK] Exists)
echo.

echo [*] Setting up database...
call npx prisma db push --accept-data-loss --skip-generate || (echo [X] DB setup failed & pause & exit /b 1)
echo     [OK] Database ready
call npx prisma generate 2>nul || echo     [!] Prisma generate note
echo.

echo ╔══════════════════════════════════════════════╗
echo ║        Installation Complete!               ║
echo ╠══════════════════════════════════════════════╣
echo ║  Start:  cd %INSTALL_DIR% ^&^& npm run dev ║
echo ║  URL:    http://localhost:3000              ║
echo ║  Uninstall:  run uninstall.bat             ║
echo ╚══════════════════════════════════════════════╝
echo.

set /p START="Start now? (y/n): "
if /i "%START%"=="y" (start http://localhost:3000 & call npm run dev)
endlocal
