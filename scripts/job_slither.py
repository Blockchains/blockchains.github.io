"""Security quick-scan: runs Slither on Sourcify-verified source of popular contracts.
Usage: python job_slither.py                 # scan TOP_CONTRACTS
       python job_slither.py 1 0xADDR "Name"  # add / refresh one contract (workflow_dispatch)"""
import json, subprocess, sys, tempfile, os, pathlib, collections
from common import write, read, now_iso, pmap
from contracts import TOP_CONTRACTS

IMPACT_ORDER = ["High", "Medium", "Low", "Informational", "Optimization"]


def scan(args):
    name, addr, category, chain = args
    with tempfile.TemporaryDirectory() as d:
        out = pathlib.Path(d) / "r.json"
        try:
            p = subprocess.run(["slither", f"sourcify-{chain}:{addr}", "--json", str(out), "--exclude-dependencies"],
                               cwd=d, capture_output=True, text=True, timeout=420)
            r = json.loads(out.read_text())
        except Exception as e:  # noqa: BLE001
            return {"name": name, "address": addr, "chain_id": chain, "category": category, "ok": False, "error": str(e)[:300]}
        if not r.get("success"):
            return {"name": name, "address": addr, "chain_id": chain, "category": category, "ok": False, "error": (r.get("error") or p.stderr)[-300:]}
        dets = r.get("results", {}).get("detectors", [])
        counts = collections.Counter(x["impact"] for x in dets)
        findings = []
        for x in sorted(dets, key=lambda x: (IMPACT_ORDER.index(x["impact"]) if x["impact"] in IMPACT_ORDER else 9, x["check"])):
            loc = None
            for el in x.get("elements", []):
                sm = el.get("source_mapping") or {}
                if sm.get("filename_short"):
                    loc = f"{sm['filename_short']}#L{(sm.get('lines') or [0])[0]}"
                    break
            findings.append({"check": x["check"], "impact": x["impact"], "confidence": x["confidence"],
                             "description": x["description"].strip()[:600], "location": loc})
        return {"name": name, "address": addr, "chain_id": chain, "category": category, "ok": True,
                "counts": {k: counts.get(k, 0) for k in IMPACT_ORDER}, "detector_hits": len(dets),
                "findings": findings[:60], "truncated": len(findings) > 60, "scanned_at": now_iso(),
                "sourcify": f"https://repo.sourcify.dev/{chain}/{addr}", "explorer": f"https://etherscan.io/address/{addr}#code" if chain == 1 else None}


def main():
    prev = {(c["chain_id"], c["address"].lower()): c for c in (read("slither.json", {}) or {}).get("contracts", [])}
    if len(sys.argv) >= 3:
        chain, addr = int(sys.argv[1]), sys.argv[2]
        name = sys.argv[3] if len(sys.argv) > 3 else addr
        res = [scan((name, addr, "On-demand", chain))]
        merged = dict(prev); merged[(chain, addr.lower())] = res[0]
        rows = list(merged.values())
    else:
        res = pmap(scan, [(n, a, c, 1) for n, a, c in TOP_CONTRACTS], workers=int(os.environ.get("SCAN_WORKERS", "3")))
        rows = res + [v for k, v in prev.items() if v.get("category") == "On-demand"]
    ok = sum(r["ok"] for r in res)
    tool = subprocess.run(["slither", "--version"], capture_output=True, text=True).stdout.strip()
    write("slither.json", {"count": len(rows), "ok": sum(r["ok"] for r in rows), "slither_version": tool,
                           "note": "Static-analysis hits are leads, not confirmed vulnerabilities. Many are informational or false positives on battle-tested code.",
                           "contracts": rows},
          source="Slither static analysis on Sourcify-verified source", source_url="https://github.com/crytic/slither",
          description="Contract security quick-scan (Slither)")
    print(f"slither: {ok}/{len(res)} scanned")
    for r in res:
        print(" ", r["name"], r.get("counts") or r.get("error", "")[:120])
    assert ok >= max(1, len(res) * 0.7)


if __name__ == "__main__":
    main()
