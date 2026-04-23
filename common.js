const BASE_LOCAL  = 'http://localhost:9000/sitemap';
const HELPER_BASE = 'http://localhost:19001';
const PROD_IPS_KEY = 'tm_prod_ips';
const ENV_KEY      = 'tm_env'; // 'test' | 'prod'

// 存取线上 IP 集合（localStorage）
function loadProdIps() {
  try { return JSON.parse(localStorage.getItem(PROD_IPS_KEY) || '[]'); } catch { return []; }
}
function saveProdIps(ips) {
  localStorage.setItem(PROD_IPS_KEY, JSON.stringify(ips));
}

// 当前环境
function getEnv() { return localStorage.getItem(ENV_KEY) || 'test'; }
function setEnv(v) { localStorage.setItem(ENV_KEY, v); }

function getBase() {
  if (getEnv() === 'prod') return 'http://localhost:9000/prod-sitemap';
  return BASE_LOCAL;
}

// 调用 nginx-helper 接口
async function helperSetUpstream(ips) {
  const res = await fetch(`${HELPER_BASE}/api/set-upstream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ips })
  });
  return res.json();
}
async function helperSetEnv(env) {
  const res = await fetch(`${HELPER_BASE}/api/set-env`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ env })
  });
  return res.json();
}
async function helperStatus() {
  const res = await fetch(`${HELPER_BASE}/api/status`);
  return res.json();
}

// 保持旧引用兼容（test-traffic 不需要切换，直接用 localhost）
const BASE = BASE_LOCAL;

function showAlert(id, msg, type='error') {
  const el = document.getElementById(id);
  el.className = `alert alert-${type} show`;
  el.textContent = msg;
}
function hideAlert(id) { document.getElementById(id).className = 'alert'; }
function setLoading(id, show) {
  document.getElementById(id).className = `loading${show ? ' show' : ''}`;
}
async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─────────────────────────────────────────────────────────────────────────────
   DayPicker  —  点击按钮弹出日历面板
   用法: const p = new DayPicker('container-id');  p.getValue() → "20260422"|""
─────────────────────────────────────────────────────────────────────────────*/
class DayPicker {
  constructor(container) {
    this._el   = typeof container === 'string' ? document.getElementById(container) : container;
    this._val  = '';
    this._cur  = (() => { const d = new Date(); d.setDate(1); return d; })();
    this._open = false;
    this._build();
    this._bind();
  }

  getValue() { return this._val; }

  _build() {
    this._el.innerHTML = '';
    this._el.style.cssText = 'position:relative;display:inline-block;';

    this._btn = document.createElement('button');
    this._btn.type = 'button';
    this._btn.className = 'dtp-trigger';
    this._refreshLabel();
    this._el.appendChild(this._btn);

    this._panel = document.createElement('div');
    this._panel.className = 'dtp-panel';
    this._panel.innerHTML = `
      <div class="dtp-nav">
        <button type="button" class="dtp-arrow" data-dir="-1">&#8249;</button>
        <span class="dtp-title"></span>
        <button type="button" class="dtp-arrow" data-dir="1">&#8250;</button>
      </div>
      <div class="dtp-week">
        <span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span>
      </div>
      <div class="dtp-days"></div>
      <div class="dtp-footer">
        <button type="button" class="dtp-clear">清空</button>
        <button type="button" class="dtp-confirm">确认</button>
      </div>`;
    this._el.appendChild(this._panel);
    this._renderCal();
  }

  _bind() {
    this._btn.addEventListener('click', e => { e.stopPropagation(); this._open ? this._close() : this._show(); });
    this._panel.addEventListener('click', e => e.stopPropagation());

    this._panel.querySelector('.dtp-nav').addEventListener('click', e => {
      const b = e.target.closest('[data-dir]');
      if (!b) return;
      this._cur.setMonth(this._cur.getMonth() + Number(b.dataset.dir));
      this._renderCal();
    });
    this._panel.querySelector('.dtp-days').addEventListener('click', e => {
      const d = e.target.closest('[data-date]');
      if (!d) return;
      this._val = d.dataset.date;
      this._renderCal();
      this._refreshLabel();
    });
    this._panel.querySelector('.dtp-clear').addEventListener('click', () => {
      this._val = ''; this._renderCal(); this._refreshLabel(); this._close();
    });
    this._panel.querySelector('.dtp-confirm').addEventListener('click', () => this._close());
    document.addEventListener('click', () => this._close());
  }

  _show() {
    if (this._val && /^\d{8}$/.test(this._val))
      this._cur = new Date(+this._val.slice(0,4), +this._val.slice(4,6)-1, 1);
    else { this._cur = new Date(); this._cur.setDate(1); }
    this._renderCal();
    this._panel.style.display = 'block';
    this._open = true;
  }
  _close() { this._panel.style.display = 'none'; this._open = false; }

  _renderCal() {
    const y = this._cur.getFullYear(), m = this._cur.getMonth();
    this._panel.querySelector('.dtp-title').textContent = `${y}年 ${m+1}月`;
    const today = new Date();
    const todayStr = today.getFullYear() + String(today.getMonth()+1).padStart(2,'0') + String(today.getDate()).padStart(2,'0');
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m+1, 0).getDate();
    let html = '';
    for (let i = 0; i < firstDay; i++) html += '<span class="dtp-day dtp-empty"></span>';
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = y + String(m+1).padStart(2,'0') + String(d).padStart(2,'0');
      let cls = 'dtp-day';
      if (ds === todayStr) cls += ' dtp-today';
      if (ds === this._val) cls += ' dtp-sel';
      html += `<span class="${cls}" data-date="${ds}">${d}</span>`;
    }
    this._panel.querySelector('.dtp-days').innerHTML = html;
  }

  _refreshLabel() {
    this._btn.textContent = (this._val || '选择日期') + '  ▾';
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   HourPicker  —  点击按钮弹出小时网格面板（7列，类日历布局）
   用法: const p = new HourPicker('container-id');  p.getValue() → "09"|""
─────────────────────────────────────────────────────────────────────────────*/
class HourPicker {
  constructor(container) {
    this._el   = typeof container === 'string' ? document.getElementById(container) : container;
    this._val  = '';
    this._open = false;
    this._build();
    this._bind();
  }

  getValue() { return this._val; }

  _build() {
    this._el.innerHTML = '';
    this._el.style.cssText = 'position:relative;display:inline-block;';

    this._btn = document.createElement('button');
    this._btn.type = 'button';
    this._btn.className = 'dtp-trigger';
    this._refreshLabel();
    this._el.appendChild(this._btn);

    this._panel = document.createElement('div');
    this._panel.className = 'dtp-panel dtp-hour-panel';
    this._panel.innerHTML = `
      <div class="dtp-nav" style="border-bottom:1px solid #f0f0f0;padding-bottom:8px;margin-bottom:8px;">
        <span class="dtp-title">选择小时</span>
      </div>
      <div class="dtp-hour-grid"></div>
      <div class="dtp-footer">
        <button type="button" class="dtp-clear">清空</button>
        <button type="button" class="dtp-confirm">确认</button>
      </div>`;

    // build 24 hour cells in 7-column grid
    const grid = this._panel.querySelector('.dtp-hour-grid');
    for (let h = 0; h < 24; h++) {
      const v = String(h).padStart(2,'0');
      const cell = document.createElement('span');
      cell.className = 'dtp-day';   // reuse calendar cell style
      cell.dataset.h = v;
      cell.textContent = v;
      grid.appendChild(cell);
    }
    // fill remaining cells to complete last row (24 % 7 = 3, need 4 more)
    const remainder = 24 % 7;
    if (remainder > 0) {
      for (let i = 0; i < (7 - remainder); i++) {
        const empty = document.createElement('span');
        empty.className = 'dtp-day dtp-empty';
        grid.appendChild(empty);
      }
    }
    this._el.appendChild(this._panel);
    this._renderGrid();
  }

  _bind() {
    this._btn.addEventListener('click', e => { e.stopPropagation(); this._open ? this._close() : this._show(); });
    this._panel.addEventListener('click', e => e.stopPropagation());

    this._panel.querySelector('.dtp-hour-grid').addEventListener('click', e => {
      const c = e.target.closest('[data-h]');
      if (!c) return;
      this._val = c.dataset.h;
      this._renderGrid();
      this._refreshLabel();
    });
    this._panel.querySelector('.dtp-clear').addEventListener('click', () => {
      this._val = ''; this._renderGrid(); this._refreshLabel(); this._close();
    });
    this._panel.querySelector('.dtp-confirm').addEventListener('click', () => this._close());
    document.addEventListener('click', () => this._close());
  }

  _show() {
    this._renderGrid();
    this._panel.style.display = 'block';
    this._open = true;
  }
  _close() { this._panel.style.display = 'none'; this._open = false; }

  _renderGrid() {
    this._panel.querySelectorAll('[data-h]').forEach(el => {
      el.classList.toggle('dtp-sel', el.dataset.h === this._val);
    });
  }

  _refreshLabel() {
    this._btn.textContent = (this._val ? this._val + ' 时' : '选择小时') + '  ▾';
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   TypeSelect  —  点击自动请求 /monitor/types，显示自定义下拉
   用法:
     const ts = new TypeSelect('container-id');
     ts.getValue()  → 当前选中的 type 字符串
     ts.reload()    → 切换环境后手动刷新列表
─────────────────────────────────────────────────────────────────────────────*/
class TypeSelect {
  constructor(container) {
    this._el   = typeof container === 'string' ? document.getElementById(container) : container;
    this._val  = '';
    this._list = [];
    this._open = false;
    this._build();
    this._bind();
  }

  getValue() { return this._val; }

  _build() {
    this._el.innerHTML = '';
    this._el.className = 'ts-wrap';

    this._row = document.createElement('div');
    this._row.className = 'ts-input-row';

    this._inp = document.createElement('input');
    this._inp.className = 'ts-input';
    this._inp.placeholder = '必填，点击加载选项';
    this._inp.autocomplete = 'off';

    this._arrow = document.createElement('button');
    this._arrow.type = 'button';
    this._arrow.className = 'ts-arrow';
    this._arrow.innerHTML = '▾';

    this._row.appendChild(this._inp);
    this._row.appendChild(this._arrow);

    this._drop = document.createElement('div');
    this._drop.className = 'ts-dropdown';

    this._el.appendChild(this._row);
    this._el.appendChild(this._drop);
  }

  _bind() {
    // 点击输入框或箭头 → 打开并加载
    this._inp.addEventListener('focus', () => this._fetchAndOpen());
    this._arrow.addEventListener('click', e => {
      e.stopPropagation();
      this._open ? this._close() : this._fetchAndOpen();
    });
    // 输入过滤
    this._inp.addEventListener('input', () => {
      this._val = this._inp.value;
      this._renderItems(this._inp.value);
    });
    // 下拉点击不关闭
    this._drop.addEventListener('click', e => e.stopPropagation());
    // 点其他地方关闭
    document.addEventListener('click', () => this._close());
  }

  async _fetchAndOpen() {
    this._showLoading();
    this._openDrop();
    try {
      const resp = await apiFetch(`${getBase()}/monitor/types`);
      this._list = resp.body || [];
    } catch {
      this._list = [];
    }
    this._renderItems(this._inp.value);
  }

  async reload() {
    this._list = [];
    this._val  = '';
    this._inp.value = '';
    if (this._open) {
      await this._fetchAndOpen();
    }
  }

  _renderItems(filter) {
    const q = (filter || '').toLowerCase();
    const matched = q ? this._list.filter(t => t.toLowerCase().includes(q)) : this._list;
    if (matched.length === 0) {
      this._drop.innerHTML = `<div class="ts-empty">${this._list.length === 0 ? '暂无数据' : '无匹配结果'}</div>`;
      return;
    }
    this._drop.innerHTML = matched.map(t =>
      `<div class="ts-item${t === this._val ? ' active' : ''}" data-v="${escHtml(t)}">${escHtml(t)}</div>`
    ).join('');
    this._drop.querySelectorAll('.ts-item').forEach(el => {
      el.addEventListener('click', () => {
        this._val = el.dataset.v;
        this._inp.value = this._val;
        this._renderItems('');
        this._close();
      });
    });
  }

  _showLoading() {
    this._drop.innerHTML = '<div class="ts-loading">加载中...</div>';
  }

  _openDrop() {
    this._drop.classList.add('open');
    this._open = true;
  }

  _close() {
    this._drop.classList.remove('open');
    this._open = false;
  }
}

// 兼容旧调用（不再需要 datalistId，忽略第二个参数）
function initTypeCombo() {}