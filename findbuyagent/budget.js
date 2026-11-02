/* /budget: a one-time burner wallet run by GitHub Actions (Blockchains/findbuyagent-runner). No FindBuyAgent server.
   This page only builds GitHub issues for the runner, reads Base directly, and sends your one deposit from your own wallet. */
window.FBABudget = (F) => {
  const { $, $$, esc, store, toast, usd, W, connect, on, switchBase } = F;
  const RUNNER = 'Blockchains/findbuyagent-runner', GH = `https://github.com/${RUNNER}`;
  const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', LOGRPC = 'https://base-rpc.publicnode.com', RPC = 'https://mainnet.base.org';
  const TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const SELL = JSON.parse($('#sellers')?.textContent || '{"sellers":[]}').sellers;
  const CATS = { image: 'Image generation', leads: 'Leads and business data' };
  const D = { total: 5, per: 0.05, daily: 1, days: 7, cats: ['image', 'leads'], sweepTo: '' };
  const cfg = () => ({ ...D, ...store.get('burner.cfg', {}) }), setCfg = (c) => store.set('burner.cfg', c);
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a || '');
  const px = (n) => (n > 0 && n < 0.1) ? '$' + (+n).toFixed(3).replace(/0$/, '') : usd(n);
  const issueURL = (title, label, json, note = '') => `${GH}/issues/new?${new URLSearchParams({ title, labels: label, body: `${note}\n\n\`\`\`json\n${JSON.stringify(json, null, 1)}\n\`\`\`\n` })}`;

  /* ---------- burner from link (#b=..&a=..) or saved ---------- */
  const hp = new URLSearchParams(location.hash.slice(1));
  if (hp.get('b') && isAddr(hp.get('a'))) {
    store.set('burner', { id: hp.get('b'), address: hp.get('a'), blk: +hp.get('blk') || 0, sweepTo: hp.get('to') || '', total: +hp.get('total'), per: +hp.get('per'), daily: +hp.get('daily'), ends: hp.get('ends') || '' });
    if (hp.get('sweep')) store.set('burner.sweep', hp.get('sweep'));
    history.replaceState(null, '', location.pathname);
  }
  const B = () => store.get('burner', null);

  /* ---------- 1. rules ---------- */
  function drawSetup() {
    const c = cfg(), n = SELL.filter((s) => c.cats.includes(s.cat) && s.usd <= c.per).length;
    $('#bsetup').innerHTML = `<div class="stack">
      ${num('total', 'Total budget', 1, 100, 1, c.total, 'Hard cap $100. Deposit no more than this.')}
      ${num('per', 'Per purchase', 0.005, Math.min(25, c.total), 0.005, Math.min(c.per, c.total))}
      ${num('daily', 'Per day', 0.01, c.total, 0.01, Math.min(c.daily, c.total))}
      <div><label class="f" for="b-days">Ends after</label><select id="b-days">${[1, 7, 30].map((d) => `<option value="${d}"${d === c.days ? ' selected' : ''}>${d} day${d > 1 ? 's' : ''}</option>`).join('')}</select></div>
      <fieldset style="border:0;padding:0;margin:0"><legend class="f">What it may buy</legend><div class="chips">${Object.entries(CATS).map(([k, l]) => `<label class="chip"><input type="checkbox" data-cat="${k}"${c.cats.includes(k) ? ' checked' : ''}> ${l}</label>`).join('')}</div>
      <p class="small muted">${n} allowlisted seller${n === 1 ? '' : 's'} fit these rules. No other address can be paid.</p></fieldset>
      <div><label class="f" for="b-to">Return leftovers to (your own Base address)</label><div class="row"><input id="b-to" class="mono" autocomplete="off" spellcheck="false" value="${esc(c.sweepTo)}" placeholder="0x…" style="flex:1"><button class="btn sec sm" type="button" id="b-me">Use my wallet</button></div></div>
      <div class="notice" role="note"><strong>High risk: the burner's money is exposed.</strong> The burner is a hot wallet whose key lives inside GitHub Actions runs. It signs and pays sellers without asking you, up to ${px(c.per)} each, ${usd(c.daily)} a day and ${usd(c.total)} in total, until it ends after ${c.days} day${c.days > 1 ? 's' : ''}. On-chain payments are final. Deposit only what you can afford to lose.</div>
      <button class="btn pri lg block" type="button" id="b-open">Create burner wallet on GitHub</button>
      <p class="small muted" style="margin:0">Opens a prefilled issue in the private <a href="${GH}" rel="noopener">${RUNNER}</a> repo. You must be signed in to GitHub as its owner. The runner replies within a few minutes with the burner address and a link back here.</p></div>`;
    $$('#bsetup input[type=number]').forEach((r) => r.onchange = () => { const k = r.dataset.k, v = Math.max(+r.min, Math.min(+r.max, +r.value || 0)); const x = { ...cfg(), [k]: v }; if (k === 'total') { x.per = Math.min(x.per, v); x.daily = Math.min(x.daily, v); } setCfg(x); drawSetup(); drawBuy(); });
    $('#b-days').onchange = (e) => { setCfg({ ...cfg(), days: +e.target.value }); drawSetup(); };
    $$('[data-cat]').forEach((x) => x.onchange = () => { setCfg({ ...cfg(), cats: $$('[data-cat]').filter((y) => y.checked).map((y) => y.dataset.cat) }); drawSetup(); drawBuy(); });
    $('#b-to').onchange = (e) => setCfg({ ...cfg(), sweepTo: e.target.value.trim() });
    $('#b-me').onclick = async () => { if (!W.addr && !(await connect())) return; setCfg({ ...cfg(), sweepTo: W.addr }); drawSetup(); };
    $('#b-open').onclick = () => {
      const c = cfg();
      if (!isAddr(c.sweepTo)) return toast('Enter your own Base address for leftovers first.');
      if (!c.cats.length) return toast('Pick at least one thing it may buy.');
      window.open(issueURL(`Budget: ${usd(c.total)} for ${c.days} day${c.days > 1 ? 's' : ''}`, 'fba-open', { total: c.total, per: c.per, daily: c.daily, days: c.days, cats: c.cats, sweepTo: c.sweepTo }, 'Burner budget rules. Press Submit new issue; the runner replies with the burner address.'), '_blank', 'noopener');
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

  /* ---------- 3. requests ---------- */
  function drawBuy() {
    const b = B(), el = $('#bbuy'); if (!b) { el.innerHTML = '<p class="muted small">Available once you have a burner.</p>'; return; }
    const list = SELL.filter((s) => s.usd <= b.per).sort((x, y) => x.usd - y.usd);
    el.innerHTML = list.length ? `<div class="stack"><div><label class="f" for="b-sel">Seller (allowlisted, within your per-purchase cap)</label><select id="b-sel">${list.map((s, i) => `<option value="${i}">${esc(CATS[s.cat])} · ${esc(s.host)} · ${px(s.usd)}</option>`).join('')}</select><p class="small muted" id="b-desc"></p></div>
      <div><label class="f" for="b-item">What it's for</label><input id="b-item" placeholder="Product photo for my shop"></div>
      <div><label class="f" for="b-in">Input sent to the seller (JSON)</label><textarea id="b-in" class="mono small" rows="6" spellcheck="false"></textarea><p class="small muted" id="b-inh"></p></div>
      <button class="btn pri block" type="button" id="b-req">Submit request on GitHub</button>
      <p class="small muted" style="margin:0">The runner checks the seller, its pay-to address and your caps before signing anything. Requests wait until the burner holds USDC.</p></div>`
      : `<p class="muted small">No allowlisted seller costs ${px(b.per)} or less.</p>`;
    if (!list.length) return;
    const pick = () => { const s = list[+$('#b-sel').value]; $('#b-desc').textContent = s.desc; $('#b-in').value = JSON.stringify(s.example || {}, null, 1); $('#b-inh').textContent = s.example ? `Prefilled with ${s.host}'s own example. Edit it to what you want.` : `${s.host} publishes no example input. Check its docs before sending.`; };
    $('#b-sel').onchange = pick; pick();
    $('#b-req').onclick = () => {
      const s = list[+$('#b-sel').value]; let input; try { input = JSON.parse($('#b-in').value || '{}'); } catch { return toast('The input is not valid JSON.'); }
      const item = $('#b-item').value.trim() || s.desc.slice(0, 60);
      window.open(issueURL(`Buy: ${item.slice(0, 60)}`, 'fba-request', { budget: +b.id, item, seller: s.url, input }, `Purchase request for burner ${b.id}, up to ${px(b.per)}.`), '_blank', 'noopener');
    };
  }

  /* ---------- 4. ledger from Base ---------- */
  async function drawLedger() {
    const b = B(), el = $('#bledger'); if (!b) { el.innerHTML = '<p class="muted small">No burner yet.</p>'; return; }
    el.innerHTML = '<p class="small muted">Reading Base…</p>';
    try {
      const t = await transfers(b), me = b.address.toLowerCase(), who = (a) => SELL.find((s) => s.payTo.toLowerCase() === a)?.host || (a === b.sweepTo.toLowerCase() ? 'Returned to you' : a.slice(0, 8) + '…');
      const inn = t.filter((x) => x.to === me).reduce((s, x) => s + x.usd, 0), out = t.filter((x) => x.from === me && x.to !== b.sweepTo.toLowerCase()).reduce((s, x) => s + x.usd, 0);
      el.innerHTML = `<div class="row wrapf"><span>Deposited <strong class="num">${px(inn)}</strong></span><span>Spent <strong class="num">${px(out)}</strong> of ${usd(b.total)}</span></div>
        <div class="list" style="margin-top:12px">${t.map((x) => `<div><span style="flex:1"><strong>${x.to === me ? 'Deposit' : esc(who(x.to))}</strong><br><span class="small muted">block ${x.block}</span></span><span class="num">${x.to === me ? '+' : '−'}${px(x.usd)}</span><a class="small" href="https://basescan.org/tx/${esc(x.tx)}" target="_blank" rel="noopener">Basescan</a></div>`).join('') || '<div class="small muted">No USDC has moved yet.</div>'}</div>`;
    } catch { el.innerHTML = `<p class="small muted">Couldn't read Base right now. <a href="https://basescan.org/address/${esc(b.address)}#tokentxns" target="_blank" rel="noopener">See it on Basescan</a>.</p>`; }
  }

  /* ---------- 5. deliveries: receipts stay private; a receipt file opens here, raw output hidden until you tap Reveal ---------- */
  function drawDeliv() {
    const b = B();
    $('#bdeliv').innerHTML = `<p class="small">Each purchase writes a receipt with the full raw output and how to use the service, emailed to you and kept in <a href="${GH}/tree/main/receipts${b ? '/' + esc(b.id) : ''}" rel="noopener">the private repo</a>. Download a receipt <span class="mono">.json</span> and open it here.</p>
      <label class="btn sec sm" style="display:inline-flex"><input type="file" id="b-file" accept="application/json,.json" style="display:none">Open a receipt</label><div id="b-rcpt" class="stack" style="margin-top:12px"></div>`;
    $('#b-file').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { showReceipt(JSON.parse(await f.text())); } catch { toast('That file is not a receipt.'); } };
  }
  function showReceipt(r) {
    const raw = r.raw?.response?.body || r.raw?.quote?.body || {}, u = r.usage || {};
    const rawText = raw.text ?? (raw.base64 ? `(binary ${raw.contentType}, ${raw.bytes} bytes; see the attached file)` : '');
    $('#b-rcpt').innerHTML = `<article class="card"><div class="row between wrapf"><strong>${esc(r.item)}</strong><span class="num">${r.spent ? px(r.usd) : 'not paid'}</span></div>
      <p class="small muted">${esc(r.host)} · ${esc(r.at)}${r.tx ? ` · <a href="https://basescan.org/tx/${esc(r.tx)}" target="_blank" rel="noopener">Basescan</a>` : ''}</p>${r.error ? `<p class="small">${esc(r.error)}</p>` : ''}
      <p class="f">Delivered output</p><pre class="code small" id="b-raw" data-hidden="1">•••• hidden. It can contain keys or private data.</pre>
      <div class="row"><button class="btn sec sm" type="button" id="b-rv">Reveal</button><button class="btn ghost sm" type="button" id="b-cp">Copy</button></div>
      <details style="margin-top:12px"><summary>How to use this service</summary><dl class="kv"><dt>Endpoint</dt><dd class="mono small">${esc(u.endpoint?.method)} ${esc(u.endpoint?.url)}</dd><dt>Payment</dt><dd class="small">${esc(u.payment?.protocol)} · ${esc(u.payment?.network)} · ${u.payment?.priceUsd != null ? px(u.payment.priceUsd) : ''} · pay to <span class="mono">${esc(u.payment?.payTo)}</span></dd></dl>
      <p class="small">${esc(u.payment?.howTo || '')}</p>${u.exampleInput ? `<p class="f">Seller's example input</p><pre class="code small">${esc(JSON.stringify(u.exampleInput, null, 1))}</pre>` : ''}
      <p class="f">curl</p><pre class="code small">${esc(u.examples?.curlUnpaid || '')}</pre><p class="small muted">Sources: ${(u.sources || []).map(esc).join(', ')}</p></details></article>`;
    $('#b-rv').onclick = () => { const p = $('#b-raw'); const h = p.dataset.hidden === '1'; p.textContent = h ? rawText.slice(0, 50000) : '•••• hidden. It can contain keys or private data.'; p.dataset.hidden = h ? '0' : '1'; $('#b-rv').textContent = h ? 'Hide' : 'Reveal'; };
    $('#b-cp').onclick = async () => { await navigator.clipboard.writeText(rawText); toast('Copied'); };
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
