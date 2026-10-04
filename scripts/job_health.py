"""Checks every service in services.json and writes data/status.json (+ a shields.io endpoint badge).
Page: HTTP 200 (+ marker). Data: valid JSON, has generated_at within max_age_h. CI: latest run on default branch succeeded."""
import json, os, sys, datetime, urllib.request
from common import http, ROOT, DATA, now_iso, pmap

LOCAL = os.environ.get("HEALTH_LOCAL") == "1"  # pre-deploy: read hub-local files from disk instead of the live site
HUB = "https://blockchains.github.io/"


def fetch(url):
    if LOCAL and url.startswith(HUB) and not url.startswith(HUB + "blockchainlab-") and not url.startswith(HUB + "sites-monitor"):
        p = ROOT / url[len(HUB):]
        if url.endswith("/"):
            p = p / "index.html"
        return p.read_bytes()
    return http(url, timeout=30, retries=2)


def age_hours(ts):
    t = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return (datetime.datetime.now(datetime.timezone.utc) - t).total_seconds() / 3600


def check(s):
    c = s["check"]
    r = {"id": s["id"], "checked_at": now_iso()}
    try:
        if c["type"] == "page":
            body = fetch(c["url"]).decode("utf-8", "ignore")
            if c.get("contains") and c["contains"] not in body:
                raise RuntimeError(f"marker {c['contains']!r} missing")
            r["status"] = "up"
        elif c["type"] == "data":
            d = json.loads(fetch(c["url"]))
            ts = d.get("generated_at")
            if not ts:
                raise RuntimeError("no generated_at")
            a = age_hours(ts)
            r["age_h"] = round(a, 1)
            r["status"] = "up" if a <= c["max_age_h"] else "stale"
            if s["url"] != c["url"] and s["url"].startswith(HUB) and not s["url"].startswith(HUB + "blockchainlab-"):
                fetch(s["url"])  # the page that renders the data must exist too
        elif c["type"] == "ci":
            tok = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
            h = {"Accept": "application/vnd.github+json"} | ({"Authorization": f"Bearer {tok}"} if tok else {})
            runs = json.loads(http(f"https://api.github.com/repos/{c['repo']}/actions/runs?branch=main&per_page=20&exclude_pull_requests=true", headers=h))["workflow_runs"]
            wfs = json.loads(http(f"https://api.github.com/repos/{c['repo']}/actions/workflows?per_page=100", headers=h))["workflows"]
            active = {w["id"] for w in wfs if w["state"] == "active" and w["path"].startswith(".github/workflows/")}
            done = [x for x in runs if x["status"] == "completed" and x["event"] != "pull_request" and x["workflow_id"] in active]
            latest = {}
            for x in done:  # latest completed run per workflow
                latest.setdefault(x["name"], x)
            bad = [n for n, x in latest.items() if x["conclusion"] not in ("success", "skipped")]
            r["workflows"] = {n: x["conclusion"] for n, x in latest.items()}
            r["status"] = "up" if latest and not bad else "down"
            if bad:
                r["detail"] = "failing: " + ", ".join(bad)
    except Exception as e:  # noqa: BLE001
        r["status"] = "down"; r["detail"] = str(e)[:200]
    return r


def main():
    cat = json.loads((ROOT / "services.json").read_text())
    res = pmap(check, cat["services"], workers=12)
    up = sum(r["status"] == "up" for r in res)
    out = {"generated_at": now_iso(), "count": len(res), "up": up, "stale": sum(r["status"] == "stale" for r in res),
           "down": sum(r["status"] == "down" for r in res), "services": {r["id"]: r for r in res}}
    (DATA / "status.json").write_text(json.dumps(out, indent=1) + "\n")
    color = "brightgreen" if up == len(res) else ("yellow" if up >= len(res) * 0.9 else "red")
    (DATA / "badge.json").write_text(json.dumps({"schemaVersion": 1, "label": "services", "message": f"{up}/{len(res)} up", "color": color}) + "\n")
    print(f"health: {up}/{len(res)} up")
    for r in res:
        if r["status"] != "up":
            print("  ", r["id"], r["status"], r.get("detail", ""), r.get("age_h", ""))
    return out


if __name__ == "__main__":
    o = main()
    sys.exit(0 if o["up"] >= o["count"] * float(os.environ.get("HEALTH_MIN", "0")) else 1)
