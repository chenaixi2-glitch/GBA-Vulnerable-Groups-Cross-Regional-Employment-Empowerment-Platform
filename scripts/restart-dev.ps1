# GBA local dev restart (static :8080, Node :3000, Python :8000)
# Usage: .\scripts\restart-dev.ps1

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$StaticPort = 8080
$NodePort = 3000
$PythonPort = 8000

function Stop-ListenerOnPort {
    param([int]$Port)

    $pattern = ":$Port\s"
    $connections = netstat -ano | Select-String "LISTENING" | Select-String $pattern
    $pids = @()

    foreach ($line in $connections) {
        $parts = ($line -replace '\s+', ' ').Trim().Split(' ')
        $procId = [int]$parts[-1]
        if ($procId -gt 0) {
            $pids += $procId
        }
    }

    foreach ($procId in ($pids | Select-Object -Unique)) {
        try {
            $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "[stop] port $Port -> PID $procId ($($proc.ProcessName))"
                Stop-Process -Id $procId -Force -ErrorAction Stop
            }
        } catch {
            Write-Host "[stop] port $Port -> PID $procId (already stopped)"
        }
    }
}

function Wait-HttpOk {
    param(
        [string]$Url,
        [int]$TimeoutSec = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
            if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400) {
                return $true
            }
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    return $false
}

function Start-DevWindow {
    param(
        [string]$Title,
        [string]$WorkDir,
        [string]$Command
    )

    $launch = @"
Set-Location -LiteralPath '$WorkDir'
`$Host.UI.RawUI.WindowTitle = '$Title'
Write-Host '>>> $Title'
Write-Host '>>> $Command'
Write-Host ''
$Command
"@

    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command", $launch
    ) | Out-Null
}

Write-Host ""
Write-Host "========================================"
Write-Host " GBA dev restart"
Write-Host " Root: $Root"
Write-Host "========================================"
Write-Host ""

Write-Host "[1/4] Stop old processes..."
Stop-ListenerOnPort -Port $StaticPort
Stop-ListenerOnPort -Port $NodePort
Stop-ListenerOnPort -Port $PythonPort
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "[2/4] Start services (new PowerShell windows)..."
Start-DevWindow -Title "GBA Static Frontend :$StaticPort" -WorkDir $Root -Command "node static-server.js"
Start-Sleep -Seconds 1
Start-DevWindow -Title "GBA Node API :$NodePort" -WorkDir (Join-Path $Root "server") -Command "npm run dev"
Start-Sleep -Seconds 1
Start-DevWindow -Title "GBA Python AI :$PythonPort" -WorkDir (Join-Path $Root "backend") -Command "python main.py"

Write-Host ""
Write-Host "[3/4] Health checks..."
$checks = @(
    @{ Name = "Static frontend"; Url = "http://127.0.0.1:$StaticPort/" },
    @{ Name = "Node API"; Url = "http://127.0.0.1:$NodePort/health" },
    @{ Name = "Python AI"; Url = "http://127.0.0.1:$PythonPort/health" }
)

$allOk = $true
foreach ($check in $checks) {
    Write-Host "  - $($check.Name): $($check.Url)"
    if (Wait-HttpOk -Url $check.Url -TimeoutSec 90) {
        Write-Host "    OK"
    } else {
        Write-Host "    TIMEOUT (check the service window)"
        $allOk = $false
    }
}

Write-Host ""
Write-Host "[4/4] URLs"
Write-Host "  Home:       http://127.0.0.1:$StaticPort/"
Write-Host "  Individual: http://127.0.0.1:$StaticPort/individual/"
Write-Host "  Corporate:  http://127.0.0.1:$StaticPort/corporate/"
Write-Host "  Node API:   http://127.0.0.1:$NodePort/health"
Write-Host "  Python AI:  http://127.0.0.1:$PythonPort/health"
Write-Host ""

if ($allOk) {
    Write-Host "All services are ready."
} else {
    Write-Host "Some services failed health check. See PowerShell windows."
    exit 1
}
