/* FindBuyAgent static app. Live-only: Base mainnet (eip155:8453), USDC. No keys, no server secrets.
   Every payment is an EIP-3009 authorisation the user signs in their own wallet after an explicit confirm. */
(() => {
'use strict';
const D = document, H = D.documentElement, B = H.dataset.base || '';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', CHAIN = 8453, CHAIN_HEX = '0x2105', RPC = 'https://mainnet.base.org', SCAN = 'https://basescan.org';
const MAX_PAY = 25, MAX_DAY = 100;
const $ = (s, r = D) => r.querySelector(s), $$ = (s, r = D) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = (html) => { const t = D.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const store = { get(k, d) { try { const v = localStorage.getItem('fba.' + k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { localStorage.setItem('fba.' + k, JSON.stringify(v)); } };
const DEF = { perPay: 1, perDay: 5, allow: [], theme: 'system', motion: false, dev: false };
const S = () => ({ ...DEF, ...store.get('settings', {}) });
const setS = (patch) => { const n = { ...S(), ...patch }; store.set('settings', n); emit('settings'); return n; };
const bus = new EventTarget(); const emit = (n, d) => bus.dispatchEvent(new CustomEvent(n, { detail: d })); const on = (n, f) => bus.addEventListener(n, (e) => f(e.detail));
const fmtU = (atomic) => { const n = Number(atomic) / 1e6; return n < 0.01 ? n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') : n.toFixed(n < 1 ? 3 : 2).replace(/(\.\d\d)0$/, '$1'); };
const usd = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = (a) => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
const addrHTML = (a) => `<span class="addr mono"><b>${esc(a.slice(0, 8))}</b>${esc(a.slice(8, -4))}<b>${esc(a.slice(-4))}</b></span>`;
const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} d`; };
const isTx = (x) => typeof x === 'string' && /^0x[0-9a-fA-F]{64}$/.test(x);
const SNAP = (() => { try { return JSON.parse($('#snap')?.textContent || 'null'); } catch { return null; } })();

/* ---------- theme ---------- */
const applyTheme = () => { const s = S(); if (s.theme === 'system') H.removeAttribute('data-theme'); else H.dataset.theme = s.theme; if (s.motion) H.dataset.motion = 'reduce'; else H.removeAttribute('data-motion'); };
applyTheme(); on('settings', applyTheme);

/* ---------- toasts ---------- */
const toastBox = D.body.appendChild(h('<div class="toasts" role="status" aria-live="polite"></div>'));
function toast(msg, action, fn, ms = 5000) {
  const t = h(`<div class="toast"><span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}</div>`);
  if (action) t.querySelector('button').onclick = () => { t.remove(); fn?.(); };
  toastBox.append(t); setTimeout(() => t.remove(), ms);
}
const ERR = {
  user_rejected: ['Signature cancelled. Nothing was paid.', 'Try again'], wrong_chain: ['Your wallet is on another network.', 'Switch to Base'],
  over_cap: ['That\'s over your limit.', 'Adjust limits'], not_allowlisted: ['This merchant isn\'t on your allowlist.', 'Allow merchant'],
  payee_changed: ['The payee changed since you approved it. Payment stopped.', 'Review'], expired: ['The price quote expired.', 'Refresh price'],
  unsupported_terms: ['This merchant doesn\'t accept USDC on Base.', 'Choose another'], merchant_error: ['The merchant didn\'t respond. You weren\'t charged.', 'Retry'],
  settle_failed: ['Payment didn\'t settle. You weren\'t charged.', 'Retry'], no_wallet: ['No wallet found in this browser.', 'Get a wallet'],
};

/* ---------- sheet ---------- */
let lastFocus = null;
function sheet(html, { label = 'Dialog', onClose } = {}) {
  closeSheet(); lastFocus = D.activeElement;
  const bg = h(`<div class="sheet-bg"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1">${html}</div></div>`);
  bg.addEventListener('click', (e) => { if (e.target === bg) closeSheet(); });
  bg._onClose = onClose; D.body.append(bg); const s = bg.firstElementChild;
  (s.querySelector('[data-autofocus]') || s).focus(); return s;
}
function closeSheet() { const bg = $('.sheet-bg'); if (!bg) return; bg._onClose?.(); bg.remove(); lastFocus?.focus?.(); }
D.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
  if (e.key === 'Tab' && $('.sheet-bg')) { const f = $$('.sheet button:not([disabled]),.sheet a,.sheet input,.sheet select,.sheet textarea'); if (!f.length) return; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && D.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && D.activeElement === z) { e.preventDefault(); a.focus(); } }
  const typing = /INPUT|TEXTAREA|SELECT/.test(D.activeElement?.tagName);
  if (!typing && e.key === ',' && !e.metaKey && !e.ctrlKey) location.href = B + '/settings';
});

/* ---------- RPC ---------- */
async function rpc(method, params) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result;
}
const usdcBalance = async (a) => BigInt(await rpc('eth_call', [{ to: USDC, data: '0x70a08231' + a.slice(2).toLowerCase().padStart(64, '0') }, 'latest']));

