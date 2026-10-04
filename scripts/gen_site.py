"""Generates every HTML page of the hub from small templates. Run: python scripts/gen_site.py"""
import json, html
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
SITE = "https://blockchains.github.io"
UTM = "?utm_source=github&utm_medium=hub&utm_campaign=blockchains-hub"
NAV = [("/", "Hub"), ("/ai/brief/", "AI brief"), ("/gas/", "Gas"), ("/chains/", "Chains"), ("/rpc/", "RPCs"), ("/scan/", "Security"),
       ("/incidents/", "Incidents"), ("/portfolio/", "Portfolio"), ("/compare/", "Compare"), ("/events/", "Events"), ("/jobs/", "Jobs"),
       ("/blockchainlab-tools/", "Tools"), ("/blockchainlab-api/", "API")]


def page(path, title, desc, body, script="", h1=None, intro=None):
    canon = SITE + path
    nav = "".join(f'<a href="{u}"{" class=on" if u == path else ""}>{n}</a>' for u, n in NAV)
    head_h = f'<section class="page-h wrap"><h1>{html.escape(h1)}</h1><p>{intro}</p><p class="mut" id="stamp" style="font-size:13px;margin-top:8px"></p></section>' if h1 else ""
    doc = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title><meta name="description" content="{html.escape(desc)}"><link rel="canonical" href="{canon}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Blockchain Lab Hub"><meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}"><meta property="og:url" content="{canon}"><meta property="og:image" content="{SITE}/assets/og.png">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="{SITE}/assets/og.png"><meta name="theme-color" content="#07090f">
<meta name="hub-base" content="/"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/site.css">
<link rel="alternate" type="application/rss+xml" title="Chain incident feed" href="/incidents/feed.xml"></head><body>
<header class="top"><div class="wrap"><a class="brand" href="/"><span class="logo"></span>Blockchain Lab Hub</a><nav class="links">{nav}</nav></div></header>
<main>{head_h}<div class="wrap">{body}</div></main>
<footer><div class="wrap"><span>Built by <a href="https://blockchainlab.com/{UTM}">Blockchain Lab</a> · <a href="https://grokhack.com/{UTM}">GrokHack</a> · open source on <a href="https://github.com/Blockchains">GitHub</a></span>
<span><a href="/services.json">services.json</a> · <a href="/data/status.json">status.json</a> · <a href="https://github.com/Blockchains/blockchains.github.io">source</a> · Not financial advice.</span></div></footer>
{f'<script type="module">{script}</script>' if script else ''}</body></html>
"""
    out = ROOT / path.lstrip("/") / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(doc)
    return path


PAGES = []


def P(*a, **k):
    PAGES.append(page(*a, **k))


IMP = 'import {$,$$,esc,data,usd,num,pct,ago,stamp,fail,spark,sortable,aiNote} from "/assets/site.js";'

# ---------------------------------------------------------------- HUB
P("/", "Blockchain Lab Hub — 75 free blockchain tools, data APIs, AI briefs and monitors",
  "One search for every free Blockchain Lab service: 26 browser tools, 20 JSON datasets, AI market briefs and contract explainers, gas, RPC and chain monitors, security scans, jobs, grants and events.",
  """<section class="hero"><h1>Every free <span class="g">blockchain</span> tool, dataset, AI brief and monitor — <span class="g">one search</span>.</h1>
<p class="lead">Open-source services from <a href="https://blockchainlab.com/?utm_source=github&utm_medium=hub&utm_campaign=blockchains-hub">Blockchain Lab</a>. Everything runs in your browser or on public GitHub Actions; every service is health-checked and shows a live status badge.</p>
<div class="search"><span>🔎</span><input id="q" type="search" placeholder="Search 75 services — try “gas”, “ENS”, “audit”, “stablecoin”, “jobs”…" autocomplete="off" aria-label="Search services"><kbd>/</kbd></div>
<div class="stats" id="stats"></div><div class="chips" id="chips"></div></section>
<section id="brief"></section><div id="out" class="grid"></div>
<h2 class="sec">More from Blockchain Lab</h2><p class="sub">Related projects (owned and maintained separately).</p>
<div class="grid">
<a class="card" href="https://blockchainlab.com/?utm_source=github&utm_medium=hub&utm_campaign=blockchains-hub"><span class="cat">Site</span><h3>blockchainlab.com</h3><p>Research, the protocol atlas, failure atlas and development lab.</p></a>
<a class="card" href="https://blockchainlab.com/whitepaper?utm_source=github&utm_medium=hub&utm_campaign=blockchains-hub"><span class="cat">Research</span><h3>Whitepaper library</h3><p>590 foundational papers with readings: mechanism, assumptions, trade-offs.</p></a>
<a class="card" href="https://grokhack.com/?utm_source=github&utm_medium=hub&utm_campaign=blockchains-hub"><span class="cat">Hackathons</span><h3>GrokHack</h3><p>Hackathons and builder programmes.</p></a>
<a class="card" href="https://github.com/Blockchains/hackathons"><span class="cat">Hackathons</span><h3>Hackathons repo</h3><p>Open hackathon resources and entry template.</p></a>
<a class="card" href="https://github.com/Blockchains?tab=repositories&type=fork"><span class="cat">Open source</span><h3>Forks index</h3><p>300+ forks of the key blockchain repositories, kept in sync.</p></a>
<a class="card" href="https://github.com/Blockchains"><span class="cat">Open source</span><h3>All repositories</h3><p>Everything on GitHub under Blockchains.</p></a></div>""",
  IMP + r"""
