"""End-to-end browser tests for every hub page (Playwright, Chromium). BASE env = site root (default local server)."""
import os, sys, json, re
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:8765").rstrip("/")
results = []


def t(name, fn, page):
    try:
        fn(page); results.append((name, True, "")); print("PASS", name)
    except Exception as e:  # noqa: BLE001
        results.append((name, False, str(e)[:300])); print("FAIL", name, str(e)[:300])


def loaded(page, path, sel="#out", min_text=40, timeout=60000):
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(BASE + path, wait_until="domcontentloaded")
    page.wait_for_function(f"""() => {{ const el=document.querySelector({json.dumps(sel)}); return el && el.innerText.length >= {min_text} && !/Loading…/.test(el.innerText) }}""", timeout=timeout)
    txt = page.inner_text(sel)
    assert "Could not load" not in txt, txt[:200]
    assert not errs, f"JS errors: {errs}"
    return txt


SIMPLE = ["/ai/", "/ai/brief/", "/ai/incidents/", "/ai/ideas/", "/ai/digest/", "/ai/protocols/", "/ai/contracts/", "/ai/audits/", "/ai/whitepapers/",
          "/gas/", "/chains/", "/rpc/", "/depeg/", "/scan/", "/incidents/", "/events/", "/jobs/", "/grants/", "/glossary/", "/papers/", "/compare/", "/status/"]


def hub(p):
    txt = loaded(p, "/", "#out", 500)
    n = p.locator("#out .card").count(); assert n == 75, f"{n} cards"
    p.fill("#q", "gas"); p.wait_for_timeout(200)
    k = p.locator("#out .card").count(); assert 1 <= k < 20, f"search gas -> {k}"
    p.fill("#q", ""); p.click(".chip[data-c='AI']"); p.wait_for_timeout(200)
    assert p.locator("#out .card").count() == 8
    p.wait_for_selector("#brief .panel", timeout=20000)
    for href in [p.locator("#out .card").nth(i).get_attribute("href") for i in range(3)]:
        assert href.startswith("https://blockchains.github.io/ai/")


def portfolio(p):
    p.goto(BASE + "/portfolio/?a=vitalik.eth", wait_until="domcontentloaded")
    p.wait_for_function("() => /non-zero balances/.test(document.querySelector('#st').innerText)", timeout=120000)
    st = p.inner_text("#st"); assert re.search(r"0x[dD]8[dD][aA]6[bB][fF]", st), st
    rows = p.locator("#out tr").count(); assert rows >= 3, f"{rows} rows"
    tot = p.inner_text("#sum .stat b"); assert tot.startswith("$"), tot


def phishing(p):
    p.goto(BASE + "/phishing/", wait_until="domcontentloaded")
    p.fill("#u", "https://www.metamask.io"); p.click("#go")
    p.wait_for_function("() => document.querySelector('#res').innerText.length>3", timeout=60000)
    bad = p.evaluate("() => fetch('https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json').then(r=>r.json()).then(c=>c.blacklist[c.blacklist.length-1])")
    p.fill("#u", "https://" + bad + "/claim"); p.click("#go"); p.wait_for_timeout(300)
    assert "Blocked" in p.inner_text("#res"), p.inner_text("#res")
    p.fill("#u", "metamsk.io"); p.click("#go"); p.wait_for_timeout(300)
    r = p.inner_text("#res"); assert ("Look-alike" in r) or ("Blocked" in r), r


def compare(p):
    p.goto(BASE + "/compare/?p=aave-v3,lido", wait_until="domcontentloaded")
    p.wait_for_function("() => document.querySelectorAll('#out th').length>=3", timeout=30000)
    h = p.inner_text("#out"); assert "aave" in h.lower() and "lido" in h.lower(), h[:200]


def feeds(p):
    for path, marker in [("/incidents/feed.xml", "<rss"), ("/events/events.ics", "BEGIN:VCALENDAR"), ("/sitemap.xml", "<urlset"), ("/robots.txt", "Sitemap:"), ("/services.json", '"services"')]:
        r = p.request.get(BASE + path); assert r.ok, path; assert marker in r.text(), path


with sync_playwright() as pw:
    b = pw.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context()
    page = ctx.new_page()
    t("hub", hub, page)
    for path in SIMPLE:
        pg = ctx.new_page()
        sel = "#out"
        t(path, lambda p, path=path: loaded(p, path, sel, 40), pg); pg.close()
    for name, fn in [("portfolio", portfolio), ("phishing", phishing), ("compare-deeplink", compare), ("feeds", feeds)]:
        pg = ctx.new_page(); t(name, fn, pg); pg.close()
    b.close()

ok = sum(r[1] for r in results)
print(f"\n{ok}/{len(results)} passed")
json.dump([{"test": n, "pass": p, "error": e} for n, p, e in results], open(os.environ.get("E2E_OUT", "/tmp/hub-e2e.json"), "w"), indent=1)
sys.exit(0 if ok == len(results) else 1)
