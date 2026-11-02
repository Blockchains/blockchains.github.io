/* /budget: a one-time burner wallet run by GitHub Actions (Blockchains/findbuyagent-runner). No FindBuyAgent server.
   This page only builds GitHub issues for the runner, reads Base directly, and sends your one deposit from your own wallet. */
window.FBABudget = (F) => {
  const { $, $$, esc, store, toast, usd, W, connect, on, switchBase } = F;
  const RUNNER = 'Blockchains/findbuyagent-runner', GH = `https://github.com/${RUNNER}`;
  const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', LOGRPC = 'https://base-rpc.publicnode.com', RPC = 'https://mainnet.base.org';
  const TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const D = { total: 5, per: 0.05, daily: 1, days: 7, sweepTo: '' };
  const cfg = () => ({ ...D, ...store.get('burner.cfg', {}) }), setCfg = (c) => store.set('burner.cfg', c);
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a || '');
  const px = (n) => (n > 0 && n < 0.1) ? '$' + (+n).toFixed(3).replace(/0$/, '') : usd(n);
  const issueURL = (title, label, json, note = '') => `${GH}/issues/new?${new URLSearchParams({ title, labels: label, body: `${note}\n\n\`\`\`json\n${JSON.stringify(json, null, 1)}\n\`\`\`\n` })}`;

  /* ---------- burner from link (#b=..&a=..) or saved ---------- */
  const PEND = () => { const q = new URLSearchParams(location.search); if (q.get('want')) { const v = { want: q.get('want'), seller: q.get('seller') || '' }; try { localStorage.setItem('fba.pendingBuy', JSON.stringify(v)); } catch {} return v; } try { return JSON.parse(localStorage.getItem('fba.pendingBuy') || '{}'); } catch { return {}; } };
  { const q = PEND(); const h = document.querySelector('.hero .wrap'); if (q.want && new URLSearchParams(location.search).get('want') && h) { const n = document.createElement('p'); n.className = 'note'; n.textContent = `Ready to buy: ${q.want.slice(0, 120)}. It is filled in under "Buy something" once your budget is open.`; h.appendChild(n); } }
  const hp = new URLSearchParams(location.hash.slice(1));
  if (hp.get('b') && isAddr(hp.get('a'))) {
    store.set('burner', { id: hp.get('b'), address: hp.get('a'), blk: +hp.get('blk') || 0, sweepTo: hp.get('to') || '', total: +hp.get('total'), per: +hp.get('per'), daily: +hp.get('daily'), ends: hp.get('ends') || '' });
    if (hp.get('sweep')) store.set('burner.sweep', hp.get('sweep'));
    history.replaceState(null, '', location.pathname);
  }
  const B = () => store.get('burner', null);

  /* ---------- vault key: X25519 secret = sha256(wallet signature of a fixed message). Never stored; derived again on each sign-in. ---------- */
  const VMSG = (a) => `FindBuyAgent vault v1\n\nWallet: ${a.toLowerCase()}\n\nSigning creates the key that unlocks your purchase receipts. It does not move funds or approve anything.`;
  const hex = (u8) => [...u8].map((x) => x.toString(16).padStart(2, '0')).join('');
  async function vaultKey() {
    if (!W.addr && !(await connect())) return null;
    const code = await rpc(RPC, 'eth_getCode', [W.addr, 'latest']).catch(() => '0x');
    if (code && code !== '0x') { toast('This is a smart-contract wallet. Its signatures change each time, so it cannot hold a vault key. Use MetaMask, Rabby or Coinbase Wallet (extension or app), or rely on email receipts.'); return null; }
    const msg = VMSG(W.addr), data = '0x' + hex(new TextEncoder().encode(msg));
    const sig = await W.p.request({ method: 'personal_sign', params: [data, W.addr] });
    const seed = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(sig.slice(2).match(/../g).map((x) => parseInt(x, 16)))));
    const kp = window.nacl.box.keyPair.fromSecretKey(seed);
    store.set('vault.pub.' + W.addr.toLowerCase(), hex(kp.publicKey));
    return { owner: W.addr.toLowerCase(), pub: hex(kp.publicKey), secret: kp.secretKey };
  }

  /* ---------- 1. rules ---------- */
  function drawSetup() {
    const c = cfg();
    $('#bsetup').innerHTML = `<div class="stack">
      ${num('total', 'Total budget', 1, 100, 1, c.total, 'Hard cap $100. Deposit no more than this.')}
      ${num('per', 'Per purchase', 0.001, Math.min(25, c.total), 0.001, Math.min(c.per, c.total))}
      ${num('daily', 'Per day', 0.01, c.total, 0.01, Math.min(c.daily, c.total))}
      <div><label class="f" for="b-days">Ends after</label><select id="b-days">${[1, 7, 30].map((d) => `<option value="${d}"${d === c.days ? ' selected' : ''}>${d} day${d > 1 ? 's' : ''}</option>`).join('')}</select></div>
      <div><label class="f" for="b-to">Return leftovers to</label><input id="b-to" class="mono" autocomplete="off" spellcheck="false" value="${esc(c.sweepTo)}" placeholder="Your connected wallet"><p class="small muted" style="margin:4px 0 0">Leave empty to use the wallet you connect.</p></div>
      <div class="notice" role="note"><strong>High risk: the burner's money is exposed.</strong> The burner is a hot wallet whose key lives inside GitHub Actions runs. It finds and pays any live x402 seller on Base without asking you, up to ${px(c.per)} each, ${usd(c.daily)} a day and ${usd(c.total)} in total, until it ends after ${c.days} day${c.days > 1 ? 's' : ''}. Sellers are not vetted by anyone. On-chain payments are final. Deposit only what you can afford to lose.</div>
      <button class="btn pri lg block" type="button" id="b-open">Connect wallet and create burner</button>
      <p class="small muted" style="margin:0">Your wallet signs one message (no funds move) to make the key that locks your receipts, then a prefilled issue opens in the private <a href="${GH}" rel="noopener">${RUNNER}</a> repo. Submit it while signed in to GitHub as the owner. The runner replies within a few minutes with your burner and a link back here.</p></div>`;
    $$('#bsetup input[type=number]').forEach((r) => r.onchange = () => { const k = r.dataset.k, v = Math.max(+r.min, Math.min(+r.max, +r.value || 0)); const x = { ...cfg(), [k]: v }; if (k === 'total') { x.per = Math.min(x.per, v); x.daily = Math.min(x.daily, v); } setCfg(x); drawSetup(); });
    $('#b-days').onchange = (e) => { setCfg({ ...cfg(), days: +e.target.value }); drawSetup(); };
    $('#b-to').onchange = (e) => setCfg({ ...cfg(), sweepTo: e.target.value.trim() });
    $('#b-open').onclick = async () => {
      const c = cfg(); if (c.sweepTo && !isAddr(c.sweepTo)) return toast('The return address must be a Base address (0x…).');
      const w = window.open('', '_blank'); // opened on the tap so pop-up blockers allow it
      let v; try { v = await vaultKey(); } catch (e) { v = null; toast(e?.code === 4001 ? 'Signature cancelled.' : 'Your wallet could not sign.'); }
      if (!v) { w?.close(); return; }
      const sweepTo = c.sweepTo || W.addr; setCfg({ ...c, sweepTo });
      const url = issueURL(`Budget: ${usd(c.total)} for ${c.days} day${c.days > 1 ? 's' : ''}`, 'fba-open', { total: c.total, per: c.per, daily: c.daily, days: c.days, sweepTo, vault: { owner: v.owner, pub: v.pub } }, 'Burner budget rules. Press Submit new issue; the runner replies with the burner address.');
      if (w) w.location = url; else location.href = url;
    };
  }
  const num = (k, l, mn, mx, st, v, hint = '') => `<div><label class="f" for="b-${k}">${l} (USDC)</label><input id="b-${k}" data-k="${k}" type="number" inputmode="decimal" min="${mn}" max="${mx}" step="${st}" value="${v}">${hint ? `<p class="small muted" style="margin:4px 0 0">${hint}</p>` : ''}</div>`;

  /* ---------- chain reads ---------- */
  const rpc = async (url, method, params) => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result; };
  const pad = (a) => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const bal = async (a) => Number(BigInt(await rpc(RPC, 'eth_call', [{ to: USDC, data: '0x70a08231' + pad(a).slice(2) }, 'latest']))) / 1e6;
  async function transfers(b) {
    const head = parseInt(await rpc(LOGRPC, 'eth_blockNumber', []), 16); let from = b.blk || head - 49000; const out = [];
    for (let i = 0; from <= head && i < 30; i++, from += 49000) {
      const to = Math.min(head, from + 48999), rng = { fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16), address: USDC };
      for (const topics of [[TOPIC, pad(b.address)], [TOPIC, null, pad(b.address)]]) for (const l of await rpc(LOGRPC, 'eth_getLogs', [{ ...rng, topics }])) out.push({ tx: l.transactionHash, block: parseInt(l.blockNumber, 16), from: '0x' + l.topics[1].slice(26), to: '0x' + l.topics[2].slice(26), usd: Number(BigInt(l.data)) / 1e6 });
    }
    return out.sort((x, y) => y.block - x.block);
  }

  /* ---------- 2. burner + deposit ---------- */
  async function drawBurner() {
    const b = B(), el = $('#bburner');
    if (!b) { el.innerHTML = `<p class="muted">No burner yet. Create one with the rules on the left, then open the link the runner posts, or paste it here.</p><div class="row"><input id="b-paste" class="mono" placeholder="Paste the runner's link" style="flex:1"><button class="btn sec sm" id="b-load" type="button">Load</button></div>`; $('#b-load').onclick = () => { try { location.hash = new URL($('#b-paste').value.trim()).hash; location.reload(); } catch { toast('That is not the runner\'s link.'); } }; return; }
    const qr = window.qrcode ? (() => { const q = window.qrcode(0, 'M'); q.addData(`ethereum:${USDC}@8453/transfer?address=${b.address}`); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); })() : '';
    el.innerHTML = `<div class="row wrapf" style="gap:16px;align-items:flex-start"><div style="width:168px;background:#fff;border-radius:12px;padding:4px" aria-label="QR code: send USDC on Base to the burner">${qr}</div>
      <div class="stack" style="flex:1;min-width:220px"><p class="micro" style="margin:0">Burner ${esc(b.id)} · USDC on Base only</p><p class="mono" style="word-break:break-all;margin:0">${esc(b.address)}</p>
      <div class="row"><button class="btn sec sm" type="button" id="b-copy">Copy address</button><a class="btn ghost sm" href="https://basescan.org/address/${esc(b.address)}" target="_blank" rel="noopener">Basescan</a><a class="btn ghost sm" href="${GH}/issues/${esc(b.id)}" target="_blank" rel="noopener">GitHub thread</a></div>
      <p class="small" id="b-bal">Reading balance…</p></div></div>
      <div class="notice" role="note" style="margin-top:12px"><strong>Funds here are exposed.</strong> Send only USDC on Base, at most ${usd(b.total)}. The runner spends it without asking you, within ${px(b.per)} per purchase and ${usd(b.daily)} a day${b.ends ? `, until ${esc(new Date(b.ends).toLocaleString())}` : ''}. Leftovers return to <span class="mono">${esc(b.sweepTo.slice(0, 8))}…${esc(b.sweepTo.slice(-4))}</span> when you close it or it ends.</div>
      <div class="row" style="margin-top:12px"><label class="hidden" for="b-amt">Deposit amount</label><input id="b-amt" type="number" inputmode="decimal" min="0.01" max="${b.total}" step="0.01" value="${Math.min(b.total, 1)}" style="width:120px"><button class="btn pri" type="button" id="b-dep">Deposit from my wallet</button></div>
      <p class="small muted">This is your only signature: a normal USDC transfer from your wallet to the burner.</p>`;
    $('#b-copy').onclick = async () => { await navigator.clipboard.writeText(b.address); toast('Address copied'); };
    $('#b-dep').onclick = () => deposit(b);
    try { $('#b-bal').innerHTML = `Balance <strong class="num">${px(await bal(b.address))}</strong> USDC`; } catch { $('#b-bal').textContent = 'Balance unavailable right now. Check Basescan.'; }
  }
  async function deposit(b) {
    const amt = +$('#b-amt').value; if (!(amt > 0 && amt <= b.total)) return toast(`Enter an amount up to ${usd(b.total)}.`);
    if (!W.addr && !(await connect())) return;
    try {
      if (W.chain !== 8453) await switchBase();
      const data = '0xa9059cbb' + pad(b.address).slice(2) + BigInt(Math.round(amt * 1e6)).toString(16).padStart(64, '0');
      const tx = await W.p.request({ method: 'eth_sendTransaction', params: [{ from: W.addr, to: USDC, data, value: '0x0' }] });
      toast('Deposit sent'); $('#b-bal').innerHTML = `Deposit sent · <a href="https://basescan.org/tx/${esc(tx)}" target="_blank" rel="noopener">Basescan</a>`;
    } catch (e) { toast(e?.code === 4001 ? 'Deposit cancelled. Nothing was sent.' : 'The deposit did not go through. Nothing was sent.'); }
  }

  /* ---------- 3. requests: free text; the runner searches every live x402 seller ---------- */
  const IDEAS = ['AI image generation API keys', 'A product photo of a ceramic mug on oak', 'Leads: new businesses in Chicago', 'Weather forecast for London'];
  function drawBuy() {
    const b = B(), el = $('#bbuy'); if (!b) { el.innerHTML = '<p class="muted small">Available once you have a burner.</p>'; return; }
    el.innerHTML = `<div class="stack"><div><label class="f" for="b-want">What should it buy?</label><textarea id="b-want" rows="3" placeholder="Buy me AI image generation API keys"></textarea>
      <div class="chips" style="margin-top:8px">${IDEAS.map((x) => `<button class="chip" type="button" data-idea="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>
      <details><summary class="small">I have a specific seller</summary><div class="stack" style="margin-top:8px"><div><label class="f" for="b-url">Seller URL (x402)</label><input id="b-url" class="mono" placeholder="https://…" inputmode="url"></div>
      <div><label class="f" for="b-in">Input JSON (optional)</label><textarea id="b-in" class="mono small" rows="4" spellcheck="false" placeholder='{"prompt": "…"}'></textarea></div></div></details>
      <button class="btn pri block" type="button" id="b-req">Ask the agent to buy it</button>
      <p class="small muted" style="margin:0">The runner searches the Coinbase x402 Bazaar, re-checks the best few live, and buys the best fit at or under ${px(b.per)}. It only signs the exact price the seller quotes, in USDC on Base, to the address in that quote, and records why it chose it. Requests wait until the burner holds USDC.</p></div>`;
    { const q = PEND(); if (q.want) $('#b-want').value = q.want.slice(0, 300); if (q.seller) { $('#b-url').value = q.seller; $('#b-url').closest('details').open = true; } }
    $$('[data-idea]').forEach((c) => c.onclick = () => { $('#b-want').value = c.dataset.idea; $('#b-want').focus(); });
    $('#b-req').onclick = () => { try { localStorage.removeItem('fba.pendingBuy'); } catch {}
      const want = $('#b-want').value.trim(), url = $('#b-url').value.trim(); let input;
      if (!want && !url) return toast('Say what to buy.');
      if (url && !/^https:\/\//.test(url)) return toast('The seller URL must start with https://');
      if ($('#b-in').value.trim()) { try { input = JSON.parse($('#b-in').value); } catch { return toast('The input is not valid JSON.'); } }
      window.open(issueURL(`Buy: ${(want || url).slice(0, 60)}`, 'fba-request', { budget: +b.id, want: want || undefined, url: url || undefined, input }, `Purchase request for burner ${b.id}, up to ${px(b.per)}.`), '_blank', 'noopener');
    };
  }

  /* ---------- 4. ledger from Base ---------- */
  async function drawLedger() {
    const b = B(), el = $('#bledger'); if (!b) { el.innerHTML = '<p class="muted small">No burner yet.</p>'; return; }
    el.innerHTML = '<p class="small muted">Reading Base…</p>';
    try {
      const t = await transfers(b), me = b.address.toLowerCase(), who = (a) => a === b.sweepTo.toLowerCase() ? 'Returned to you' : 'Paid ' + a.slice(0, 8) + '…';
      const inn = t.filter((x) => x.to === me).reduce((s, x) => s + x.usd, 0), out = t.filter((x) => x.from === me && x.to !== b.sweepTo.toLowerCase()).reduce((s, x) => s + x.usd, 0);
      el.innerHTML = `<div class="row wrapf"><span>Deposited <strong class="num">${px(inn)}</strong></span><span>Spent <strong class="num">${px(out)}</strong> of ${usd(b.total)}</span></div>
        <div class="list" style="margin-top:12px">${t.map((x) => `<div><span style="flex:1"><strong>${x.to === me ? 'Deposit' : esc(who(x.to))}</strong><br><span class="small muted">block ${x.block}</span></span><span class="num">${x.to === me ? '+' : '−'}${px(x.usd)}</span><a class="small" href="https://basescan.org/tx/${esc(x.tx)}" target="_blank" rel="noopener">Basescan</a></div>`).join('') || '<div class="small muted">No USDC has moved yet.</div>'}</div>`;
    } catch { el.innerHTML = `<p class="small muted">Couldn't read Base right now. <a href="https://basescan.org/address/${esc(b.address)}#tokentxns" target="_blank" rel="noopener">See it on Basescan</a>.</p>`; }
  }

  /* ---------- 5. My purchases: encrypted receipts, unlocked by the wallet that funded and owns the burner ---------- */
  const VAULT = 'https://raw.githubusercontent.com/Blockchains/findbuyagent-vault/main/v/';
  const KEYRX = /(?:api[_-]?key|secret|token|access[_-]?key|password|bearer|private[_-]?key|x-api-key)["'\s:=]+([A-Za-z0-9_\-.]{12,})|\b(sk-[A-Za-z0-9_\-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abp]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/gi;
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  function drawDeliv() {
    $('#bdeliv').innerHTML = `<p class="small">Every purchase's full raw data, any keys it delivered, and how to use what you bought. Stored only encrypted; your wallet unlocks it here. ${'Email copies arrive too when email is set up.'}</p>
      <button class="btn pri block" type="button" id="b-vault">Sign in with wallet</button><div id="b-rcpt" class="stack" style="margin-top:12px" aria-live="polite"></div>
      <details style="margin-top:8px"><summary class="small">Open a receipt file instead</summary><label class="btn ghost sm" style="display:inline-flex;margin-top:8px"><input type="file" id="b-file" accept="application/json,.json" style="display:none">Choose .json</label></details>`;
    $('#b-vault').onclick = signIn;
    $('#b-file').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { $('#b-rcpt').innerHTML = ''; showReceipt(JSON.parse(await f.text())); } catch { toast('That file is not a receipt.'); } };
  }
  async function signIn() {
    const out = $('#b-rcpt'); if (!W.addr && !(await connect())) return;
    const me = W.addr.toLowerCase(); out.innerHTML = '<p class="small muted">Looking for your receipts…</p>';
    let idx; try { const r = await fetch(`${VAULT}${me}/index.json?t=${Date.now()}`, { cache: 'no-store' }); idx = r.ok ? await r.json() : null; } catch { idx = null; }
    if (!idx?.items?.length) { const b = B(); out.innerHTML = `<p class="small">No receipts are locked to <span class="mono">${esc(me.slice(0, 8))}…${esc(me.slice(-4))}</span> yet.${b ? ' Purchases appear here a minute or two after the runner buys.' : ''} If you created the burner with another wallet, connect that one.</p>`; return; }
    let k; try { k = await vaultKey(); } catch (e) { out.innerHTML = `<p class="small">${e?.code === 4001 ? 'Signature cancelled. Nothing was unlocked.' : 'Your wallet could not sign.'}</p>`; return; }
    if (!k) { out.innerHTML = ''; return; }
    out.innerHTML = `<p class="small muted">${idx.items.length} receipt${idx.items.length > 1 ? 's' : ''}. Unlocking…</p>`; let bad = 0; const got = [];
    for (const it of [...idx.items].reverse()) {
      try { const e = await (await fetch(VAULT + me + '/' + encodeURIComponent(it.file), { cache: 'no-store' })).json();
        const pt = window.nacl.box.open(b64(e.ct), b64(e.nonce), b64(e.epk), k.secret); if (!pt) { bad++; continue; } got.push(JSON.parse(new TextDecoder().decode(pt))); } catch { bad++; }
    }
    k.secret.fill(0); out.innerHTML = '';
    if (!got.length) { out.innerHTML = '<p class="small">These receipts would not unlock with this wallet\'s signature. That happens if the wallet signs differently each time (smart wallets) or a different wallet created the burner.</p>'; return; }
    got.forEach(showReceipt); if (bad) out.insertAdjacentHTML('beforeend', `<p class="small muted">${bad} receipt${bad > 1 ? 's' : ''} could not be unlocked.</p>`);
    out.insertAdjacentHTML('afterbegin', `<div class="row between"><span class="small">Unlocked ${got.length} for this visit only.</span><button class="btn ghost sm" type="button" id="b-lock">Lock</button></div>`); $('#b-lock').onclick = drawDeliv;
  }
  function showReceipt(r) {
    const raw = r.raw?.response?.body || r.raw?.quote?.body || {}, u = r.usage || {};
    const rawText = raw.text ?? '', img = raw.base64 && /^image\//.test(raw.contentType || '') ? `data:${raw.contentType.split(';')[0]};base64,${raw.base64}` : null;
    const keys = [...new Set([...rawText.matchAll(KEYRX)].map((m) => m[1] || m[2]))].slice(0, 10);
    const card = document.createElement('article'); card.className = 'card';
    card.innerHTML = `<div class="row between wrapf"><strong>${esc(r.want || r.item)}</strong><span class="num">${r.spent ? px(r.usd) : 'not paid'}</span></div>
      <p class="small muted">${esc(r.host)} · ${esc(new Date(r.at).toLocaleString())}${r.tx ? ` · <a href="https://basescan.org/tx/${esc(r.tx)}" target="_blank" rel="noopener">Basescan</a>` : ''}</p>${r.error ? `<p class="small">${esc(r.error)}</p>` : ''}${r.why ? `<p class="small muted">Why this seller: ${esc(r.why)}</p>` : ''}
      ${keys.length ? `<p class="f">Keys and tokens found</p>${keys.map((x, i) => `<div class="row"><code class="mono small" data-key="${i}" style="flex:1;word-break:break-all">••••••••${esc(x.slice(-4))}</code><button class="btn sec sm" type="button" data-kr="${i}">Reveal</button><button class="btn ghost sm" type="button" data-kc="${i}">Copy</button></div>`).join('')}` : ''}
      <p class="f">Delivered data</p>${img ? '<div data-img hidden></div>' : ''}<pre class="code small" data-raw style="max-height:320px;overflow:auto">•••• hidden. It can contain keys or private data.</pre>
      <div class="row"><button class="btn sec sm" type="button" data-rv>Reveal</button><button class="btn ghost sm" type="button" data-cp>Copy</button><button class="btn ghost sm" type="button" data-dl>Download</button></div>
      <details style="margin-top:12px"><summary>How to use this service</summary><dl class="kv"><dt>Endpoint</dt><dd class="mono small">${esc(u.endpoint?.method)} ${esc(u.endpoint?.url)}</dd><dt>Payment</dt><dd class="small">${esc(u.payment?.protocol)} · ${esc(u.payment?.network)} · ${u.payment?.priceUsd != null ? px(u.payment.priceUsd) : ''} · pay to <span class="mono">${esc(u.payment?.payTo)}</span></dd></dl>
      <p class="small">${esc(u.description || '')}</p><p class="small">${esc(u.payment?.howTo || '')}</p>${u.exampleInput ? `<p class="f">Seller's example input</p><pre class="code small">${esc(JSON.stringify(u.exampleInput, null, 1))}</pre>` : ''}
      <p class="f">curl</p><pre class="code small">${esc(u.examples?.curlUnpaid || '')}</pre>${(u.docs || []).map((d) => `<details><summary class="small">${esc(d.source)}</summary><pre class="code small" style="max-height:240px;overflow:auto">${esc(d.text)}</pre></details>`).join('')}<p class="small muted">Sources: ${(u.sources || []).map(esc).join(', ')}</p></details>`;
    $('#b-rcpt').appendChild(card);
    $$('[data-kr]', card).forEach((bt) => bt.onclick = () => { const c = $(`[data-key="${bt.dataset.kr}"]`, card), x = keys[+bt.dataset.kr], h = bt.textContent === 'Reveal'; c.textContent = h ? x : '••••••••' + x.slice(-4); bt.textContent = h ? 'Hide' : 'Reveal'; });
    $$('[data-kc]', card).forEach((bt) => bt.onclick = async () => { await navigator.clipboard.writeText(keys[+bt.dataset.kc]); toast('Copied'); });
    $('[data-rv]', card).onclick = (e) => { const p = $('[data-raw]', card), h = e.target.textContent === 'Reveal'; p.textContent = h ? (rawText || (raw.base64 ? `${raw.contentType}, ${raw.bytes} bytes` : '(empty)')).slice(0, 100000) : '•••• hidden. It can contain keys or private data.'; e.target.textContent = h ? 'Hide' : 'Reveal';
      const im = $('[data-img]', card); if (im) { im.hidden = !h; im.innerHTML = h ? `<img src="${img}" alt="Delivered image" style="max-width:100%;border-radius:8px">` : ''; } };
    $('[data-cp]', card).onclick = async () => { await navigator.clipboard.writeText(rawText || JSON.stringify(r.raw)); toast('Copied'); };
    $('[data-dl]', card).onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 1)], { type: 'application/json' })); a.download = `receipt-${r.budget}-${r.request}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  }

  /* ---------- 6. close + sweep ---------- */
  function drawClose() {
    const b = B(), el = $('#bclose'); if (!b) { el.innerHTML = ''; return; }
    const sw = store.get('burner.sweep', null);
    el.innerHTML = `<p class="small">Closing stops all purchases, returns every remaining USDC to <span class="mono">${esc(b.sweepTo)}</span> and deletes the burner's sealed key. It also happens automatically when the budget ends.</p>
      <div class="row wrapf"><a class="btn sec" id="b-close" href="${esc(issueURL(`Close budget ${b.id}`, 'fba-close', { budget: +b.id }, 'Close this burner and sweep its USDC back to me.'))}" target="_blank" rel="noopener">Close and sweep on GitHub</a>
      ${sw ? '<button class="btn pri" type="button" id="b-sweep">Return my USDC</button>' : ''}<button class="btn ghost" type="button" id="b-forget">Forget this burner here</button></div>
      ${sw ? '<p class="small muted">The runner signed a transfer of the whole balance to your address. Any wallet can submit it; you only pay Base gas.</p>' : ''}`;
    $('#b-forget').onclick = () => { store.set('burner', null); store.set('burner.sweep', null); drawAll(); };
    if (sw) $('#b-sweep').onclick = async () => {
      let a; try { a = JSON.parse(atob(sw.replace(/-/g, '+').replace(/_/g, '/'))); } catch { return toast('The sweep link is damaged. Ask the runner again by closing on GitHub.'); }
      if (a.to.toLowerCase() !== b.sweepTo.toLowerCase()) return toast('This sweep does not go to your address. Not sent.');
      if (!W.addr && !(await connect())) return;
      try {
        if (W.chain !== 8453) await switchBase();
        const h = (x) => BigInt(x).toString(16).padStart(64, '0'), w = (x) => x.toLowerCase().replace(/^0x/, '').padStart(64, '0');
        const data = '0xe3ee160e' + w(a.from) + w(a.to) + h(a.value) + h(a.validAfter) + h(a.validBefore) + w(a.nonce) + h(a.v) + w(a.r) + w(a.s);
        const tx = await W.p.request({ method: 'eth_sendTransaction', params: [{ from: W.addr, to: USDC, data, value: '0x0' }] });
        store.set('burner.sweep', null); toast('Sweep sent'); el.insertAdjacentHTML('beforeend', `<p class="small">Sent · <a href="https://basescan.org/tx/${esc(tx)}" target="_blank" rel="noopener">Basescan</a>. The runner retires the burner on its next check.</p>`);
      } catch (e) { toast(e?.code === 4001 ? 'Cancelled. The USDC is still in the burner.' : 'That didn\'t go through. The authorization may have been used or expired; close again on GitHub for a fresh one.'); }
    };
  }
  function drawAll() { drawSetup(); drawBurner(); drawBuy(); drawLedger(); drawDeliv(); drawClose(); }
  drawAll(); on('wallet', () => {});
};
