#!/usr/bin/env bash
# ============================================================
#  Traffic Monitor UI 关闭脚本
#  停止 Nginx（仅停止 Traffic Monitor，端口 9000）
# ============================================================

NGINX="/opt/homebrew/opt/nginx/bin/nginx"
UI_PORT=9000

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ── 检查 Nginx 是否在运行 ────────────────────────────────────
if ! lsof -ti tcp:$UI_PORT > /dev/null 2>&1; then
    warn "Nginx 未在运行（端口 $UI_PORT 未监听）"
    exit 0
fi

# ── 停止 Nginx ───────────────────────────────────────────────
info "正在停止 Nginx..."
$NGINX -s stop 2>/dev/null
sleep 1

# ── 验证停止 ────────────────────────────────────────────────
if ! lsof -ti tcp:$UI_PORT > /dev/null 2>&1; then
    info "✓ Nginx 已停止，端口 $UI_PORT 已释放"
else
    warn "Nginx 未能正常停止，尝试强制终止..."
    lsof -ti tcp:$UI_PORT | xargs kill -9 2>/dev/null
    info "✓ 已强制终止"
fi
