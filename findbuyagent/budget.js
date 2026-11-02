/* /budget: a one-time burner wallet run by GitHub Actions (Blockchains/findbuyagent-runner). No FindBuyAgent server.
   This page only builds GitHub issues for the runner, reads Base directly, and sends your one deposit from your own wallet. */
window.FBABudget = (F) => {
  const { $, $$, esc, store, toast, usd, W, connect, pickWallet, disconnect, refreshBal, on, switchBase } = F;
  const CAP = 100; // hard cap on what the burner may hold, in USDC
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
      <div class="row"><button class="btn sec sm" type="button" id="b-copy">Copy address</button><a class="btn ghost sm" href="https://basescan.org/address/${esc(b.address)}" target="_blank" rel="noopener">Basescan</a><a class="btn ghost sm" href="${GH}/issues/${esc(b.id)}" target="_blank" rel="noopener">GitHub thread</a></div></div></div>
      <div class="notice" role="note" style="margin-top:12px"><strong>Funds here are exposed.</strong> Send only USDC on Base. The burner may hold at most ${usd(CAP)} in total, from all your wallets together. The runner spends it without asking you, within ${px(b.per)} per purchase, ${usd(b.daily)} a day and ${usd(b.total)} in total${b.ends ? `, until ${esc(new Date(b.ends).toLocaleString())}` : ''}. Deposit only what you can afford to lose.</div>
      <h3 style="font-size:18px;margin:16px 0 8px">Add funds</h3><div id="bfund" aria-live="polite"></div>`;
    $('#b-copy').onclick = async () => { await navigator.clipboard.writeText(b.address); toast('Address copied'); };
    drawFund(b); pollFund(b);
  }

  /* ---------- 2b. add funds from any number of wallets (EIP-6963 picker as on monaf.ai) ---------- */
  const FS = { bal: null, funders: null, amt: null, tx: null, txState: '', txAmt: 0, err: '' };
  const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const room = () => FS.bal == null ? null : Math.max(0, Math.floor((CAP - FS.bal - (FS.txState === 'pending' ? FS.txAmt : 0)) * 100) / 100);
  async function readFund(b) {
    try { FS.bal = await bal(b.address); FS.err = ''; } catch { FS.err = 'Balance unavailable right now. Check Basescan.'; }
    try { const m = new Map(); for (const t of await transfers(b)) if (t.to === b.address.toLowerCase() && t.from !== t.to && !/^0x0{40}$/.test(t.from)) m.set(t.from, (m.get(t.from) || 0) + t.usd); FS.funders = [...m].map(([addr, usd]) => ({ addr, usd })).sort((x, y) => y.usd - x.usd); } catch { /* keep last list */ }
  }
  let polling = 0;
  async function pollFund(b) {
    const me = ++polling; await readFund(b); if (me !== polling) return; drawFund(b);
    const loop = async () => { if (me !== polling || B()?.address !== b.address) return; if (!document.hidden && FS.txState !== 'pending') { await readFund(b); if (me === polling) drawFund(b); } setTimeout(loop, 15000); };
    setTimeout(loop, 15000);
  }
  function drawFund(b) {
    const el = $('#bfund'); if (!el) return;
    const r = room(), wb = W.bal == null ? null : Number(W.bal) / 1e6, wrong = W.addr && W.chain !== 8453;
    const max = r == null ? 0 : Math.max(0, wb == null ? r : Math.min(r, Math.floor(wb * 100) / 100));
    if (FS.amt != null && FS.amt > max) FS.amt = null;
    const pct = FS.bal == null ? 0 : Math.min(100, FS.bal / CAP * 100);
    const chip = (v, label) => { const off = !(v > 0) || r == null || v > r || (wb != null && v > wb + 1e-9); return `<button class="btn ${FS.amt === v ? 'pri' : 'sec'} sm" type="button" data-amt="${v}" aria-pressed="${FS.amt === v}" ${off ? 'disabled' : ''}>${label}</button>`; };
    const me = W.addr?.toLowerCase();
    el.innerHTML = `<div class="stack">
      <div><div class="row between"><span class="small">Burner balance <strong class="num" id="b-bal">${FS.bal == null ? (FS.err ? '—' : 'reading…') : px(FS.bal)}</strong> of ${usd(CAP)} cap</span><span class="small num">${r == null ? '' : `Room left ${usd(r)}`}</span></div>
        <div role="progressbar" aria-label="Burner balance against the ${usd(CAP)} cap" aria-valuemin="0" aria-valuemax="${CAP}" aria-valuenow="${FS.bal ?? 0}" style="height:8px;border-radius:4px;background:rgba(127,127,127,.25);margin-top:6px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${pct >= 100 ? '#d33' : 'currentColor'};opacity:.7"></div></div>${FS.err ? `<p class="small">${esc(FS.err)}</p>` : ''}</div>
      ${W.addr ? `<div class="row wrapf between" style="gap:8px"><div class="row" style="gap:8px">${W.info?.icon ? `<img src="${esc(W.info.icon)}" alt="" width="24" height="24">` : ''}<div><div class="small"><strong>${esc(W.info?.name || 'Wallet')}</strong> <span class="mono">${esc(short(W.addr))}</span></div><div class="small muted" id="b-wbal">${wb == null ? 'Reading USDC…' : `${px(wb)} USDC on Base`}${wrong ? ' · your wallet will be asked to switch to Base' : ''}</div></div></div>
        <div class="row"><button class="btn sec sm" type="button" id="b-other">Use another wallet</button><button class="btn ghost sm" type="button" id="b-disc">Disconnect</button></div></div>`
        : `<button class="btn sec block" type="button" id="b-conn">Connect a wallet to add funds</button>`}
      ${W.addr ? `<div class="row wrapf" role="group" aria-label="Amount">${chip(5, '$5')}${chip(10, '$10')}${chip(25, '$25')}${chip(max, max > 0 ? `Max ${usd(max)}` : 'Max')}</div>
        <div class="row"><label class="hidden" for="b-amt">Other amount (USDC)</label><input id="b-amt" type="number" inputmode="decimal" min="0.01" max="${max}" step="0.01" placeholder="Other amount" value="${FS.amt != null && ![5, 10, 25, max].includes(FS.amt) ? FS.amt : ''}" style="width:150px">
        <button class="btn pri" type="button" id="b-dep" ${FS.amt > 0 && FS.txState !== 'pending' ? '' : 'disabled'}>${FS.amt > 0 ? `Deposit ${px(FS.amt)}` : 'Pick an amount'}</button></div>
        ${r === 0 ? `<p class="small"><strong>The burner is at the ${usd(CAP)} cap.</strong> Deposits are blocked until it spends or you close it.</p>` : wb === 0 ? '<p class="small">This wallet has no USDC on Base. Use another wallet, or send USDC on Base to it first.</p>' : ''}
        <p class="small muted" style="margin:0">One signature in your wallet: a plain USDC transfer to the burner. No approval, nothing else can be taken from your wallet.</p>` : ''}
      <div id="b-txs">${FS.tx ? `<p class="small">${FS.txState === 'pending' ? '<span aria-hidden="true">⏳</span> Deposit sent, waiting for Base to confirm…' : FS.txState === 'ok' ? `<span aria-hidden="true">✅</span> Confirmed: ${px(FS.txAmt)} is in the burner.` : '<span aria-hidden="true">⚠️</span> That transaction failed on Base. No USDC moved.'} <a href="https://basescan.org/tx/${esc(FS.tx)}" target="_blank" rel="noopener">Basescan</a></p>` : ''}</div>
      ${FS.funders?.length ? `<div><p class="f" style="margin:0 0 4px">Funded by</p><ul class="small" style="margin:0;padding-left:18px">${FS.funders.map((f) => `<li><span class="mono">${esc(short(f.addr))}</span> · ${px(f.usd)}${f.addr === me ? ' · this wallet' : ''}</li>`).join('')}</ul>
        <p class="small muted" style="margin:4px 0 0">On close, what is left goes back pro rata to what each wallet deposited (the creator's share goes to the return address).</p></div>` : ''}
      ${W.addr ? `<details><summary class="small">Read receipts with this wallet too</summary><p class="small">The wallet that created the burner can already read them. For another wallet that deposited: sign two messages (no funds move), then submit the prefilled GitHub issue as the owner. Access is granted once its deposit is seen.</p><button class="btn ghost sm" type="button" id="b-reg">Get receipts with this wallet</button></details>` : ''}
    </div>`;
    $('#b-conn') && ($('#b-conn').onclick = async () => { if (await pickWallet()) drawFund(b); });
    $('#b-other') && ($('#b-other').onclick = async () => { if (await pickWallet({ fresh: true })) { FS.amt = null; drawFund(b); } });
    $('#b-disc') && ($('#b-disc').onclick = () => { disconnect(); FS.amt = null; drawFund(b); });
    $$('[data-amt]', el).forEach((x) => x.onclick = () => { FS.amt = +x.dataset.amt; drawFund(b); });
    const inp = $('#b-amt');
    if (inp) {
      const check = () => { const v = Math.round(+inp.value * 100) / 100; if (!(v > 0)) return [null, '']; if (r != null && v > r) return [null, `That would take the burner over ${usd(CAP)}. Room left: ${usd(r)}.`]; if (wb != null && v > wb) return [null, `This wallet holds ${px(wb)} USDC.`]; return [v, '']; };
      inp.oninput = () => { const [v] = check(); FS.amt = v; $$('[data-amt]', el).forEach((x) => { x.className = 'btn sec sm'; x.setAttribute('aria-pressed', 'false'); }); const d = $('#b-dep'); d.disabled = !(v > 0) || FS.txState === 'pending'; d.textContent = v > 0 ? `Deposit ${px(v)}` : 'Pick an amount'; };
      inp.onchange = () => { const [, why] = check(); if (why) toast(why); };
    }
    $('#b-dep') && ($('#b-dep').onclick = () => deposit(b));
    $('#b-reg') && ($('#b-reg').onclick = () => registerFunder(b));
  }
  async function deposit(b) {
    const amt = FS.amt; if (!(amt > 0)) return;
    if (!W.addr && !(await connect())) return;
    const btn = $('#b-dep'); if (btn) { btn.disabled = true; btn.textContent = 'Check your wallet…'; }
    try {
      FS.bal = await bal(b.address); // fresh read: the cap is checked against the live balance, not a cached one
      const r = room(); if (amt > r) { toast(`Blocked: that would take the burner over ${usd(CAP)}. Room left: ${usd(r)}.`); FS.amt = null; return drawFund(b); }
      if (W.chain !== 8453) await switchBase();
      const atomic = BigInt(Math.round(amt * 1e6)); const have = BigInt(await rpc(RPC, 'eth_call', [{ to: USDC, data: '0x70a08231' + pad(W.addr).slice(2) }, 'latest']));
      if (have < atomic) { toast(`This wallet holds ${px(Number(have) / 1e6)} USDC on Base.`); return drawFund(b); }
      const data = '0xa9059cbb' + pad(b.address).slice(2) + atomic.toString(16).padStart(64, '0');
      const tx = await W.p.request({ method: 'eth_sendTransaction', params: [{ from: W.addr, to: USDC, data, value: '0x0' }] });
      Object.assign(FS, { tx, txState: 'pending', txAmt: amt, amt: null }); toast('Deposit sent'); drawFund(b);
      for (let i = 0; i < 90; i++) {
        await new Promise((ok) => setTimeout(ok, 2000));
        const rc = await rpc(RPC, 'eth_getTransactionReceipt', [tx]).catch(() => null);
        if (rc?.status) { FS.txState = rc.status === '0x1' ? 'ok' : 'fail'; break; }
      }
      if (FS.txState === 'pending') FS.txState = 'ok'; // still unconfirmed after 3 minutes: stop holding the cap; balance polling takes over
      await readFund(b); refreshBal?.(); drawFund(b); if (FS.txState === 'ok') toast('Deposit confirmed');
    } catch (e) { toast(e?.code === 4001 ? 'Deposit cancelled. Nothing was sent.' : 'The deposit did not go through. Nothing was sent.'); drawFund(b); }
  }
  const FMSG = (id, burner, wallet, pub) => `FindBuyAgent funder v1\n\nBudget: ${id}\nBurner: ${burner.toLowerCase()}\nWallet: ${wallet.toLowerCase()}\nVault key: ${pub}\n\nThis links your receipt key to this budget so you can read its receipts. It does not move funds or approve anything.`;
  async function registerFunder(b) {
    const w = window.open('', '_blank');
    try {
      const v = await vaultKey(); if (!v) { w?.close(); return; } v.secret.fill(0);
      const msg = FMSG(String(b.id), b.address, v.owner, v.pub);
      const proof = await W.p.request({ method: 'personal_sign', params: ['0x' + hex(new TextEncoder().encode(msg)), W.addr] });
      const url = issueURL(`Funder for budget ${b.id}`, 'fba-fund', { budget: +b.id, vault: { owner: v.owner, pub: v.pub }, proof }, 'Let this wallet read this budget\'s receipts. Press Submit new issue.');
      if (w) w.location = url; else location.href = url;
    } catch (e) { w?.close(); toast(e?.code === 4001 ? 'Signature cancelled.' : 'Your wallet could not sign.'); }
  }
  on('wallet', () => { const b = B(); if (b) drawFund(b); });

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
  // v1: one recipient. v2: content key wrapped to each funder's key (every wallet that registered can open the same receipt).
  function openEnv(e, sk) {
    const N = window.nacl; if (e.v !== 2) return N.box.open(b64(e.ct), b64(e.nonce), b64(e.epk), sk);
    const pub = hex(N.box.keyPair.fromSecretKey(sk).publicKey);
    for (const k of e.keys || []) { if (k.pub && k.pub !== pub) continue; const ck = N.box.open(b64(k.k), b64(k.nonce), b64(k.epk || e.epk), sk); if (ck) return N.secretbox.open(b64(e.ct), b64(e.nonce), ck); }
    return null;
  }
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
        const pt = openEnv(e, k.secret); if (!pt) { bad++; continue; } got.push(JSON.parse(new TextDecoder().decode(pt))); } catch { bad++; }
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
    el.innerHTML = `<p class="small">Closing stops all purchases and deletes the burner's sealed key. What is left goes back <strong>pro rata to what each wallet deposited</strong>; the creator's share goes to <span class="mono">${esc(b.sweepTo)}</span>. If the runner can't read any deposits, everything goes to that address. It also happens automatically when the budget ends.</p>
      <div class="row wrapf"><a class="btn sec" id="b-close" href="${esc(issueURL(`Close budget ${b.id}`, 'fba-close', { budget: +b.id }, 'Close this burner and return its USDC to the funders.'))}" target="_blank" rel="noopener">Close and return on GitHub</a>
      ${sw ? '<button class="btn pri" type="button" id="b-sweep">Return USDC to funders</button>' : ''}<button class="btn ghost" type="button" id="b-forget">Forget this burner here</button></div>
      ${sw ? '<p class="small muted">The runner signed one transfer per funder. Any wallet can submit them; you only pay Base gas, once per transfer.</p>' : ''}<div id="b-sweepout" class="small"></div>`;
    $('#b-forget').onclick = () => { store.set('burner', null); store.set('burner.sweep', null); drawAll(); };
    if (sw) $('#b-sweep').onclick = async () => {
      let list; try { const a = JSON.parse(atob(sw.replace(/-/g, '+').replace(/_/g, '/'))); list = Array.isArray(a) ? a : [a]; } catch { return toast('The return link is damaged. Ask the runner again by closing on GitHub.'); }
      await readFund(b).catch(() => {});
      const ok = new Set([b.sweepTo.toLowerCase(), ...(FS.funders || []).map((f) => f.addr)]);
      if (!list.length || list.some((a) => a.from?.toLowerCase() !== b.address.toLowerCase() || !ok.has(String(a.to).toLowerCase()))) return toast('A transfer in this link does not go to a wallet that funded the burner. Nothing was sent.');
      if (!W.addr && !(await connect())) return;
      const out = $('#b-sweepout'); let sent = 0;
      try {
        if (W.chain !== 8453) await switchBase();
        const h = (x) => BigInt(x).toString(16).padStart(64, '0'), w = (x) => x.toLowerCase().replace(/^0x/, '').padStart(64, '0');
        for (const a of list) {
          const data = '0xe3ee160e' + w(a.from) + w(a.to) + h(a.value) + h(a.validAfter) + h(a.validBefore) + w(a.nonce) + h(a.v) + w(a.r) + w(a.s);
          const tx = await W.p.request({ method: 'eth_sendTransaction', params: [{ from: W.addr, to: USDC, data, value: '0x0' }] }); sent++;
          out.insertAdjacentHTML('beforeend', `<p>${px(Number(BigInt(a.value)) / 1e6)} to <span class="mono">${esc(short(a.to))}</span> sent · <a href="https://basescan.org/tx/${esc(tx)}" target="_blank" rel="noopener">Basescan</a></p>`);
        }
        store.set('burner.sweep', null); toast('Returns sent'); out.insertAdjacentHTML('beforeend', '<p>The runner retires the burner on its next check.</p>');
      } catch (e) { toast(e?.code === 4001 ? `Cancelled after ${sent} of ${list.length}. The rest is still in the burner.` : 'That didn\'t go through. The authorization may have been used or expired; close again on GitHub for a fresh one.'); }
    };
  }
  function drawAll() { drawSetup(); drawBurner(); drawBuy(); drawLedger(); drawDeliv(); drawClose(); }
  drawAll(); on('wallet', () => {});
};
