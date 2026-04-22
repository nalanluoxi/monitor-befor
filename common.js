const BASE = 'http://localhost:9000/sitemap';

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
function fmtTs(ts) {
  if (!ts || ts === '') return '';
  // yyyyMMddHH format (10 digits)
  if (/^\d{10}$/.test(ts)) {
    return `${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)} ${ts.slice(8,10)}时`;
  }
  // yyyyMMddHHmmss format (14 digits)
  if (/^\d{14}$/.test(ts)) {
    return `${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)} ${ts.slice(8,10)}:${ts.slice(10,12)}:${ts.slice(12,14)}`;
  }
  // Unix timestamp (seconds, 10 digits starting with 1 or larger)
  const n = Number(ts);
  if (isNaN(n) || n === 0) return ts;
  // distinguish seconds vs milliseconds
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms).toLocaleString('zh-CN');
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
