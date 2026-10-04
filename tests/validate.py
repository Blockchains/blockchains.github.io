"""Structural validation of every data file the hub serves (no network)."""
import json, sys, pathlib, xml.etree.ElementTree as ET
R = pathlib.Path(__file__).resolve().parent.parent
D = R / "data"
REQ = {"gas.json": ("chains", 15), "liveness.json": ("chains", 15), "rpc-latency.json": ("endpoints", 30), "incidents.json": ("incidents", 100),
       "events.json": ("events", 1), "jobs.json": ("jobs", 50), "grants.json": ("grants", 20), "glossary.json": ("terms", 20),
       "protocols.json": ("protocols", 100), "depeg.json": ("stablecoins", 20), "slither.json": ("contracts", 10), "tokens.json": ("tokens", 300),
       "ai/brief.json": ("sections", 3), "ai/incidents.json": ("items", 5), "ai/ideas.json": ("ideas", 6), "ai/protocols.json": ("protocols", 10),
       "ai/contracts.json": ("contracts", 10), "ai/audits.json": ("reports", 10), "ai/whitepapers.json": ("papers", 8)}
bad = []
for f, (k, n) in REQ.items():
    try:
        d = json.loads((D / f).read_text())
        assert d.get("generated_at"), "generated_at"
        assert len(d[k]) >= n, f"{k}: {len(d[k])} < {n}"
        if f.startswith("ai/"):
            assert "disclaimer" in d
    except Exception as e:  # noqa: BLE001
        bad.append(f"{f}: {e}")
d = json.loads((D / "ai/digest.json").read_text()); assert d["headline"]
cat = json.loads((R / "services.json").read_text())
ids = [s["id"] for s in cat["services"]]
if len(ids) != len(set(ids)):
    bad.append("duplicate service ids")
if len(ids) < 75:
    bad.append(f"only {len(ids)} services")
ET.parse(R / "incidents/feed.xml")
ics = (R / "events/events.ics").read_text()
if not ics.startswith("BEGIN:VCALENDAR") or "END:VCALENDAR" not in ics:
    bad.append("ics")
print("\n".join(bad) or f"all {len(REQ)} data files + catalog + feeds valid")
sys.exit(1 if bad else 0)
