FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/backend

COPY backend/requirements.txt /tmp/requirements.raw.txt
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libpangoft2-1.0-0 \
    libharfbuzz-subset0 \
    libgdk-pixbuf-2.0-0 \
    shared-mime-info \
    fonts-liberation \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*
RUN python - <<'PY'
from pathlib import Path

raw_path = Path('/tmp/requirements.raw.txt')
data = raw_path.read_bytes()
for encoding in ('utf-8-sig', 'utf-16', 'utf-16-le', 'utf-16-be'):
    try:
        text = data.decode(encoding)
        break
    except UnicodeDecodeError:
        continue
else:
    text = data.decode('utf-8', errors='ignore')

Path('/tmp/requirements.txt').write_text(text, encoding='utf-8')
PY
RUN pip install --upgrade pip -i https://mirrors.aliyun.com/pypi/simple/ && \
    pip install -r /tmp/requirements.txt -i https://mirrors.aliyun.com/pypi/simple/ --timeout 180

COPY backend /app/backend
COPY docker/backend/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
