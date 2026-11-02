// Marketplace: sort/filter the static table, then refresh verification and ratings from the live data repo.
(() => {
  const $ = (s) => document.querySelector(s), RAW = 'https://raw.githubusercontent.com/Blockchains/findbuyagent-vault/main/market/';
  const rt = (r) => r ? `${r.avg.toFixed(1)}★ (${r.count} rating${r.count === 1 ? '' : 's'})` : 'No ratings yet';
  const get = (f) => fetch(RAW + f, { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).catch(() => null);
  const tb = $('#m-rows');
  if (tb) {
    // ~500 rows: sort only when the sort key changes (one fragment append), filter by toggling hidden; search is debounced.
    const rows = [...tb.rows], cnt = $('#m-count'), pay = $('#m-pay'), chips = [...document.querySelectorAll('#m-chips [data-c]')]; let lastSort = '';
    const v = (r, f) => f === 'price' ? +r.dataset.price : f === 'cat' ? r.dataset.cat : f === 'ver' ? r.dataset.ver : f === 'use' ? +r.dataset.use : f === 'up' ? +r.dataset.up : +r.dataset.rate * 1000 + +r.dataset.count;
    const apply = (force) => {
      const k = $('#m-sort').value, d = k.startsWith('-') ? -1 : 1, f = k.replace('-', ''), q = $('#m-q').value.trim().toLowerCase(), c = $('#m-cat').value, p = pay ? pay.value : '';
      if (force === true || k !== lastSort) { rows.sort((a, b) => { const x = v(a, f), y = v(b, f); return (x > y ? 1 : x < y ? -1 : +a.dataset.price - +b.dataset.price) * d; }); const fr = document.createDocumentFragment(); rows.forEach((r) => fr.appendChild(r)); tb.appendChild(fr); lastSort = k; }
      const words = q.split(/\s+/).filter(Boolean); let n = 0;
      for (const r of rows) { const h = r.dataset.dead === '1' || (c && r.dataset.cat !== c) || (p && r.dataset.pay !== p) || (words.length && !words.every((w) => r.dataset.name.includes(w))); if (r.hidden !== h) r.hidden = h; if (!h) n++; }
      if (cnt) cnt.textContent = n + ' of ' + rows.length + ' services';
      chips.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === c)));
      const u = new URLSearchParams(); if (k !== 'price') u.set('sort', k); if (c) u.set('cat', c); if (p) u.set('pay', p); if (q) u.set('q', q); history.replaceState(null, '', u.toString() ? '?' + u : location.pathname);
    };
    const pr = new URLSearchParams(location.search); if (pr.get('sort')) $('#m-sort').value = pr.get('sort'); if (pr.get('cat')) $('#m-cat').value = pr.get('cat'); if (pr.get('q')) $('#m-q').value = pr.get('q'); if (pay && pr.get('pay')) pay.value = pr.get('pay');
    ['#m-sort', '#m-cat', '#m-pay'].forEach((s) => { if ($(s)) $(s).onchange = apply; });
    chips.forEach((b) => b.onclick = () => { $('#m-cat').value = b.dataset.c; apply(); });
    let t; $('#m-q').oninput = () => { clearTimeout(t); t = setTimeout(apply, 80); }; apply(true);
    Promise.all([get('market.json'), get('ratings.json')]).then(([m, r]) => {
      if (m?.services) { const live = new Map(m.services.map((s) => [s.slug, s])); let dead = 0;
        rows.forEach((row) => { const s = live.get(row.dataset.slug); if (!s || s.fails) { row.dataset.dead = '1'; dead++; } else { row.dataset.ver = s.verifiedAt; if (s.uptime) row.dataset.up = s.uptime.pct; row.querySelector('[data-v]').textContent = s.verifiedAt.slice(0, 16).replace('T', ' ') + ' UTC'; } });
        if (dead) $('#m-note').insertAdjacentText('afterbegin', `${dead} service${dead === 1 ? '' : 's'} hidden: failed the latest live check. `); }
      if (r?.ratings) rows.forEach((row) => { const x = r.ratings[row.dataset.slug]; row.dataset.rate = x?.avg ?? -1; row.dataset.count = x?.count ?? 0; row.querySelector('[data-r]').textContent = rt(x); });
      apply(true);
    });
  }
  const sv = $('#svc');
  if (sv) { const { slug } = JSON.parse(sv.textContent);
    Promise.all([get('market.json'), get('ratings.json')]).then(([m, r]) => {
      const s = m?.services?.find((x) => x.slug === slug);
      if (m && (!s || s.fails)) $('#sv-ver').textContent = 'Failed the latest live check; may be down. Do not buy until it is re-verified.';
      else if (s) { $('#sv-ver').textContent = new Date(s.verifiedAt).toUTCString().replace(' GMT', ' UTC') + ' (live 402 with this price)'; if (s.uptime && $('#sv-up')) $('#sv-up').textContent = `${s.uptime.pct}% (${s.uptime.ok} of ${s.uptime.checks} checks since ${s.uptime.since.slice(0, 10)})`; }
      if (r?.ratings) $('#sv-rate').textContent = rt(r.ratings[slug]);
    }); }
})();
