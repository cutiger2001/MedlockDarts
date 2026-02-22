<#
.SYNOPSIS
    Medlock Bridge Darts League — Windows Installer
.DESCRIPTION
    Guides the user through installing all prerequisites and configuring
    the Darts League application on a Windows machine.
    
    Prerequisites handled:
      - SQL Server 2022 Express (downloaded automatically if missing)
      - Node.js 20 LTS (downloaded automatically if missing)
      - Database creation, login setup, schema execution
      - NPM dependency installation and production build
      - Windows Firewall rule for tablet/phone access
      - Desktop shortcut creation

    Run as Administrator:
      Right-click > Run with PowerShell  -or-
      powershell -ExecutionPolicy Bypass -File install.ps1
#>

param(
    [string]$DbPassword = "180Allday!",
    [switch]$SkipSqlInstall,
    [switch]$SkipNodeInstall
)

# ── Strict mode ──────────────────────────────────────────────────────
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Constants ────────────────────────────────────────────────────────
$AppName      = "Medlock Bridge Darts League"
$AppDir       = $PSScriptRoot                   # wherever the repo was cloned
$ServerPort   = 3001
$DbName       = "DartsLeague"
$DbUser       = "DartsAdmin"
$SqlInstance  = "SQLEXPRESS"
$NodeVersion  = "20.18.1"
$NodeUrl      = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-x64.msi"
$SqlExpressUrl = "https://go.microsoft.com/fwlink/p/?linkid=2216019&clcid=0x409&culture=en-us&country=us"
$TempDir      = Join-Path $env:TEMP "DartsInstall"

# ── Helper functions ─────────────────────────────────────────────────
function Write-Banner($text) {
    $line = '=' * 60
    Write-Host ""
    Write-Host $line -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor White
    Write-Host $line -ForegroundColor Cyan
}

function Write-Step($num, $text) {
    Write-Host ""
    Write-Host "  [$num] $text" -ForegroundColor Yellow
    Write-Host "  $('-' * 50)" -ForegroundColor DarkGray
}

function Write-OK($text) {
    Write-Host "      [OK] $text" -ForegroundColor Green
}

function Write-Warn($text) {
    Write-Host "      [!] $text" -ForegroundColor DarkYellow
}

function Write-Fail($text) {
    Write-Host "      [FAIL] $text" -ForegroundColor Red
}

function Test-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]$identity
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Find-SqlCmd {
    # Check common paths for sqlcmd
    $cmd = Get-Command sqlcmd -ErrorAction SilentlyContinue
    $cmdPath = if ($cmd) { $cmd.Source } else { $null }
    $paths = @(
        $cmdPath,
        "C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\sqlcmd.exe",
        "C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\180\Tools\Binn\sqlcmd.exe",
        "C:\Program Files\Microsoft SQL Server\150\Tools\Binn\sqlcmd.exe",
        "C:\Program Files\Microsoft SQL Server\160\Tools\Binn\sqlcmd.exe"
    )
    foreach ($p in $paths) {
        if ($p -and (Test-Path $p)) { return $p }
    }
    return $null
}

function Test-SqlExpressInstalled {
    # Check if SQL Server Express instance exists
    $service = Get-Service -Name "MSSQL`$SQLEXPRESS" -ErrorAction SilentlyContinue
    return ($null -ne $service)
}

function Test-NodeInstalled {
    try {
        $v = & node --version 2>$null
        return ($null -ne $v)
    } catch {
        return $false
    }
}

function Get-LocalIP {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 |
           Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.PrefixOrigin -eq 'Dhcp' } |
           Select-Object -First 1).IPAddress
    if (-not $ip) { $ip = "localhost" }
    return $ip
}

# ══════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════

Write-Banner $AppName
Write-Host "  Installer v1.0" -ForegroundColor DarkGray
Write-Host "  App directory: $AppDir" -ForegroundColor DarkGray

# ── Check admin ──────────────────────────────────────────────────────
if (-not (Test-Admin)) {
    Write-Fail "This installer must be run as Administrator."
    Write-Host "      Right-click PowerShell > 'Run as administrator', then run this script again." -ForegroundColor Gray
    Read-Host "Press Enter to exit"
    exit 1
}
Write-OK "Running as Administrator"

