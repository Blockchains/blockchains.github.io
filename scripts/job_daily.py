"""Daily data jobs: incidents (+RSS), events (+ICS), jobs, grants, glossary, protocols, stablecoin depegs."""
import json, re, sys, html, datetime, xml.etree.ElementTree as ET
from email.utils import format_datetime
from common import http, get_json, write, pmap, DATA, ROOT, now_iso

SITE = "https://blockchains.github.io"


def esc(s):
    return html.escape(str(s or ""), quote=True)


# ---------------- incidents ----------------
def incidents():
    rows = get_json("https://api.llama.fi/hacks")
    rows.sort(key=lambda r: r.get("date") or 0, reverse=True)
    out = []
    for r in rows[:300]:
        out.append({"date": datetime.datetime.fromtimestamp(r["date"], datetime.timezone.utc).date().isoformat(),
                    "name": r.get("name"), "amount_usd": r.get("amount"), "chains": r.get("chain") or [],
                    "classification": r.get("classification"), "technique": r.get("technique"),
                    "target_type": r.get("targetType"), "bridge": bool(r.get("bridgeHack")),
                    "returned_usd": r.get("returnedFunds"), "source": r.get("source"), "language": r.get("language")})
    year = str(datetime.date.today().year)
    ytd = sum((r["amount_usd"] or 0) for r in out if r["date"].startswith(year))
    write("incidents.json", {"count": len(out), "total_all_time_usd": sum((r.get("amount") or 0) for r in rows),
                             "ytd_usd": ytd, "incidents": out},
          source="DefiLlama hacks database", source_url="https://defillama.com/hacks", description="Chain incident feed (hacks & exploits)")
    # RSS 2.0
    items = []
    for r in out[:50]:
        d = datetime.datetime.fromisoformat(r["date"]).replace(tzinfo=datetime.timezone.utc)
        amt = f"${(r['amount_usd'] or 0)/1e6:,.2f}M" if r["amount_usd"] else "undisclosed"
        title = f"{r['name']} — {amt} ({r['technique'] or r['classification'] or 'exploit'})"
        link = r["source"] or f"{SITE}/incidents/"
        items.append(f"<item><title>{esc(title)}</title><link>{esc(link)}</link><guid isPermaLink=\"false\">{esc(r['date']+r['name'])}</guid>"
                     f"<pubDate>{format_datetime(d)}</pubDate><description>{esc('Chains: ' + ', '.join(r['chains']) + '. Classification: ' + str(r['classification']))}</description></item>")
    rss = ('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>'
           f"<title>Blockchain Lab — chain incident feed</title><link>{SITE}/incidents/</link>"
           f'<atom:link href="{SITE}/incidents/feed.xml" rel="self" type="application/rss+xml"/>'
           "<description>Latest crypto hacks and exploits (data: DefiLlama).</description>"
           f"<lastBuildDate>{format_datetime(datetime.datetime.now(datetime.timezone.utc))}</lastBuildDate>" + "".join(items) + "</channel></rss>\n")
    ET.fromstring(rss.encode())  # must parse
    (ROOT / "incidents").mkdir(exist_ok=True)
    (ROOT / "incidents" / "feed.xml").write_text(rss)
    return len(out)


# ---------------- events (+ ICS) ----------------
def events():
    s = http("https://ethglobal.com/events").decode("utf-8", "ignore").replace('\\"', '"')
    pat = re.compile(r'\{"id":(\d+),"name":"([^"]+)","slug":"([^"]+)","type":"([^"]+)","medium":"([^"]+)","startTime":"([^"]+)","endTime":"([^"]+)"')
    today = datetime.datetime.now(datetime.timezone.utc)
    seen, out = set(), []
    for m in pat.finditer(s):
        id_, name, slug, typ, medium, st, en = m.groups()
        if slug in seen:
            continue
        seen.add(slug)
        end = datetime.datetime.fromisoformat(en.replace("Z", "+00:00"))
        if end < today - datetime.timedelta(days=1):
            continue
        out.append({"name": name, "type": typ, "medium": medium, "start": st, "end": en,
                    "url": f"https://ethglobal.com/events/{slug}", "organiser": "ETHGlobal", "uid": f"ethglobal-{id_}"})
    out.sort(key=lambda e: e["start"])
    if len(out) < 3:
        raise RuntimeError(f"only {len(out)} upcoming events parsed — page format changed?")
    write("events.json", {"count": len(out), "events": out, "ics": f"{SITE}/events/events.ics"},
          source="ETHGlobal public events page", source_url="https://ethglobal.com/events", description="Web3 events & hackathons calendar")

    def ics_dt(x):
        return datetime.datetime.fromisoformat(x.replace("Z", "+00:00")).strftime("%Y%m%dT%H%M%SZ")

    def fold(line):
        b, outl = line.encode(), []
        while len(b) > 74:
            cut = 74
            while (b[cut] & 0xC0) == 0x80:
                cut -= 1
            outl.append(b[:cut].decode()); b = b" " + b[cut:]
        outl.append(b.decode())
        return "\r\n".join(outl)

    def t(x):
        return x.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Blockchain Lab//Hub Events//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
             "X-WR-CALNAME:Blockchain Lab — Web3 events & hackathons", "X-PUBLISHED-TTL:PT12H"]
    for e in out:
        st, en = ics_dt(e["start"]), ics_dt(e["end"])
        if en <= st:
            en = (datetime.datetime.strptime(st, "%Y%m%dT%H%M%SZ") + datetime.timedelta(hours=8)).strftime("%Y%m%dT%H%M%SZ")
        lines += ["BEGIN:VEVENT", f"UID:{e['uid']}@blockchains.github.io", f"DTSTAMP:{stamp}", f"DTSTART:{st}", f"DTEND:{en}",
                  fold(f"SUMMARY:{t(e['name'])} ({e['type']})"), fold(f"URL:{e['url']}"),
                  fold(f"DESCRIPTION:{t(e['organiser'] + ' ' + e['type'] + ' — ' + e['medium'] + '. ' + e['url'])}"), "END:VEVENT"]
    lines.append("END:VCALENDAR")
    (ROOT / "events").mkdir(exist_ok=True)
    (ROOT / "events" / "events.ics").write_text("\r\n".join(lines) + "\r\n")
    return len(out)


