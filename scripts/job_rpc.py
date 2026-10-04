"""RPC latency leaderboard: 5 timed eth_blockNumber calls per public endpoint, ranks by median latency."""
import time, statistics
from common import rpc, write, pmap, read
from chains import CHAINS


def probe(args):
    name, cid, url = args
    lat, heights, err = [], [], None
    for _ in range(5):
        t = time.perf_counter()
        try:
            heights.append(int(rpc(url, "eth_blockNumber", timeout=8), 16))
            lat.append((time.perf_counter() - t) * 1000)
        except Exception as e:  # noqa: BLE001
            err = str(e)[:160]
    row = {"chain": name, "chain_id": cid, "url": url, "success_rate": len(lat) / 5}
    if lat:
        row.update(median_ms=round(statistics.median(lat), 1), p90_ms=round(sorted(lat)[int(len(lat) * 0.9) - 1 if len(lat) > 1 else 0], 1),
                   min_ms=round(min(lat), 1), height=max(heights))
    if err:
        row["last_error"] = err
    return row


def main():
    rows = pmap(probe, [(n, cid, u) for n, cid, _, _, rpcs in CHAINS for u in rpcs], workers=5)
    best = {}
    for r in rows:
        if "height" in r:
            best[r["chain_id"]] = max(best.get(r["chain_id"], 0), r["height"])
    for r in rows:
        if "height" in r:
            r["lag_blocks"] = best[r["chain_id"]] - r["height"]
        score = (r.get("median_ms", 9999)) * (2 - r["success_rate"]) + (500 if r.get("lag_blocks", 0) > 5 else 0)
        r["score"] = round(score, 1)
    rows.sort(key=lambda r: r["score"])
    prev = read("rpc-latency.json", {}) or {}
    hist = (prev.get("history") or [])[-167:]
    ok = [r for r in rows if r["success_rate"] == 1]
    hist.append({"t": int(time.time()), "median_ms": round(statistics.median([r["median_ms"] for r in ok]), 1) if ok else None, "healthy": len(ok)})
    write("rpc-latency.json", {"count": len(rows), "healthy": len(ok), "vantage": "GitHub Actions runner (US/EU Azure)", "endpoints": rows, "history": hist},
          source="Timed eth_blockNumber calls to public RPCs", source_url="https://blockchains.github.io/rpc/",
          description="Public RPC latency leaderboard")
    print(f"rpc: {len(ok)}/{len(rows)} fully healthy")
    assert len(ok) >= len(rows) * 0.5


if __name__ == "__main__":
    main()
