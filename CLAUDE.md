# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定性

纯静态 HTML/CSS/JS 流量监控看板，无构建步骤，无框架依赖。通过 Nginx 反向代理统一对外提供服务（前端 + 后端 API 代理），后端为独立 Spring Boot 服务（端口 8080，context `/sitemap`）。

## 启动与停止

```bash
# 启动（Nginx + nginx-helper，对外端口 9000）
bash scripts/start.sh

# 停止
bash scripts/stop.sh

# 直接用 Python 简单预览（无代理，会有跨域问题）
python3 -m http.server 3000
```

**依赖**：Nginx（`brew install nginx`），Python 3（内置）。

后端 Spring Boot（端口 8080）需单独启动，不在本仓库。

## 架构

```
浏览器 → http://localhost:9000
           ├─ /sitemap/*      → Nginx 代理 → localhost:8080 (Spring Boot)
           ├─ /prod-sitemap/* → Nginx 代理 → prod_backend upstream（可动态切换 IP）
           └─ 其他路径         → 静态文件（本目录）
```

**nginx-helper**（`scripts/nginx-helper.py`）：Python HTTP 服务，监听 `:19001`，供前端调用以动态修改 Nginx upstream 并 reload。

- `POST /api/set-upstream` — 更新线上 IP 列表，重写 `traffic-monitor.conf` 中的 `upstream prod_backend`，触发 `nginx -s reload`
- `POST /api/set-env` — 切换 test/prod 环境
- `GET  /api/status` — 返回当前 env 和 ips

状态持久化在 `scripts/helper-state.json`，Nginx 配置路径为 `/opt/homebrew/etc/nginx/servers/traffic-monitor.conf`。

## 文件结构

| 文件 | 说明 |
|------|------|
| `index.html` | 导航首页，各功能卡片入口 |
| `test-traffic.html` | 调用 `GET /sitemap/test/traffic` 写入测试流量 |
| `types.html` | 调用 `GET /sitemap/monitor/types` 列出所有 type |
| `branch-ids.html` | 调用 `GET /sitemap/monitor/branchIds` 列出所有 branchId |
| `query-by-day.html` | 调用 `GET /sitemap/monitor/queryByDay` 按天汇总流量 |
| `query-by-hour.html` | 调用 `GET /sitemap/monitor/queryByHour` 按小时查询明细 |
| `settings.html` | 管理线上 IP 集合，调用 nginx-helper 更新 upstream |
| `common.css` | 全局样式（navbar、card、table、DayPicker/HourPicker、TypeSelect、env-bar） |
| `common.js` | 工具函数 + 三个 UI 组件类（见下节） |

## common.js 关键内容

**环境切换**：`getEnv()`/`setEnv()` 存于 localStorage（key `tm_env`）。`getBase()` 根据当前环境返回 test（`/sitemap`）或 prod（`/prod-sitemap`）前缀。

**三个 UI 组件类**（所有页面复用）：
- `DayPicker` — 日历面板，`getValue()` 返回 `"YYYYMMDD"` 或 `""`
- `HourPicker` — 24小时网格面板，`getValue()` 返回 `"HH"` 或 `""`
- `TypeSelect` — 自动请求 `/monitor/types` 的可搜索下拉，`getValue()` 返回 type 字符串；`reload()` 用于切换环境后刷新

**辅助函数**：`showAlert(id, msg, type)`、`hideAlert(id)`、`setLoading(id, show)`、`apiFetch(url)`、`escHtml(s)`。

**nginx-helper 调用**：`helperSetUpstream(ips)`、`helperSetEnv(env)`、`helperStatus()`。

## 后端接口列表

| 接口 | 说明 |
|------|------|
| `GET /sitemap/test/traffic` | 写入测试流量（参数：monitorType/batchId/count/dispatchTs/type） |
| `GET /sitemap/monitor/types` | 返回所有 monitorType 集合 |
| `GET /sitemap/monitor/branchIds` | 返回所有 branchId 集合 |
| `GET /sitemap/monitor/queryByDay` | 按天+type 查询，返回 `{queryDay, all[], [slot]: [{type,branchId,dispatchTs,count}]}` |
| `GET /sitemap/monitor/queryByHour` | 按天+小时+type 查询，返回 `{all汇总行, items明细}` |