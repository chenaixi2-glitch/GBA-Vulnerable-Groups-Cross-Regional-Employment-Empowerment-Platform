#!/usr/bin/env bash
# ============================================================
# GBA 平台 — 在云 CPU 服务器上安装并配置 Redis
# 适用：阿里云轻量应用服务器 2GB 内存（Ubuntu / Debian）
# 用法：sudo bash scripts/install-redis.sh
# ============================================================
set -euo pipefail

REDIS_CONF="/etc/redis/redis.conf"
REDIS_PORT="${REDIS_PORT:-6379}"
# 2GB 整机：Redis 仅作会话缓存，默认上限 128MB（约占 RAM 6%）
# 同机还运行 Nginx + Node + Python，勿超过 192mb
REDIS_MAXMEMORY="${REDIS_MAXMEMORY:-128mb}"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "请使用 root 运行：sudo bash $0"
  exit 1
fi

echo "==> 安装 Redis..."
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y redis-server
elif command -v yum >/dev/null 2>&1; then
  yum install -y epel-release || true
  yum install -y redis
  REDIS_CONF="/etc/redis.conf"
else
  echo "不支持的系统，请手动安装 redis-server"
  exit 1
fi

if [[ ! -f "$REDIS_CONF" ]]; then
  echo "找不到 Redis 配置文件: $REDIS_CONF"
  exit 1
fi

echo "==> 配置 Redis（仅本机访问，不对外开放 6379）..."

# 备份原配置
cp "$REDIS_CONF" "${REDIS_CONF}.bak.$(date +%Y%m%d%H%M%S)"

set_conf() {
  local key="$1"
  local value="$2"
  if grep -qE "^${key} " "$REDIS_CONF"; then
    sed -i "s|^${key} .*|${key} ${value}|" "$REDIS_CONF"
  elif grep -qE "^# ${key} " "$REDIS_CONF"; then
    sed -i "s|^# ${key} .*|${key} ${value}|" "$REDIS_CONF"
  else
    echo "${key} ${value}" >> "$REDIS_CONF"
  fi
}

set_conf "bind" "127.0.0.1 ::1"
set_conf "port" "$REDIS_PORT"
set_conf "protected-mode" "yes"
set_conf "maxmemory" "$REDIS_MAXMEMORY"
set_conf "maxmemory-policy" "allkeys-lru"
set_conf "supervised" "systemd"
# 2GB 服务器：会话缓存可丢，关闭 RDB/AOF 以降低 fork 与磁盘 I/O 峰值
set_conf "save" "\"\""
set_conf "appendonly" "no"
set_conf "lazyfree-lazy-eviction" "yes"
set_conf "lazyfree-lazy-expire" "yes"
set_conf "lazyfree-lazy-server-del" "yes"

# 可选：设置密码（export REDIS_PASSWORD=xxx 后再运行脚本）
if [[ -n "${REDIS_PASSWORD:-}" ]]; then
  set_conf "requirepass" "$REDIS_PASSWORD"
  echo "已设置 requirepass（请同步写入 backend/.env 的 REDIS_PASSWORD）"
fi

echo "==> 启动 Redis 服务..."
systemctl enable redis-server 2>/dev/null || systemctl enable redis
systemctl restart redis-server 2>/dev/null || systemctl restart redis

echo "==> 验证..."
if redis-cli -p "$REDIS_PORT" ping | grep -q PONG; then
  echo "✓ Redis 运行正常（redis-cli ping -> PONG）"
else
  echo "✗ Redis 验证失败，请检查：systemctl status redis-server"
  exit 1
fi

echo ""
echo "==> 部署完成（2GB 服务器默认 maxmemory=${REDIS_MAXMEMORY}）"
echo "  地址: 127.0.0.1:${REDIS_PORT}"
echo "  配置: ${REDIS_CONF}"
echo ""
echo "内存监控："
echo "  free -h"
echo "  redis-cli info memory | grep used_memory_human"
echo ""
echo "backend/.env 中应包含："
echo "  REDIS_HOST=127.0.0.1"
echo "  REDIS_PORT=${REDIS_PORT}"
echo "  REDIS_DB=0"
if [[ -n "${REDIS_PASSWORD:-}" ]]; then
  echo "  REDIS_PASSWORD=<与 requirepass 一致>"
fi
echo ""
echo "Docker 部署时 .env.docker 使用："
echo "  REDIS_HOST=host.docker.internal"
echo ""
echo "⚠ 2GB 服务器：建议 FASTAPI_WORKERS=1，勿在安全组开放 ${REDIS_PORT} 端口"
