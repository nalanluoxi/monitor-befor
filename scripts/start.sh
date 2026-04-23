#!/usr/bin/env bash
# ============================================================
#  Traffic Monitor UI 启动脚本
#  通过 Nginx 反向代理统一对外提供服务
#  前端页面 + 后端 API 代理  →  http://localhost:9000
#  后端 Spring Boot           →  http://localhost:8080（需手动启动）
#  Nginx 默认 server          →  http://localhost:8081（占位，无实际用途）
# ============================================================

NGINX="/opt/homebrew/opt/nginx/bin/nginx"
NGINX_CONF="/opt/homebrew/etc/nginx/nginx.conf"
UI_PORT=9000
HELPER_PORT=19001
HELPER_PID="$(dirname "$0")/helper.pid"
HELPER_LOG="$(dirname "$0")/ui.log"

# ── 颜色输出 ────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ── 检查 Nginx 是否已安装 ────────────────────────────────────
if [ ! -f "$NGINX" ]; then
    error "未找到 Nginx: $NGINX"
    error "请先执行: brew install nginx"
    exit 1
fi

# ── 检查端口是否已占用 ──────────────────────────────────────
if lsof -ti tcp:$UI_PORT > /dev/null 2>&1; then
    warn "端口 $UI_PORT 已被占用，Nginx 可能已在运行"
    warn "如需重启请先执行 stop.sh"
    exit 1
fi

# ── 启动 nginx-helper（自动管理 upstream）────────────────────
if lsof -ti tcp:$HELPER_PORT > /dev/null 2>&1; then
    warn "nginx-helper 已在运行（端口 $HELPER_PORT）"
else
    info "正在启动 nginx-helper..."
    python3 "$(dirname "$0")/nginx-helper.py" >> "$HELPER_LOG" 2>&1 &
    sleep 0.5
    if lsof -ti tcp:$HELPER_PORT > /dev/null 2>&1; then
        info "✓ nginx-helper 启动成功（端口 $HELPER_PORT）"
    else
        warn "nginx-helper 启动失败，线上 IP 切换功能不可用"
    fi
fi

# ── 检查配置语法 ─────────────────────────────────────────────
info "检查 Nginx 配置语法..."
if ! $NGINX -t 2>&1; then
    error "Nginx 配置语法错误，请检查配置文件"
    exit 1
fi
# ── 启动 Nginx ───────────────────────────────────────────────
info "正在启动 Nginx..."
$NGINX
sleep 1
# ── 验证启动 ────────────────────────────────────────────────
if lsof -ti tcp:$UI_PORT > /dev/null 2>&1; then
    info "✓ Nginx 启动成功"
    echo ""
    info "================================================"
    info "  前端访问地址 : http://localhost:$UI_PORT"
    info "  API 代理     : http://localhost:$UI_PORT/sitemap/* → http://localhost:8080/sitemap/*"
    info "  访问日志     : /opt/homebrew/var/log/nginx/traffic-monitor.access.log"
    info "  错误日志     : /opt/homebrew/var/log/nginx/traffic-monitor.error.log"
    info "  nginx-helper : http://localhost:$HELPER_PORT/api/status"
    echo ""
    warn "  后端 Spring Boot（端口 8080）需单独启动"
    info "================================================"
else
    error "Nginx 启动失败，查看错误日志:"
    tail -20 /opt/homebrew/var/log/nginx/error.log 2>/dev/null
    exit 1
fi
