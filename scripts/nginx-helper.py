#!/usr/bin/env python3
"""
nginx-helper.py
轻量本地 HTTP 服务（监听 19001），供前端调用来动态修改 Nginx upstream 并 reload。

接口：
  POST /api/set-upstream   body: {"ips": ["10.0.0.1:8080", "10.0.0.2:8080"]}
  POST /api/set-env        body: {"env": "test"}  或  {"env": "prod"}
  GET  /api/status         返回当前 env 和 ips
"""

import json
import os
import re
import signal
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

HELPER_PORT   = 19001
NGINX_BIN     = '/opt/homebrew/opt/nginx/bin/nginx'
NGINX_CONF    = '/opt/homebrew/etc/nginx/servers/traffic-monitor.conf'
PID_FILE      = os.path.join(os.path.dirname(__file__), 'helper.pid')
STATE_FILE    = os.path.join(os.path.dirname(__file__), 'helper-state.json')

# ---------- 状态读写 ----------

def load_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return {'env': 'test', 'ips': []}

def save_state(state):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, ensure_ascii=False, indent=2)

# ---------- Nginx 操作 ----------

def build_upstream_block(ips):
    if ips:
        servers = '\n'.join(f'    server {ip};' for ip in ips)
    else:
        servers = '    server 127.0.0.1:8080;   # 占位'
    return f'upstream prod_backend {{\n{servers}\n}}'

def update_nginx_upstream(ips):
    with open(NGINX_CONF, 'r') as f:
        content = f.read()
    new_block = build_upstream_block(ips)
    new_content = re.sub(
        r'upstream\s+prod_backend\s*\{[^}]*\}',
        new_block,
        content,
        flags=re.DOTALL
    )
    with open(NGINX_CONF, 'w') as f:
        f.write(new_content)

def nginx_reload():
    result = subprocess.run([NGINX_BIN, '-s', 'reload'],
                            capture_output=True, text=True)
    return result.returncode == 0, result.stderr.strip()

# ---------- HTTP Handler ----------

class Handler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        pass  # 静默日志

    def _send(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(body))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/status':
            self._send(200, load_state())
        else:
            self._send(404, {'error': 'not found'})

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length) or '{}')

        if self.path == '/api/set-upstream':
            ips = body.get('ips', [])
            state = load_state()
            state['ips'] = ips
            try:
                update_nginx_upstream(ips)
                ok, err = nginx_reload()
                if ok:
                    save_state(state)
                    self._send(200, {'ok': True, 'ips': ips})
                else:
                    self._send(500, {'ok': False, 'error': f'nginx reload 失败: {err}'})
            except Exception as e:
                self._send(500, {'ok': False, 'error': str(e)})

        elif self.path == '/api/set-env':
            env = body.get('env', 'test')
            state = load_state()
            state['env'] = env
            try:
                if env == 'test':
                    # 切换到 test 时，将 upstream 恢复为占位（localhost）
                    update_nginx_upstream([])
                else:
                    # 切换回 prod 时，重新应用已保存的 ips
                    update_nginx_upstream(state.get('ips', []))
                nginx_reload()
            except Exception:
                pass
            save_state(state)
            self._send(200, {'ok': True, 'env': env})

        else:
            self._send(404, {'error': 'not found'})


# ---------- 主入口 ----------

def main():
    # 写 PID
    with open(PID_FILE, 'w') as f:
        f.write(str(os.getpid()))

    def on_exit(sig, frame):
        if os.path.exists(PID_FILE):
            os.remove(PID_FILE)
        sys.exit(0)

    signal.signal(signal.SIGTERM, on_exit)
    signal.signal(signal.SIGINT, on_exit)

    server = HTTPServer(('127.0.0.1', HELPER_PORT), Handler)
    print(f'[helper] 监听 127.0.0.1:{HELPER_PORT}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
