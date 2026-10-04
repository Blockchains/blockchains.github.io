"""Builds services.json — the single source of truth for every service listed on the hub."""
import json
from common import ROOT, get_json, now_iso

HUB = "https://blockchains.github.io"
TOOLS = f"{HUB}/blockchainlab-tools"
API = f"{HUB}/blockchainlab-api/v1"
GH = "https://github.com/Blockchains"


def build():
    S = []

    def add(id, name, cat, desc, url, check, tags=(), extra=None):
        S.append({"id": id, "name": name, "category": cat, "description": desc, "url": url, "check": check, "tags": list(tags), **(extra or {})})

    # --- AI services (Grok, precomputed in Actions) ---
    ai = [("brief", "AI daily market brief", "Daily structure brief of chains, DEXs, fees, stablecoins, L2s and security — written by Grok from live data.", 30, ["daily"]),
          ("incidents", "AI incident explainer", "Recent hacks explained in plain English with a lesson for builders and the matching hands-on lab.", 30, ["daily", "security"]),
          ("ideas", "AI hackathon idea generator", "12 buildable hackathon ideas matched to upcoming events, grant programmes and category trends.", 30, ["daily"]),
          ("digest", "AI chain-health & L2 digest", "Chain liveness, gas, RPC reliability and L2 metrics summarised.", 30, ["daily"]),
          ("protocols", "AI protocol briefs", "What the top 15 DeFi protocols do, how they earn, and their key risks.", 24 * 8, ["weekly", "defi"]),
          ("contracts", "AI contract explainer", "Plain-English explainers of 17 of the most-used mainnet contracts from their verified source.", 24 * 8, ["weekly", "security"]),
          ("audits", "AI audit-checklist reports", "Checklist reviews of popular contracts combining Slither output with a Grok security review.", 24 * 8, ["weekly", "security"]),
          ("whitepapers", "AI whitepaper summaries", "Structured summaries of 12 foundational papers (Bitcoin, Ethereum, Uniswap, EIP-1559, EIP-4844…).", 24 * 8, ["weekly", "research"])]
    for k, n, d, age, tags in ai:
        add(f"ai-{k}", n, "AI", d, f"{HUB}/ai/{k}/", {"type": "data", "url": f"{HUB}/data/ai/{k}.json", "max_age_h": age}, ["ai", "grok", *tags])

    # --- monitors ---
    mon = [("gas", "Gas tracker & alerts", "Base/priority fees on 21 chains, Ethereum blob fee and Bitcoin sat/vB, with browser alerts when gas drops below your threshold.", "/gas/", "gas.json", 3),
           ("chains", "Chain liveness monitor", "Head-block age for 21 EVM chains, Bitcoin and Solana — spots halted or stalled chains.", "/chains/", "liveness.json", 3),
           ("rpc", "RPC latency leaderboard", "64 public RPC endpoints ranked by median latency, success rate and block lag; test from your own browser too.", "/rpc/", "rpc-latency.json", 3),
           ("depeg", "Stablecoin depeg monitor", "Every USD stablecoin over $50M, price deviation from $1 and alert status.", "/depeg/", "depeg.json", 30),
           ("scan", "Contract security quick-scan", "Slither static analysis of popular verified contracts, refreshed weekly; on-demand scans via workflow dispatch.", "/scan/", "slither.json", 24 * 8),
           ("incidents", "Chain incident feed", "Latest 300 hacks and exploits with technique, chains and amounts.", "/incidents/", "incidents.json", 30)]
    for k, n, d, path, f, age in mon:
        add(f"mon-{k}", n, "Monitors", d, HUB + path, {"type": "data", "url": f"{HUB}/data/{f}", "max_age_h": age}, ["monitor"])
    add("mon-sites", "Website status monitor", "Monitors", "Uptime, TLS, security headers and SEO checks for the Blockchain Lab sites.", f"{HUB}/sites-monitor/",
        {"type": "page", "url": f"{HUB}/sites-monitor/"}, ["monitor"])

    # --- feeds ---
    add("feed-incidents", "Incident RSS feed", "Feeds", "Subscribe to new hacks/exploits in any RSS reader.", f"{HUB}/incidents/feed.xml",
        {"type": "page", "url": f"{HUB}/incidents/feed.xml", "contains": "<rss"}, ["feed", "rss"])
    add("feed-events", "Events calendar (ICS)", "Feeds", "Subscribe in Google/Apple/Outlook calendar: upcoming ETHGlobal hackathons and summits.", f"{HUB}/events/events.ics",
        {"type": "page", "url": f"{HUB}/events/events.ics", "contains": "BEGIN:VCALENDAR"}, ["feed", "ics"])

    # --- finders / explorers ---
    fnd = [("portfolio", "Wallet portfolio viewer", "Read-only balances for any address or ENS across 10 EVM chains via public RPCs + Multicall3. Nothing leaves your browser.", "/portfolio/", None),
           ("compare", "Protocol comparison", "Compare up to 4 DeFi protocols side by side: TVL, 7-day change, fees, chains, audits.", "/compare/", "protocols.json"),
           ("events", "Events & hackathons calendar", "Upcoming hackathons and summits with one-click calendar subscription.", "/events/", "events.json"),
           ("jobs", "Crypto job board", "500+ open roles aggregated daily from public job boards (Greenhouse APIs, CryptoJobsList).", "/jobs/", "jobs.json"),
           ("grants", "Grants finder", "33 ecosystem grant programmes with official links checked daily.", "/grants/", "grants.json"),
           ("glossary", "Glossary search", "Instant search over the Blockchain Lab glossary.", "/glossary/", "glossary.json"),
           ("papers", "Whitepaper library search", "Search 600+ blockchain papers in the Blockchain Lab research corpus.", "/papers/", None),
           ("phishing", "Phishing domain checker", "Check a URL against MetaMask's open phishing blocklist before you connect a wallet (fuzzy look-alike match too).", "/phishing/", None)]
    for k, n, d, path, f in fnd:
        chk = {"type": "data", "url": f"{HUB}/data/{f}", "max_age_h": 30} if f else {"type": "page", "url": HUB + path, "contains": "<h1"}
        add(f"find-{k}", n, "Finders", d, HUB + path, chk, ["finder"])

    # --- tools (26) ---
    for t in json.load(open(ROOT / "scripts" / "tools.json")):
        add(f"tool-{t['slug']}", t["title"], "Tools", t["description"], f"{TOOLS}/{t['slug']}/",
            {"type": "page", "url": f"{TOOLS}/{t['slug']}/", "contains": "<h1"}, ["tool", "browser"])

    # --- data API (20 datasets) ---
    idx = get_json(f"{API}/index.json")
    for d in idx["datasets"]:
        add(f"data-{d['dataset']}", f"API: {d['dataset']}", "Data API", d["description"], d["url"],
            {"type": "data", "url": d["url"], "max_age_h": 50}, ["api", "json"], {"schema": d.get("schema")})

    # --- developer ---
    dev = [("sdk", "Blockchain Lab SDK (TS + Python)", "Typed clients for every API dataset. npm i github:Blockchains/blockchainlab-sdk", f"{GH}/blockchainlab-sdk", "blockchainlab-sdk"),
           ("mcp", "MCP server (43 tools)", "Give Claude, Cursor or VS Code agents 43 blockchain tools. Docker image on GHCR.", f"{GH}/blockchainlab-mcp", "blockchainlab-mcp"),
           ("labs", "54 hands-on labs", "Solidity/Foundry, Noir ZK and Cairo labs with tests — security, DeFi, MEV, governance.", f"{GH}/blockchainlab-labs", "blockchainlab-labs"),
           ("apidocs", "API docs & OpenAPI", "OpenAPI 3 spec, JSON Schemas and usage examples for the data API.", f"{HUB}/blockchainlab-api/", "blockchainlab-api")]
    for k, n, d, url, repo in dev:
        add(f"dev-{k}", n, "Developers", d, url, {"type": "ci", "repo": f"Blockchains/{repo}"}, ["developer"])

    out = {"generated_at": now_iso(), "count": len(S), "categories": sorted({s["category"] for s in S}), "services": S}
    (ROOT / "services.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    return out


if __name__ == "__main__":
    o = build()
    from collections import Counter
    print(o["count"], dict(Counter(s["category"] for s in o["services"])))
