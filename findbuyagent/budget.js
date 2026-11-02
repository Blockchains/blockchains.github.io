/* /budget: an agent budget the user grants once (Base Spend Permission). The agent server spends within it, with no further prompts.
   This static build has no agent server, so granting, autonomous buying and email show their honest "needs the agent server" state. */
window.FBABudget = (F) => {
  const { $, $$, esc, store, toast, sheet, closeSheet, usd, ago, W, connect, on } = F;
  const AGENT = document.documentElement.dataset.agent || '';
  const SPM = '0xf85210B21cC50302F477BA56686d2019dC9b67Ad', USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const SELL = JSON.parse($('#sellers')?.textContent || '{"sellers":[]}');
  const CATS = { image: ['Image generation', /image|picture|photo|art|logo|illustrat|draw|render|poster|cover/i], leads: ['Leads and business data', /lead|prospect|contact|compan|business|b2b|enrich|sales|crm/i] };
  const D = { total: 25, per: 5, daily: 10, days: 7, cats: ['image', 'leads'], email: '', emailRaw: true };
  const cfg = () => ({ ...D, ...store.get('budget.cfg', {}) });
  const setCfg = (c) => store.set('budget.cfg', c);
  const host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return u; } };
  const ago2 = (iso) => ago(new Date(iso).getTime());

  /* ---------- setup ---------- */
  function drawSetup() {
    const c = cfg();
    $('#bsetup').innerHTML = `<div class="stack">
      ${slider('total', 'Budget', 1, 100, 1, c.total, 'Default $25, up to $100.')}
      ${slider('per', 'Per purchase', 0.01, Math.min(25, c.total), 0.01, Math.min(c.per, c.total))}
      ${slider('daily', 'Per day', 0.01, c.total, 0.01, Math.min(c.daily, c.total))}
      <div><label class="f" for="b-days">Ends after</label><select id="b-days">${[1, 7, 30].map((d) => `<option value="${d}"${d === c.days ? ' selected' : ''}>${d} day${d > 1 ? 's' : ''}</option>`).join('')}</select></div>
      <fieldset style="border:0;padding:0;margin:0"><legend class="f">What it may buy</legend><div class="chips">${Object.entries(CATS).map(([k, [l]]) => `<label class="chip"><input type="checkbox" data-cat="${k}"${c.cats.includes(k) ? ' checked' : ''}> ${l}</label>`).join('')}</div>
      <p class="small muted">${SELL.sellers.filter((s) => c.cats.includes(s.cat)).length} live sellers allowed. Only these merchants can be paid.</p></fieldset>
      <div><label class="f" for="b-email">Email deliveries to</label><input id="b-email" type="email" autocomplete="email" value="${esc(c.email)}" placeholder="you@yourdomain.com">
      <label class="row small" style="margin-top:8px"><input type="checkbox" id="b-raw"${c.emailRaw ? ' checked' : ''}> Email everything I buy in full, including API keys and data files</label>
      <p class="small muted" id="b-rawnote">${c.emailRaw ? 'Email isn\'t encrypted end to end. Anyone who reads this inbox can use the keys and data.' : 'Emails will include the item, merchant, amount and transaction link, with the full data kept on this site.'}</p></div>
      <div class="notice" role="note"><strong>This money can be spent without asking you.</strong> Up to ${usd(c.total)} over ${c.days} day${c.days > 1 ? 's' : ''}, at most ${usd(c.per)} per purchase and ${usd(c.daily)} a day. On-chain payments are final. Only use money you can afford to lose.</div>
      <button class="btn pri lg block" type="button" id="b-grant">Grant ${usd(c.total)} budget · one signature</button>
      <p class="small muted" style="text-align:center;margin:0">Revoke anytime with one click. Funds stay in your wallet until the agent spends them.</p></div>`;
    $$('#bsetup input[type=range]').forEach((r) => r.oninput = () => { const v = +r.value; const k = r.dataset.k; const n = { ...cfg(), [k]: v }; if (k === 'total') { n.per = Math.min(n.per, v); n.daily = Math.min(n.daily, v); } setCfg(n); r.nextElementSibling.textContent = usd(v); if (k === 'total') drawSetup(); else refreshNotice(); });
    $('#b-days').onchange = (e) => { setCfg({ ...cfg(), days: +e.target.value }); drawSetup(); };
    $$('[data-cat]').forEach((x) => x.onchange = () => { setCfg({ ...cfg(), cats: $$('[data-cat]').filter((y) => y.checked).map((y) => y.dataset.cat) }); drawSetup(); });
    $('#b-email').onchange = (e) => setCfg({ ...cfg(), email: e.target.value.trim() });
    $('#b-raw').onchange = (e) => { setCfg({ ...cfg(), emailRaw: e.target.checked }); drawSetup(); };
    $('#b-grant').onclick = grant;
  }
  const px = (n) => (n > 0 && n < 0.1) ? '$' + (+n).toFixed(3).replace(/0$/, '') : usd(n);
  const slider = (k, l, mn, mx, st, v, hint = '') => `<div><label class="f" for="b-${k}">${l}</label><div class="row"><input id="b-${k}" data-k="${k}" type="range" min="${mn}" max="${mx}" step="${st}" value="${v}" style="flex:1"><output class="num" for="b-${k}" style="min-width:72px;text-align:right">${usd(v)}</output></div>${hint ? `<p class="small muted" style="margin:0">${hint}</p>` : ''}</div>`;
  function refreshNotice() { const c = cfg(); const n = $('#bsetup .notice'); if (n) n.innerHTML = `<strong>This money can be spent without asking you.</strong> Up to ${usd(c.total)} over ${c.days} day${c.days > 1 ? 's' : ''}, at most ${usd(c.per)} per purchase and ${usd(c.daily)} a day. On-chain payments are final. Only use money you can afford to lose.`; }

  /* The exact Base Spend Permission the user would sign: one period covering the whole budget, so the contract itself caps the total. */
  function permission(account, spender) {
    const c = cfg(), start = Math.floor(Date.now() / 1000), end = start + c.days * 86400;
    return { account, spender, token: USDC, allowance: String(Math.round(c.total * 1e6)), period: end - start, start, end, salt: '0x' + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join(''), extraData: '0x' };
  }
  async function grant() {
    const c = cfg();
    if (!AGENT) {
      const p = permission(W.addr || '(your Base Account)', '(FindBuyAgent agent address)');
      sheet(`<p class="micro">Agent budget</p><h2>This needs the agent server</h2>
        <p>Spending without asking needs an agent that's always online to find sellers, pay and email you. That agent runs on the FindBuyAgent server, not on this GitHub Pages site, so nothing has been signed and no budget exists.</p>
        <p class="small muted">When it's live on findbuyagent.com, your wallet will show one signature for this Base Spend Permission. The contract caps the total; the agent server enforces the per-purchase, daily and merchant limits before every payment.</p>
        <dl class="kv"><dt>Contract</dt><dd class="mono small">SpendPermissionManager ${SPM.slice(0, 10)}…${SPM.slice(-4)}</dd><dt>Token</dt><dd>USDC on Base</dd><dt>Total</dt><dd>${usd(c.total)}</dd><dt>Per purchase</dt><dd>${usd(c.per)}</dd><dt>Per day</dt><dd>${usd(c.daily)}</dd><dt>Ends</dt><dd>${new Date(p.end * 1000).toLocaleString()}</dd><dt>Merchants</dt><dd>${SELL.sellers.filter((s) => c.cats.includes(s.cat)).length} allowed</dd></dl>
        <details><summary class="small">Permission data</summary><pre class="code small">${esc(JSON.stringify(p, null, 1))}</pre></details>
        <p class="small muted">Spend Permissions need a Base Account (Coinbase Smart Wallet). Wallets like MetaMask can't grant them.</p>
        <div class="stack" style="margin-top:12px"><a class="btn pri block" href="https://findbuyagent.com/budget" rel="noopener">Open findbuyagent.com</a><button class="btn ghost block" type="button" id="g-x">Close</button></div>`, { label: 'Agent budget' });
      $('#g-x').onclick = closeSheet; return;
    }
    if (!W.addr && !(await connect())) return;
    try {
      const info = await (await fetch(`${AGENT}/v1/agent`)).json();
      const p = permission(W.addr, info.spender);
      const typed = { types: { EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }], SpendPermission: [['account', 'address'], ['spender', 'address'], ['token', 'address'], ['allowance', 'uint160'], ['period', 'uint48'], ['start', 'uint48'], ['end', 'uint48'], ['salt', 'uint256'], ['extraData', 'bytes']].map(([name, type]) => ({ name, type })) }, primaryType: 'SpendPermission', domain: { name: 'Spend Permission Manager', version: '1', chainId: 8453, verifyingContract: SPM }, message: { ...p, salt: BigInt(p.salt).toString() } };
      const signature = await W.p.request({ method: 'eth_signTypedData_v4', params: [W.addr, JSON.stringify(typed)] });
      const r = await fetch(`${AGENT}/v1/budget`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ permission: p, signature, rules: { per: c.per, daily: c.daily, cats: c.cats, merchants: SELL.sellers.filter((s) => c.cats.includes(s.cat)).map((s) => s.url) }, email: c.email, emailRaw: c.emailRaw }) });
      if (!r.ok) throw new Error('The agent server refused the budget.');
      toast('Budget granted'); drawLedger();
    } catch (e) { toast(e?.code === 4001 ? 'Signature cancelled. No budget was granted.' : (e.message || 'Something went wrong. Nothing was spent.')); }
  }

  /* ---------- requests: match real sellers only ---------- */
  function plan(text) {
    const c = cfg(); const cat = Object.entries(CATS).find(([, [, re]]) => re.test(text))?.[0];
    const keyNote = /\bkeys?\b/i.test(text) && cat === 'image' ? '<p class="small muted">x402 image sellers charge per image; none sells reusable API keys. Your agent buys the images themselves, paid one by one from your budget.</p>' : '';
    if (!cat) return { none: true, why: 'No live seller found for that yet.' };
    const fits = SELL.sellers.filter((s) => s.cat === cat).sort((a, b) => a.usd - b.usd);
    if (!fits.length) return { none: true, why: 'No live seller found for that yet.' };
    if (!c.cats.includes(cat)) return { none: true, why: `${CATS[cat][0]} isn't allowed in your budget. Turn it on above.`, fits };
    const ok = fits.filter((s) => s.usd <= c.per);
    if (!ok.length) return { none: true, why: `The cheapest seller is ${px(fits[0].usd)}, above your ${usd(c.per)} per-purchase cap.`, fits };
    return { pick: ok[0], fits: ok, cat, keyNote };
  }
  async function livePrice(s) {
    if (!s.cors) return null;
    try { const r = await fetch(s.url, { method: s.method === 'POST' ? 'POST' : 'GET', headers: s.method === 'POST' ? { 'content-type': 'application/json' } : {}, body: s.method === 'POST' ? '{}' : undefined, signal: AbortSignal.timeout(6000) });
      const h = r.headers.get('payment-required'); const j = h ? JSON.parse(atob(h)) : await r.json().catch(() => null); const a = j?.accepts?.find((x) => x.network === 'eip155:8453'); return a ? +a.amount / 1e6 : null; } catch { return null; }
  }
  async function ask(e) {
    e?.preventDefault(); const q = $('#breq').value.trim(); if (!q) return; const out = $('#bplan'); const p = plan(q);
    if (p.none) { out.innerHTML = `<div class="card"><h3 style="margin-top:0">No live seller found</h3><p class="muted">${esc(p.why)}</p><button class="btn sec" type="button" id="bw">Watch for a seller</button></div>`;
      $('#bw').onclick = () => { const w = store.get('budget.watch', []); w.unshift({ q, t: Date.now() }); store.set('budget.watch', w.slice(0, 50)); toast('Watching. Checked each time you open this page.'); drawWatch(); }; return; }
    out.innerHTML = `<div class="card"><p class="micro">Your agent would buy</p><div class="row between wrapf"><h3 style="margin:0">${esc(p.pick.host)}</h3><span class="price num" id="bpx">${px(p.pick.usd)}</span></div><p class="small muted">${esc(p.pick.desc)}</p><p class="small muted" id="bsrc">Price read by our build ${ago2(SELL.generatedAt)} ago.</p>${p.keyNote}
      <p class="small">Cheapest of ${p.fits.length} live seller${p.fits.length > 1 ? 's' : ''} within your ${usd(cfg().per)} cap. <span class="badge b-ind">Independent merchant</span></p>
      <button class="btn pri block" type="button" id="bgo">${AGENT ? 'Send to agent' : 'Send to agent · needs the agent server'}</button>
      <details style="margin-top:8px"><summary class="small">Other sellers</summary><div class="list">${p.fits.slice(1).map((s) => `<div><span style="flex:1" class="small">${esc(s.host)}</span><span class="num small">${px(s.usd)}</span></div>`).join('') || '<div class="small muted">None</div>'}</div></details></div>`;
    livePrice(p.pick).then((v) => { if (v != null && $('#bpx')) { $('#bpx').textContent = px(v); $('#bsrc').textContent = 'Price read live from the merchant just now.'; } });
    $('#bgo').onclick = async () => {
      if (!AGENT) return toast('Autonomous buying runs on the FindBuyAgent server. Nothing was bought.');
      const r = await fetch(`${AGENT}/v1/requests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: W.addr, text: q }) }); toast(r.ok ? 'Sent. Your agent is buying it.' : 'The agent server refused the request.'); drawLedger();
    };
  }
  function drawWatch() { const w = store.get('budget.watch', []); $('#bwatch').innerHTML = w.length ? `<h3 style="font-size:16px">Watching</h3><div class="list">${w.map((x, i) => `<div><span style="flex:1" class="small">${esc(x.q)}</span>${plan(x.q).pick ? '<span class="badge b-ok">Seller found</span>' : '<span class="badge b-n">No seller yet</span>'}<button class="btn ghost sm" type="button" data-unw="${i}">Stop</button></div>`).join('')}</div>` : '';
    $$('[data-unw]').forEach((b) => b.onclick = () => { const a = store.get('budget.watch', []); a.splice(+b.dataset.unw, 1); store.set('budget.watch', a); drawWatch(); }); }

  /* ---------- ledger ---------- */
  async function drawLedger() {
    const el = $('#bledger');
    if (!AGENT) { el.innerHTML = `<div class="card"><div class="row between"><h3 style="margin:0">No budget granted</h3><span class="badge b-n">Agent server off</span></div><p class="muted small">Budget left, every spend with its Basescan link, pause and revoke appear here once a budget is granted on findbuyagent.com.</p><div class="meter" aria-hidden="true"><span style="width:0"></span></div></div>`; return; }
    if (!W.addr) { el.innerHTML = '<p class="muted small">Connect your wallet to see your budget.</p>'; return; }
    try {
      const L = await (await fetch(`${AGENT}/v1/ledger?account=${W.addr}`)).json();
      if (!L.budget) { el.innerHTML = '<div class="card"><h3 style="margin-top:0">No budget granted</h3></div>'; return; }
      const used = L.spends.reduce((s, x) => s + x.usd, 0), pct = Math.min(100, (used / L.budget.total) * 100);
      el.innerHTML = `<div class="card"><div class="row between wrapf"><div><p class="micro">Budget left</p><p class="amount" style="margin:0">${usd(L.budget.total - used)}</p></div><span class="badge ${L.budget.paused ? 'b-n' : 'b-ok'}">${L.budget.paused ? 'Paused' : 'Active'}</span></div>
        <div class="meter" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100" aria-label="Budget used"><span style="width:${pct}%"></span></div>
        ${pct >= 80 ? `<p class="notice" role="alert">${Math.round(pct)}% of your budget is used.</p>` : ''}<p class="small muted">${usd(used)} of ${usd(L.budget.total)} used · ends ${new Date(L.budget.end * 1000).toLocaleDateString()}</p>
        <div class="row"><button class="btn sec" type="button" id="bpause">${L.budget.paused ? 'Resume' : 'Pause'}</button><button class="btn danger" type="button" id="brevoke">Revoke</button></div></div>
        <div class="list" style="margin-top:12px">${L.spends.map((x) => `<div><span style="flex:1"><strong>${esc(x.merchant)}</strong><br><span class="small muted">${esc(x.item)} · ${ago2(x.at)} ago</span></span><span class="num">${px(x.usd)}</span><a class="small" href="https://basescan.org/tx/${esc(x.tx)}" target="_blank" rel="noopener">Basescan</a></div>`).join('') || '<div class="small muted">No spends yet.</div>'}</div>`;
      $('#bpause').onclick = async () => { await fetch(`${AGENT}/v1/budget/pause`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: W.addr, paused: !L.budget.paused }) }); drawLedger(); };
      $('#brevoke').onclick = async () => { try { const { calls } = await (await fetch(`${AGENT}/v1/budget/revoke-calls?account=${W.addr}`)).json(); for (const c of calls) await W.p.request({ method: 'eth_sendTransaction', params: [{ from: W.addr, to: c.to, data: c.data, value: '0x0' }] }); toast('Budget revoked'); drawLedger(); } catch (e) { toast(e?.code === 4001 ? 'Revoke cancelled. The budget is still active.' : 'Revoke failed. Try again.'); } };
      await syncDeliveries(L.deliveries || []);
    } catch { el.innerHTML = '<p class="notice">The agent server didn\'t respond. Nothing is spent while it\'s offline.</p>'; }
  }

  /* ---------- deliveries: kept only in this browser, encrypted with a key from one wallet signature ---------- */
  let KEY = null;
  async function vaultKey() { if (KEY) return KEY; const sig = await W.p.request({ method: 'personal_sign', params: ['0x' + [...new TextEncoder().encode('FindBuyAgent deliveries key v1. This signature only unlocks deliveries in this browser.')].map((b) => b.toString(16).padStart(2, '0')).join(''), W.addr] });
    const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sig)); return (KEY = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])); }
  const b64 = (u) => btoa(String.fromCharCode(...new Uint8Array(u))), unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function seal(obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); return { iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await vaultKey(), new TextEncoder().encode(JSON.stringify(obj)))) }; }
  async function open(b) { return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(b.iv) }, await vaultKey(), unb64(b.ct)))); }
  async function syncDeliveries(list) { const have = store.get('deliveries', []); const ids = new Set(have.map((d) => d.id)); for (const d of list) if (!ids.has(d.id)) have.unshift({ id: d.id, at: d.at, merchant: d.merchant, item: d.item, usd: d.usd, tx: d.tx, box: await seal(d.payload) }); store.set('deliveries', have); drawDeliveries(); }
  function drawDeliveries() {
    const all = store.get('deliveries', []);
    $('#bdeliv').innerHTML = all.length ? all.map((d) => `<article class="card" data-d="${esc(d.id)}"><div class="row between wrapf"><strong>${esc(d.item)}</strong><span class="num">${px(d.usd)}</span></div><p class="small muted">${esc(d.merchant)} · ${ago2(d.at)} ago · <a href="https://basescan.org/tx/${esc(d.tx)}" target="_blank" rel="noopener">Basescan</a></p><div class="dv mono small">•••• locked</div><div class="row"><button class="btn sec sm" type="button" data-rv="${esc(d.id)}">Reveal</button><button class="btn ghost sm" type="button" data-cp="${esc(d.id)}">Copy</button><button class="btn ghost sm" type="button" data-dl="${esc(d.id)}">Download</button></div></article>`).join('')
      : `<div class="empty card"><p><strong>Nothing delivered yet</strong></p><p class="muted small">Images, keys, lead lists and API responses your agent buys appear here, encrypted in this browser, and in your email if you added one.</p></div>`;
    const get = async (id) => open(store.get('deliveries', []).find((x) => x.id === id).box);
    $$('[data-rv]').forEach((b) => b.onclick = async () => { const p = await get(b.dataset.rv); const v = b.closest('article').querySelector('.dv'); v.innerHTML = p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.label || 'Delivered image')}" style="max-width:100%;border-radius:12px">` : `<pre class="code">${esc(typeof p.body === 'string' ? p.body : JSON.stringify(p.body, null, 1)).slice(0, 20000)}</pre>`; });
    $$('[data-cp]').forEach((b) => b.onclick = async () => { const p = await get(b.dataset.cp); await navigator.clipboard.writeText(p.secret || p.imageUrl || (typeof p.body === 'string' ? p.body : JSON.stringify(p.body))); toast('Copied'); });
    $$('[data-dl]').forEach((b) => b.onclick = async () => { const p = await get(b.dataset.dl); const blob = new Blob([p.csv || (typeof p.body === 'string' ? p.body : JSON.stringify(p.body, null, 1))], { type: p.csv ? 'text/csv' : 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `delivery-${b.dataset.dl}.${p.csv ? 'csv' : 'json'}`; a.click(); });
  }
  $('#bform').addEventListener('submit', ask);
  $$('[data-breq]').forEach((b) => b.onclick = () => { $('#breq').value = b.dataset.breq; ask(); });
  $('#bemailstate').textContent = AGENT ? '' : 'Email delivery is sent by the FindBuyAgent server. This GitHub Pages site can\'t send email, so nothing is emailed from here.';
  drawSetup(); drawLedger(); drawDeliveries(); drawWatch(); on('wallet', drawLedger);
};