const [cat, st] = await Promise.all([fetch("/services.json").then(r=>r.json()), data("status.json").catch(()=>({services:{}}))]);
const S = cat.services, status = st.services||{}; let active = "All";
const order = ["AI","Monitors","Finders","Feeds","Tools","Data API","Developers"];
$("#stats").innerHTML = [[S.length,"services"],[st.up??"…","up now"],[S.filter(s=>s.category=="AI").length,"AI services"],[S.filter(s=>s.category=="Tools").length,"browser tools"],[S.filter(s=>s.category=="Data API").length,"JSON datasets"]].map(([b,s])=>`<div class="stat"><b>${b}</b><span>${s}</span></div>`).join("") + (st.generated_at?`<div class="stat"><b style="font-size:15px;padding-top:5px">${ago(st.generated_at)}</b><span>last health check</span></div>`:"");
$("#chips").innerHTML = ["All",...order].map(c=>`<button class="chip${c==active?" on":""}" data-c="${c}">${c}${c=="All"?"":" · "+S.filter(s=>s.category==c).length}</button>`).join("");
const badge = (id)=>{const s=status[id]; const k=s?.status||"unknown"; return `<span class="badge ${k}" title="${esc(s?.detail||s?.checked_at||"")}">${k}</span>`};
function render(){
  const q = $("#q").value.trim().toLowerCase(), terms=q.split(/\s+/).filter(Boolean);
  const hits = S.filter(s=>(active=="All"||s.category==active) && terms.every(t=>(s.name+" "+s.description+" "+s.tags.join(" ")+" "+s.category).toLowerCase().includes(t)));
  hits.sort((a,b)=>order.indexOf(a.category)-order.indexOf(b.category));
  $("#out").innerHTML = hits.map(s=>`<a class="card" href="${esc(s.url)}"><span class="cat">${esc(s.category)}</span><h3>${esc(s.name)}</h3><p>${esc(s.description)}</p><div class="meta"><span>${s.tags.slice(0,2).map(esc).join(" · ")}</span>${badge(s.id)}</div></a>`).join("") || `<div class="empty">No services match “${esc(q)}”.</div>`;
  const u=new URL(location); q?u.searchParams.set("q",q):u.searchParams.delete("q"); history.replaceState(null,"",u);
}
$("#chips").addEventListener("click",e=>{const c=e.target.closest(".chip"); if(!c)return; active=c.dataset.c; $$(".chip").forEach(x=>x.classList.toggle("on",x==c)); render();});
$("#q").addEventListener("input",render); $("#q").value=new URLSearchParams(location.search).get("q")||"";
addEventListener("keydown",e=>{if(e.key=="/"&&document.activeElement!=$("#q")){e.preventDefault();$("#q").focus();}});
render();
data("ai/brief.json").then(b=>{$("#brief").innerHTML=`<a class="panel" style="display:block;color:inherit;text-decoration:none" href="/ai/brief/"><span class="cat">🤖 Today's AI brief · ${esc(b.date)}</span><h3 style="margin:6px 0">${esc(b.headline)}</h3><p class="mut" style="margin:0">${esc(b.summary)}</p></a>`}).catch(()=>{});
""")

# ---------------------------------------------------------------- AI pages
AI_INTRO = "Written by Grok on a schedule in GitHub Actions from public data — no AI runs in your browser, nothing you type is sent anywhere."
P("/ai/", "AI services — Blockchain Lab Hub", "AI-generated briefs, explainers and reports powered by Grok, precomputed from public data.",
  """<div class="grid" id="out"></div>""", IMP + r"""const c=await fetch("/services.json").then(r=>r.json());$("#out").innerHTML=c.services.filter(s=>s.category=="AI").map(s=>`<a class="card" href="${s.url}"><span class="cat">AI</span><h3>${esc(s.name)}</h3><p>${esc(s.description)}</p></a>`).join("");""",
  h1="AI services", intro=AI_INTRO)

P("/ai/brief/", "AI daily crypto market brief — Blockchain Lab", "A daily, data-grounded brief on chains, DEX volumes, fees, stablecoins, L2s and security incidents, written by Grok.",
  """<div id="out"><div class="empty">Loading…</div></div><h2 class="sec">Archive</h2><div id="arch" class="row"></div>""",
  IMP + r"""try{const d=await data("ai/brief.json");stamp(d);
$("#out").innerHTML=aiNote(d)+`<div class="panel"><span class="cat">${esc(d.date)}</span><h2 style="margin:6px 0 10px">${esc(d.headline)}</h2><p>${esc(d.summary)}</p></div>`+
`<div class="cards2">${d.sections.map(s=>`<div class="panel"><h3 style="margin-top:0">${esc(s.title)}</h3><ul class="tight">${s.bullets.map(b=>`<li>${esc(b)}</li>`).join("")}</ul></div>`).join("")}</div>`+
`<div class="panel"><h3 style="margin-top:0">Watchlist</h3><ul class="tight">${(d.watchlist||[]).map(b=>`<li>${esc(b)}</li>`).join("")}</ul></div>`;
const a=await data("ai/briefs/index.json");$("#arch").innerHTML=a.dates.map(x=>`<a class="pill" href="/data/ai/briefs/${x}.json">${x}</a>`).join("");}catch(e){fail(e)}""",
  h1="AI daily market brief", intro="Chains, DEXs, fees, stablecoins, L2s and security in five minutes. " + AI_INTRO)

P("/ai/incidents/", "AI incident explainer — recent crypto hacks in plain English", "Recent hacks and exploits explained for builders, each linked to a hands-on lab that teaches the defence.",
  """<div id="out"><div class="empty">Loading…</div></div>""",
  IMP + r"""try{const d=await data("ai/incidents.json");stamp(d);$("#out").innerHTML=aiNote(d)+`<div class="cards2">${d.items.map(i=>`<div class="panel"><span class="cat">${esc(i.date)} · ${usd(i.amount_usd)} · ${esc((i.chains||[]).join(", "))}</span><h3 style="margin:6px 0">${esc(i.name)}</h3><p>${esc(i.plain_english)}</p><p><b>Lesson:</b> ${esc(i.lesson_for_builders)}</p><p class="mut">${i.related_lab?`Practise it: <a href="${esc(d.labs_repo)}">${esc(i.related_lab)}</a> · `:""}${i.source?`<a href="${esc(i.source)}" rel="noopener nofollow">source</a>`:""}</p></div>`).join("")}</div>`}catch(e){fail(e)}""",
  h1="AI incident explainer", intro="What happened, in plain English, and the lab that teaches the fix. " + AI_INTRO)

P("/ai/ideas/", "AI hackathon idea generator — Blockchain Lab", "Twelve buildable hackathon ideas matched to upcoming events, grant programmes and DeFi category trends, refreshed daily.",
  """<div class="row" style="margin:6px 0 10px"><select class="f" id="lvl"><option value="">All levels</option><option>beginner</option><option>intermediate</option><option>advanced</option></select></div><div id="out"><div class="empty">Loading…</div></div>""",
  IMP + r"""try{const d=await data("ai/ideas.json");stamp(d);const r=()=>{const l=$("#lvl").value;$("#out").innerHTML=aiNote(d)+`<div class="cards2">${d.ideas.filter(i=>!l||i.difficulty==l).map(i=>`<div class="panel"><span class="cat">${esc(i.track)} · ${esc(i.difficulty)}</span><h3 style="margin:6px 0">${esc(i.title)}</h3><p>${esc(i.pitch)}</p><p class="mut">${(i.stack||[]).map(s=>`<span class="pill">${esc(s)}</span>`).join("")}</p><details><summary>Build plan</summary><ol class="tight">${(i.build_steps||[]).map(s=>`<li>${esc(s)}</li>`).join("")}</ol><p class="mut">Why now: ${esc(i.why_now)}${i.fits_event?`<br>Event: ${esc(i.fits_event)}`:""}${i.fits_grant?`<br>Grant: ${esc(i.fits_grant)}`:""}</p></details></div>`).join("")}</div>`};$("#lvl").onchange=r;r();}catch(e){fail(e)}""",
  h1="AI hackathon idea generator", intro="Ideas a team of 2–4 can ship in 36 hours, tied to real upcoming events and grants. " + AI_INTRO)

P("/ai/digest/", "AI chain-health & L2 digest — Blockchain Lab", "Chain liveness, gas, RPC reliability and L2 metrics summarised by Grok.",
  """<div id="out"><div class="empty">Loading…</div></div>""",
  IMP + r"""try{const d=await data("ai/digest.json");stamp(d);const L=(t,a)=>`<div class="panel"><h3 style="margin-top:0">${t}</h3><ul class="tight">${(a||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`;$("#out").innerHTML=aiNote(d)+`<div class="panel"><h2 style="margin-top:0">${esc(d.headline)}</h2><p>${esc(d.summary)}</p></div><div class="cards2">${L("Chains",d.chains)}${L("L2s",d.l2s)}${L("Infrastructure",d.infrastructure)}${L("Builder tips",d.builder_tips)}</div>`}catch(e){fail(e)}""",
  h1="AI chain-health & L2 digest", intro="Built from the hub's own liveness, gas and RPC monitors plus L2BEAT data. " + AI_INTRO)

P("/ai/protocols/", "AI protocol briefs — top DeFi protocols explained", "What the top 15 DeFi protocols by TVL do, how they make money and their key risks, written by Grok from DefiLlama data.",
  """<input class="f" id="q" placeholder="Filter protocols…" style="width:100%;max-width:420px;margin-bottom:10px"><div id="out"><div class="empty">Loading…</div></div>""",
  IMP + r"""try{const d=await data("ai/protocols.json");stamp(d);const r=()=>{const q=$("#q").value.toLowerCase();$("#out").innerHTML=aiNote(d)+`<div class="cards2">${d.protocols.filter(p=>!q||(p.name+p.category).toLowerCase().includes(q)).map(p=>{const b=p.brief;return `<div class="panel"><span class="cat">${esc(p.category)} · TVL ${usd(p.tvl)}</span><h3 style="margin:6px 0">${esc(p.name)}</h3><p>${esc(b.what_it_does)}</p><p><b>Revenue:</b> ${esc(b.how_it_makes_money)}</p><details><summary>Risks & facts</summary><ul class="tight">${(b.key_risks||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul><p class="mut">${esc(b.who_uses_it)}</p><ul class="tight">${(b.notable_facts||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></details><p class="mut"><a href="${esc(p.llama)}">DefiLlama</a>${p.url?` · <a href="${esc(p.url)}" rel="noopener">website</a>`:""} · <a href="/compare/?p=${esc(p.slug)}">compare</a></p></div>`}).join("")}</div>`};$("#q").oninput=r;r();}catch(e){fail(e)}""",
  h1="AI protocol briefs", intro="The top 15 protocols by TVL, refreshed weekly. " + AI_INTRO)

P("/ai/contracts/", "AI smart-contract explainer — popular Ethereum contracts in plain English", "Plain-English explainers of WETH, USDT, USDC, DAI, Uniswap, Permit2, Safe, Aave, Lido and more from their verified source code.",
  """<div id="out"><div class="empty">Loading…</div></div>""",
  IMP + r"""try{const d=await data("ai/contracts.json");stamp(d);$("#out").innerHTML=aiNote(d)+d.contracts.map(c=>{const x=c.explainer;return `<details><summary>${esc(c.name)} <span class="mut mono">${esc(c.address)}</span></summary><p>${esc(x.summary)}</p><div class="cards2"><div><h4>Key functions</h4><ul class="tight">${(x.key_functions||[]).map(f=>`<li><code>${esc(f.name)}</code> — ${esc(f.what)}</li>`).join("")}</ul></div><div><h4>Admin powers</h4><ul class="tight">${(x.admin_powers||[]).map(f=>`<li>${esc(f)}</li>`).join("")}</ul><h4>Upgradeability</h4><p>${esc(x.upgradeability)}</p></div><div><h4>User risks</h4><ul class="tight">${(x.user_risks||[]).map(f=>`<li>${esc(f)}</li>`).join("")}</ul></div><div><h4>Integration tips</h4><ul class="tight">${(x.integration_tips||[]).map(f=>`<li>${esc(f)}</li>`).join("")}</ul></div></div><p class="mut">${esc(c.contract)} · ${esc(c.compiler)} · <a href="${esc(c.etherscan)}">Etherscan</a> · <a href="${esc(c.sourcify)}">Sourcify</a> · <a href="/scan/#${esc(c.address)}">Slither scan</a></p></details>`}).join("")}catch(e){fail(e)}""",
  h1="AI contract explainer", intro="17 of the most-used Ethereum contracts explained from Sourcify-verified source. " + AI_INTRO)

P("/ai/audits/", "AI audit-checklist reports for popular smart contracts", "Automated checklist reviews combining Slither static analysis with a Grok security review — triage of detector hits and a 10-point checklist.",
  """<div id="out"><div class="empty">Loading…</div></div>""",
  IMP + r"""try{const d=await data("ai/audits.json");stamp(d);const ic={pass:"✅",concern:"⚠️","n/a":"➖"};$("#out").innerHTML=aiNote(d)+`<div class="note">${esc(d.note)}</div>`+d.reports.map(r=>{const x=r.report;return `<details><summary>${esc(r.name)} <span class="mut">· Slither H${r.slither_counts.High}/M${r.slither_counts.Medium}/L${r.slither_counts.Low}</span></summary><p>${esc(x.overall)}</p><table><tr><th>Check</th><th></th><th>Note</th></tr>${(x.checklist||[]).map(c=>`<tr><td>${esc(c.item)}</td><td>${ic[c.status]||esc(c.status)}</td><td>${esc(c.note)}</td></tr>`).join("")}</table>${(x.slither_triage||[]).length?`<h4>Slither triage</h4><ul class="tight">${x.slither_triage.map(t=>`<li><code>${esc(t.check)}</code> — <b>${esc(t.verdict)}</b>: ${esc(t.why)}</li>`).join("")}</ul>`:""}<p class="mut"><a href="/scan/#${esc(r.address)}">Full Slither output</a> · <a href="https://etherscan.io/address/${esc(r.address)}#code">source</a></p></details>`}).join("")}catch(e){fail(e)}""",
  h1="AI audit-checklist reports", intro="Not an audit — a fast, transparent first pass you can check line by line. " + AI_INTRO)

P("/ai/whitepapers/", "AI whitepaper summaries — Bitcoin, Ethereum, Uniswap, EIP-1559, EIP-4844", "Structured summaries of 12 foundational blockchain papers: problem, mechanism, key ideas, trade-offs, what changed since.",
  """<div id="out"><div class="empty">Loading…</div></div>""",
  IMP + r"""try{const d=await data("ai/whitepapers.json");stamp(d);$("#out").innerHTML=aiNote(d)+d.papers.map(p=>{const s=p.summary;return `<details><summary>${esc(p.title)} <span class="mut">(${p.year})</span></summary><p><b>TL;DR</b> ${esc(s.tldr)}</p><p><b>Problem.</b> ${esc(s.problem)}</p><p><b>Mechanism.</b> ${esc(s.mechanism)}</p><div class="cards2"><div><h4>Key ideas</h4><ul class="tight">${(s.key_ideas||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div><div><h4>Assumptions & trade-offs</h4><ul class="tight">${(s.assumptions_and_tradeoffs||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div></div><p><b>Since then.</b> ${esc(s.what_changed_since)}</p><p class="mut"><a href="${esc(p.url)}" rel="noopener">Original</a> · <a href="${esc(p.blockchainlab)}?utm_source=github&utm_medium=hub&utm_campaign=blockchains-hub">Blockchain Lab reading</a></p></details>`}).join("")}catch(e){fail(e)}""",
  h1="AI whitepaper summaries", intro="Summarised from the original PDFs; re-summarised only when the source text changes. " + AI_INTRO)

# ---------------------------------------------------------------- Monitors
P("/gas/", "Multi-chain gas tracker & alerts — 21 chains, blob fees, Bitcoin", "Live base and priority fees on 21 EVM chains, Ethereum blob base fee and Bitcoin sat/vB. Set a browser alert for when gas drops below your target.",
  """<div class="panel"><div class="row"><b>Gas alert</b><select class="f" id="ac"></select><span>below</span><input class="f" id="at" type="number" step="0.01" style="width:110px" placeholder="gwei"><span>gwei</span><button class="b" id="arm">Arm alert</button><span id="ast" class="mut"></span></div><p class="mut" style="margin:8px 0 0;font-size:13px">Checks the chain's public RPC from your browser every 30 s while this tab is open and fires a desktop notification. Nothing is stored server-side.</p></div>
<div id="btc" class="row"></div><div class="tablewrap"><table id="t"><thead><tr><th data-k="chain">Chain</th><th class="num" data-k="base_fee_gwei">Base fee</th><th class="num" data-k="priority_standard_gwei">Priority (p50)</th><th class="num" data-k="priority_fast_gwei">Fast (p90)</th><th class="num" data-k="gas_price_gwei">eth_gasPrice</th><th class="num" data-k="gas_used_ratio_avg">Block fullness</th><th>Base fee, last 20 blocks</th></tr></thead><tbody id="out"></tbody></table></div>""",
  IMP + r"""try{const d=await data("gas.json");stamp(d);const rows=d.chains.filter(c=>c.ok);
const g=v=>v==null?"—":v<0.01?num(v,5):num(v,v<1?3:2);
const R=rs=>$("#out").innerHTML=rs.map(c=>`<tr><td><b>${esc(c.chain)}</b> <span class="mut">${c.chain_id}</span></td><td class="num">${g(c.base_fee_gwei)}</td><td class="num">${g(c.priority_standard_gwei)}</td><td class="num">${g(c.priority_fast_gwei)}</td><td class="num">${g(c.gas_price_gwei)}</td><td class="num">${c.gas_used_ratio_avg!=null?Math.round(c.gas_used_ratio_avg*100)+"%":"—"}</td><td>${spark(c.base_fee_trend_gwei||[])}</td></tr>`).join("");R(rows);sortable($("#t"),rows,R);
const e=d.chains.find(c=>c.chain_id==1),b=d.bitcoin_sat_vb||{};$("#btc").innerHTML=`<div class="stat"><b>${g(e?.blob_base_fee_gwei)}</b><span>Ethereum blob base fee (gwei)</span></div>`+(b.fastestFee!=null?`<div class="stat"><b>${b.fastestFee} / ${b.halfHourFee} / ${b.hourFee}</b><span>Bitcoin sat/vB · fastest / 30 min / 1 h</span></div>`:"");
$("#ac").innerHTML=rows.map(c=>`<option value="${esc(c.rpc)}" data-n="${esc(c.chain)}">${esc(c.chain)}</option>`).join("");
let timer;$("#arm").onclick=async()=>{const t=parseFloat($("#at").value);if(!(t>0)){$("#ast").textContent="Enter a threshold";return}
 if("Notification"in window&&Notification.permission!=="granted")await Notification.requestPermission();clearInterval(timer);
 const url=$("#ac").value,name=$("#ac").selectedOptions[0].dataset.n;const tick=async()=>{try{const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_gasPrice",params:[]})}).then(r=>r.json());const v=parseInt(r.result,16)/1e9;$("#ast").innerHTML=`${esc(name)}: <b>${g(v)}</b> gwei · checked ${new Date().toLocaleTimeString()}`;if(v<=t){clearInterval(timer);$("#ast").innerHTML+=` — <b class="ok">below ${t}!</b>`;if(Notification.permission==="granted")new Notification(`${name} gas is ${g(v)} gwei`,{body:`Below your ${t} gwei alert.`});}}catch(e){$("#ast").textContent="RPC error: "+e.message}};tick();timer=setInterval(tick,30000);};
}catch(e){fail(e)}""",
  h1="Gas tracker & alerts", intro="21 EVM chains via public RPCs (eth_feeHistory), Ethereum blob base fee (EIP-4844) and Bitcoin fees from mempool.space. Refreshed hourly.")

P("/chains/", "Chain liveness monitor — is the chain halted?", "Head-block age for 21 EVM chains plus Bitcoin and Solana. Detects halted or stalled chains, refreshed hourly with a live re-check from your browser.",
  """<div class="row" style="margin-bottom:10px"><button class="b ghost" id="live">Re-check EVM chains live from my browser</button><span class="mut" id="lst"></span></div><div class="tablewrap"><table id="t"><thead><tr><th data-k="chain">Chain</th><th data-k="status">Status</th><th class="num" data-k="height">Height</th><th class="num" data-k="head_age_s">Head age</th><th class="num" data-k="threshold_s">Stall threshold</th><th>Explorer</th></tr></thead><tbody id="out"></tbody></table></div>""",
  IMP + r"""try{const d=await data("liveness.json");stamp(d);const rows=d.chains;const cls={ok:"up",stalled:"down",slow:"stale",unreachable:"down"};
const R=rs=>$("#out").innerHTML=rs.map(c=>`<tr id="c${c.chain_id||c.chain}"><td><b>${esc(c.chain)}</b></td><td><span class="badge ${cls[c.status]}">${esc(c.status)}</span></td><td class="num">${num(c.height,0)}</td><td class="num age">${c.head_age_s!=null?num(c.head_age_s,1)+" s":"—"}</td><td class="num">${c.threshold_s?c.threshold_s+" s":"—"}</td><td>${c.explorer?`<a href="${esc(c.explorer)}" rel="noopener">open</a>`:""}</td></tr>`).join("");R(rows);sortable($("#t"),rows,R);
$("#live").onclick=async()=>{$("#lst").textContent="checking…";let n=0;await Promise.all(rows.filter(c=>c.rpc&&c.chain_id).map(async c=>{try{const r=await fetch(c.rpc,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_getBlockByNumber",params:["latest",false]})}).then(r=>r.json());const age=Date.now()/1000-parseInt(r.result.timestamp,16);const td=$(`#c${c.chain_id} .age`);if(td){td.innerHTML=`<b class="${age<=c.threshold_s?"ok":"bad"}">${num(age,1)} s</b> live`;n++}}catch{}}));$("#lst").textContent=`${n} chains re-checked from your browser`;};
}catch(e){fail(e)}""",
  h1="Chain liveness monitor", intro="A chain is flagged <b>stalled</b> when its freshest head block (best of up to 3 public RPCs) is older than the threshold.")

P("/rpc/", "Public RPC latency leaderboard — fastest free Ethereum, Base, Arbitrum RPCs", "64 free public RPC endpoints across 21 chains ranked by median latency, success rate and block lag. Run the benchmark from your own browser too.",
  """<div class="row" style="margin-bottom:10px"><select class="f" id="ch"><option value="">All chains</option></select><button class="b ghost" id="me">Benchmark from my browser</button><span class="mut" id="ms"></span></div><div id="hist" class="panel"></div><div class="tablewrap"><table id="t"><thead><tr><th data-k="score">#</th><th data-k="chain">Chain</th><th data-k="url">Endpoint</th><th class="num" data-k="median_ms">Median</th><th class="num" data-k="p90_ms">p90</th><th class="num" data-k="success_rate">Success</th><th class="num" data-k="lag_blocks">Lag</th><th class="num">You</th></tr></thead><tbody id="out"></tbody></table></div>""",
  IMP + r"""try{const d=await data("rpc-latency.json");stamp(d);let rows=d.endpoints;rows.forEach((r,i)=>r.rank=i+1);
$("#ch").innerHTML+=[...new Set(rows.map(r=>r.chain))].map(c=>`<option>${esc(c)}</option>`).join("");
const R=rs=>{const c=$("#ch").value;$("#out").innerHTML=rs.filter(r=>!c||r.chain==c).map(r=>`<tr><td>${r.rank}</td><td>${esc(r.chain)}</td><td class="mono">${esc(r.url)}</td><td class="num">${r.median_ms!=null?num(r.median_ms,0)+" ms":"—"}</td><td class="num">${r.p90_ms!=null?num(r.p90_ms,0)+" ms":"—"}</td><td class="num ${r.success_rate==1?"ok":r.success_rate>0?"warn":"bad"}">${Math.round(r.success_rate*100)}%</td><td class="num">${r.lag_blocks??"—"}</td><td class="num you" data-u="${esc(r.url)}">—</td></tr>`).join("")};R(rows);sortable($("#t"),rows,R);$("#ch").onchange=()=>R(rows);
const h=d.history||[];$("#hist").innerHTML=`<b>Median latency of healthy endpoints over time</b> ${spark(h.map(x=>x.median_ms),300,40)} <span class="mut">${h.length} hourly samples · vantage: ${esc(d.vantage)}</span>`;
$("#me").onclick=async()=>{$("#ms").textContent="benchmarking…";const cells=$$(".you");for(const td of cells){const u=td.dataset.u;const ts=[];for(let i=0;i<3;i++){const t=performance.now();try{const r=await fetch(u,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_blockNumber",params:[]})});await r.json();ts.push(performance.now()-t)}catch{}}td.innerHTML=ts.length?`<b>${Math.round(ts.sort((a,b)=>a-b)[1]??ts[0])} ms</b>`:`<span class="bad">blocked</span>`;}$("#ms").textContent="done — numbers include your network + CORS";};
}catch(e){fail(e)}""",
  h1="RPC latency leaderboard", intro="5 timed <code>eth_blockNumber</code> calls per endpoint every hour from GitHub Actions, scored by median latency × reliability, penalised for lagging blocks.")

P("/depeg/", "Stablecoin depeg monitor — USDT, USDC, DAI, USDe and 60 more", "Live price deviation from $1 for every USD stablecoin over $50M circulating, with watch and depeg alerts.",
  """<div id="al"></div><div class="tablewrap"><table id="t"><thead><tr><th data-k="name">Stablecoin</th><th data-k="status">Status</th><th class="num" data-k="price">Price</th><th class="num" data-k="deviation_pct">Deviation</th><th class="num" data-k="circulating_usd">Circulating</th><th data-k="mechanism">Mechanism</th></tr></thead><tbody id="out"></tbody></table></div>""",
  IMP + r"""try{const d=await data("depeg.json");stamp(d);const rows=d.stablecoins;const cls={ok:"up",watch:"stale",depeg:"down"};
$("#al").innerHTML=d.alerts.length?`<div class="note"><b>${d.alerts.length} on watch/depeg:</b> ${d.alerts.map(a=>`${esc(a.symbol)} ${pct(a.deviation_pct)}`).join(" · ")}</div>`:`<div class="note ok">All tracked stablecoins within ±0.5% of $1.</div>`;
const R=rs=>$("#out").innerHTML=rs.map(s=>`<tr><td><b>${esc(s.symbol)}</b> <span class="mut">${esc(s.name)}</span></td><td><span class="badge ${cls[s.status]}">${s.status}</span></td><td class="num">$${num(s.price,4)}</td><td class="num">${pct(s.deviation_pct)}</td><td class="num">${usd(s.circulating_usd)}</td><td class="mut">${esc(s.mechanism)}</td></tr>`).join("");R(rows);sortable($("#t"),rows,R);}catch(e){fail(e)}""",
  h1="Stablecoin depeg monitor", intro="Status: <b>ok</b> within ±0.5%, <b>watch</b> within ±2%, otherwise <b>depeg</b>. Prices from DefiLlama, refreshed daily. Long-tail prices can be stale on thin markets — check before acting.")

P("/scan/", "Smart-contract security quick-scan (Slither) — WETH, USDT, Uniswap, Aave, Safe", "Slither static analysis of 17 popular verified Ethereum contracts, refreshed weekly, with every finding and its source location.",
  """<div class="note">Static-analysis hits are leads, not confirmed bugs — battle-tested contracts trigger many detectors by design. See the <a href="/ai/audits/">AI audit-checklist reports</a> for triage. Want a contract scanned? Open an issue on <a href="https://github.com/Blockchains/blockchains.github.io/issues/new?title=Scan%20request:%200x...">GitHub</a>; maintainers run the <code>security-scan</code> workflow with the address.</div><div id="out"><div class="empty">Loading…</div></div>""",
  IMP + r"""try{const d=await data("slither.json");stamp(d);$("#out").innerHTML=`<p class="mut">${esc(d.slither_version?"Slither "+d.slither_version:"")}</p>`+d.contracts.filter(c=>c.ok).map(c=>`<details id="${esc(c.address)}"><summary>${esc(c.name)} <span class="mut">· <span class="bad">High ${c.counts.High}</span> · <span class="warn">Medium ${c.counts.Medium}</span> · Low ${c.counts.Low} · Info ${c.counts.Informational}</span></summary><p class="mut mono">${esc(c.address)} · scanned ${esc(ago(c.scanned_at))} · <a href="${esc(c.explorer)}">source</a></p><table><tr><th>Impact</th><th>Detector</th><th>Finding</th><th>Location</th></tr>${c.findings.filter(f=>f.impact!="Informational"&&f.impact!="Optimization").slice(0,40).map(f=>`<tr><td class="${f.impact=="High"?"bad":f.impact=="Medium"?"warn":""}">${esc(f.impact)}</td><td><a href="https://github.com/crytic/slither/wiki/Detector-Documentation#${esc(f.check)}">${esc(f.check)}</a></td><td style="white-space:pre-wrap;font-size:12.5px">${esc(f.description.slice(0,400))}</td><td class="mono">${esc(f.location||"")}</td></tr>`).join("")}</table></details>`).join("");if(location.hash){const el=document.getElementById(location.hash.slice(1));if(el){el.open=true;el.scrollIntoView()}}}catch(e){fail(e)}""",
  h1="Contract security quick-scan", intro="Slither on Sourcify-verified source, run weekly in GitHub Actions.")

P("/incidents/", "Crypto hack & exploit feed — latest 300 incidents, RSS", "The latest 300 crypto hacks and exploits with technique, chains and amounts, plus an RSS feed. Data: DefiLlama.",
  """<div class="row" style="margin-bottom:10px"><input class="f" id="q" placeholder="Filter by name, chain, technique…" style="flex:1;min-width:240px"><a class="b ghost" style="padding:10px 14px;border-radius:10px;border:1px solid var(--line)" href="/incidents/feed.xml">RSS feed</a><a href="/ai/incidents/">AI explainer →</a></div><div id="sum" class="stats"></div><div class="tablewrap"><table id="t"><thead><tr><th data-k="date">Date</th><th data-k="name">Name</th><th class="num" data-k="amount_usd">Lost</th><th data-k="technique">Technique</th><th data-k="classification">Class</th><th>Chains</th><th></th></tr></thead><tbody id="out"></tbody></table></div>""",
  IMP + r"""try{const d=await data("incidents.json");stamp(d);const rows=d.incidents;$("#sum").innerHTML=`<div class="stat"><b>${usd(d.ytd_usd)}</b><span>lost this year (tracked)</span></div><div class="stat"><b>${usd(d.total_all_time_usd)}</b><span>all time</span></div>`;
const R=rs=>{const q=$("#q").value.toLowerCase();$("#out").innerHTML=rs.filter(r=>!q||JSON.stringify(r).toLowerCase().includes(q)).map(r=>`<tr><td>${esc(r.date)}</td><td><b>${esc(r.name)}</b>${r.bridge?' <span class="pill">bridge</span>':""}</td><td class="num">${usd(r.amount_usd)}</td><td>${esc(r.technique)}</td><td class="mut">${esc(r.classification)}</td><td class="mut">${esc(r.chains.join(", "))}</td><td>${r.source?`<a href="${esc(r.source)}" rel="noopener nofollow">source</a>`:""}</td></tr>`).join("")};R(rows);sortable($("#t"),rows,R);$("#q").oninput=()=>R(rows);}catch(e){fail(e)}""",
  h1="Chain incident feed", intro="Hacks and exploits from DefiLlama's public database, refreshed daily. Subscribe via RSS.")

# ---------------------------------------------------------------- Finders
P("/events/", "Web3 hackathons & events calendar — subscribe (ICS)", "Upcoming ETHGlobal hackathons and summits. Subscribe once in Google, Apple or Outlook calendar and stay updated.",
  """<div class="panel"><b>Subscribe:</b> <code id="ics"></code> <button class="b ghost" id="cp">Copy</button> · <a id="gc" rel="noopener">Add to Google Calendar</a> · <a id="wc">Apple / Outlook (webcal)</a></div><div id="out" class="cards2"></div>""",
  IMP + r"""try{const d=await data("events.json");stamp(d);const u=d.ics;$("#ics").textContent=u;$("#cp").onclick=()=>navigator.clipboard.writeText(u);$("#gc").href="https://calendar.google.com/calendar/r?cid="+encodeURIComponent(u.replace("https://","webcal://"));$("#wc").href=u.replace("https://","webcal://");
const f=x=>new Date(x).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});$("#out").innerHTML=d.events.map(e=>`<a class="card" href="${esc(e.url)}" rel="noopener"><span class="cat">${esc(e.type)} · ${esc(e.medium)}</span><h3>${esc(e.name)}</h3><p>${f(e.start)}${e.end!=e.start?" – "+f(e.end):""}</p><div class="meta"><span>${esc(e.organiser)}</span></div></a>`).join("");}catch(e){fail(e)}""",
  h1="Events & hackathons calendar", intro="From ETHGlobal's public events page, refreshed daily. See also the <a href=\"/ai/ideas/\">AI idea generator</a> for what to build.")

P("/jobs/", "Crypto & web3 job board — 500+ roles from public sources", "Search 500+ open crypto and web3 roles aggregated daily from Coinbase, Ripple, Gemini, Fireblocks, Consensys and CryptoJobsList.",
  """<div class="row" style="margin-bottom:10px"><input class="f" id="q" placeholder="Search title, company, location — e.g. “solidity remote”" style="flex:1;min-width:260px"><select class="f" id="co"><option value="">All companies</option></select><span class="mut" id="n"></span></div><div class="tablewrap"><table><thead><tr><th>Role</th><th>Company</th><th>Location</th><th>Posted</th><th>Source</th></tr></thead><tbody id="out"></tbody></table></div>""",
  IMP + r"""try{const d=await data("jobs.json");stamp(d);const cos=[...new Set(d.jobs.map(j=>j.company).filter(Boolean))].sort();$("#co").innerHTML+=cos.slice(0,400).map(c=>`<option>${esc(c)}</option>`).join("");
const R=()=>{const t=$("#q").value.toLowerCase().split(/\s+/).filter(Boolean),c=$("#co").value;const h=d.jobs.filter(j=>(!c||j.company==c)&&t.every(x=>(j.title+" "+j.company+" "+(j.location||"")).toLowerCase().includes(x)));$("#n").textContent=`${h.length} roles`;$("#out").innerHTML=h.slice(0,300).map(j=>`<tr><td><a href="${esc(j.url)}" rel="noopener nofollow">${esc(j.title)}</a></td><td>${esc(j.company)}</td><td class="mut">${esc(j.location||"")}</td><td class="mut">${esc(j.posted||"")}</td><td class="mut">${esc(j.source)}</td></tr>`).join("")};$("#q").oninput=R;$("#co").onchange=R;$("#q").value=new URLSearchParams(location.search).get("q")||"";R();}catch(e){fail(e)}""",
  h1="Crypto job board", intro="Aggregated from Greenhouse public job-board APIs and the CryptoJobsList RSS feed. Apply on the employer's own page.")

P("/grants/", "Web3 grants finder — 33 ecosystem grant programmes", "Find grant programmes for Ethereum, Solana, Bitcoin, Polkadot, Cosmos, L2s and more. Official links checked daily.",
  """<input class="f" id="q" placeholder="Filter by ecosystem or funder — e.g. “bitcoin”, “L2”, “zk”" style="width:100%;max-width:480px;margin-bottom:12px"><div id="out" class="grid"></div>""",
  IMP + r"""try{const d=await data("grants.json");stamp(d);const R=()=>{const q=$("#q").value.toLowerCase();$("#out").innerHTML=d.grants.filter(g=>!q||(g.name+g.ecosystem+g.funder).toLowerCase().includes(q)).map(g=>`<a class="card" href="${esc(g.url)}" rel="noopener"><span class="cat">${esc(g.ecosystem)}</span><h3>${esc(g.name)}</h3><p>${esc(g.funder)}</p><div class="meta"><span class="mut">link checked ${esc(ago(g.checked_at))}</span><span class="badge ${g.link_ok?"up":"down"}">${g.link_ok?"link ok":"link broken"}</span></div></a>`).join("")};$("#q").oninput=R;R();}catch(e){fail(e)}""",
  h1="Grants finder", intro="Curated by Blockchain Lab. Amounts and rules change — always read the programme's own page.")

P("/glossary/", "Blockchain glossary search — plain-language definitions", "Instant search over the Blockchain Lab glossary: short, defensible definitions of blockchain mechanisms.",
  """<input class="f" id="q" placeholder="Search terms — e.g. “oracle”, “custody”, “merkle”" style="width:100%;max-width:480px;margin-bottom:12px" autofocus><div id="out" class="grid"></div>""",
  IMP + r"""try{const d=await data("glossary.json");stamp(d);const R=()=>{const q=$("#q").value.toLowerCase();$("#out").innerHTML=d.terms.filter(t=>!q||(t.term+" "+t.definition).toLowerCase().includes(q)).map(t=>`<a class="card" href="${esc(t.url)}?utm_source=github&utm_medium=hub&utm_campaign=blockchains-hub"><h3>${esc(t.term)}</h3><p>${esc(t.definition)}</p></a>`).join("")||`<div class="empty">No match.</div>`};$("#q").oninput=R;$("#q").value=new URLSearchParams(location.search).get("q")||"";R();}catch(e){fail(e)}""",
  h1="Glossary search", intro="Definitions from <a href=\"https://blockchainlab.com/learn/glossary\">blockchainlab.com/learn/glossary</a>.")

P("/papers/", "Blockchain whitepaper library search — 600+ papers", "Search the Blockchain Lab research corpus of 600+ blockchain papers by title, author, topic and year.",
  """<input class="f" id="q" placeholder="Search papers — e.g. “zk”, “consensus”, “Buterin”, “2014”" style="width:100%;max-width:520px;margin-bottom:12px"><p class="mut" id="n"></p><div class="tablewrap"><table><thead><tr><th>Title</th><th>Year</th><th>Topic</th><th></th></tr></thead><tbody id="out"></tbody></table></div><p class="mut">AI summaries of 12 foundational papers: <a href="/ai/whitepapers/">AI whitepaper summaries →</a></p>""",
  IMP + r"""try{const r=await fetch("/blockchainlab-api/v1/whitepapers.json").then(r=>r.json());stamp(r);const P=r.data;const k=Object.keys(P[0]);const g=(p,...ks)=>{for(const x of ks)if(p[x]!=null&&p[x]!=="")return Array.isArray(p[x])?p[x].join(", "):p[x];return ""};
const R=()=>{const t=$("#q").value.toLowerCase().split(/\s+/).filter(Boolean);const h=P.filter(p=>t.every(x=>JSON.stringify(p).toLowerCase().includes(x)));$("#n").textContent=`${h.length} of ${P.length} papers`;$("#out").innerHTML=h.slice(0,250).map(p=>`<tr><td><b>${esc(g(p,"title","name"))}</b><br><span class="mut">${esc(g(p,"authors","author")).slice(0,140)}</span></td><td>${esc(g(p,"year","published"))}</td><td class="mut">${esc(g(p,"topic","category","topics"))}</td><td>${g(p,"url","page_url","blockchainlab_url")?`<a href="${esc(g(p,"url","page_url","blockchainlab_url"))}">read</a>`:""}${g(p,"source_url","original_url","pdf")?` · <a href="${esc(g(p,"source_url","original_url","pdf"))}" rel="noopener">original</a>`:""}</td></tr>`).join("")};$("#q").oninput=R;R();}catch(e){fail(e)}""",
  h1="Whitepaper library search", intro="Metadata from the Blockchain Lab API <code>whitepapers</code> dataset; readings live on blockchainlab.com.")

P("/phishing/", "Crypto phishing domain checker — check a link before you connect your wallet", "Paste a URL to check it against MetaMask's open-source phishing blocklist (100k+ domains), including look-alike detection.",
  """<div class="panel"><div class="row"><input class="f" id="u" placeholder="https://uniswap-claim.example.com" style="flex:1;min-width:260px"><button class="b" id="go">Check</button></div><div id="res" style="margin-top:14px"></div><p class="mut" id="ver" style="font-size:13px"></p></div><div class="note">Runs entirely in your browser against <a href="https://github.com/MetaMask/eth-phishing-detect">MetaMask/eth-phishing-detect</a>. “Not listed” does not mean safe: new scams appear hourly. Never sign a transaction you do not understand — decode it first with the <a href="/blockchainlab-tools/tx/">tx decoder</a> or <a href="/blockchainlab-tools/eip712/">EIP-712 viewer</a>, and review approvals with the <a href="/blockchainlab-tools/approvals/">approvals checker</a>.</div>""",
  IMP + r"""let cfg;const load=async()=>{if(cfg)return cfg;$("#ver").textContent="Loading blocklist (≈3 MB)…";cfg=await fetch("https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json").then(r=>r.json());cfg.bl=new Set(cfg.blacklist);cfg.wl=new Set(cfg.whitelist);$("#ver").textContent=`MetaMask list v${cfg.version}: ${cfg.blacklist.length.toLocaleString()} blocked domains, ${cfg.fuzzylist.length} protected brands, tolerance ${cfg.tolerance}.`;return cfg};
const lev=(a,b)=>{const m=[...Array(b.length+1).keys()];for(let i=1;i<=a.length;i++){let p=m[0];m[0]=i;for(let j=1;j<=b.length;j++){const t=m[j];m[j]=Math.min(m[j]+1,m[j-1]+1,p+(a[i-1]==b[j-1]?0:1));p=t}}return m[b.length]};
const parents=h=>{const p=h.split(".");return p.map((_,i)=>p.slice(i).join(".")).filter(x=>x.includes("."))};
function check(c,input){let h;try{h=new URL(/^[a-z]+:\/\//i.test(input)?input:"https://"+input).hostname.toLowerCase().replace(/^www\./,"")}catch{return{v:"invalid"}}
 const ps=parents(h);if(ps.some(x=>c.wl.has(x)))return{v:"allow",h,why:"on the MetaMask allowlist"};const hit=ps.find(x=>c.bl.has(x));if(hit)return{v:"block",h,why:`listed as phishing (${hit})`};
 const root=ps[ps.length-2]||h;const sld=root.split(".")[0];for(const f of c.fuzzylist){const fs=f.split(".")[0];const d=lev(sld,fs);if(sld!==fs&&d<=c.tolerance)return{v:"warn",h,why:`looks like ${f} (edit distance ${d})`}}return{v:"unlisted",h,why:"not on the blocklist"}}
window.__check=check;
$("#go").onclick=async()=>{const c=await load();const r=check(c,$("#u").value.trim());const m={block:["down","🚫 Blocked"],warn:["stale","⚠️ Look-alike"],allow:["up","✅ Allowlisted"],unlisted:["","ℹ️ Not listed"],invalid:["down","Invalid URL"]}[r.v];$("#res").innerHTML=`<span class="badge ${m[0]}" style="font-size:15px;padding:6px 12px">${m[1]}</span> <b class="mono">${esc(r.h||"")}</b> <span class="mut">— ${esc(r.why||"")}</span>`};
$("#u").addEventListener("keydown",e=>{if(e.key=="Enter")$("#go").click()});const q=new URLSearchParams(location.search).get("u");if(q){$("#u").value=q;$("#go").click()}""",
  h1="Phishing domain checker", intro="Check a link before you connect a wallet or sign anything.")

P("/compare/", "DeFi protocol comparison — TVL, fees, chains, audits side by side", "Compare up to 4 DeFi protocols side by side: TVL, 1d/7d change, fees, market cap, chains and audits. Top 400 protocols, data from DefiLlama.",
  """<div class="panel"><div class="row"><input class="f" id="q" list="pl" placeholder="Add a protocol — e.g. Aave, Lido, Uniswap" style="flex:1;min-width:240px"><datalist id="pl"></datalist><button class="b" id="add">Add</button><button class="b ghost" id="clr">Clear</button></div><p class="mut" style="font-size:13px;margin:8px 0 0">Shareable: the URL updates as you add protocols.</p></div><div id="out"></div><h2 class="sec">Top 400 by TVL</h2><div class="tablewrap"><table id="t"><thead><tr><th data-k="name">Protocol</th><th data-k="category">Category</th><th class="num" data-k="tvl">TVL</th><th class="num" data-k="change_7d">7d</th><th class="num" data-k="fees_30d">Fees 30d</th><th></th></tr></thead><tbody id="all"></tbody></table></div>""",
  IMP + r"""try{const d=await data("protocols.json");stamp(d);const P=d.protocols,by=Object.fromEntries(P.map(p=>[p.slug,p]));$("#pl").innerHTML=P.map(p=>`<option value="${esc(p.name)}">`).join("");
let sel=(new URLSearchParams(location.search).get("p")||"").split(",").filter(s=>by[s]);if(!sel.length)sel=P.slice(0,3).map(p=>p.slug);
const rowsDef=[["Category",p=>esc(p.category)],["TVL",p=>usd(p.tvl)],["1d change",p=>pct(p.change_1d)],["7d change",p=>pct(p.change_7d)],["Fees 24h",p=>usd(p.fees_24h)],["Fees 30d",p=>usd(p.fees_30d)],["Fees 30d / TVL (annualised)",p=>p.fees_30d&&p.tvl?(p.fees_30d*12/p.tvl*100).toFixed(2)+"%":"—"],["Market cap",p=>usd(p.mcap)],["Mcap / TVL",p=>p.mcap&&p.tvl?(p.mcap/p.tvl).toFixed(2):"—"],["Chains",p=>(p.chains||[]).map(c=>`<span class="pill">${esc(c)}</span>`).join("")],["Audits listed",p=>esc(p.audits??"—")],["Links",p=>`<a href="${esc(p.llama)}">DefiLlama</a>${p.url?` · <a href="${esc(p.url)}" rel="noopener">site</a>`:""}`]];
const R=()=>{const ps=sel.map(s=>by[s]);history.replaceState(null,"","?p="+sel.join(","));$("#out").innerHTML=ps.length?`<div class="tablewrap"><table><tr><th></th>${ps.map(p=>`<th>${p.logo?`<img src="${esc(p.logo)}" width="18" height="18" style="vertical-align:middle;border-radius:50%" alt="" loading="lazy"> `:""}${esc(p.name)} <a href="#" data-x="${esc(p.slug)}" title="remove">✕</a></th>`).join("")}</tr>${rowsDef.map(([n,f])=>`<tr><td class="mut">${n}</td>${ps.map(p=>`<td>${f(p)}</td>`).join("")}</tr>`).join("")}</table></div>`:""};
$("#out").addEventListener("click",e=>{const x=e.target.dataset.x;if(x){e.preventDefault();sel=sel.filter(s=>s!=x);R()}});
$("#add").onclick=()=>{const v=$("#q").value.toLowerCase();const p=P.find(p=>p.name.toLowerCase()==v)||P.find(p=>p.name.toLowerCase().includes(v));if(p&&!sel.includes(p.slug)){sel=[...sel,p.slug].slice(-4);R()}$("#q").value=""};$("#q").addEventListener("keydown",e=>{if(e.key=="Enter")$("#add").click()});$("#clr").onclick=()=>{sel=[];R()};R();
const all=P.slice();const RA=rs=>$("#all").innerHTML=rs.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td class="mut">${esc(p.category)}</td><td class="num">${usd(p.tvl)}</td><td class="num">${pct(p.change_7d)}</td><td class="num">${usd(p.fees_30d)}</td><td><a href="#" data-a="${esc(p.slug)}">compare</a></td></tr>`).join("");RA(all);sortable($("#t"),all,RA);$("#all").addEventListener("click",e=>{const a=e.target.dataset.a;if(a){e.preventDefault();if(!sel.includes(a)){sel=[...sel,a].slice(-4);R();scrollTo({top:0,behavior:"smooth"})}}});
}catch(e){fail(e)}""",
  h1="Protocol comparison", intro="Top 400 DeFi protocols by TVL with 24h/30d fees. Refreshed daily from DefiLlama. Not investment advice.")

P("/portfolio/", "Wallet portfolio viewer — multi-chain balances for any address or ENS (read-only)", "View native and token balances for any Ethereum address or ENS name across 10 EVM chains, read directly from public RPCs with Multicall3. No wallet connection, nothing stored.",
  """<div class="panel"><div class="row"><input class="f" id="a" placeholder="0x… address or name.eth" style="flex:1;min-width:280px" autocomplete="off"><button class="b" id="go">View</button><label class="mut"><input type="checkbox" id="dust"> show dust (&lt; $1)</label></div><p class="mut" id="st" style="font-size:13px;margin:8px 0 0">Read-only. Balances are read in your browser from public RPCs; prices from DefiLlama. Token coverage: Uniswap default token list (974 tokens).</p></div><div id="sum" class="stats"></div><div class="tablewrap"><table id="t"><thead><tr><th data-k="chain">Chain</th><th data-k="symbol">Asset</th><th class="num" data-k="amount">Balance</th><th class="num" data-k="price">Price</th><th class="num" data-k="value">Value</th></tr></thead><tbody id="out"></tbody></table></div>""",
  IMP + r"""import {ethers} from "https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.min.js";
const CH={1:{n:"Ethereum",r:"https://ethereum-rpc.publicnode.com",g:"ethereum",nat:"coingecko:ethereum",s:"ETH"},8453:{n:"Base",r:"https://base-rpc.publicnode.com",g:"base",nat:"coingecko:ethereum",s:"ETH"},42161:{n:"Arbitrum One",r:"https://arbitrum-one-rpc.publicnode.com",g:"arbitrum",nat:"coingecko:ethereum",s:"ETH"},10:{n:"OP Mainnet",r:"https://optimism-rpc.publicnode.com",g:"optimism",nat:"coingecko:ethereum",s:"ETH"},137:{n:"Polygon",r:"https://polygon-bor-rpc.publicnode.com",g:"polygon",nat:"coingecko:polygon-ecosystem-token",s:"POL"},56:{n:"BNB Chain",r:"https://bsc-rpc.publicnode.com",g:"bsc",nat:"coingecko:binancecoin",s:"BNB"},43114:{n:"Avalanche",r:"https://avalanche-c-chain-rpc.publicnode.com",g:"avax",nat:"coingecko:avalanche-2",s:"AVAX"},100:{n:"Gnosis",r:"https://gnosis-rpc.publicnode.com",g:"xdai",nat:"coingecko:xdai",s:"xDAI"},59144:{n:"Linea",r:"https://linea-rpc.publicnode.com",g:"linea",nat:"coingecko:ethereum",s:"ETH"},324:{n:"zkSync Era",r:"https://mainnet.era.zksync.io",g:"era",nat:"coingecko:ethereum",s:"ETH"}};
const MC="0xcA11bde05977b3631167028862bE2a173976CA11";const mcAbi=["function aggregate3((address target,bool allowFailure,bytes callData)[] calls) view returns ((bool success,bytes returnData)[])","function getEthBalance(address) view returns (uint256)"];const erc=new ethers.Interface(["function balanceOf(address) view returns (uint256)"]);
const toks=(await data("tokens.json")).tokens;let rows=[];
async function chainBal(cid,addr){const c=CH[cid];const p=new ethers.JsonRpcProvider(c.r,Number(cid),{staticNetwork:true,batchMaxCount:1});const out=[];
 out.push({chain:c.n,cid,symbol:c.s,key:c.nat,amount:Number(ethers.formatEther(await p.getBalance(addr)))});
 const ts=toks.filter(t=>t.chainId==cid);const mc=new ethers.Contract(MC,mcAbi,p);
 for(let i=0;i<ts.length;i+=150){const part=ts.slice(i,i+150);const res=await mc.aggregate3(part.map(t=>({target:t.address,allowFailure:true,callData:erc.encodeFunctionData("balanceOf",[addr])})));
  res.forEach((r,j)=>{if(r.success&&r.returnData.length>=66){const v=BigInt(r.returnData.slice(0,66));if(v>0n){const t=part[j];out.push({chain:c.n,cid,symbol:t.symbol,name:t.name,logo:t.logo,key:`${c.g}:${t.address}`,amount:Number(ethers.formatUnits(v,t.decimals))})}}})}
 return out}
async function run(){const inp=$("#a").value.trim();if(!inp)return;$("#st").textContent="Resolving…";let addr=inp;
 try{if(!ethers.isAddress(inp)){const p=new ethers.JsonRpcProvider(CH[1].r,1,{staticNetwork:true});addr=await p.resolveName(inp);if(!addr)throw new Error("ENS name has no address")}addr=ethers.getAddress(addr)}catch(e){$("#st").innerHTML=`<span class="bad">${esc(e.message)}</span>`;return}
 history.replaceState(null,"","?a="+encodeURIComponent(inp));$("#st").textContent=`Reading ${addr} on ${Object.keys(CH).length} chains…`;
 const res=await Promise.allSettled(Object.keys(CH).map(cid=>chainBal(cid,addr)));rows=res.flatMap(r=>r.status=="fulfilled"?r.value:[]);const failed=res.map((r,i)=>r.status=="rejected"?CH[Object.keys(CH)[i]].n:null).filter(Boolean);
 const keys=[...new Set(rows.map(r=>r.key))];const prices={};for(let i=0;i<keys.length;i+=80){try{const j=await fetch("https://coins.llama.fi/prices/current/"+keys.slice(i,i+80).join(",")).then(r=>r.json());Object.assign(prices,j.coins)}catch{}}
 rows.forEach(r=>{const pr=prices[r.key]||prices[r.key.toLowerCase()];r.price=pr?.price??null;r.value=r.price!=null?r.price*r.amount:null});rows.sort((a,b)=>(b.value??-1)-(a.value??-1));
 const tot=rows.reduce((s,r)=>s+(r.value||0),0);const byc={};rows.forEach(r=>byc[r.chain]=(byc[r.chain]||0)+(r.value||0));
 $("#sum").innerHTML=`<div class="stat"><b>${usd(tot)}</b><span>total (priced assets)</span></div>`+Object.entries(byc).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([c,v])=>`<div class="stat"><b>${usd(v)}</b><span>${esc(c)}</span></div>`).join("");
 $("#st").innerHTML=`<span class="mono">${esc(addr)}</span> · ${rows.length} non-zero balances${failed.length?` · <span class="warn">RPC failed: ${esc(failed.join(", "))}</span>`:""} · <a href="/blockchainlab-tools/approvals/?q=${addr}">check approvals</a> · <a href="/blockchainlab-tools/address/?q=${addr}">address tool</a>`;R(rows);}
const R=rs=>{const dust=$("#dust").checked;$("#out").innerHTML=rs.filter(r=>dust||r.value==null||r.value>=1).map(r=>`<tr><td>${esc(r.chain)}</td><td>${r.logo?`<img src="${esc(r.logo)}" width="16" height="16" alt="" loading="lazy" style="vertical-align:middle;border-radius:50%"> `:""}<b>${esc(r.symbol)}</b> <span class="mut">${esc(r.name||"native")}</span></td><td class="num">${num(r.amount,6)}</td><td class="num">${r.price!=null?"$"+num(r.price,4):"—"}</td><td class="num">${usd(r.value)}</td></tr>`).join("")||`<tr><td colspan="5" class="empty">No balances found.</td></tr>`};
sortable($("#t"),rows,R);$("#dust").onchange=()=>R(rows);$("#go").onclick=run;$("#a").addEventListener("keydown",e=>{if(e.key=="Enter")run()});const q=new URLSearchParams(location.search).get("a");if(q){$("#a").value=q;run()}""",
  h1="Wallet portfolio viewer", intro="Read-only and private: no wallet connection, no backend. Your browser talks directly to public RPCs.")

# ---------------------------------------------------------------- status page
P("/status/", "Service status — Blockchain Lab Hub", "Live health of every Blockchain Lab hub service: pages, data freshness and CI.",
  """<div id="sum" class="stats"></div><div class="tablewrap"><table><thead><tr><th>Service</th><th>Category</th><th>Status</th><th>Detail</th><th>Checked</th></tr></thead><tbody id="out"></tbody></table></div>""",
  IMP + r"""try{const [c,s]=await Promise.all([fetch("/services.json").then(r=>r.json()),data("status.json")]);$("#stamp").textContent="Health check "+ago(s.generated_at)+" (every 6 hours + after each data refresh)";$("#sum").innerHTML=`<div class="stat"><b class="ok">${s.up}</b><span>up</span></div><div class="stat"><b class="warn">${s.stale}</b><span>stale</span></div><div class="stat"><b class="bad">${s.down}</b><span>down</span></div>`;
$("#out").innerHTML=c.services.map(x=>{const r=s.services[x.id]||{};return `<tr><td><a href="${esc(x.url)}">${esc(x.name)}</a></td><td class="mut">${esc(x.category)}</td><td><span class="badge ${r.status||""}">${esc(r.status||"unknown")}</span></td><td class="mut">${esc(r.detail||(r.age_h!=null?"data age "+r.age_h+" h":r.workflows?Object.entries(r.workflows).map(([k,v])=>k+": "+v).join(", "):""))}</td><td class="mut">${r.checked_at?esc(ago(r.checked_at)):""}</td></tr>`}).join("")}catch(e){fail(e)}""",
  h1="Service status", intro="Every service on the hub is checked automatically: pages must return 200, data must be fresh, developer repos must have green CI.")


def sitemap():
    urls = sorted(set(PAGES)) + ["/incidents/feed.xml", "/events/events.ics"]
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(
        f"<url><loc>{SITE}{u}</loc><changefreq>{'hourly' if u in ('/gas/', '/chains/', '/rpc/') else 'daily'}</changefreq></url>\n" for u in urls if u.endswith("/")) + "</urlset>\n"
    (ROOT / "sitemap.xml").write_text(xml)
    (ROOT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n")


if __name__ == "__main__":
    sitemap()
    print(len(PAGES), "pages")
