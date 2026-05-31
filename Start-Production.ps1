# Start-Production.ps1
# Builds and starts the Darts App in production with HTTPS via Caddy
# Access at: https://darts.dickersons.org:5175/

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $rootDir

# Refresh PATH so caddy is found even in a fresh shell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path","User")

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Medlock Bridge Darts - Production Start" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Stop any previous instances
Write-Host "`n[0/3] Stopping any previous Caddy/Node instances..." -ForegroundColor Gray
Stop-Process -Name caddy -Force -ErrorAction SilentlyContinue
# Kill node only if it's holding port 3001
$portPid = (Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue).OwningProcess |
           Select-Object -First 1
if ($portPid) { Stop-Process -Id $portPid -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

# Step 1: Build
Write-Host "`n[1/3] Building app..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; exit 1 }

# Step 2: Start Express server in background (production mode)
Write-Host "`n[2/3] Starting Express server on port 3001..." -ForegroundColor Yellow
$env:NODE_ENV = "production"
$serverJob = Start-Process -FilePath "node" -ArgumentList "server/dist/index.js" `
    -WorkingDirectory $rootDir -PassThru -WindowStyle Minimized
Write-Host "  Express PID: $($serverJob.Id)"
Start-Sleep -Seconds 2

# Verify Express started
$health = Invoke-WebRequest "http://localhost:3001/api/health" -UseBasicParsing -ErrorAction SilentlyContinue
if ($health.StatusCode -ne 200) {
    Write-Host "  ERROR: Express did not start. Check server logs." -ForegroundColor Red
    Stop-Process -Id $serverJob.Id -ErrorAction SilentlyContinue
    exit 1
}
Write-Host "  Express healthy." -ForegroundColor Green

# Step 3: Start Caddy (foreground — Ctrl+C stops everything)
Write-Host "`n[3/3] Starting Caddy HTTPS proxy..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  App available at: https://darts.dickersons.org:5175/" -ForegroundColor Green
Write-Host "  Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

try {
    caddy run --config "$rootDir\Caddyfile"
} finally {
    Write-Host "`nStopping Express server (PID $($serverJob.Id))..." -ForegroundColor Yellow
    Stop-Process -Id $serverJob.Id -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped." -ForegroundColor Green
}
