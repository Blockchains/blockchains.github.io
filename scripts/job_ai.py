"""AI services powered by Grok (xAI). Runs server-side in GitHub Actions only; outputs static JSON for the hub.
Usage: python job_ai.py brief incidents ...   (default: all)"""
import json, sys, hashlib, datetime, subprocess, tempfile, re, html as htmlmod, os
from common import grok, get_json, http, read, write, AI_DISCLAIMER, DATA, now_iso, pmap
from contracts import TOP_CONTRACTS

API = "https://blockchains.github.io/blockchainlab-api/v1"
LABS = "https://github.com/Blockchains/blockchainlab-labs"
SYS_ANALYST = ("You are Blockchain Lab's research analyst. Write crisp, factual British English. Use ONLY the data provided; "
               "if something is not in the data, do not invent it. No price predictions, no investment advice, no hype. "
               "Return valid JSON exactly matching the requested schema.")


def ds(name):
    return get_json(f"{API}/{name}.json")["data"]


def J(text):
    return json.loads(text)


def save(name, payload, desc, sources):
    write(f"ai/{name}.json", dict(payload, disclaimer=AI_DISCLAIMER), source="Grok (xAI) over public data: " + ", ".join(sources),
          source_url="https://blockchains.github.io/ai/", description=desc)


