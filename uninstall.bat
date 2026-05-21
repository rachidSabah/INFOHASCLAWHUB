@echo off
setlocal
echo.
echo ╔══════════════════════════════════════════════╗
echo ║   ClawHub Desktop - Uninstaller             ║
echo ╚══════════════════════════════════════════════╝
echo.

set INSTALL_DIR=%USERPROFILE%\clawhub-desktop
if not exist "%INSTALL_DIR%" (
    set INSTALL_DIR=%HOME%\clawhub-desktop
    if not exist "%INSTALL_DIR%" (
        echo [X] No installation found.
        pause
        exit /b 0
    )
)

echo [*] Found: %INSTALL_DIR%
echo.

set /p CONFIRM="Remove completely? (y/n): "
if /i not "%CONFIRM%"=="y" (echo Cancelled. & pause & exit /b 0)

echo [*] Removing files...
rmdir /s /q "%INSTALL_DIR%" 2>nul
echo     [OK] Removed

echo.
echo ╔══════════════════════════════════════════════╗
echo ║        Uninstall Complete!                  ║
echo ╚══════════════════════════════════════════════╝
pause
endlocal
