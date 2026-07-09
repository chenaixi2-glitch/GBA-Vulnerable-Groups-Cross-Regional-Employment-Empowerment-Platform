# GBA git commit & push helper
# Usage:
#   .\scripts\git-commit-push.ps1 -Message "feat: add resume checklist"
#   .\scripts\git-commit-push.ps1 -Message "fix profile patch" -Paths backend/,individual/
#   .\scripts\git-commit-push.ps1                    # interactive message prompt
#   .\scripts\git-commit-push.ps1 -NoPush          # commit only
#   .\scripts\git-commit-push.ps1 -DryRun          # preview without changes

param(
    [string]$Message = "",
    [string[]]$Paths = @(),
    [switch]$NoPush,
    [switch]$DryRun,
    [switch]$AddAll
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$SensitivePatterns = @(
    ".env",
    ".env.*",
    "credentials.json",
    "secrets.json",
    "*.pem",
    "*.key",
    "id_rsa"
)

function Write-Step {
    param([string]$Text)
    Write-Host ""
    Write-Host $Text
}

function Invoke-Git {
    param([string[]]$GitArgs)
    $prev = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $output = & git -C $Root @GitArgs 2>&1
    } finally {
        $ErrorActionPreference = $prev
    }
    if ($LASTEXITCODE -ne 0) {
        if ($output) { Write-Host $output }
        throw "git $($GitArgs -join ' ') failed (exit $LASTEXITCODE)"
    }
    return @($output | Where-Object { $_ -is [string] })
}

function Test-SensitivePath {
    param([string]$Path)
    $normalized = $Path -replace '\\', '/'
    foreach ($pattern in $SensitivePatterns) {
        if ($normalized -like $pattern -or $normalized -like "*/$pattern") {
            return $true
        }
    }
    return $false
}

function Get-ChangedFiles {
    $staged = @(Invoke-Git @("diff", "--cached", "--name-only"))
    $unstaged = @(Invoke-Git @("diff", "--name-only"))
    $untracked = @(Invoke-Git @("ls-files", "--others", "--exclude-standard"))
    return @{
        Staged = $staged | Where-Object { $_ }
        Unstaged = $unstaged | Where-Object { $_ }
        Untracked = $untracked | Where-Object { $_ }
    }
}

Set-Location $Root

if (-not (Test-Path (Join-Path $Root ".git"))) {
    throw "Not a git repository: $Root"
}

Write-Host ""
Write-Host "========================================"
Write-Host " GBA git commit & push"
Write-Host " Root: $Root"
Write-Host "========================================"

Write-Step "[1/5] Current status"
Invoke-Git @("status", "--short", "--branch") | ForEach-Object { Write-Host "  $_" }

$changes = Get-ChangedFiles
$hasWork = @(
    $changes.Staged,
    $changes.Unstaged,
    $changes.Untracked
) | ForEach-Object { $_ } | Select-Object -First 1

if (-not $hasWork -and $Paths.Count -eq 0 -and -not $AddAll) {
    Write-Host ""
    Write-Host "Nothing to commit."
    exit 0
}

Write-Step "[2/5] Stage files"
if ($Paths.Count -gt 0) {
    Write-Host "  Mode: explicit paths"
    Write-Host "  Paths: $($Paths -join ', ')"
} elseif ($AddAll) {
    Write-Host "  Mode: add all (git add -A)"
} elseif ($changes.Staged.Count -gt 0 -and $changes.Unstaged.Count -eq 0 -and $changes.Untracked.Count -eq 0) {
    Write-Host "  Mode: use already staged files"
} else {
    Write-Host "  Mode: stage modified + untracked (use -AddAll for everything)"
}

$stagedCandidates = @()
if ($AddAll) {
    $stagedCandidates = @(
        $changes.Staged
        $changes.Unstaged
        $changes.Untracked
    ) | Select-Object -Unique
} elseif ($Paths.Count -gt 0) {
    $stagedCandidates = @($Paths)
} elseif ($changes.Staged.Count -gt 0 -and $changes.Unstaged.Count -eq 0 -and $changes.Untracked.Count -eq 0) {
    $stagedCandidates = @($changes.Staged)
} else {
    $stagedCandidates = @(
        $changes.Staged
        $changes.Unstaged
        $changes.Untracked
    ) | Select-Object -Unique
}

if (-not $DryRun) {
    if ($AddAll) {
        Invoke-Git @("add", "-A") | Out-Null
    } elseif ($Paths.Count -gt 0) {
        Invoke-Git @("add", "--") + $Paths | Out-Null
    } elseif ($changes.Staged.Count -eq 0 -or $changes.Unstaged.Count -gt 0 -or $changes.Untracked.Count -gt 0) {
        $toAdd = @($changes.Unstaged + $changes.Untracked) | Select-Object -Unique
        if ($toAdd.Count -gt 0) {
            Invoke-Git @("add", "--") + $toAdd | Out-Null
        }
    }
    $stagedCandidates = @(Invoke-Git @("diff", "--cached", "--name-only"))
}

$sensitive = @($stagedCandidates | Where-Object { Test-SensitivePath $_ })
if ($sensitive.Count -gt 0) {
    Write-Host ""
    Write-Host "  WARNING: sensitive files detected:"
    $sensitive | ForEach-Object { Write-Host "    - $_" }
    if (-not $DryRun) {
        $confirm = Read-Host "  Continue staging these files? [y/N]"
        if ($confirm -notmatch '^[yY]') {
            throw "Aborted: sensitive files not confirmed."
        }
    }
}

$stagedNow = @($stagedCandidates | Where-Object { $_ })
if ($stagedNow.Count -eq 0) {
    Write-Host ""
    Write-Host "No staged changes after add."
    exit 0
}

Write-Host "  Staged ($($stagedNow.Count)):"
$stagedNow | ForEach-Object { Write-Host "    + $_" }

Write-Step "[3/5] Commit message"
if (-not $Message) {
    $Message = Read-Host "  Enter commit message"
}
$Message = $Message.Trim()
if (-not $Message) {
    throw "Commit message is required."
}

Write-Host "  Message: $Message"

Write-Step "[4/5] Commit"
if ($DryRun) {
    Write-Host "  [dry-run] git commit -m ""$Message"""
} else {
    Invoke-Git @("commit", "-m", $Message) | ForEach-Object { Write-Host "  $_" }
}

if ($NoPush -or $DryRun) {
    Write-Step "[5/5] Push skipped"
    if ($DryRun) {
        Write-Host "  [dry-run] would push current branch"
    } else {
        Write-Host "  (-NoPush)"
    }
    exit 0
}

Write-Step "[5/5] Push"
$branch = (Invoke-Git @("branch", "--show-current")).Trim()
& git -C $Root rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>$null | Out-Null
$hasUpstream = $LASTEXITCODE -eq 0

if (-not $hasUpstream) {
    Write-Host "  No upstream; setting origin/$branch"
    Invoke-Git @("push", "-u", "origin", $branch) | ForEach-Object { Write-Host "  $_" }
} else {
    if ($branch -match '^(main|master)$') {
        Write-Host "  Branch: $branch (no force push)"
    }
    Invoke-Git @("push") | ForEach-Object { Write-Host "  $_" }
}

Write-Host ""
Write-Host "Done."
Invoke-Git @("status", "--short", "--branch") | ForEach-Object { Write-Host "  $_" }
Write-Host ""