# ---------------- jobs ----------------
GREENHOUSE = {"coinbase": "Coinbase", "ripple": "Ripple", "gemini": "Gemini", "fireblocks": "Fireblocks", "blockchain": "Blockchain.com",
              "consensys": "Consensys", "aptoslabs": "Aptos Labs"}


def jobs():
    out = []

    def gh(slug):
        try:
            d = get_json(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs")
            return [{"title": j["title"], "company": GREENHOUSE[slug], "location": (j.get("location") or {}).get("name"),
                     "url": j["absolute_url"], "posted": (j.get("updated_at") or "")[:10], "source": "Greenhouse"} for j in d.get("jobs", [])]
        except Exception as e:  # noqa: BLE001
            print("jobs: greenhouse", slug, e, file=sys.stderr); return []
    for rows in pmap(gh, list(GREENHOUSE)):
        out += rows
    try:
        root = ET.fromstring(http("https://cryptojobslist.com/rss"))
        for it in root.iter("item"):
            title = it.findtext("title") or ""
            company = ""
            m = re.match(r"(.*) at (.*)$", title)
            if m:
                title, company = m.group(1), m.group(2)
            pub = it.findtext("pubDate") or ""
            try:
                pub = datetime.datetime.strptime(pub[:25].strip(), "%a, %d %b %Y %H:%M:%S").date().isoformat()
            except Exception:  # noqa: BLE001
                pub = ""
            out.append({"title": title.strip(), "company": company.strip(), "location": None, "url": it.findtext("link"), "posted": pub, "source": "CryptoJobsList"})
    except Exception as e:  # noqa: BLE001
        print("jobs: cryptojobslist", e, file=sys.stderr)
    out = [j for j in out if j["url"]]
    out.sort(key=lambda j: j["posted"] or "", reverse=True)
    if len(out) < 50:
        raise RuntimeError(f"only {len(out)} jobs")
    write("jobs.json", {"count": len(out), "companies": sorted({j["company"] for j in out if j["company"]})[:500], "jobs": out},
          source="Greenhouse public job-board APIs + CryptoJobsList RSS", source_url="https://developers.greenhouse.io/job-board.html",
          description="Crypto & web3 job board (aggregated from public sources)")
    return len(out)


# ---------------- grants (curated list, link-checked daily) ----------------
def grants():
    rows = [dict(zip(["name", "ecosystem", "funder", "url"], l.rstrip("\n").split("\t"))) for l in open(ROOT / "scripts" / "grants.tsv") if l.strip()]

    def check(r):
        try:
            http(r["url"], timeout=20, retries=1)
            r["link_ok"] = True
        except Exception as e:  # noqa: BLE001
            msg = str(e)
            # 403/429 = site is up but blocks bots (Cloudflare etc.); count as reachable
            r["link_ok"] = "403" in msg or "429" in msg
            r["link_note" if r["link_ok"] else "link_error"] = "bot-protected (HTTP 403/429), reachable in a browser" if r["link_ok"] else msg[-80:]
        r["checked_at"] = now_iso()
        return r
    rows = pmap(check, rows)
    ok = sum(r["link_ok"] for r in rows)
    write("grants.json", {"count": len(rows), "links_ok": ok, "grants": rows},
          source="Curated by Blockchain Lab; every link checked daily", source_url=f"{SITE}/grants/", description="Web3 grants finder")
    return ok


# ---------------- glossary ----------------
def glossary():
    s = http("https://blockchainlab.com/learn/glossary").decode("utf-8", "ignore")
    items = re.findall(r'<a href="(/learn/concepts/[^"]+)"><span[^>]*>[^<]*</span><span[^>]*>([^<]+)</span><span[^>]*>([^<]+)</span></a>', s)
    out = [{"term": html.unescape(t), "definition": html.unescape(d), "url": "https://blockchainlab.com" + u} for u, t, d in items]
    if len(out) < 20:
        raise RuntimeError(f"glossary parse found {len(out)}")
    write("glossary.json", {"count": len(out), "terms": out}, source="Blockchain Lab glossary",
          source_url="https://blockchainlab.com/learn/glossary", description="Glossary search")
    return len(out)


# ---------------- protocols (for comparison pages) ----------------
def protocols():
    rows = get_json("https://api.llama.fi/protocols", timeout=60)
    rows = [r for r in rows if (r.get("tvl") or 0) > 0 and r.get("category") not in ("CEX", "Chain")]
    rows.sort(key=lambda r: r.get("tvl") or 0, reverse=True)
    fees = {}
    try:
        f = get_json("https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true", timeout=60)
        fees = {p.get("slug") or p.get("module"): p for p in f.get("protocols", [])}
    except Exception as e:  # noqa: BLE001
        print("fees", e, file=sys.stderr)
    out = []
    for r in rows[:400]:
        fp = fees.get(r.get("slug"), {})
        out.append({"name": r["name"], "slug": r.get("slug"), "category": r.get("category"), "chains": (r.get("chains") or [])[:12],
                    "tvl": round(r.get("tvl") or 0), "change_1d": r.get("change_1d"), "change_7d": r.get("change_7d"),
                    "mcap": r.get("mcap"), "fees_24h": fp.get("total24h"), "fees_30d": fp.get("total30d"),
                    "audits": r.get("audits"), "url": r.get("url"), "twitter": r.get("twitter"), "logo": r.get("logo"),
                    "llama": f"https://defillama.com/protocol/{r.get('slug')}"})
    write("protocols.json", {"count": len(out), "protocols": out}, source="DefiLlama /protocols + fees overview",
          source_url="https://defillama.com/docs/api", description="Protocol comparison (top 400 by TVL)")
    return len(out)


# ---------------- stablecoin depeg monitor ----------------
def depeg():
    d = get_json("https://stablecoins.llama.fi/stablecoins?includePrices=true", timeout=60)
    out = []
    for s in d["peggedAssets"]:
        circ = (s.get("circulating") or {}).get("peggedUSD") or 0
        if s.get("pegType") != "peggedUSD" or circ < 50_000_000 or s.get("price") is None:
            continue
        p = float(s["price"])
        dev = (p - 1) * 100
        out.append({"name": s["name"], "symbol": s["symbol"], "price": p, "deviation_pct": round(dev, 3), "circulating_usd": round(circ),
                    "mechanism": s.get("pegMechanism"), "status": "ok" if abs(dev) < 0.5 else ("watch" if abs(dev) < 2 else "depeg"),
                    "url": f"https://defillama.com/stablecoin/{s['name'].lower().replace(' ', '-')}"})
    out.sort(key=lambda x: -x["circulating_usd"])
    write("depeg.json", {"count": len(out), "alerts": [x for x in out if x["status"] != "ok"], "stablecoins": out},
          source="DefiLlama stablecoins API", source_url="https://stablecoins.llama.fi/stablecoins", description="Stablecoin depeg monitor (USD-pegged, > $50M)")
    return len(out)


# ---------------- token list for the portfolio viewer ----------------
PORTFOLIO_CHAINS = {1: "Ethereum", 8453: "Base", 42161: "Arbitrum One", 10: "OP Mainnet", 137: "Polygon", 56: "BNB Chain", 43114: "Avalanche", 100: "Gnosis", 59144: "Linea", 324: "zkSync Era"}


def tokens():
    d = get_json("https://tokens.uniswap.org")
    out = [{"chainId": t["chainId"], "address": t["address"], "symbol": t["symbol"], "name": t["name"], "decimals": t["decimals"], "logo": t.get("logoURI")}
           for t in d["tokens"] if t["chainId"] in PORTFOLIO_CHAINS]
    write("tokens.json", {"count": len(out), "chains": PORTFOLIO_CHAINS, "list": d.get("name"), "list_version": d.get("version"), "tokens": out},
          source="Uniswap default token list", source_url="https://tokens.uniswap.org", description="Token list used by the portfolio viewer")
    return len(out)


JOBS = {"tokens": tokens, "incidents": incidents, "events": events, "jobs": jobs, "grants": grants, "glossary": glossary, "protocols": protocols, "depeg": depeg}

if __name__ == "__main__":
    want = sys.argv[1:] or list(JOBS)
    failed = []
    for k in want:
        try:
            print(k, JOBS[k]())
        except Exception as e:  # noqa: BLE001
            failed.append(k); print("FAILED", k, e, file=sys.stderr)
    sys.exit(1 if failed else 0)
