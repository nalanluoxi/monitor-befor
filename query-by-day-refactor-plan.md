# query-by-day.html 改造计划

## 需求描述

在「按天查询」页面的结果区域新增**详情** / **汇总**两种展示模式：

| 模式 | 触发方式 | 展示内容 |
|------|---------|---------|
| **汇总（默认）** | 页面初始 / 点击「汇总」按钮 | 使用已有 `queryByDay` 响应数据，把 `type + branchId + dispatchTs` 视为唯一 key，将所有时间槽的 count 累加，得到每个 key 的全天 `allCount`；支持按 allCount 排序 |
| **详情** | 点击「详情」按钮后**重新发起查询** | 展示原始时间槽结构，每个槽一张表，与现有 `render()` 逻辑完全一致 |

---

## 数据来源分析

后端接口：`GET /monitor/queryByDay?type=xxx&day=yyyyMMdd`

响应结构（已确认）：
```json
{
  "queryDay": "20260427",
  "all": [ { "type": "...", "branchId": "...", "dispatchTs": "...", "count": 100 } ],
  "2026042700": [ { "type": "...", "branchId": "...", "dispatchTs": "...", "count": 10 } ],
  "2026042701": [ ... ],
  ...
}
```

汇总模式可以在**前端**对已拿到的数据做聚合，**无需额外请求**。
详情模式点击按钮时才发起请求，返回后按时间槽分组展示。

---

## 状态管理

在页面级脚本中新增两个变量：

```js
let currentMode = 'summary';  // 'summary' | 'detail'
let lastData    = null;        // 缓存最近一次 queryByDay 响应
```

---

## 改动清单

### 1. `query-by-day.html` — 查询区域新增模式切换按钮

在现有「查询」按钮旁边，添加两个切换按钮（仅在有结果时显示，初始隐藏）：

```html
<button id="btn-summary" class="btn btn-mode active-mode" onclick="switchMode('summary')">汇总</button>
<button id="btn-detail"  class="btn btn-mode"             onclick="switchMode('detail')">详情</button>
```

按钮外包一个 `<div id="mode-btns" style="display:none">` 容器，首次查询返回结果后才 `display:flex`。

---

### 2. `query-by-day.html` — `load()` 函数改造

```
load()
  ├── 发起请求
  ├── lastData = resp.body
  ├── 显示 #mode-btns
  └── renderByMode()          ← 根据 currentMode 分发
```

---

### 3. `query-by-day.html` — `switchMode(mode)` 函数（新增）

```js
async function switchMode(mode) {
  currentMode = mode;
  // 更新按钮高亮
  document.getElementById('btn-summary').classList.toggle('active-mode', mode === 'summary');
  document.getElementById('btn-detail').classList.toggle('active-mode', mode === 'detail');

  if (mode === 'detail') {
    // 重新发起查询，保证数据最新
    await load(/* 复用现有参数，不再清空 lastData */);
  } else {
    // 汇总直接用 lastData，无需请求
    renderSummary(lastData);
  }
}
```

---

### 4. `query-by-day.html` — `renderByMode()` 函数（新增）

```js
function renderByMode() {
  if (currentMode === 'summary') renderSummary(lastData);
  else                           render(lastData);   // 现有详情逻辑不动
}
```

---

### 5. `query-by-day.html` — `renderSummary(data)` 函数（新增）

**聚合逻辑**：遍历所有时间槽（排除 `queryDay` / `all`），用 `${type}||${branchId}||${dispatchTs}` 作 Map key，累加 count。

```js
function renderSummary(data) {
  const queryDay = data.queryDay || '';
  const slots = Object.keys(data).filter(k => k !== 'queryDay' && k !== 'all');

  // 聚合：Map<key, { type, branchId, dispatchTs, allCount }>
  const map = new Map();
  slots.forEach(slot => {
    (data[slot] || []).forEach(r => {
      const key = `${r.type}||${r.branchId}||${r.dispatchTs}`;
      if (map.has(key)) {
        map.get(key).allCount += Number(r.count || 0);
      } else {
        map.set(key, { type: r.type, branchId: r.branchId, dispatchTs: r.dispatchTs, allCount: Number(r.count || 0) });
      }
    });
  });

  let rows = [...map.values()];

  // 根据 sortDesc 决定排序方向
  if (sortDesc) rows.sort((a, b) => b.allCount - a.allCount);

  // 全天总量
  const grandTotal = rows.reduce((s, r) => s + r.allCount, 0);

  // 渲染 HTML（含排序按钮）
  ...
}
```

---

### 6. `query-by-day.html` — 汇总表格排序按钮

在汇总视图的表头 `allCount` 列旁边放一个小箭头按钮，点击触发排序：

```html
<th>allCount <button class="sort-btn" onclick="toggleSort()">↕</button></th>
```

```js
let sortDesc = true;   // 默认降序

function toggleSort() {
  sortDesc = !sortDesc;
  renderSummary(lastData);
}
```

按钮状态：`sortDesc=true` 时显示 `↓`，`false` 时显示 `↑`。

---

### 7. `common.css` — 新增样式

需要新增以下几条样式（**追加**到 `common.css` 末尾）：

```css
/* ── 详情/汇总 模式切换按钮 ── */
.btn-mode {
  background: #fff;
  color: #555;
  border: 1px solid #d9d9d9;
}
.btn-mode.active-mode {
  background: #00d4ff;
  color: #1a1a2e;
  border-color: #00d4ff;
}

/* ── 汇总表排序按钮 ── */
.sort-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: #1890ff;
  padding: 0 4px;
  vertical-align: middle;
}
.sort-btn:hover { color: #0050b3; }
```

---

## 完整流程图

```
用户点击「查询」
  ↓
load()
  ├── apiFetch(queryByDay)
  ├── lastData = data
  ├── 显示 mode-btns
  └── renderByMode()
        ├── currentMode==='summary' → renderSummary(lastData)
        │     └── 聚合 + 渲染汇总表（默认降序）
        └── currentMode==='detail'  → render(lastData)
              └── 按时间槽分组展示（现有逻辑不变）

用户点击「汇总」按钮
  ↓ switchMode('summary') → renderSummary(lastData)（不请求）

用户点击「详情」按钮
  ↓ switchMode('detail')  → load()（重新请求）→ render(lastData)

用户点击「↕ 排序」（汇总模式下）
  ↓ toggleSort() → sortDesc 取反 → renderSummary(lastData)（不请求）
```

---

## 需要修改的文件

| 文件 | 修改性质 |
|------|---------|
| `query-by-day.html` | 主要改动：HTML 结构 + JS 逻辑 |
| `common.css` | 追加两组样式（约 15 行） |

`common.js` **不需要改动**，复用所有现有函数和组件。

---

## 不改变的部分

- `load()` 内部的请求参数构建、错误处理逻辑保持不变
- `render(data)` 函数（详情渲染）保持完全不变
- `fmtTs()` / `fmtNum()` / `escHtml()` 等辅助函数不变
- `DayPicker` / `HourPicker` / `TypeSelect` 组件不变
- Navbar、env-bar、表单区域 HTML 结构不变