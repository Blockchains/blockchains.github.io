// Shared helpers for the Blockchain Lab hub. No trackers, no cookies.
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const BASE = document.querySelector('meta[name="hub-base"]')?.content || "/";
export async function data(name) {
  const r = await fetch(`${BASE}data/${name}`, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return r.json();
}
export const usd = (n) => n == null ? "—" : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Number(n).toFixed(2)}`;
export const num = (n, d = 2) => n == null ? "—" : Number(n).toLocaleString("en-GB", { maximumFractionDigits: d });
export const pct = (n) => n == null ? "—" : `<span class="${n >= 0 ? "ok" : "bad"}">${n >= 0 ? "+" : ""}${Number(n).toFixed(2)}%</span>`;
export function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return `${Math.round(s)}s ago`; if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`; return `${Math.round(s / 86400)} days ago`;
}
export function stamp(d, el = $("#stamp")) {
  if (el && d?.generated_at) el.innerHTML = `Updated ${esc(ago(d.generated_at))} · source: <a href="${esc(d.source_url)}" rel="noopener">${esc(d.source)}</a>`;
}
export function fail(e, el = $("#out")) { if (el) el.innerHTML = `<div class="empty bad">Could not load data: ${esc(e.message || e)}</div>`; console.error(e); }
export function spark(vals, w = 120, h = 26) {
  const v = vals.filter((x) => x != null); if (v.length < 2) return "";
  const mn = Math.min(...v), mx = Math.max(...v), r = mx - mn || 1;
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * w},${h - ((x - mn) / r) * (h - 4) - 2}`).join(" ");
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="#5eead4" stroke-width="1.6" points="${pts}"/></svg>`;
}
// sortable tables: click a <th data-k> to sort rows rendered by render(rows)
export function sortable(table, rows, render) {
  let key = null, dir = -1;
  $$("th[data-k]", table).forEach((th) => th.addEventListener("click", () => {
    const k = th.dataset.k; dir = key === k ? -dir : -1; key = k;
    rows.sort((a, b) => { const x = a[k], y = b[k]; if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * dir; });
    render(rows);
  }));
}
export function aiNote(d) {
  return `<div class="note ai">🤖 ${esc(d.disclaimer || "AI-generated.")} Model: <code>${esc(d.model || (d.protocols?.[0]?.model) || "grok")}</code> · generated ${esc(ago(d.generated_at))} by a scheduled GitHub Action — no AI calls happen in your browser.</div>`;
}
