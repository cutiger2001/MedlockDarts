<#
.SYNOPSIS
    Sets up the DartsLeague database from scratch and optionally loads historical data.

.DESCRIPTION
    This script:
    1. Creates the DartsLeague database (if it doesn't exist)
    2. Creates the DartsAdmin login/user (if it doesn't exist)
    3. Runs all schema migration scripts in order
    4. Optionally imports historical data from the Excel file

.PARAMETER Server
    SQL Server instance name (default: localhost)

.PARAMETER SAPassword
    SA password for SQL Server authentication

.PARAMETER SkipHistory
    Skip the historical data import step

.EXAMPLE
    .\scripts\setup-database.ps1 -SAPassword "YourSAPassword"
    .\scripts\setup-database.ps1 -Server "localhost\SQLEXPRESS" -SAPassword "YourSAPassword"
    .\scripts\setup-database.ps1 -SAPassword "YourSAPassword" -SkipHistory
#>

param(
    [string]$Server = "localhost",
    [Parameter(Mandatory=$true)]
    [string]$SAPassword,
    [switch]$SkipHistory
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   Darts League - Database Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# --- Step 1: Create database and login ---
Write-Host "[1/4] Creating database and login..." -ForegroundColor Yellow

$setupSql = @"
-- Create database if not exists
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'DartsLeague')
BEGIN
    CREATE DATABASE DartsLeague;
    PRINT 'Database DartsLeague created.';
END
ELSE
    PRINT 'Database DartsLeague already exists.';

-- Create login if not exists
IF NOT EXISTS (SELECT name FROM sys.server_principals WHERE name = 'DartsAdmin')
BEGIN
    CREATE LOGIN DartsAdmin WITH PASSWORD = '180Allday!', DEFAULT_DATABASE = DartsLeague;
    PRINT 'Login DartsAdmin created.';
END
ELSE
    PRINT 'Login DartsAdmin already exists.';
GO

USE DartsLeague;
GO

-- Create user if not exists
IF NOT EXISTS (SELECT name FROM sys.database_principals WHERE name = 'DartsAdmin')
BEGIN
    CREATE USER DartsAdmin FOR LOGIN DartsAdmin;
    PRINT 'User DartsAdmin created.';
END
ELSE
    PRINT 'User DartsAdmin already exists.';

-- Grant permissions
ALTER ROLE db_owner ADD MEMBER DartsAdmin;
PRINT 'DartsAdmin granted db_owner role.';
"@

$setupSql | sqlcmd -S $Server -U sa -P $SAPassword -b
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED: Could not create database/login. Check SA password and that SQL Server is running." -ForegroundColor Red
    exit 1
}
Write-Host "  Database and login ready." -ForegroundColor Green

# --- Step 2: Run schema migrations ---
Write-Host "[2/4] Running schema migrations..." -ForegroundColor Yellow

$migrations = @(
    "001_create_schema.sql",
    "002_adhoc_play.sql",
    "002_game_wins_model.sql",
    "002_team_setup_columns.sql",
    "003_cricket_turns.sql",
    "003_player_theme_color.sql",
    "003_season_game_formats.sql",
    "004_nullable_player2.sql",
    "005_season_champion.sql"
)

foreach ($script in $migrations) {
    $path = Join-Path $ProjectRoot "database\$script"
    if (Test-Path $path) {
        Write-Host "  Running $script..." -NoNewline
        sqlcmd -S $Server -U DartsAdmin -P "180Allday!" -d DartsLeague -i $path -b 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host " WARNING (may already be applied)" -ForegroundColor DarkYellow
        } else {
            Write-Host " OK" -ForegroundColor Green
        }
    } else {
        Write-Host "  Skipping $script (not found)" -ForegroundColor DarkYellow
    }
}

# --- Step 3: Create server .env ---
Write-Host "[3/4] Setting up server .env..." -ForegroundColor Yellow

$envPath = Join-Path $ProjectRoot "server\.env"
if (-not (Test-Path $envPath)) {
    $envContent = @"
DB_SERVER=$Server
DB_PORT=1433
DB_INSTANCE=
DB_USER=DartsAdmin
DB_PASSWORD=180Allday!
DB_NAME=DartsLeague
SERVER_PORT=3001
NODE_ENV=production
"@
    Set-Content -Path $envPath -Value $envContent
    Write-Host "  Created server\.env" -ForegroundColor Green
} else {
    Write-Host "  server\.env already exists, skipping." -ForegroundColor DarkYellow
}

# --- Step 4: Import historical data ---
if ($SkipHistory) {
    Write-Host "[4/4] Skipping historical data import (-SkipHistory)." -ForegroundColor DarkYellow
} else {
    Write-Host "[4/4] Importing historical data..." -ForegroundColor Yellow

    $excelPath = Join-Path $ProjectRoot "History\Darts Rankings 2024 (1).xlsx"
    if (Test-Path $excelPath) {
        Push-Location $ProjectRoot
        try {
            node scripts/import-history.js
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  Historical data imported successfully." -ForegroundColor Green
            } else {
                Write-Host "  WARNING: Import script exited with errors." -ForegroundColor Red
            }
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "  Excel file not found at: $excelPath" -ForegroundColor Red
        Write-Host "  Place 'Darts Rankings 2024 (1).xlsx' in the History/ folder and re-run." -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   Setup Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start the app:" -ForegroundColor White
Write-Host "  npm run install:all" -ForegroundColor White
Write-Host "  npm run dev" -ForegroundColor White
Write-Host ""