# 1. Daily market & protocol brief
def brief():
    chains = sorted(ds("chains-tvl"), key=lambda r: -(r.get("tvl") or 0))[:15]
    stables = ds("stablecoins")[:10]
    dex = ds("dex-volumes")[:12]
    fees = ds("fees")[:12]
    l2 = ds("l2-metrics")[:10]
    dep = (read("depeg.json") or {}).get("alerts", [])
    inc = [i for i in (read("incidents.json") or {}).get("incidents", [])[:15]
           if i["date"] >= (datetime.date.today() - datetime.timedelta(days=14)).isoformat()]
    gas = [{k: r.get(k) for k in ("chain", "base_fee_gwei", "gas_price_gwei")} for r in (read("gas.json") or {}).get("chains", [])[:8]]
    data = {"date": datetime.date.today().isoformat(), "chains_tvl_top15": chains, "stablecoins_top10": stables, "dex_volumes_top12": dex,
            "fees_top12": fees, "l2_top10": l2, "stablecoin_peg_alerts": dep, "incidents_last_14d": inc, "gas_now": gas}
    schema = ('{"headline": str (<=110 chars), "summary": str (3-4 sentences), "sections": [{"title": str, "bullets": [str]}] '
              '(4-5 sections: Chains & TVL, DEX & fees, Stablecoins, L2s, Security), "watchlist": [str] (3-5 items to monitor, factual)}')
    text, meta = grok(SYS_ANALYST, f"Write today's crypto market structure brief from this data. Schema: {schema}\n\nDATA:\n{json.dumps(data, default=str)[:60000]}", json_mode=True, max_tokens=2500)
    out = J(text) | {"date": data["date"], "model": meta["model"], "tokens": meta["tokens"]}
    save("brief", out, "Daily AI market structure brief", ["Blockchain Lab API (DefiLlama, L2BEAT)", "hub monitors"])
    (DATA / "ai" / "briefs").mkdir(parents=True, exist_ok=True)
    (DATA / "ai" / "briefs" / f"{data['date']}.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    idx = sorted(p.stem for p in (DATA / "ai" / "briefs").glob("*.json"))
    (DATA / "ai" / "briefs" / "index.json").write_text(json.dumps({"dates": idx[::-1]}))
    return out["headline"]


# 2. Protocol briefs (top protocols by TVL)
def protocols():
    allp = get_json("https://api.llama.fi/protocols", timeout=90)
    allp = [p for p in allp if p.get("category") not in ("CEX", "Chain") and (p.get("tvl") or 0) > 0]
    allp.sort(key=lambda p: -(p.get("tvl") or 0))
    top = allp[:15]
    prev = {p["slug"]: p for p in (read("ai/protocols.json") or {}).get("protocols", [])}

    def one(p):
        facts = {k: p.get(k) for k in ("name", "slug", "category", "description", "chains", "tvl", "change_1d", "change_7d", "mcap",
                                        "audits", "audit_links", "url", "methodology", "forkedFrom", "oracles", "listedAt")}
        schema = '{"what_it_does": str, "how_it_makes_money": str, "key_risks": [str], "who_uses_it": str, "notable_facts": [str]}'
        t, m = grok(SYS_ANALYST, f"Write a protocol brief. Schema: {schema}\nFACTS:\n{json.dumps(facts, default=str)[:12000]}", json_mode=True, max_tokens=1200)
        return {"name": p["name"], "slug": p["slug"], "category": p.get("category"), "tvl": round(p.get("tvl") or 0), "chains": (p.get("chains") or [])[:8],
                "url": p.get("url"), "llama": f"https://defillama.com/protocol/{p['slug']}", "brief": J(t), "model": m["model"], "generated_at": now_iso()}
    rows = pmap(one, top, workers=4)
    save("protocols", {"count": len(rows), "protocols": rows}, "AI protocol briefs (top 15 by TVL)", ["DefiLlama /protocols"])
    return len(rows)


def sourcify_source(addr, chain=1, limit=28000):
    d = get_json(f"https://sourcify.dev/server/v2/contract/{chain}/{addr}?fields=sources,compilation", timeout=60)
    fq = d["compilation"]["fullyQualifiedName"]
    main_path = fq.rsplit(":", 1)[0]
    srcs = d["sources"]
    main = srcs.get(main_path, {}).get("content") or next(iter(srcs.values()))["content"]
    # main file first, then other files until the budget is used
    out, used = [f"// FILE: {main_path}\n{main}"], len(main)
    for p, v in srcs.items():
        if p == main_path or "/test" in p.lower():
            continue
        c = v.get("content", "")
        if used + len(c) > limit:
            continue
        out.append(f"// FILE: {p}\n{c}"); used += len(c)
    return "\n\n".join(out)[:limit], fq, d["compilation"].get("compilerVersion")


SYS_SEC = ("You are a senior smart-contract security engineer at Blockchain Lab. Explain clearly for developers. Base every statement on the "
           "provided source code and tool output; never invent functions that are not in the code. Return valid JSON exactly matching the schema.")


# 3. Contract explainer
def contracts():
    def one(c):
        name, addr, cat = c
        src, fq, ver = sourcify_source(addr)
        schema = ('{"summary": str (2-3 sentences), "key_functions": [{"name": str, "what": str}] (5-10), "admin_powers": [str], '
                  '"upgradeability": str, "user_risks": [str], "integration_tips": [str]}')
        t, m = grok(SYS_SEC, f"Explain this verified contract ({name}, {addr}, {fq}, solc {ver}). Schema: {schema}\n\nSOURCE:\n{src}", json_mode=True, max_tokens=2000)
        return {"name": name, "address": addr, "category": cat, "contract": fq, "compiler": ver, "explainer": J(t), "model": m["model"],
                "sourcify": f"https://repo.sourcify.dev/1/{addr}", "etherscan": f"https://etherscan.io/address/{addr}#code", "generated_at": now_iso()}
    rows = pmap(one, TOP_CONTRACTS, workers=4)
    save("contracts", {"count": len(rows), "contracts": rows}, "AI contract explainer (popular mainnet contracts)", ["Sourcify verified source"])
    return len(rows)


# 4. Audit-checklist reports (uses Slither output)
def audits():
    sl = {c["address"].lower(): c for c in (read("slither.json") or {}).get("contracts", []) if c.get("ok")}
    targets = [c for c in TOP_CONTRACTS if c[1].lower() in sl]

    def one(c):
        name, addr, cat = c
        s = sl[addr.lower()]
        src, fq, ver = sourcify_source(addr, limit=22000)
        top = [f for f in s["findings"] if f["impact"] in ("High", "Medium")][:15]
        schema = ('{"overall": str (2-3 sentences), "checklist": [{"item": str, "status": "pass"|"concern"|"n/a", "note": str}] '
                  '(cover: access control, upgradeability, reentrancy, oracle/price use, arithmetic, external calls, signature/replay, pausing/emergency, '
                  'token approvals, events/monitoring), "slither_triage": [{"check": str, "verdict": "likely false positive"|"by design"|"worth review", "why": str}]}')
        t, m = grok(SYS_SEC, f"Produce an audit-checklist review of {name} ({fq}). Slither High/Medium findings: {json.dumps(top)}\n"
                             f"Slither counts: {s['counts']}\nSchema: {schema}\n\nSOURCE:\n{src}", json_mode=True, max_tokens=2600)
        return {"name": name, "address": addr, "category": cat, "slither_counts": s["counts"], "report": J(t), "model": m["model"], "generated_at": now_iso()}
    rows = pmap(one, targets, workers=4)
    save("audits", {"count": len(rows), "reports": rows,
                    "note": "Automated checklist review — NOT an audit. Battle-tested contracts often trigger detectors by design."},
         "AI audit-checklist reports", ["Sourcify source", "Slither"])
    return len(rows)


# 5. Whitepaper summaries (cached by content hash)
PAPERS = [
    ("Bitcoin: A Peer-to-Peer Electronic Cash System", "https://bitcoin.org/bitcoin.pdf", "https://blockchainlab.com/whitepaper/bitcoin-nakamoto", 2008),
    ("Ethereum Whitepaper", "https://ethereum.org/en/whitepaper/", "https://blockchainlab.com/research/corpus/papers/ethereum", 2014),
    ("Uniswap v2 Core", "https://app.uniswap.org/whitepaper.pdf", "https://blockchainlab.com/whitepaper/uniswap-v2", 2020),
    ("Uniswap v3 Core", "https://app.uniswap.org/whitepaper-v3.pdf", "https://blockchainlab.com/whitepaper/uniswap-v3", 2021),
    ("Solana: A new architecture for a high performance blockchain", "https://solana.com/solana-whitepaper.pdf", "https://blockchainlab.com/whitepaper/solana", 2017),
    ("Chainlink 2.0", "https://research.chain.link/whitepaper-v2.pdf", "https://blockchainlab.com/whitepaper/chainlink", 2021),
    ("The Bitcoin Lightning Network", "https://lightning.network/lightning-network-paper.pdf", "https://blockchainlab.com/whitepaper/lightning", 2016),
    ("The Maker Protocol (Multi-Collateral Dai)", "https://makerdao.com/whitepaper/White%20Paper%20-The%20Maker%20Protocol_%20MakerDAO%E2%80%99s%20Multi-Collateral%20Dai%20%28MCD%29%20System-FINAL-%20021720.pdf", "https://blockchainlab.com/whitepaper/maker-dai", 2020),
    ("Aave V3 Technical Paper", "https://github.com/aave/aave-v3-core/raw/master/techpaper/Aave_V3_Technical_Paper.pdf", "https://blockchainlab.com/whitepaper/aave", 2022),
    ("Casper the Friendly Finality Gadget", "https://arxiv.org/pdf/1710.09437", "https://blockchainlab.com/whitepaper/casper-ffg", 2017),
    ("EIP-1559: Fee market change", "https://eips.ethereum.org/EIPS/eip-1559", "https://blockchainlab.com/whitepaper/eip-1559", 2019),
    ("EIP-4844: Shard Blob Transactions", "https://eips.ethereum.org/EIPS/eip-4844", "https://blockchainlab.com/whitepaper/eip-4844", 2022),
]


def paper_text(url):
    raw = http(url, timeout=90)
    if raw[:4] == b"%PDF":
        with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
            f.write(raw); f.flush()
            return subprocess.run(["pdftotext", "-layout", f.name, "-"], capture_output=True, text=True, timeout=120).stdout
    s = raw.decode("utf-8", "ignore")
    s = re.sub(r"(?is)<(script|style|nav|header|footer)[^>]*>.*?</\1>", " ", s)
    return htmlmod.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s)))


