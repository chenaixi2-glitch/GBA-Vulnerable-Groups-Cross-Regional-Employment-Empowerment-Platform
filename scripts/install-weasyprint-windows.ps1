# Install WeasyPrint for local Windows testing.
# Run in PowerShell: .\scripts\install-weasyprint-windows.ps1

$ErrorActionPreference = "Stop"
$MsysRoot = "C:\msys64"
$MingwBin = "$MsysRoot\mingw64\bin"

Write-Host "[weasyprint] Installing Python package..."
python -m pip install --upgrade "weasyprint==63.1"

$bash = Join-Path $MsysRoot "usr\bin\bash.exe"

if (-not (Test-Path $bash)) {
    Write-Host "[weasyprint] MSYS2 not found or incomplete. Installing via winget..."
    if ((Test-Path $MsysRoot) -and -not (Test-Path $bash)) {
        Write-Host "[weasyprint] Removing incomplete MSYS2 folder at $MsysRoot ..."
        Remove-Item -LiteralPath $MsysRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    winget install MSYS2.MSYS2 --accept-package-agreements --accept-source-agreements
    if (-not (Test-Path $bash)) {
        throw "MSYS2 installation failed. Install manually from https://www.msys2.org/ and re-run this script."
    }
}

$PangoDll = Join-Path $MingwBin "libpango-1.0-0.dll"
if (-not (Test-Path $PangoDll)) {
    Write-Host "[weasyprint] Installing Pango via MSYS2 pacman (may take a few minutes)..."
    & $bash -lc "pacman -Sy --noconfirm mingw-w64-x86_64-pango"
}

if (-not (Test-Path $PangoDll)) {
    throw "Pango DLL not found at $PangoDll. Open MSYS2 UCRT64 and run: pacman -S mingw-w64-x86_64-pango"
}

Write-Host "[weasyprint] Setting WEASYPRINT_DLL_DIRECTORIES for current session..."
$env:WEASYPRINT_DLL_DIRECTORIES = $MingwBin

Write-Host "[weasyprint] Verifying PDF export..."
$verify = @"
import os
os.environ['WEASYPRINT_DLL_DIRECTORIES'] = r'$MingwBin'
from weasyprint import HTML
pdf = HTML(string='<html><body><p>WeasyPrint OK</p></body></html>').write_pdf()
assert pdf[:4] == b'%PDF'
print('WeasyPrint PDF export OK, bytes:', len(pdf))
"@
python -c $verify

Write-Host ""
Write-Host "Success. Add this to your user environment (System Properties -> Environment Variables):"
Write-Host "  WEASYPRINT_DLL_DIRECTORIES = $MingwBin"
Write-Host ""
Write-Host "Or run before starting backend:"
Write-Host "  `$env:WEASYPRINT_DLL_DIRECTORIES = '$MingwBin'"