/* ---------- wallets (EIP-6963 + injected fallback) ---------- */
const found = new Map();
window.addEventListener('eip6963:announceProvider', (e) => { const d = e.detail; if (d?.info?.uuid) { found.set(d.info.rdns || d.info.uuid, d); emit('wallets'); } });
window.dispatchEvent(new Event('eip6963:requestProvider'));
const W = { p: null, info: null, addr: null, chain: null, bal: null };
function walletList() {
  const l = [...found.values()];
  if (!l.length && window.ethereum) l.push({ info: { name: window.ethereum.isMetaMask ? 'MetaMask' : window.ethereum.isCoinbaseWallet ? 'Coinbase Wallet' : 'Browser wallet', rdns: 'injected', icon: '' }, provider: window.ethereum });
  const recent = store.get('recentWallets', []);
  return l.sort((a, b) => { const ia = recent.indexOf(a.info.rdns), ib = recent.indexOf(b.info.rdns); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
}
async function useWallet(w, silent) {
  const accts = await w.provider.request({ method: silent ? 'eth_accounts' : 'eth_requestAccounts' });
  if (!accts?.length) return false;
  W.p = w.provider; W.info = w.info; W.addr = accts[0];
  W.chain = parseInt(await W.p.request({ method: 'eth_chainId' }), 16);
  const r = store.get('recentWallets', []).filter((x) => x !== w.info.rdns); r.unshift(w.info.rdns); store.set('recentWallets', r.slice(0, 5)); store.set('wallet', { rdns: w.info.rdns });
  if (!W.p._fba) { W.p._fba = 1; W.p.on?.('accountsChanged', (a) => { if (!a.length) disconnect(true); else { W.addr = a[0]; refreshBal(); } }); W.p.on?.('chainChanged', (c) => { W.chain = parseInt(c, 16); emit('wallet'); }); }
  emit('wallet'); refreshBal(); if (!silent) toast('Wallet connected'); return true;
}
async function refreshBal() { if (!W.addr) return; try { W.bal = await usdcBalance(W.addr); } catch { W.bal = null; } emit('wallet'); }
function disconnect(quiet) { Object.assign(W, { p: null, info: null, addr: null, chain: null, bal: null }); store.set('wallet', null); emit('wallet'); if (!quiet) toast('Disconnected'); }
async function switchBase() {
  try { await W.p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] }); }
  catch (e) { if (e?.code === 4902) await W.p.request({ method: 'wallet_addEthereumChain', params: [{ chainId: CHAIN_HEX, chainName: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: [RPC], blockExplorerUrls: [SCAN] }] }); else throw e; }
  W.chain = parseInt(await W.p.request({ method: 'eth_chainId' }), 16); emit('wallet');
}
// Resolves when connected. One wallet: connect straight away (the wallet's own prompt is the confirmation).
function connect() {
  return new Promise((resolve) => {
    if (W.addr) return resolve(true);
    const l = walletList();
    if (l.length === 1) return useWallet(l[0]).then(resolve, (e) => { if (e?.code !== 4001) toast(...ERR.merchant_error.slice(0, 1)); resolve(false); });
    const here = encodeURIComponent(location.href.replace(/^https:\/\//, ''));
    const tiles = l.length ? l.map((w, i) => `<button class="wtile" type="button" data-i="${i}" ${i === 0 ? 'data-autofocus' : ''}>${w.info.icon ? `<img src="${esc(w.info.icon)}" alt="" width="32" height="32">` : '<span class="fav" style="width:32px;height:32px">W</span>'}<span>${esc(w.info.name)}</span>${i === 0 && store.get('recentWallets', []).includes(w.info.rdns) ? '<span class="badge b-n" style="margin-left:auto">Recently used</span>' : ''}</button>`).join('')
      : `<p><strong>No wallet detected</strong></p><p class="muted">Install one, then come back. On mobile, open FindBuyAgent in your wallet's browser.</p>
        <div class="stack"><a class="wtile" href="https://link.metamask.io/dapp/${here}">MetaMask</a><a class="wtile" href="https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(location.href)}">Coinbase Wallet</a><a class="wtile" href="https://rabby.io/">Rabby</a><a class="wtile" href="https://link.trustwallet.com/open_url?coin_id=8453&url=${encodeURIComponent(location.href)}">Trust Wallet</a><a class="wtile" href="https://phantom.com/ul/browse/${encodeURIComponent(location.href)}">Phantom</a></div>`;
    let done = false;
    const s = sheet(`<h2>Connect a wallet</h2><p class="muted small">Wallets found in this browser</p><div class="stack">${tiles}</div><p class="small muted" style="margin-top:16px">FindBuyAgent never asks for your seed phrase or private key.</p>`, { label: 'Connect a wallet', onClose: () => { if (!done) resolve(false); } });
    $$('[data-i]', s).forEach((b) => b.onclick = async () => { b.disabled = true; try { if (await useWallet(l[+b.dataset.i])) { done = true; closeSheet(); resolve(true); } } catch (e) { b.disabled = false; toast(e?.code === 4001 ? 'Connection cancelled.' : 'That wallet didn\'t connect.'); } });
  });
}
(async () => { const last = store.get('wallet'); if (!last) return; await new Promise((r) => setTimeout(r, 300)); const w = walletList().find((x) => x.info.rdns === last.rdns); if (w) useWallet(w, true).catch(() => {}); })();

/* wallet chip */
function renderChip() {
  const c = $('#wallet'); if (!c) return;
  if (!W.addr) { c.className = 'btn pri sm wallet-chip'; c.textContent = 'Connect wallet'; return; }
  const wrong = W.chain !== CHAIN;
  c.className = 'btn sec sm wallet-chip'; c.innerHTML = wrong ? '<span class="badge b-bad">Switch to Base</span>' : `<span class="dot" style="color:var(--ok)" aria-hidden="true"></span>${esc(short(W.addr))} · ${W.bal == null ? '…' : fmtU(W.bal)} USDC`;
}
on('wallet', renderChip);
D.addEventListener('click', async (e) => {
  const c = e.target.closest('#wallet'); if (!c) return;
  if (!W.addr) return connect();
  if (W.chain !== CHAIN) return switchBase().catch(() => toast(...ERR.wrong_chain));
  const last = store.get('receipts', [])[0];
  const s = sheet(`<h2>${esc(short(W.addr))}</h2><p class="muted small">${esc(W.info?.name || 'Wallet')} · Base · ${W.bal == null ? '' : fmtU(W.bal) + ' USDC'}</p><div class="list"><button class="btn ghost" data-a="copy" type="button">Copy address</button><a class="btn ghost" href="${SCAN}/address/${W.addr}" target="_blank" rel="noopener">View on Basescan</a>${last ? `<a class="btn ghost" href="${B}/receipts?tx=${last.tx}">Last receipt</a>` : ''}<button class="btn ghost" data-a="dis" type="button">Disconnect</button></div>`, { label: 'Wallet' });
  s.querySelector('[data-a=copy]').onclick = () => { navigator.clipboard?.writeText(W.addr); toast('Copied'); };
  s.querySelector('[data-a=dis]').onclick = () => { closeSheet(); disconnect(); };
});
renderChip();

/* ---------- catalogue ---------- */
const BANNED = /lorem|ipsum|todo|fixme|placeholder|coming soon|example|demo|mock|dummy|simulat|sepolia|84532|testnet/i;
function catalogue() {
  if (!SNAP) return [];
  const core = SNAP.core.filter((c) => c.accept).map((c) => ({ id: c.id, name: c.name, merchant: c.merchant, host: new URL(c.url).host, url: c.url, method: c.method, words: c.words, suggestion: c.suggestion, snap: c.accept, snapMs: c.ms, example: c.example, payers: null, browser: c.cors.pay, read: c.cors.read }));
  const baz = SNAP.bazaar.filter((b) => !BANNED.test(b.description + ' ' + b.name)).map((b, i) => ({ id: 'bz' + i, name: b.description.split(/[.:-]/)[0].trim().slice(0, 60) || b.name, merchant: b.name, host: b.host, url: b.url, method: 'GET', words: b.description, snap: { amount: b.amount, payTo: b.payTo, network: 'eip155:8453', scheme: 'exact', asset: USDC }, example: b.example, payers: b.payers30d, browser: b.cors.pay, read: b.cors.read }));
  return [...core, ...baz];
}
const quoteCache = new Map();
async function liveQuote(item, force) {
  const c = quoteCache.get(item.id); if (!force && c && Date.now() - c.at < 60000) return c;
  if (!item.read) return { at: Date.parse(SNAP.generatedAt), accept: item.snap, ms: item.snapMs, snapshot: true };
  const t0 = performance.now(); const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(item.url, { method: item.method, signal: ctl.signal, ...(item.method === 'POST' ? { headers: { 'content-type': 'application/json' }, body: '{}' } : {}) });
    const ms = Math.round(performance.now() - t0);
    if (r.status !== 402) throw new Error('status ' + r.status);
    let pr = null; const hd = r.headers.get('payment-required'); if (hd) { try { pr = JSON.parse(atob(hd)); } catch {} } if (!pr) pr = await r.json().catch(() => null);
    const accept = (pr?.accepts || []).find((a) => a.scheme === 'exact' && a.network === 'eip155:8453' && a.asset?.toLowerCase() === USDC.toLowerCase());
    if (!accept) throw Object.assign(new Error('terms'), { code: 'unsupported_terms' });
    const q = { at: Date.now(), accept, resource: pr.resource, ms, raw: pr, example: pr.extensions?.bazaar?.info?.output?.example };
    quoteCache.set(item.id, q); return q;
  } finally { clearTimeout(to); }
}

/* ---------- receipts (hash-chained, local) ---------- */
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const core = (r) => JSON.stringify([r.tx, r.amount, r.payTo, r.from, r.host, r.resource, r.ts, r.auth?.nonce]);
async function addReceipt(r) { const all = store.get('receipts', []); r.prev = all[0]?.hash || '0'; r.hash = await sha(r.prev + core(r)); all.unshift(r); store.set('receipts', all); emit('receipts'); }
async function verifyChain(all) { let prev = '0'; for (const r of [...all].reverse()) { if (r.prev !== prev || r.hash !== await sha(r.prev + core(r))) return false; prev = r.hash; } return true; }
function updateReceipt(tx, patch) { const all = store.get('receipts', []); const r = all.find((x) => x.tx === tx); if (r) { Object.assign(r, patch); store.set('receipts', all); emit('receipts'); } }
async function watchTx(tx) {
  for (let i = 0; i < 60; i++) {
    try { const rc = await rpc('eth_getTransactionReceipt', [tx]); if (rc) { updateReceipt(tx, { status: rc.status === '0x1' ? 'Confirmed' : 'Failed', block: parseInt(rc.blockNumber, 16) }); return rc; } } catch {}
    await new Promise((r) => setTimeout(r, 3000));
  }
}
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const usedToday = () => store.get('receipts', []).filter((r) => r.ts >= today() && r.status !== 'Failed').reduce((s, r) => s + Number(r.amount) / 1e6, 0);

/* ---------- rules ---------- */
function evaluate(item, accept) {
  const s = S(), amt = Number(accept.amount) / 1e6, used = usedToday();
  return [
    { id: 'cap', ok: amt <= s.perPay, pass: `Within ${usd(s.perPay)} per payment`, fail: 'Over your per-payment limit' },
    { id: 'day', ok: used + amt <= s.perDay, pass: `Within today's ${usd(s.perDay)}`, fail: 'Over today\'s limit' },
    { id: 'allow', ok: s.allow.includes(item.host), pass: 'Allowed merchant', fail: 'Not on your allowlist', fixable: true },
  ];
}

/* ---------- pay ---------- */
const enc64 = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
const dec64 = (s) => JSON.parse(decodeURIComponent(escape(atob(s))));
async function buy(item) {
  if (!W.addr && !(await connect())) return;
  let q; const s = sheet(`<p class="micro">Confirm payment</p><div class="amount skel" style="width:60%">0.000</div><p class="muted">Reading live prices…</p>`, { label: 'Confirm payment' });
  try { q = await liveQuote(item, true); } catch (e) { closeSheet(); return toast(...(e.code === 'unsupported_terms' ? ERR.unsupported_terms : [`${item.host} didn't respond. Showing the next best option.`])), nextBest(item); }
  if (!$('.sheet') || $('.sheet') !== s) return;
  renderConfirm(s, item, q);
}
function nextBest(item) { const alt = catalogue().filter((x) => x.id !== item.id && x.browser).sort((a, b) => Number(a.snap.amount) - Number(b.snap.amount))[0]; if (alt && location.pathname.endsWith('/find')) $(`[data-buy="${alt.id}"]`)?.focus(); }
function renderConfirm(s, item, q) {
  const a = q.accept, amt = Number(a.amount), rules = evaluate(item, a), blocked = rules.filter((r) => !r.ok && !r.fixable);
  const needAllow = rules.find((r) => r.id === 'allow' && !r.ok);
  const ttl = Math.min(a.maxTimeoutSeconds || 60, 120); const exp = q.at + ttl * 1000;
  const after = W.bal != null ? fmtU(W.bal - BigInt(amt)) : null; const short_ = W.bal != null && W.bal < BigInt(amt);
  const wrong = W.chain !== CHAIN;
  const name = W.info?.name || 'wallet';
  let cta, reason = '';
  if (!item.browser) { cta = `<button class="btn pri lg block" disabled type="button">Pay on findbuyagent.com</button>`; reason = 'This merchant doesn\'t let a browser pay it directly from this site. Paying it needs the FindBuyAgent server at findbuyagent.com.'; }
  else if (q.snapshot) { cta = `<button class="btn pri lg block" disabled type="button">Refresh price</button>`; reason = 'Live price unavailable here.'; }
  else if (blocked.length) { cta = `<a class="btn pri lg block" href="${B}/mandates">Adjust limits</a>`; reason = blocked.map((r) => r.fail).join(' · '); }
  else if (wrong) cta = `<button class="btn pri lg block" data-a="switch" type="button" data-autofocus>Switch to Base</button>`;
  else if (short_) { cta = `<a class="btn pri lg block" href="https://www.coinbase.com/price/usdc" target="_blank" rel="noopener">Get USDC</a>`; reason = `Not enough USDC. You have ${fmtU(W.bal)}, this needs ${fmtU(amt)}.`; }
  else cta = `<button class="btn pri lg block" data-a="sign" type="button" data-autofocus>${needAllow ? `Allow ${esc(item.host)} and sign in ${esc(name)}` : `Sign in ${esc(name)}`}</button>`;
  s.innerHTML = `<p class="micro">Confirm payment</p>
   <div class="amount">${fmtU(amt)} USDC</div><p class="muted small">${amt / 1e6 < 0.01 ? 'Less than $0.01' : '≈ ' + usd(amt / 1e6)} · Base mainnet <span class="badge b-live"><span class="dot pulse"></span>Live · Base mainnet</span></p>
   <div class="chips" aria-label="Rules">${rules.map((r) => `<span class="badge ${r.ok ? 'b-ok' : r.fixable ? 'b-n' : 'b-bad'}">${r.ok ? '✓ ' + esc(r.pass) : (r.fixable ? '+ ' : '✕ ') + esc(r.fixable ? 'Allowed when you sign' : r.fail)}</span>`).join('')}<span class="badge b-ind" title="FindBuyAgent doesn't review merchants. Check the payee before you sign.">Independent merchant</span></div>
   <dl class="kv"><dt>To</dt><dd>${addrHTML(a.payTo)} <button class="btn ghost sm" data-a="cp" type="button">Copy</button> <a class="small" href="${SCAN}/address/${a.payTo}" target="_blank" rel="noopener">Basescan</a></dd>
   <dt>Merchant</dt><dd>${esc(item.host)}</dd><dt>For</dt><dd>${esc(item.name)}</dd>
   <dt>Expires in</dt><dd class="num" data-exp>${Math.max(0, Math.round((exp - Date.now()) / 1000))}s</dd>${after != null ? `<dt>Balance after</dt><dd class="num">${after} USDC</dd>` : ''}</dl>
   ${q.example ? `<details><summary class="small">Sample response from the merchant's listing</summary><pre class="code">${esc(JSON.stringify(q.example, null, 2)).slice(0, 1500)}</pre></details>` : ''}
   ${S().dev ? `<details><summary class="small">Developer view: 402 terms</summary><pre class="code">${esc(JSON.stringify(a, null, 2))}</pre></details>` : ''}
   <p class="notice">This is a real payment. Check the payee, then sign in your wallet.</p>
   <div class="stack" style="margin-top:16px">${cta}${reason ? `<p class="small muted" role="status">${esc(reason)}</p>` : ''}<button class="btn ghost block" data-a="cancel" type="button">Cancel</button></div>`;
  s.querySelector('[data-a=cancel]').onclick = closeSheet;
  s.querySelector('[data-a=cp]').onclick = () => { navigator.clipboard?.writeText(a.payTo); toast('Copied'); };
  const tick = setInterval(async () => { const el = s.querySelector('[data-exp]'); if (!el || !s.isConnected) return clearInterval(tick); const left = Math.round((exp - Date.now()) / 1000); el.textContent = Math.max(0, left) + 's';
    if (left <= 0) { clearInterval(tick); if (!q.requoted) { try { const n = await liveQuote(item, true); if (n.accept.payTo.toLowerCase() !== a.payTo.toLowerCase()) { toast(...ERR.payee_changed); return closeSheet(); } n.requoted = 1; renderConfirm(s, item, n); } catch { toast(...ERR.expired); } } else toast(...ERR.expired, () => buy(item)); } }, 1000);
  s.querySelector('[data-a=switch]')?.addEventListener('click', async () => { try { await switchBase(); renderConfirm(s, item, q); } catch { toast(...ERR.wrong_chain); } });
  s.querySelector('[data-a=sign]')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget; if (Date.now() > exp) return toast(...ERR.expired);
    btn.disabled = true; btn.textContent = 'Waiting for your signature…'; clearInterval(tick);
    try {
      if (needAllow) { setS({ allow: [...new Set([...S().allow, item.host])] }); }
      const now = Math.floor(Date.now() / 1000);
      const msg = { from: W.addr, to: a.payTo, value: String(a.amount), validAfter: String(now - 600), validBefore: String(now + (a.maxTimeoutSeconds || 60)), nonce: '0x' + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('') };
      const typed = { types: { EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }], TransferWithAuthorization: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }] }, primaryType: 'TransferWithAuthorization', domain: { name: a.extra?.name || 'USD Coin', version: a.extra?.version || '2', chainId: CHAIN, verifyingContract: a.asset }, message: msg };
      const sig = await W.p.request({ method: 'eth_signTypedData_v4', params: [W.addr, JSON.stringify(typed)] });
      btn.textContent = 'Sending payment…';
      const payload = { x402Version: 2, resource: q.resource, accepted: a, payload: { signature: sig, authorization: msg } };
      const r = await fetch(item.url, { method: item.method, headers: { 'PAYMENT-SIGNATURE': enc64(payload), ...(item.method === 'POST' ? { 'content-type': 'application/json' } : {}) }, ...(item.method === 'POST' ? { body: '{}' } : {}) });
      btn.textContent = 'Confirming on Base…';
      const ph = r.headers.get('payment-response') || r.headers.get('x-payment-response'); let pr = null; try { pr = ph ? dec64(ph) : null; } catch {}
      const body = await r.text();
      const tx = pr?.transaction;
      if (!r.ok && !isTx(tx)) { toast(...ERR.settle_failed); return renderConfirm(s, item, q); }
      if (!isTx(tx)) return renderUnsettled(s);
      const rec = { tx, network: 'eip155:8453', amount: String(a.amount), payTo: a.payTo, from: W.addr, host: item.host, resource: item.url, name: item.name, itemId: item.id, ts: Date.now(), status: 'Pending', response: body.slice(0, 4000), auth: msg, signature: sig };
      await addReceipt(rec); refreshBal(); renderPaid(s, rec, item); watchTx(tx).then(() => { const st = s.querySelector('[data-st]'); const cur = store.get('receipts', []).find((x) => x.tx === tx); if (st && cur) st.textContent = cur.status; });
    } catch (e) {
      if (e?.code === 4001 || /reject|denied|cancel/i.test(e?.message || '')) toast(...ERR.user_rejected, () => buy(item)); else toast(...ERR.merchant_error, () => buy(item));
      renderConfirm(s, item, q);
    }
  });
}
function renderUnsettled(s) { s.innerHTML = `<h2>Signed, settlement not confirmed.</h2><p class="muted">The merchant hasn't returned a transaction. No receipt was saved. Check your wallet activity on Basescan.</p><div class="stack"><a class="btn sec block" href="${SCAN}/address/${W.addr}" target="_blank" rel="noopener">View on Basescan</a><button class="btn ghost block" type="button" data-a="x">Close</button></div>`; s.querySelector('[data-a=x]').onclick = closeSheet; }
function pretty(body) { try { return esc(JSON.stringify(JSON.parse(body), null, 2)); } catch { return esc(body); } }
function renderPaid(s, rec, item) {
  s.innerHTML = `<p class="micro">Paid</p><div class="amount">${fmtU(rec.amount)} USDC</div><p class="muted">to ${esc(rec.host)}</p>
   <dl class="kv"><dt>Transaction</dt><dd><a class="mono" href="${SCAN}/tx/${rec.tx}" target="_blank" rel="noopener">${short(rec.tx)}</a></dd><dt>Status</dt><dd data-st>Pending</dd></dl>
   <pre class="code">${pretty(rec.response)}</pre>
   <div class="stack"><a class="btn pri block" href="${B}/receipts?tx=${rec.tx}" data-autofocus>View receipt</a><div class="row"><button class="btn sec" type="button" data-a="cp">Copy response</button><button class="btn sec" type="button" data-a="dl">Download</button><a class="btn ghost" href="${SCAN}/tx/${rec.tx}" target="_blank" rel="noopener">View on Basescan</a></div></div>`;
  s.querySelector('[data-a=cp]').onclick = () => { navigator.clipboard?.writeText(rec.response); toast('Copied'); };
  s.querySelector('[data-a=dl]').onclick = () => download(`receipt-${rec.tx.slice(0, 10)}.json`, JSON.stringify(rec, null, 2));
}
function download(name, text, type = 'application/json') { const a = D.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

/* ---------- cards ---------- */
function itemCard(it, best) {
  return `<article class="card" data-item="${it.id}">${best ? '<span class="badge b-ok" style="float:right">Best match</span>' : ''}<div class="mtile"><div class="fav" aria-hidden="true">${esc(it.merchant[0])}</div><div style="min-width:0"><h3 style="font-size:17px;line-height:24px;margin:0">${esc(it.name)}</h3><p class="small muted" style="margin:0">${esc(it.merchant)} · ${esc(it.host)}</p></div></div>
   <p class="price" style="margin:12px 0 4px"><span data-price="${it.id}">${fmtU(it.snap.amount)}</span> USDC <span class="small muted">per call · Base</span></p>
   <p class="small muted" data-meta="${it.id}" style="margin:0 0 12px">${it.read ? 'Checking price…' : `Checked ${ago(Date.parse(SNAP.generatedAt))} ago by our build`}</p>
   <div class="chips" style="margin-bottom:12px"><span class="badge b-ind" title="FindBuyAgent doesn't review merchants. Check the payee before you sign.">Independent merchant</span>${it.payers ? `<span class="badge b-n">${it.payers} payers in 30 days, reported by Coinbase x402 Bazaar</span>` : ''}${it.browser ? '' : '<span class="badge b-n">Pays via findbuyagent.com</span>'}</div>
   <button class="btn ${it.browser ? 'pri' : 'sec'} block" type="button" data-buy="${it.id}">${it.browser ? (W.addr ? `Buy · ${fmtU(it.snap.amount)} USDC` : `Connect wallet to buy · ${fmtU(it.snap.amount)} USDC`) : 'Check price'}</button></article>`;
}
function hydratePrices(items) {
  let i = 0; const run = async () => { while (i < items.length) { const it = items[i++]; if (!it.read) continue; try { const q = await liveQuote(it); const p = $(`[data-price="${it.id}"]`), m = $(`[data-meta="${it.id}"]`); if (p) { p.textContent = fmtU(q.accept.amount); } if (m) m.innerHTML = `<span class="dot pulse" style="color:var(--ok)" aria-hidden="true"></span> Price read live from the merchant · ${q.ms}ms`; } catch { const m = $(`[data-meta="${it.id}"]`); if (m) m.textContent = 'This merchant isn\'t responding right now.'; } } };
  (window.requestIdleCallback || setTimeout)(() => { for (let k = 0; k < 4; k++) run(); });
}
D.addEventListener('click', (e) => { const b = e.target.closest('[data-buy]'); if (!b) return; const it = catalogue().find((x) => x.id === b.dataset.buy); if (!it) return; if (it.browser) buy(it); else checkPrice(it); });
on('wallet', () => $$('[data-buy]').forEach((b) => { const it = catalogue().find((x) => x.id === b.dataset.buy); if (it?.browser) b.textContent = W.addr ? `Buy · ${fmtU(it.snap.amount)} USDC` : `Connect wallet to buy · ${fmtU(it.snap.amount)} USDC`; }));
async function checkPrice(it) {
  const s = sheet(`<h2>Live payment terms</h2><p class="muted small">Read directly from the merchant. Nothing was paid.</p><p class="muted">Reading live prices…</p>`, { label: 'Live payment terms' });
  let q; try { q = await liveQuote(it, true); } catch { s.querySelector('p:last-child').textContent = 'This merchant isn\'t responding right now.'; return; }
  const a = q.accept;
  s.innerHTML = `<h2>Live payment terms</h2><p class="muted small">${q.snapshot ? `Read by our build ${ago(q.at)} ago. This merchant doesn't allow browsers on this site to read its terms directly.` : 'Read directly from the merchant. Nothing was paid.'}</p>
   <dl class="kv"><dt>Price</dt><dd class="num">${fmtU(a.amount)} USDC</dd><dt>Network</dt><dd>Base (eip155:8453)</dd><dt>Asset</dt><dd class="mono">${short(a.asset)}</dd><dt>Payee</dt><dd>${addrHTML(a.payTo)}</dd><dt>Merchant</dt><dd>${esc(it.host)}</dd>${a.maxTimeoutSeconds ? `<dt>Time window</dt><dd>${a.maxTimeoutSeconds}s</dd>` : ''}</dl>
   ${it.browser ? `<button class="btn pri block" type="button" data-a="buy">Buy · ${fmtU(a.amount)} USDC</button>` : `<p class="small muted">Paying this merchant needs the FindBuyAgent server at findbuyagent.com, because it doesn't accept payments sent straight from a browser on this site.</p><a class="btn sec block" href="https://findbuyagent.com/merchants">Open findbuyagent.com</a>`}
   <button class="btn ghost block" type="button" data-a="x" style="margin-top:8px">Close</button>`;
  s.querySelector('[data-a=x]').onclick = closeSheet; s.querySelector('[data-a=buy]')?.addEventListener('click', () => buy(it));
}

/* ---------- search ---------- */
function rank(q) {
  const items = catalogue(); const t = q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !['the', 'and', 'get', 'for', 'one', 'with'].includes(w));
  if (!t.length) return items.sort((a, b) => (b.browser - a.browser));
  return items.map((it) => { const hay = `${it.name} ${it.merchant} ${it.words} ${it.suggestion || ''}`.toLowerCase(); let s = 0; t.forEach((w) => { if (hay.includes(w)) s += 2; else if (hay.includes(w.slice(0, 4))) s += 1; }); if (it.suggestion && it.suggestion.toLowerCase() === q.toLowerCase()) s += 10; return { it, s: s + (it.browser ? 0.5 : 0) }; })
    .filter((x) => x.s >= 1).sort((a, b) => b.s - a.s).map((x) => x.it);
}
// Suggestion chip: run the search and go straight to the confirm sheet for the single best match.
D.addEventListener('click', (e) => { const c = e.target.closest('[data-suggest]'); if (!c) return; e.preventDefault(); const best = rank(c.dataset.suggest)[0]; if (!best) return location.href = `${B}/find?q=${encodeURIComponent(c.dataset.suggest)}`; best.browser ? buy(best) : checkPrice(best); });

/* ---------- pages ---------- */
const page = D.body.dataset.page;
const P = {};
P.home = () => { const items = catalogue().slice(0, 6); const g = $('#live'); if (g) { g.innerHTML = items.map((i) => itemCard(i)).join(''); hydratePrices(items); } };
P.find = () => {
  const f = $('#findform'), inp = $('#q'), out = $('#results'); const qs = new URLSearchParams(location.search).get('q') || ''; inp.value = qs;
  const go = (q) => { const t0 = setTimeout(() => { $('#status').textContent = 'Still reaching merchants…'; }, 3000); const r = rank(q); clearTimeout(t0);
    $('#status').textContent = r.length ? `${r.length} live options` : '';
    out.innerHTML = r.length ? r.map((it, i) => itemCard(it, i === 0 && q)).join('') : `<div class="empty card"><p><strong>Nothing matched that yet.</strong></p><p class="muted">Try one of the suggestions, or browse live merchants.</p><a class="btn pri" href="${B}/merchants">Browse merchants</a></div>`;
    hydratePrices(r.slice(0, 12)); };
  f.addEventListener('submit', (e) => { e.preventDefault(); history.replaceState(null, '', `?q=${encodeURIComponent(inp.value)}`); go(inp.value); }); go(qs);
};
P.merchants = () => { const items = catalogue(); $('#mgrid').innerHTML = items.map((i) => itemCard(i).replace(/<button class="btn (pri|sec) block" type="button" data-buy="([^"]+)">[^<]*<\/button>/, (m, _c, id) => `<div class="row"><button class="btn sec" type="button" data-check="${id}">Check price</button><button class="btn ${S().allow.includes(i.host) ? 'sec' : 'pri'}" type="button" data-allow="${esc(i.host)}" aria-pressed="${S().allow.includes(i.host)}">${S().allow.includes(i.host) ? 'Allowed' : 'Allow'}</button></div>`)).join(''); hydratePrices(items);
  D.addEventListener('click', (e) => { const c = e.target.closest('[data-check]'); if (c) checkPrice(items.find((x) => x.id === c.dataset.check)); const a = e.target.closest('[data-allow]'); if (a) { const host = a.dataset.allow, s = S(); const has = s.allow.includes(host); setS({ allow: has ? s.allow.filter((x) => x !== host) : [...s.allow, host] }); toast(has ? 'Merchant removed' : 'Merchant allowed'); $$(`[data-allow="${host}"]`).forEach((b) => { b.textContent = has ? 'Allow' : 'Allowed'; b.className = `btn ${has ? 'pri' : 'sec'}`; b.setAttribute('aria-pressed', !has); }); } }); };

function limitsUI(root) {
  const draw = () => { const s = S(); const used = usedToday();
    root.innerHTML = `<p class="sub" data-sentence>Up to ${usd(s.perPay)} per payment and ${usd(s.perDay)} per day, to allowed merchants only.</p>
    <div class="grid g2" style="margin-top:20px">
     <div class="card"><h2 style="font-size:20px">Per payment</h2><p class="price">${usd(s.perPay)}</p><div class="chips">${[0.1, 1, 5].map((v) => `<button class="chip" type="button" data-set="perPay" data-v="${v}" aria-pressed="${s.perPay === v}">${usd(v)}</button>`).join('')}</div><label class="f" for="r-pp" style="margin-top:12px">Custom per payment</label><input id="r-pp" type="range" min="0.1" max="${MAX_PAY}" step="0.1" value="${s.perPay}" data-range="perPay"></div>
     <div class="card"><h2 style="font-size:20px">Per day</h2><div class="row"><div class="ring" style="--p:${Math.min(100, used / s.perDay * 100)}"><span>${Math.round(Math.min(100, used / s.perDay * 100))}%</span></div><p class="small">${usd(used)} of ${usd(s.perDay)} used today</p></div><div class="chips">${[1, 5, 20].map((v) => `<button class="chip" type="button" data-set="perDay" data-v="${v}" aria-pressed="${s.perDay === v}">${usd(v)}</button>`).join('')}</div><label class="f" for="r-pd" style="margin-top:12px">Custom per day</label><input id="r-pd" type="range" min="1" max="${MAX_DAY}" step="1" value="${s.perDay}" data-range="perDay"></div>
    </div><p class="small muted">Up to $25 per payment and $100 per day.</p>`;
    const set = (k, v) => { const old = S()[k]; if (v === old) return; if (v > old && !confirm(`Raise your ${k === 'perPay' ? 'per-payment' : 'daily'} limit to ${usd(v)}?`)) return draw(); setS({ [k]: v }); draw(); toast('Limits saved', 'Undo', () => { setS({ [k]: old }); draw(); }); };
    $$('[data-set]', root).forEach((b) => b.onclick = () => set(b.dataset.set, +b.dataset.v));
    $$('[data-range]', root).forEach((r) => { r.oninput = () => { $('[data-sentence]', root).textContent = `Up to ${usd(r.dataset.range === 'perPay' ? +r.value : S().perPay)} per payment and ${usd(r.dataset.range === 'perDay' ? +r.value : S().perDay)} per day, to allowed merchants only.`; }; r.onchange = () => set(r.dataset.range, Math.round(+r.value * 10) / 10); });
  }; draw();
}
function allowUI(root) {
  const draw = () => { const a = S().allow; root.innerHTML = a.length ? `<div class="list">${a.map((h) => `<div><span class="fav" style="width:32px;height:32px" aria-hidden="true">${esc(h[0])}</span><span style="flex:1">${esc(h)}</span><button class="btn ghost sm" type="button" data-rm="${esc(h)}">Remove</button></div>`).join('')}</div><button class="btn danger sm" type="button" data-revoke style="margin-top:12px">Revoke all merchants</button>`
    : `<div class="empty card"><svg viewBox="0 0 120 96" aria-hidden="true"><path d="M60 8 96 22v26c0 22-15 36-36 42C39 84 24 70 24 48V22z" fill="none" stroke="currentColor" stroke-width="3"/><path d="m46 50 10 10 20-22" fill="none" stroke="currentColor" stroke-width="3"/></svg><p><strong>No merchants allowed yet</strong></p><p class="muted">Allow a merchant from the Merchants page and it will appear here.</p><a class="btn pri" href="${B}/merchants">Browse merchants</a></div>`;
    $$('[data-rm]', root).forEach((b) => b.onclick = () => { const old = S().allow; setS({ allow: old.filter((x) => x !== b.dataset.rm) }); draw(); toast('Merchant removed', 'Undo', () => { setS({ allow: old }); draw(); }); });
    $('[data-revoke]', root)?.addEventListener('click', () => { if (confirm('Revoke all merchants?')) { const old = S().allow; setS({ allow: [] }); draw(); toast('Merchant removed', 'Undo', () => { setS({ allow: old }); draw(); }); } }); };
  draw();
}
P.mandates = () => { limitsUI($('#limits')); allowUI($('#allow')); };
P.settings = () => {
  limitsUI($('#limits')); allowUI($('#allow'));
  const ws = () => { $('#wset').innerHTML = W.addr ? `<div><span style="flex:1">${esc(W.info?.name || 'Wallet')} · <span class="mono">${esc(short(W.addr))}</span></span><button class="btn ghost sm" type="button" id="wdis">Disconnect</button></div>` : `<div><span style="flex:1">Not connected</span><button class="btn pri sm" type="button" id="wcon">Connect wallet</button></div>`; $('#wdis')?.addEventListener('click', () => disconnect()); $('#wcon')?.addEventListener('click', connect); }; ws(); on('wallet', ws);
  const s = S(); $$('[name=theme]').forEach((r) => { r.checked = r.value === s.theme; r.onchange = () => { setS({ theme: r.value }); toast('Settings saved'); }; });
  $('#motion').checked = s.motion; $('#motion').onchange = (e) => setS({ motion: e.target.checked });
  $('#dev').checked = s.dev; $('#dev').onchange = (e) => setS({ dev: e.target.checked });
  $('#exp').onclick = () => { download('findbuyagent-receipts.json', JSON.stringify(store.get('receipts', []), null, 2)); toast('Receipts exported'); };
  $('#clr').onclick = () => { if (confirm('Clear all receipts from this browser? Payments on Base are not affected.')) { store.set('receipts', []); toast('Receipts cleared'); } };
  $('#reset').onclick = () => { if (confirm('Reset limits, allowlist and appearance to defaults?')) { const old = S(); store.set('settings', DEF); emit('settings'); location.reload(); } };
  $('#ssearch').oninput = (e) => { const t = e.target.value.toLowerCase(); $$('[data-group]').forEach((g) => g.classList.toggle('hidden', t && !g.textContent.toLowerCase().includes(t))); };
};
P.receipts = async () => {
  const tx = new URLSearchParams(location.search).get('tx');
  if (tx && isTx(tx)) return receiptDetail(tx);
  const root = $('#rlist'); let filter = 'All', q = '';
  const draw = async () => {
    const all = store.get('receipts', []);
    $('#integrity').innerHTML = all.length ? ((await verifyChain(all)) ? '<span class="badge b-ok">✓ Receipt history verified</span>' : '<span class="badge b-bad">Receipt history changed. Export and review.</span>') : '';
    if (!all.length) { root.innerHTML = W.addr ? `<div class="empty card"><p><strong>No payments yet</strong></p><p class="muted">Your receipts appear here after your first purchase.</p><a class="btn pri" href="${B}/find">Make your first purchase</a></div>` : `<div class="empty card"><p><strong>Connect a wallet to start</strong></p><button class="btn pri" type="button" id="wallet2">Connect wallet</button></div>`; $('#wallet2')?.addEventListener('click', connect); $('#totals').textContent = ''; return; }
    const rows = all.filter((r) => (filter === 'All' || r.status === filter) && (!q || `${r.host} ${r.resource} ${r.tx}`.toLowerCase().includes(q)));
    $('#totals').textContent = `${rows.length} payments · ${fmtU(rows.reduce((s, r) => s + Number(r.amount), 0))} USDC`;
    root.innerHTML = `<div class="tablewrap"><table><caption>Receipts stored in this browser</caption><thead><tr><th scope="col">Date</th><th scope="col">Merchant</th><th scope="col">Status</th><th scope="col">Transaction</th><th scope="col" class="r">Amount</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${new Date(r.ts).toLocaleString()}</td><td><a href="${B}/receipts?tx=${r.tx}">${esc(r.host)}</a></td><td><span class="badge ${r.status === 'Confirmed' ? 'b-ok' : r.status === 'Pending' ? 'b-n' : 'b-bad'}">${esc(r.status)}</span></td><td><a class="mono" href="${SCAN}/tx/${r.tx}" target="_blank" rel="noopener">${short(r.tx)}</a></td><td class="r num">${fmtU(r.amount)} USDC</td></tr>`).join('')}</tbody></table></div>`;
  };
  $$('[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f; $$('[data-f]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(); });
  let deb; $('#rsearch').oninput = (e) => { clearTimeout(deb); deb = setTimeout(() => { q = e.target.value.toLowerCase(); draw(); }, 150); };
  $('#rcsv').onclick = () => { const all = store.get('receipts', []); download('findbuyagent-receipts.csv', ['date,merchant,amount_usdc,status,tx,payee,resource', ...all.map((r) => [new Date(r.ts).toISOString(), r.host, Number(r.amount) / 1e6, r.status, r.tx, r.payTo, r.resource].join(','))].join('\n'), 'text/csv'); toast('Receipts exported'); };
  $('#rjson').onclick = () => { download('findbuyagent-receipts.json', JSON.stringify(store.get('receipts', []), null, 2)); toast('Receipts exported'); };
  $('#rrec').onclick = async () => { for (const r of store.get('receipts', [])) { try { const rc = await rpc('eth_getTransactionReceipt', [r.tx]); updateReceipt(r.tx, rc ? { status: rc.status === '0x1' ? 'Confirmed' : 'Failed', block: parseInt(rc.blockNumber, 16) } : { status: 'Not found on Base' }); } catch {} } draw(); toast('Reconciled with Base'); };
  on('receipts', draw); on('wallet', draw); draw();
};
async function receiptDetail(tx) {
  const own = store.get('receipts', []).find((r) => r.tx === tx);
  const root = $('#rmain'); root.innerHTML = `<p class="muted">Reading the transaction from Base…</p>`;
  let rc = null, tip = null, t = null; try { [rc, tip, t] = await Promise.all([rpc('eth_getTransactionReceipt', [tx]), rpc('eth_blockNumber', []), rpc('eth_getTransactionByHash', [tx])]); } catch {}
  if (!rc && !own) { root.innerHTML = `<h1>Receipt</h1><p>Not found on Base.</p>`; return; }
  const conf = rc ? parseInt(tip, 16) - parseInt(rc.blockNumber, 16) + 1 : 0;
  const tlog = rc?.logs?.find((l) => l.address.toLowerCase() === USDC.toLowerCase() && l.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef');
  const xfer = tlog ? { from: '0x' + tlog.topics[1].slice(26), to: '0x' + tlog.topics[2].slice(26), value: BigInt(tlog.data).toString() } : null;
  const shareUrl = `${location.origin}${B}/receipts?tx=${tx}`;
  root.innerHTML = `<p class="micro">${rc ? (rc.status === '0x1' ? `Confirmed on Base · ${conf} confirmations` : 'Failed') : 'Pending'}</p><h1>Receipt</h1>
   <div class="grid g2"><section class="card"><h2 style="font-size:20px">Summary</h2><p class="amount">${xfer ? fmtU(xfer.value) : own ? fmtU(own.amount) : '—'} USDC</p><dl class="kv">${own ? `<dt>Merchant</dt><dd>${esc(own.host)}</dd><dt>Time</dt><dd>${new Date(own.ts).toLocaleString()}</dd>` : ''}<dt>Status</dt><dd>${rc ? (rc.status === '0x1' ? 'Confirmed' : 'Failed') : 'Pending'}</dd></dl></section>
   <section class="card"><h2 style="font-size:20px">Payment</h2><dl class="kv"><dt>Transaction</dt><dd><a class="mono" href="${SCAN}/tx/${tx}" target="_blank" rel="noopener">${short(tx)}</a></dd>${rc ? `<dt>Block</dt><dd class="num">${parseInt(rc.blockNumber, 16)}</dd>` : ''}${xfer ? `<dt>Payer</dt><dd class="mono">${short(xfer.from)}</dd><dt>Payee</dt><dd class="mono">${short(xfer.to)}</dd>` : ''}<dt>USDC contract</dt><dd class="mono">${short(USDC)}</dd>${t ? `<dt>Submitted by</dt><dd class="mono">${short(t.from)}</dd>` : ''}</dl></section></div>
   ${own ? `<section class="card" style="margin-top:16px"><h2 style="font-size:20px">Request</h2><dl class="kv"><dt>Method</dt><dd>GET</dd><dt>Resource</dt><dd>${esc(own.resource)}</dd><dt>Response size</dt><dd>${own.response.length} bytes</dd></dl><pre class="code">${pretty(own.response)}</pre></section>
   <section class="card" style="margin-top:16px"><h2 style="font-size:20px">Proof</h2><pre class="code">${esc(JSON.stringify({ ...own.auth, receiptHash: own.hash, previousHash: own.prev }, null, 2))}</pre></section>` : '<p class="small muted">Read-only view from the Base RPC. Request details are kept only in the payer\'s browser.</p>'}
   <div class="row wrapf" style="margin-top:16px">${own ? `<button class="btn sec" type="button" id="dlr">Download receipt</button><button class="btn sec" type="button" onclick="print()">Print</button>${own.itemId ? `<button class="btn pri" type="button" id="again">Pay again</button>` : ''}` : ''}<button class="btn ghost" type="button" id="share">Share link</button></div>`;
  $('#dlr')?.addEventListener('click', () => download(`receipt-${tx.slice(0, 10)}.json`, JSON.stringify({ ...own, onchain: { block: rc && parseInt(rc.blockNumber, 16), confirmations: conf, transfer: xfer } }, null, 2)));
  $('#again')?.addEventListener('click', () => { const it = catalogue().find((x) => x.id === own.itemId); if (it) buy(it); else location.href = B + '/find'; });
  $('#share').onclick = () => { navigator.clipboard?.writeText(shareUrl); toast('Copied'); };
}
P.security = () => { const f = $('#verify'); f.addEventListener('submit', async (e) => { e.preventDefault(); const v = $('#vtx').value.trim(); const o = $('#vout'); if (!isTx(v)) { o.textContent = 'Enter a 66-character transaction hash.'; return; } o.textContent = 'Checking Base…'; try { const rc = await rpc('eth_getTransactionReceipt', [v]); o.innerHTML = rc ? `${rc.status === '0x1' ? 'Confirmed' : 'Failed'} on Base in block ${parseInt(rc.blockNumber, 16)}. <a href="${B}/receipts?tx=${v}">Open receipt</a>` : 'Not found on Base.'; } catch { o.textContent = 'The Base RPC didn\'t respond. Try again.'; } }); };
P.faq = () => { const s = $('#fsearch'); s.oninput = () => { const t = s.value.trim().toLowerCase(); $$('.faq-item').forEach((el) => { const txt = el.dataset.t; el.classList.toggle('hidden', !!t && !txt.includes(t)); }); }; };
P.blog = () => { const s = $('#bsearch'); if (s) s.oninput = () => { const t = s.value.trim().toLowerCase(); $$('[data-post]').forEach((el) => el.classList.toggle('hidden', !!t && !el.dataset.post.includes(t))); }; };
P.post = () => { const bar = $('.progress'); const upd = () => { const a = $('article.prose'); if (!a) return; const r = a.getBoundingClientRect(); bar.style.width = Math.min(100, Math.max(0, (-r.top) / (r.height - innerHeight) * 100)) + '%'; }; addEventListener('scroll', upd, { passive: true }); };
P.protocols = () => {
  const tabs = $$('[role=tab]'); const sel = (t) => { tabs.forEach((x) => { const on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; $('#' + x.getAttribute('aria-controls')).hidden = !on; }); };
  tabs.forEach((t, i) => { t.onclick = () => sel(t); t.onkeydown = (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; sel(n); n.focus(); } }; });
  const h = location.hash.slice(1); const t = tabs.find((x) => x.id === 'tab-' + h); if (t) sel(t);
  $('#inspect').addEventListener('submit', async (e) => { e.preventDefault(); const u = $('#iurl').value.trim(); const o = $('#iout'); o.textContent = 'Reading terms…';
    try { const r = await fetch(u, { signal: AbortSignal.timeout(6000) }); if (r.status !== 402) { o.textContent = `That URL answered ${r.status}, not 402.`; return; } let pr = null; const hd = r.headers.get('payment-required'); if (hd) pr = JSON.parse(atob(hd)); else pr = await r.json(); const a = (pr.accepts || [])[0]; o.innerHTML = `<pre class="code">${esc(JSON.stringify({ price: a && fmtU(a.amount) + ' (atomic ' + a.amount + ')', network: a?.network, asset: a?.asset, payTo: a?.payTo, timeout: a?.maxTimeoutSeconds }, null, 2))}</pre><p class="small muted">Read only. Nothing was paid.</p>`; }
    catch { o.innerHTML = 'Host not supported from this site: it doesn\'t let browsers read its terms (CORS). <a href="https://github.com/Blockchains/findbuyagent/issues/new" rel="noopener">Request it</a>.'; } });
};
P.compare = () => { const b = $('#nc'); b?.addEventListener('click', () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); $$('tr[data-nc]').forEach((r) => r.classList.toggle('hidden', on && r.dataset.nc !== '1')); }); };
P.shop = () => window.FBAShop?.(api);
P.budget = () => window.FBABudget?.(api);
const api = { $, $$, esc, h, store, toast, sheet, closeSheet, usd, ago, B, W, connect, fmtU, short, on, emit };
window.FBA = api;
(P[page] || (() => {}))();
})();