def whitepapers():
    prev = {p["url"]: p for p in (read("ai/whitepapers.json") or {}).get("papers", [])}

    def one(p):
        title, url, bl, year = p
        txt = paper_text(url)
        h = hashlib.sha256(txt.encode()).hexdigest()[:16]
        if url in prev and prev[url].get("text_sha256_16") == h and not os.environ.get("FORCE"):
            return prev[url]
        schema = ('{"tldr": str (1 sentence), "problem": str, "mechanism": str (how it works, 3-5 sentences), "key_ideas": [str] (4-6), '
                  '"assumptions_and_tradeoffs": [str], "what_changed_since": str (only well-established facts), "read_next": [str]}')
        t, m = grok("You are Blockchain Lab's research editor. Summarise accurately from the provided text; flag uncertainty. Return valid JSON.",
                    f"Summarise the paper '{title}' ({year}). Schema: {schema}\n\nTEXT (may be truncated):\n{txt[:45000]}", json_mode=True, max_tokens=1800)
        return {"title": title, "year": year, "url": url, "blockchainlab": bl, "chars": len(txt), "text_sha256_16": h, "summary": J(t),
                "model": m["model"], "generated_at": now_iso()}
    rows = pmap(one, PAPERS, workers=4)
    save("whitepapers", {"count": len(rows), "papers": rows}, "AI whitepaper summaries", ["original whitepaper PDFs/pages"])
    return len(rows)