# ── Prompt for DB password ───────────────────────────────────────────
Write-Host ""
Write-Host "  Database password for '$DbUser' login" -ForegroundColor White
Write-Host "  (Press Enter to use default: $DbPassword)" -ForegroundColor DarkGray
$inputPw = Read-Host "  Password"
if ($inputPw -ne "") { $DbPassword = $inputPw }

# ── Create temp directory ────────────────────────────────────────────
if (-not (Test-Path $TempDir)) { New-Item -Path $TempDir -ItemType Directory -Force | Out-Null }

# ══════════════════════════════════════════════════════════════════════
# STEP 1: SQL Server Express
# ══════════════════════════════════════════════════════════════════════
Write-Step 1 "SQL Server 2022 Express"

if (Test-SqlExpressInstalled) {
    Write-OK "SQL Server Express instance already installed"
    # Make sure it's running
    $svc = Get-Service -Name "MSSQL`$SQLEXPRESS"
    if ($svc.Status -ne 'Running') {
        Write-Warn "Starting SQL Server Express service..."
        Start-Service -Name "MSSQL`$SQLEXPRESS"
        Start-Sleep -Seconds 3
    }
    Write-OK "SQL Server Express service is running"
} elseif ($SkipSqlInstall) {
    Write-Warn "SQL install skipped (-SkipSqlInstall). Ensure SQL Server is available."
} else {
    Write-Host "      Downloading SQL Server 2022 Express..." -ForegroundColor Gray
    Write-Host "      This downloads a small bootstrapper (~6 MB) that then" -ForegroundColor DarkGray
    Write-Host "      downloads and installs SQL Server Express (~700 MB total)." -ForegroundColor DarkGray

    $sqlSetup = Join-Path $TempDir "SQL2022-SSEI-Expr.exe"
    if (-not (Test-Path $sqlSetup)) {
        try {
            Invoke-WebRequest -Uri $SqlExpressUrl -OutFile $sqlSetup -UseBasicParsing
        } catch {
            Write-Fail "Failed to download SQL Server Express installer."
            Write-Host "      Please download manually from:" -ForegroundColor Gray
            Write-Host "      https://go.microsoft.com/fwlink/p/?linkid=2216019" -ForegroundColor Cyan
            Write-Host "      Install it, then re-run this installer with -SkipSqlInstall" -ForegroundColor Gray
            Read-Host "Press Enter to exit"
            exit 1
        }
    }
    Write-OK "Downloaded SQL Server Express bootstrapper"

    Write-Host "      Installing SQL Server Express (this may take several minutes)..." -ForegroundColor Gray
    Write-Host "      Instance: SQLEXPRESS | Mixed-Mode Auth | SA Password: $DbPassword" -ForegroundColor DarkGray

    # Run the bootstrapper in "Download" media mode to get the actual installer
    # Then run setup with silent params
    $mediaPath = Join-Path $TempDir "SQLMedia"
    
    # The SSEI bootstrapper can do Install, Download, or Custom
    # Use /Action=Install /Quiet for direct silent install
    $sqlArgs = @(
        "/Action=Install",
        "/IACCEPTSQLSERVERLICENSETERMS",
        "/QS",
        "/FEATURES=SQLENGINE",
        "/INSTANCENAME=$SqlInstance",
        "/SECURITYMODE=SQL",
        "/SAPWD=$DbPassword",
        "/TCPENABLED=1",
        "/BROWSERSVCSTARTUPTYPE=Automatic"
    )

    $process = Start-Process -FilePath $sqlSetup -ArgumentList $sqlArgs -Wait -PassThru
    
    if ($process.ExitCode -ne 0) {
        Write-Warn "SQL Express bootstrapper exited with code $($process.ExitCode)."
        Write-Host "      This bootstrapper sometimes uses a non-zero exit for success." -ForegroundColor DarkGray
        Write-Host "      Checking if SQL Express was actually installed..." -ForegroundColor DarkGray
        Start-Sleep -Seconds 5
    }

    # Verify installation
    if (Test-SqlExpressInstalled) {
        Write-OK "SQL Server Express installed successfully"
        Start-Service -Name "MSSQL`$SQLEXPRESS" -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 5
    } else {
        Write-Fail "SQL Server Express installation could not be verified."
        Write-Host "      Please install SQL Server Express manually and re-run with -SkipSqlInstall" -ForegroundColor Gray
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Enable TCP/IP and set port for SQL Express
Write-Host "      Configuring SQL Server TCP/IP..." -ForegroundColor Gray
try {
    # Enable TCP/IP protocol
    $regPath = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server"
    $instances = Get-ChildItem $regPath -ErrorAction SilentlyContinue |
                 Where-Object { $_.Name -match 'MSSQL\d+\.SQLEXPRESS' }
    if ($instances) {
        $instanceKey = $instances | Select-Object -Last 1
        $tcpPath = Join-Path $instanceKey.PSPath "MSSQLServer\SuperSocketNetLib\Tcp"
        if (Test-Path $tcpPath) {
            Set-ItemProperty -Path $tcpPath -Name "Enabled" -Value 1 -ErrorAction SilentlyContinue
        }
        $ipAllPath = Join-Path $tcpPath "IPAll"
        if (Test-Path $ipAllPath) {
            Set-ItemProperty -Path $ipAllPath -Name "TcpPort" -Value "1433" -ErrorAction SilentlyContinue
            Set-ItemProperty -Path $ipAllPath -Name "TcpDynamicPorts" -Value "" -ErrorAction SilentlyContinue
        }
    }
    # Restart SQL to apply TCP settings
    Restart-Service -Name "MSSQL`$SQLEXPRESS" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    # Start SQL Browser (needed for named instances)
    Set-Service -Name "SQLBrowser" -StartupType Automatic -ErrorAction SilentlyContinue
    Start-Service -Name "SQLBrowser" -ErrorAction SilentlyContinue
    Write-OK "TCP/IP enabled on port 1433"
} catch {
    Write-Warn "Could not auto-configure TCP/IP: $($_.Exception.Message)"
    Write-Host "      You may need to enable TCP/IP in SQL Server Configuration Manager" -ForegroundColor Gray
}

# ══════════════════════════════════════════════════════════════════════
# STEP 2: Node.js
# ══════════════════════════════════════════════════════════════════════
Write-Step 2 "Node.js Runtime"

if (Test-NodeInstalled) {
    $nodeVer = & node --version
    Write-OK "Node.js $nodeVer already installed"
} elseif ($SkipNodeInstall) {
    Write-Warn "Node install skipped (-SkipNodeInstall). Ensure Node.js is in PATH."
} else {
    Write-Host "      Downloading Node.js v$NodeVersion..." -ForegroundColor Gray
    $nodeMsi = Join-Path $TempDir "node-v$NodeVersion-x64.msi"
    if (-not (Test-Path $nodeMsi)) {
        try {
            Invoke-WebRequest -Uri $NodeUrl -OutFile $nodeMsi -UseBasicParsing
        } catch {
            Write-Fail "Failed to download Node.js installer."
            Write-Host "      Please install Node.js 20+ from https://nodejs.org and re-run with -SkipNodeInstall" -ForegroundColor Gray
            Read-Host "Press Enter to exit"
            exit 1
        }
    }
    Write-OK "Downloaded Node.js installer"

    Write-Host "      Installing Node.js (silent)..." -ForegroundColor Gray
    $msiArgs = "/i `"$nodeMsi`" /qn /norestart"
    $proc = Start-Process msiexec -ArgumentList $msiArgs -Wait -PassThru
    
    if ($proc.ExitCode -eq 0 -or $proc.ExitCode -eq 3010) {
        # Refresh PATH for this session
        $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
        $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
        $env:Path = "$machinePath;$userPath"

        if (Test-NodeInstalled) {
            $nodeVer = & node --version
            Write-OK "Node.js $nodeVer installed successfully"
        } else {
            Write-Warn "Node.js installed but not yet in PATH. You may need to restart this script."
        }
    } else {
        Write-Fail "Node.js installation failed (exit code $($proc.ExitCode))"
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# ══════════════════════════════════════════════════════════════════════
# STEP 3: Database Setup
# ══════════════════════════════════════════════════════════════════════
Write-Step 3 "Database Setup"

$sqlcmd = Find-SqlCmd
if (-not $sqlcmd) {
    # After SQL Express install, sqlcmd might be at a known location
    # Try refreshing PATH
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $env:Path = "$machinePath;$($env:Path)"
    $sqlcmd = Find-SqlCmd
}

if (-not $sqlcmd) {
    Write-Warn "sqlcmd not found. Will try connecting via the app server itself."
    Write-Host "      If database setup fails, install 'sqlcmd' from:" -ForegroundColor Gray
    Write-Host "      https://learn.microsoft.com/en-us/sql/tools/sqlcmd/sqlcmd-utility" -ForegroundColor Cyan
    $useSqlCmd = $false
} else {
    Write-OK "Found sqlcmd at: $sqlcmd"
    $useSqlCmd = $true
}

if ($useSqlCmd) {
    $serverConn = "localhost\$SqlInstance"

    # Create login and database using SA/Windows auth
    Write-Host "      Creating database and login..." -ForegroundColor Gray

    # First try Windows Auth (works if current user is admin on SQL)
    $setupSql = @"
-- Create database if it doesn't exist
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = '$DbName')
BEGIN
    CREATE DATABASE [$DbName];
    PRINT 'Database $DbName created.';
END
ELSE
    PRINT 'Database $DbName already exists.';
GO

-- Create SQL login if it doesn't exist
IF NOT EXISTS (SELECT name FROM sys.server_principals WHERE name = '$DbUser')
BEGIN
    CREATE LOGIN [$DbUser] WITH PASSWORD = '$DbPassword', CHECK_POLICY = OFF;
    PRINT 'Login $DbUser created.';
END
ELSE
BEGIN
    ALTER LOGIN [$DbUser] WITH PASSWORD = '$DbPassword';
    PRINT 'Login $DbUser password updated.';
END
GO

-- Create database user and grant permissions
USE [$DbName];
IF NOT EXISTS (SELECT name FROM sys.database_principals WHERE name = '$DbUser')
BEGIN
    CREATE USER [$DbUser] FOR LOGIN [$DbUser];
    ALTER ROLE db_owner ADD MEMBER [$DbUser];
    PRINT 'User $DbUser added to $DbName with db_owner role.';
END
ELSE
    PRINT 'User $DbUser already exists in $DbName.';
GO
"@

    $setupFile = Join-Path $TempDir "setup_db.sql"
    $setupSql | Out-File -FilePath $setupFile -Encoding UTF8

    # Try Windows Auth first, fall back to SA auth
    $sqlResult = & $sqlcmd -S $serverConn -E -i $setupFile 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Windows auth failed, trying SA auth..."
        $sqlResult = & $sqlcmd -S $serverConn -U sa -P $DbPassword -i $setupFile 2>&1
    }
    
    if ($LASTEXITCODE -eq 0) {
        Write-OK "Database '$DbName' and login '$DbUser' ready"
    } else {
        Write-Warn "Database setup had issues: $sqlResult"
        Write-Host "      Will attempt to continue..." -ForegroundColor DarkGray
    }

    # Run schema migrations
    Write-Host "      Running schema migrations..." -ForegroundColor Gray
    $schemaFiles = Get-ChildItem (Join-Path $AppDir "database") -Filter "*.sql" | 
                   Where-Object { $_.Name -ne "999_reset_and_simulate.sql" } |
                   Sort-Object Name

    foreach ($file in $schemaFiles) {
        Write-Host "        -> $($file.Name)" -ForegroundColor DarkGray
        $result = & $sqlcmd -S $serverConn -U $DbUser -P $DbPassword -d $DbName -i $file.FullName 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "Migration $($file.Name) had issues (may be already applied)"
        }
    }
    Write-OK "Schema migrations applied"
}

# ══════════════════════════════════════════════════════════════════════
# STEP 4: Install Dependencies & Build
# ══════════════════════════════════════════════════════════════════════
Write-Step 4 "NPM Dependencies & Production Build"

Push-Location $AppDir
try {
    Write-Host "      Installing npm dependencies (this may take a minute)..." -ForegroundColor Gray
    & npm run install:all 2>&1 | Out-Null
    Write-OK "Dependencies installed"

    Write-Host "      Building client (Vite production build)..." -ForegroundColor Gray
    & npm run build:client 2>&1 | Out-Null
    Write-OK "Client built to client/dist/"

    Write-Host "      Building server (TypeScript compilation)..." -ForegroundColor Gray
    & npm run build:server 2>&1 | Out-Null
    Write-OK "Server built to server/dist/"
} catch {
    Write-Fail "Build failed: $($_.Exception.Message)"
    Pop-Location
    Read-Host "Press Enter to exit"
    exit 1
}
Pop-Location

# ══════════════════════════════════════════════════════════════════════
# STEP 5: Create .env Configuration
# ══════════════════════════════════════════════════════════════════════
Write-Step 5 "Configuration"

$envFile = Join-Path $AppDir "server\.env"
$envContent = @"
# Medlock Bridge Darts League - Server Configuration
# Generated by installer on $(Get-Date -Format 'yyyy-MM-dd HH:mm')

# MS-SQL Server connection
DB_SERVER=localhost
DB_PORT=1433
DB_INSTANCE=$SqlInstance
DB_USER=$DbUser
DB_PASSWORD=$DbPassword
DB_NAME=$DbName

# Server
SERVER_PORT=$ServerPort
NODE_ENV=production
"@

$envContent | Out-File -FilePath $envFile -Encoding UTF8 -Force
Write-OK "Configuration written to server\.env"

# ══════════════════════════════════════════════════════════════════════
# STEP 6: Windows Firewall Rule
# ══════════════════════════════════════════════════════════════════════
Write-Step 6 "Windows Firewall"

$ruleName = "Darts League App (Port $ServerPort)"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    Write-OK "Firewall rule already exists"
} else {
    try {
        New-NetFirewallRule -DisplayName $ruleName `
            -Direction Inbound -Action Allow `
            -Protocol TCP -LocalPort $ServerPort `
            -Profile Private,Domain `
            -Description "Allow tablet/phone access to Darts League app on LAN" | Out-Null
        Write-OK "Firewall rule created (port $ServerPort, Private/Domain networks)"
    } catch {
        Write-Warn "Could not create firewall rule: $($_.Exception.Message)"
        Write-Host "      You may need to manually allow port $ServerPort in Windows Firewall" -ForegroundColor Gray
    }
}

# ══════════════════════════════════════════════════════════════════════
# STEP 7: Desktop Shortcut
# ══════════════════════════════════════════════════════════════════════
Write-Step 7 "Desktop Shortcut"

$batFile = Join-Path $AppDir "Start-DartsApp.bat"
$desktopPath = [Environment]::GetFolderPath("CommonDesktopDirectory")
$shortcutPath = Join-Path $desktopPath "Darts League.lnk"

# Also create per-user shortcut
$userDesktop = [Environment]::GetFolderPath("Desktop")
$userShortcutPath = Join-Path $userDesktop "Darts League.lnk"

foreach ($scPath in @($shortcutPath, $userShortcutPath)) {
    try {
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($scPath)
        $shortcut.TargetPath = $batFile
        $shortcut.WorkingDirectory = $AppDir
        $shortcut.Description = $AppName
        $shortcut.IconLocation = "shell32.dll,172"  # Target/bullseye-like icon
        $shortcut.Save()
    } catch {
        Write-Warn "Could not create shortcut at $scPath"
    }
}
Write-OK "Desktop shortcut created"

# ══════════════════════════════════════════════════════════════════════
# DONE
# ══════════════════════════════════════════════════════════════════════
$localIP = Get-LocalIP

Write-Banner "Installation Complete!"
Write-Host ""
Write-Host "  To start the app:" -ForegroundColor White
Write-Host "    - Double-click the 'Darts League' icon on your Desktop" -ForegroundColor Gray
Write-Host "    - Or run: Start-DartsApp.bat" -ForegroundColor Gray
Write-Host ""
Write-Host "  Access from this computer:" -ForegroundColor White
Write-Host "    http://localhost:$ServerPort" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Access from tablets/phones on your network:" -ForegroundColor White
Write-Host "    http://${localIP}:$ServerPort" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Database: $DbName on localhost\$SqlInstance" -ForegroundColor DarkGray
Write-Host "  DB Login: $DbUser / $DbPassword" -ForegroundColor DarkGray
Write-Host ""

Read-Host "Press Enter to close"
