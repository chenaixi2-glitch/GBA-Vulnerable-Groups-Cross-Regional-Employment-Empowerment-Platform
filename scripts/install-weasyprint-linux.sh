#!/usr/bin/env bash
# Install WeasyPrint system dependencies on Debian/Ubuntu (cloud server).
# Usage: sudo bash scripts/install-weasyprint-linux.sh

set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Please run as root: sudo bash scripts/install-weasyprint-linux.sh"
  exit 1
fi

echo "[weasyprint] Installing system libraries..."
apt-get update
apt-get install -y --no-install-recommends \
  libcairo2 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libpangoft2-1.0-0 \
  libharfbuzz-subset0 \
  libgdk-pixbuf-2.0-0 \
  shared-mime-info \
  fonts-liberation \
  fonts-noto-cjk

echo "[weasyprint] Installing Python package (if backend venv active, run pip in venv instead)..."
if command -v python3 >/dev/null 2>&1; then
  python3 -m pip install --upgrade 'weasyprint==63.1' || true
fi

echo "[weasyprint] Verifying import..."
python3 - <<'PY'
from weasyprint import HTML
pdf = HTML(string="<html><body><p>WeasyPrint OK</p></body></html>").write_pdf()
assert pdf[:4] == b"%PDF", pdf[:20]
print("WeasyPrint PDF export OK, bytes:", len(pdf))
PY

echo "[weasyprint] Done."