# 6. Hackathon idea generator
def ideas():
    ev = (read("events.json") or {}).get("events", [])[:10]
    prot = (read("protocols.json") or {}).get("protocols", [])
    cats = {}
    for p in prot:
        c = p["category"]; cats.setdefault(c, [0, 0]); cats[c][0] += p["tvl"]; cats[c][1] += (p.get("change_7d") or 0) * p["tvl"]
    trend = sorted(({"category": k, "tvl": v[0], "tvl_weighted_change_7d": round(v[1] / v[0], 2) if v[0] else 0} for k, v in cats.items()),
                   key=lambda x: -x["tvl"])[:20]
    grants = [g["name"] + " (" + g["ecosystem"] + ")" for g in (read("grants.json") or {}).get("grants", [])]
    tools = "Blockchain Lab Tools (26 browser tools incl. EIP-712, calldata diff, approvals, MEV checker, Safe tx decoder), Blockchain Lab API (20 JSON datasets), MCP server (43 tools), SDK (TS/Python), 54 labs (Solidity, Noir ZK, Cairo)"
    schema = ('{"ideas": [{"title": str, "pitch": str (2 sentences), "track": str, "difficulty": "beginner"|"intermediate"|"advanced", '
              '"stack": [str], "build_steps": [str] (4-6), "fits_event": str|null, "fits_grant": str|null, "why_now": str}] (12 ideas)}')
    t, m = grok("You are a hackathon mentor at Blockchain Lab. Ideas must be buildable in a 36-hour hackathon by 2-4 people, useful, and not scams or token launches. Return valid JSON.",
                f"Generate hackathon ideas. Schema: {schema}\nUPCOMING EVENTS: {json.dumps(ev)}\nCATEGORY TRENDS: {json.dumps(trend)}\nGRANT PROGRAMS: {grants}\nFREE BUILDING BLOCKS: {tools}",
                json_mode=True, max_tokens=4000, temperature=0.7)
    out = J(t)
    save("ideas", out | {"model": m["model"], "inputs": {"events": len(ev), "categories": len(trend)}}, "AI hackathon idea generator", ["ETHGlobal events", "DefiLlama", "grants list"])
    return len(out["ideas"])


# 7. Incident explainer
def incidents():
    inc = (read("incidents.json") or {}).get("incidents", [])[:12]
    schema = ('{"items": [{"name": str, "date": str, "plain_english": str (2 sentences, only from the given fields), '
              '"lesson_for_builders": str, "related_lab": str|null}]}')
    labs = ("L09 Reentrancy, L13 Signatures, L19 FlashLoan, L22 Proxy, L28 InvariantVault, L37 OracleConsumer, L41 Sandwich, L42 SpotOracleLending, "
            "L43 CrossChainReplay, L45 CircuitBreaker, L03 Ownable/access control, L14 MultiSig")
    t, m = grok(SYS_SEC, f"Explain these recent incidents for builders using ONLY the provided classification/technique/amount fields; "
                         f"do not invent details. Map each to the most relevant lab from: {labs}. Schema: {schema}\nINCIDENTS: {json.dumps(inc)}",
                json_mode=True, max_tokens=3000)
    out = J(t)
    for it in out["items"]:
        src = next((i for i in inc if i["name"] == it["name"]), None)
        if src:
            it.update(amount_usd=src["amount_usd"], source=src["source"], chains=src["chains"])
    save("incidents", out | {"model": m["model"], "labs_repo": LABS}, "AI incident explainer", ["DefiLlama hacks"])
    return len(out["items"])


# 8. Weekly chain-health & L2 digest
def digest():
    data = {"liveness": (read("liveness.json") or {}).get("chains"), "gas": (read("gas.json") or {}).get("chains"),
            "rpc_top": (read("rpc-latency.json") or {}).get("endpoints", [])[:15], "rpc_history": (read("rpc-latency.json") or {}).get("history", [])[-48:],
            "l2": ds("l2-metrics")[:15], "bridges": ds("bridges")[:10]}
    schema = '{"headline": str, "summary": str, "chains": [str] (bullets), "l2s": [str], "infrastructure": [str], "builder_tips": [str]}'
    t, m = grok(SYS_ANALYST, f"Write the chain health & L2 digest. Schema: {schema}\nDATA:\n{json.dumps(data, default=str)[:60000]}", json_mode=True, max_tokens=2000)
    save("digest", J(t) | {"model": m["model"]}, "AI chain-health & L2 digest", ["hub monitors", "L2BEAT", "DefiLlama"])
    return 1


JOBS = {"brief": brief, "incidents": incidents, "ideas": ideas, "digest": digest, "protocols": protocols, "contracts": contracts,
        "audits": audits, "whitepapers": whitepapers}

if __name__ == "__main__":
    failed = []
    for k in sys.argv[1:] or list(JOBS):
        try:
            print(k, "->", JOBS[k]())
        except Exception as e:  # noqa: BLE001
            failed.append(k); print("FAILED", k, repr(e)[:400], file=sys.stderr)
    sys.exit(1 if failed else 0)
