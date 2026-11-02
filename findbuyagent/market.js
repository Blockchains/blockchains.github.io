// Marketplace: sort/filter the static table, then refresh verification and ratings from the live data repo.
(() => {
  const $ = (s) => document.querySelector(s), RAW = 'https://raw.githubusercontent.com/Blockchains/findbuyagent-vault/main/market/';
  const rt = (r) => r ? `${r.avg.toFixed(1)}★ (${r.count} rating${r.count === 1 ? '' : 's'})` : 'No ratings yet';
  const get = (f) => fetch(RAW + f, { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).catch(() => null);
  const tb = $('#m-rows');
  if (tb) {
    const rows = [...tb.rows], apply = () => {
      const k = $('#m-sort').value, d = k.startsWith('-') ? -1 : 1, f = k.replace('-', ''), q = $('#m-q').value.trim().toLowerCase(), c = $('#m-cat').value;
      const v = (r) => f === 'price' ? +r.dataset.price : f === 'cat' ? r.dataset.cat : f === 'ver' ? r.dataset.ver : +r.dataset.rate * 1000 + +r.dataset.count;
      rows.sort((a, b) => { const x = v(a), y = v(b); return (x > y ? 1 : x < y ? -1 : +a.dataset.price - +b.dataset.price) * d; });
      rows.forEach((r) => { r.hidden = r.dataset.dead === '1' || (c && r.dataset.cat !== c) || (q && !(r.dataset.name + ' ' + r.dataset.cat.toLowerCase()).includes(q)); tb.appendChild(r); });
      const u = new URLSearchParams(); if (k !== 'price') u.set('sort', k); if (c) u.set('cat', c); if (q) u.set('q', q); history.replaceState(null, '', u.toString() ? '?' + u : location.pathname);
    };
    const p = new URLSearchParams(location.search); if (p.get('sort')) $('#m-sort').value = p.get('sort'); if (p.get('cat')) $('#m-cat').value = p.get('cat'); if (p.get('q')) $('#m-q').value = p.get('q');
    ['#m-sort', '#m-cat'].forEach((s) => $(s).onchange = apply); $('#m-q').oninput = apply; apply();
    Promise.all([get('market.json'), get('ratings.json')]).then(([m, r]) => {
      if (m?.services) { const live = new Map(m.services.map((s) => [s.slug, s])); let dead = 0;
        rows.forEach((row) => { const s = live.get(row.dataset.slug); if (!s || s.fails) { row.dataset.dead = '1'; dead++; } else { row.dataset.ver = s.verifiedAt; row.querySelector('[data-v]').textContent = s.verifiedAt.slice(0, 16).replace('T', ' ') + ' UTC'; } });
        if (dead) $('#m-note').insertAdjacentText('afterbegin', `${dead} service${dead === 1 ? '' : 's'} hidden: failed the latest live check. `); }
      if (r?.ratings) rows.forEach((row) => { const x = r.ratings[row.dataset.slug]; row.dataset.rate = x?.avg ?? -1; row.dataset.count = x?.count ?? 0; row.querySelector('[data-r]').textContent = rt(x); });
      apply();
    });
  }
  const sv = $('#svc');
  if (sv) { const { slug } = JSON.parse(sv.textContent);
    Promise.all([get('market.json'), get('ratings.json')]).then(([m, r]) => {
      const s = m?.services?.find((x) => x.slug === slug);
      if (m && (!s || s.fails)) $('#sv-ver').textContent = 'Failed the latest live check; may be down. Do not buy until it is re-verified.';
      else if (s) $('#sv-ver').textContent = new Date(s.verifiedAt).toUTCString().replace(' GMT', ' UTC') + ' (live 402 with this price)';
      if (r?.ratings) $('#sv-rate').textContent = rt(r.ratings[slug]);
    }); }
})();
