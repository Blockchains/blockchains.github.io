/* /shop: agent shopping jobs. On this static host, jobs, offers and activity live in this browser (localStorage).
   Store prices come only from what the user enters or confirms; nothing is estimated. Ask-first is locked on. */
window.FBAShop = (F) => {
  const { $, $$, esc, store, toast, sheet, closeSheet, usd, ago, B } = F;
  const jobs = () => store.get('jobs', []), save = (j) => { store.set('jobs', j); draw(); };
  const log = (jobId, text) => { const a = store.get('activity', []); a.unshift({ t: Date.now(), jobId, text, source: 'You, in this browser' }); store.set('activity', a.slice(0, 300)); };
  const CARD_CAP = 100, CARD_MONTH = 300, STALE = 30 * 60e3;
  const carrier = (n) => { n = n.replace(/\s/g, ''); if (/^1Z[0-9A-Z]{16}$/i.test(n)) return ['UPS', `https://www.ups.com/track?tracknum=${n}`]; if (/^(94|93|92|95)\d{20}$|^\d{20,22}$/.test(n)) return ['USPS', `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`]; if (/^\d{12}$|^\d{15}$/.test(n)) return ['FedEx', `https://www.fedex.com/fedextrack/?trknbr=${n}`]; return null; };
  const host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return ''; } };
  const storeName = (u) => { const h = host(u); return h ? h.split('.').slice(-2, -1)[0].replace(/^./, (c) => c.toUpperCase()) : ''; };
  function parse(text) {
    const j = { item: '', link: '', max: null, notStores: [], stores: [], deadline: '', variant: '', mode: 'cheaper', repeat: false };
    let t = ' ' + text + ' ';
    const cmd = t.match(/shop\s+"([^"]+)"/i); if (cmd) { j.item = cmd[1]; t = t.replace(cmd[0], ' '); }
    t = t.replace(/https?:\/\/\S+/i, (m) => { j.link = m; return ' '; });
    t = t.replace(/(?:--max|under|below|less than|cheaper than|max|<)\s*\$?\s*([\d,]+(?:\.\d\d)?)/i, (m, n) => { j.max = parseFloat(n.replace(/,/g, '')); return ' '; });
    t = t.replace(/(?:--not|not on|not from|not at|not|except|excluding)\s+(amazon|walmart|ebay|target|best ?buy|costco)/gi, (m, s) => { j.notStores.push(s.toLowerCase().replace(' ', '')); return ' '; });
    t = t.replace(/\bby\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|\d{1,2}\s+[a-z]{3,9}|[a-z]{3,9}\s+\d{1,2})/i, (m, d) => { j.deadline = d; return ' '; });
    t = t.replace(/\bsize\s+(\S+)/i, (m, s) => { j.variant = s; return ' '; });
    if (/--watch|watch and alert|alert me/i.test(t)) { j.mode = 'watch'; t = t.replace(/--watch|watch and alert|alert me/i, ' '); }
    if (/\b(every|repeat|weekly|monthly)\b/i.test(t)) j.repeat = true;
    t = t.replace(/--ask-first|\bfind (this|me)?\b|\bexact\b|\bcheaper\b|\bplease\b|[,.]/gi, ' ').replace(/\s+/g, ' ').trim();
    if (!j.item) j.item = t || (j.link ? storeName(j.link) + ' item' : '');
    return j;
  }
  const cond = (j) => [j.max ? `Under ${usd(j.max)}` : '', ...j.notStores.map((s) => `not ${s[0].toUpperCase() + s.slice(1)}`), j.deadline ? `by ${j.deadline}` : '', j.variant ? `size ${j.variant}` : ''].filter(Boolean).join(' · ') || 'No conditions';
  const best = (j) => j.offers.filter((o) => !j.notStores.some((s) => o.store.toLowerCase().replace(/\s/g, '').includes(s))).filter((o) => !j.max || o.price <= j.max).sort((a, b) => a.price - b.price)[0];
  const exact = (j, o) => j.ref?.model && o.model && j.ref.model.trim().toLowerCase() === o.model.trim().toLowerCase();
  function status(j) {
    if (j.state) return j.state;
    if (j.paused) return 'PAUSED';
    const b = best(j); if (b) return 'NEEDS YOU';
    return 'WATCHING';
  }
  const pillCls = { 'NEEDS YOU': 'b-bad', FOUND: 'b-ok', WATCHING: 'b-n', PAUSED: 'b-n', 'OPENED AT STORE': 'b-ind', ORDERED: 'b-ok', SHIPPED: 'b-ok', DELIVERED: 'b-ok', ENDED: 'b-n' };
  let filter = 'All';
  function draw() {
    const all = jobs();
    const waiting = all.filter((j) => status(j) === 'NEEDS YOU').length;
    const saved = all.filter((j) => j.saved != null).reduce((s, j) => s + j.saved, 0);
    $('#sum').innerHTML = `<div class="card"><p class="micro">Active jobs</p><p class="price">${all.filter((j) => !['ENDED', 'DELIVERED'].includes(status(j))).length}</p></div><div class="card"><p class="micro">Waiting for you</p><p class="price">${waiting}</p></div><div class="card"><p class="micro">Confirmed savings</p><p class="price">${usd(saved)}</p></div>`;
    const fmap = { All: () => true, 'Needs you': (j) => status(j) === 'NEEDS YOU', Watching: (j) => status(j) === 'WATCHING', Ordered: (j) => ['ORDERED', 'SHIPPED', 'DELIVERED'].includes(status(j)), Ended: (j) => status(j) === 'ENDED' };
    const list = all.filter(fmap[filter]);
    $('#jobs').innerHTML = !all.length ? `<div class="empty card"><svg viewBox="0 0 120 96" aria-hidden="true"><path d="M30 30h60l-6 54H36z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M46 30v-6a14 14 0 0 1 28 0v6" fill="none" stroke="currentColor" stroke-width="3"/></svg><p><strong>No shopping jobs yet</strong></p><p class="muted">Tell your agent what to find and your limits. It asks before every purchase.</p><button class="btn pri" type="button" id="cj">Create a job</button></div>`
      : list.map((j) => { const st = status(j), b = best(j), stale = b && Date.now() - b.at > STALE;
        return `<article class="card" data-job="${j.id}"><div class="row between wrapf"><h3 style="margin:0;font-size:18px">${esc(j.item)}</h3><span class="pill ${pillCls[st] || 'b-n'}">${esc(st)}${j.saved ? ` · Saved ${usd(j.saved)}` : ''}</span></div>
        <p class="small muted" style="margin:4px 0 10px">${esc(cond(j))}${j.lastChecked ? ` · last checked ${ago(j.lastChecked)} ago` : ''}</p>
        ${j.purchase ? `<p><strong>${j.saved ? `You saved ${usd(j.saved)}` : `Purchased at ${esc(j.purchase.store)} · ${usd(j.purchase.price)}`}</strong></p>${track(j)}` : b ? `<div class="grid g2">${j.ref ? offerCard(j.ref, 'Your reference', j) : ''}${offerCard(b, 'Best offer', j)}</div>${j.ref && exact(j, b) && j.ref.price > b.price ? `<p class="price" style="color:var(--ok)">${usd(j.ref.price - b.price)} less</p>` : ''}${j.offers.length > 1 ? `<p class="small muted">See all ${j.offers.length} offers below.</p>` : ''}` : `<p class="muted small">No lower price found yet. We'll keep checking.</p>`}
        <div class="row wrapf" style="margin-top:12px">${!j.purchase && b ? (stale ? `<button class="btn pri" type="button" data-refresh="${j.id}">Refresh price</button>` : `<button class="btn pri" type="button" data-approve="${j.id}">Review · ${usd(b.price)}</button>`) : ''}${st === 'OPENED AT STORE' ? `<button class="btn pri" type="button" data-bought="${j.id}">Did you buy it?</button>` : ''}${!j.purchase ? `<button class="btn sec" type="button" data-offer="${j.id}">Add an offer</button>` : ''}<button class="btn ghost sm" type="button" data-pause="${j.id}">${j.paused ? 'Resume' : 'Pause'}</button><button class="btn ghost sm" type="button" data-del="${j.id}">Delete</button></div>
        ${j.offers.length > 1 ? `<details style="margin-top:8px"><summary class="small">All offers</summary><div class="list">${j.offers.map((o) => `<div><span style="flex:1">${esc(o.store)}${exact(j, o) ? '' : ' · <span class="muted">Similar, not exact</span>'}</span><span class="num">${usd(o.price)}</span></div>`).join('')}</div></details>` : ''}</article>`; }).join('') || '<p class="muted">Nothing in this filter.</p>';
    $('#cj')?.addEventListener('click', () => $('#jobq').focus());
    const act = store.get('activity', []).slice(0, 30);
    $('#activity').innerHTML = act.length ? act.map((a) => `<div><span class="small" style="flex:1">${esc(a.text)}</span><span class="small muted">${ago(a.t)} ago</span></div>`).join('') : '<div><span class="small muted">No activity yet.</span></div>';
  }
  const offerCard = (o, label, j) => `<div class="card raised"><p class="micro">${esc(label)}</p><div class="row"><span class="fav" style="width:32px;height:32px" aria-hidden="true">${o.url ? `<img src="https://${esc(host(o.url))}/favicon.ico" alt="" width="32" height="32" loading="lazy" onerror="this.remove()">` : ''}</span><strong>${esc(o.store)}</strong></div><p class="price" style="margin:8px 0 0">${usd(o.price)}</p><p class="small muted" style="margin:0">${o.shipIncl ? 'Includes shipping and tax' : '+ shipping and tax at checkout'}</p><p class="small muted" style="margin:0">Price checked ${ago(o.at)} ago · Price you entered</p>${label !== 'Your reference' && !exact(j, o) ? '<p class="small"><span class="badge b-n">Similar, not exact</span></p>' : ''}</div>`;
  function track(j) {
    const steps = ['Ordered', 'Shipped', 'Out for delivery', 'Delivered']; const done = j.track || { Ordered: j.purchase.at };
    const c = j.purchase.tracking && carrier(j.purchase.tracking);
    return `<ol class="list" style="list-style:none;padding:0">${steps.map((s) => `<li><span aria-hidden="true">${done[s] ? '●' : '○'}</span><span style="flex:1">${s}${done[s] ? ` · <span class="small muted">${new Date(done[s]).toLocaleString()} · Marked by you</span>` : ''}</span>${!done[s] ? `<button class="btn ghost sm" type="button" data-mark="${j.id}" data-step="${s}">Mark</button>` : ''}</li>`).join('')}</ol>${c ? `<a class="btn sec sm" href="${c[1]}" target="_blank" rel="noopener">Track on ${c[0]}</a>` : j.purchase.tracking ? `<p class="small muted">We couldn't find that tracking number's carrier.</p>` : ''}`;
  }
  function preview(text) {
    const j = parse(text); if (!j.item) return;
    const s = sheet(`<h2>Save job</h2><p class="muted small">Check what your agent understood.</p>
      <label class="f" for="pj-item">Item or link</label><input id="pj-item" value="${esc(j.item)}" data-autofocus>
      <label class="f" for="pj-link" style="margin-top:10px">Reference link (optional)</label><input id="pj-link" type="url" value="${esc(j.link)}">
      <div class="grid g2" style="margin-top:10px"><div><label class="f" for="pj-max">Max price</label><input id="pj-max" type="number" inputmode="decimal" value="${j.max ?? ''}"></div><div><label class="f" for="pj-dl">Deadline</label><input id="pj-dl" value="${esc(j.deadline)}"></div></div>
      <label class="f" for="pj-not" style="margin-top:10px">Stores to skip</label><input id="pj-not" value="${esc(j.notStores.join(', '))}">
      <label class="f" for="pj-var" style="margin-top:10px">Size or variant</label><input id="pj-var" value="${esc(j.variant)}">
      <div class="chips" style="margin:12px 0"><span class="badge b-ok">🔒 Ask first: always on</span><span class="badge b-n">${j.mode === 'watch' ? 'Watch and alert' : 'Find cheaper elsewhere'}</span>${j.repeat ? '<span class="badge b-n">Repeat</span>' : ''}<span class="badge b-n">Pay with: at the store</span></div>
      <button class="btn pri block" type="button" id="pj-save">Save job</button><button class="btn ghost block" type="button" id="pj-x">Not now</button>`, { label: 'Save job' });
    $('#pj-x', s).onclick = closeSheet;
    $('#pj-save', s).onclick = () => { const v = (id) => $(id, s).value.trim(); const n = { id: crypto.randomUUID(), item: v('#pj-item'), link: v('#pj-link'), max: v('#pj-max') ? +v('#pj-max') : null, deadline: v('#pj-dl'), notStores: v('#pj-not').split(/[,\s]+/).filter(Boolean).map((x) => x.toLowerCase()), variant: v('#pj-var'), mode: j.mode, repeat: j.repeat, offers: [], ref: null, created: Date.now() };
      closeSheet(); save([n, ...jobs()]); log(n.id, `Job created: ${n.item}`); toast('Job saved'); $('#jobq').value = ''; if (n.link) addOffer(n.id, true); };
  }
  function addOffer(id, isRef) {
    const j = jobs().find((x) => x.id === id);
    const s = sheet(`<h2>${isRef ? 'Your reference price' : 'Add an offer'}</h2><p class="muted small">${isRef ? 'Enter the price on your reference page. FindBuyAgent can\'t read store pages from this static site, so you confirm it.' : 'Paste a store link and the price you see there.'}</p>
      <label class="f" for="of-url">Store link</label><input id="of-url" type="url" value="${esc(isRef ? j.link : '')}" data-autofocus>
      <div class="grid g2" style="margin-top:10px"><div><label class="f" for="of-price">Price</label><input id="of-price" type="number" inputmode="decimal" step="0.01"></div><div><label class="f" for="of-model">Model number (optional)</label><input id="of-model"></div></div>
      <label class="row small" style="margin:12px 0"><input type="checkbox" id="of-ship"> Price includes shipping and tax</label>
      <button class="btn pri block" type="button" id="of-save">Save price</button>`, { label: 'Add offer' });
    $('#of-save', s).onclick = () => { const url = $('#of-url', s).value.trim(), price = +$('#of-price', s).value; if (!price) return toast('We couldn\'t verify this price.'); const o = { url, store: storeName(url) || 'Store', price, model: $('#of-model', s).value.trim(), shipIncl: $('#of-ship', s).checked, at: Date.now() };
      const all = jobs(); const jj = all.find((x) => x.id === id); if (isRef) jj.ref = o; else jj.offers.push(o); jj.lastChecked = Date.now(); closeSheet(); save(all); log(id, `Checked ${o.store} · ${usd(o.price)} · just now`); if (!isRef && best(jj) === o) log(id, 'Price found'); };
  }
  function approve(id) {
    const j = jobs().find((x) => x.id === id), o = best(j); if (!o) return;
    if (Date.now() - o.at > STALE) return toast('Price is over 30 minutes old.', 'Refresh price', () => addOffer(id));
    log(id, 'Waiting for your approval');
    const s = sheet(`<p class="micro">Hand-off</p><h2>Open at ${esc(o.store)} for ${usd(o.price)}?</h2>
      <dl class="kv"><dt>Item</dt><dd>${esc(j.item)}</dd><dt>Store</dt><dd>${esc(o.store)} · ${esc(host(o.url))}</dd><dt>Pay with</dt><dd>At ${esc(o.store)}, on their site</dd><dt>Shipping and tax</dt><dd>${o.shipIncl ? 'Included' : 'At checkout'}</dd><dt>Total</dt><dd class="num">${usd(o.price)}${o.shipIncl ? '' : ' + shipping and tax'}</dd>${j.ref && exact(j, o) && j.ref.price > o.price ? `<dt></dt><dd>${usd(j.ref.price - o.price)} less than ${esc(j.ref.store)}</dd>` : ''}</dl>
      <p class="notice">You buy it yourself on ${esc(o.store)}'s site. FindBuyAgent doesn't charge you.</p>
      <div class="stack" style="margin-top:12px"><button class="btn pri lg block" type="button" id="ap-go" data-autofocus>Approve</button><p class="small muted" style="text-align:center;margin:0">Press and hold to approve</p><button class="btn ghost block" type="button" id="ap-no">Not now</button></div>`, { label: 'Approve hand-off' });
    $('#ap-no', s).onclick = () => { log(id, 'You declined'); closeSheet(); draw(); };
    const go = $('#ap-go', s); let tm;
    const fire = () => { log(id, 'You approved'); log(id, `Opened at ${o.store}`); const all = jobs(); all.find((x) => x.id === id).state = 'OPENED AT STORE'; save(all); closeSheet(); if (o.url) window.open(o.url, '_blank', 'noopener'); };
    go.addEventListener('pointerdown', () => { go.textContent = 'Keep holding…'; tm = setTimeout(fire, 600); });
    ['pointerup', 'pointerleave'].forEach((ev) => go.addEventListener(ev, () => { clearTimeout(tm); if (go.isConnected) go.textContent = 'Approve'; }));
    go.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); } });
  }
  function bought(id) {
    const j = jobs().find((x) => x.id === id), o = best(j);
    const s = sheet(`<h2>Did you buy it?</h2><label class="f" for="bt-p">Price paid</label><input id="bt-p" type="number" step="0.01" value="${o?.price ?? ''}" data-autofocus><label class="f" for="bt-t" style="margin-top:10px">Order or tracking number (optional)</label><input id="bt-t"><div class="stack" style="margin-top:12px"><button class="btn pri block" type="button" id="bt-y">Yes, I bought it</button><button class="btn ghost block" type="button" id="bt-n">Not yet</button></div>`, { label: 'Did you buy it?' });
    $('#bt-n', s).onclick = () => { const all = jobs(); delete all.find((x) => x.id === id).state; save(all); closeSheet(); };
    $('#bt-y', s).onclick = () => { const price = +$('#bt-p', s).value; if (!price) return; const all = jobs(); const jj = all.find((x) => x.id === id); jj.purchase = { store: o?.store || 'Store', price, tracking: $('#bt-t', s).value.trim(), at: Date.now() }; jj.state = 'ORDERED'; jj.track = { Ordered: Date.now() };
      if (jj.ref && o && exact(jj, o) && jj.ref.price > price) jj.saved = Math.round((jj.ref.price - price) * 100) / 100; closeSheet(); save(all); log(id, `Ordered at ${jj.purchase.store} · ${usd(price)}`); };
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return; const d = t.dataset;
    if (d.approve) approve(d.approve); if (d.offer) addOffer(d.offer); if (d.refresh) addOffer(d.refresh); if (d.bought) bought(d.bought);
    if (d.pause) { const all = jobs(); const j = all.find((x) => x.id === d.pause); j.paused = !j.paused; save(all); }
    if (d.del && confirm('Delete this job?')) { save(jobs().filter((x) => x.id !== d.del)); toast('Job deleted'); }
    if (d.mark) { const all = jobs(); const j = all.find((x) => x.id === d.mark); j.track = { ...(j.track || {}), [d.step]: Date.now() }; j.state = d.step === 'Delivered' ? 'DELIVERED' : d.step === 'Ordered' ? 'ORDERED' : 'SHIPPED'; save(all); log(j.id, 'Tracking updated'); }
    if (d.jf) { filter = d.jf; $$('[data-jf]').forEach((x) => x.setAttribute('aria-pressed', x === t)); draw(); }
  });
  $('#jobform').addEventListener('submit', (e) => { e.preventDefault(); preview($('#jobq').value); });
  $$('[data-tpl]').forEach((b) => b.onclick = () => { $('#jobq').value = b.dataset.tpl; $('#jobq').focus(); });
  document.addEventListener('keydown', (e) => { const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName); if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); $('#jobq').focus(); } });
  const wrow = () => { $('#wrow').innerHTML = F.W.addr ? `Wallet · <span class="mono">${esc(F.short(F.W.addr))}</span> · ${F.W.bal == null ? '…' : F.fmtU(F.W.bal)} USDC` : 'Wallet · not connected'; }; wrow(); F.on('wallet', wrow);
  draw();
};
