@echo off
title Medlock Bridge Darts League
color 0A

:: Store the directory where this bat file lives
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"

echo.
echo ============================================================
echo   Medlock Bridge Darts League
echo ============================================================
echo.

:: Check if Node.js is available
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo         Please run install.ps1 first.
    pause
    exit /b 1
)

:: Check if server is built
if not exist "server\dist\index.js" (
    echo [!] Server not built. Building now...
    call npm run build
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Build failed. Please run install.ps1 again.
        pause
        exit /b 1
    )
)

:: Check if client is built
if not exist "client\dist\index.html" (
    echo [!] Client not built. Building now...
    call npm run build:client
)

:: Ensure SQL Server Express is running
net start "MSSQL$SQLEXPRESS" >nul 2>nul
net start "SQLBrowser" >nul 2>nul

:: Get local IP for display
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    for /f "tokens=1" %%b in ("%%a") do set "LOCAL_IP=%%b"
)

echo   Starting server...
echo.
echo   Local:   http://localhost:3001
echo   Network: http://%LOCAL_IP%:3001
echo.
echo   Open the Network URL on your tablet/phone browser
echo   Close this window to stop the server
echo ============================================================
echo.

:: Open browser after a short delay (gives server time to start)
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3001"

:: Start the server (this blocks until Ctrl+C or window close)
cd server
set NODE_ENV=production
node dist/index.js
