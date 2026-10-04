"""Chain liveness monitor: head block age for 20 EVM chains plus Bitcoin and Solana. Flags stalls."""
import time
from common import rpc, get_json, http, write, pmap
from chains import CHAINS

# block-time based thresholds: a chain is 'stalled' if its head is older than this (seconds)
STALL = {1: 120, 56: 60, 137: 60, 43114: 60, 100: 120}


def evm(c):
    name, cid, sym, explorer, rpcs = c
    best, last = None, None
    for u in rpcs[:3]:  # take the freshest head across endpoints so one stale node doesn't fake a stall
        try:
            b = rpc(u, "eth_getBlockByNumber", ["latest", False])
            row = (int(b["timestamp"], 16), int(b["number"], 16), u)
            if best is None or row[0] > best[0]:
                best = row
        except Exception as e:  # noqa: BLE001
            last = e
    if best is None:
        return {"chain": name, "chain_id": cid, "status": "unreachable", "error": str(last)[:200]}
    age = time.time() - best[0]
    lim = STALL.get(cid, 60)
    return {"chain": name, "chain_id": cid, "height": best[1], "head_age_s": round(age, 1),
            "status": "ok" if age <= lim else "stalled", "threshold_s": lim, "rpc": best[2], "explorer": explorer}


def bitcoin():
    try:
        h = int(http("https://mempool.space/api/blocks/tip/height"))
        blk = get_json("https://mempool.space/api/v1/blocks")[0]
        age = time.time() - blk["timestamp"]
        return {"chain": "Bitcoin", "chain_id": None, "height": h, "head_age_s": round(age, 1),
                "status": "ok" if age <= 3600 else "slow", "threshold_s": 3600, "rpc": "https://mempool.space/api", "explorer": "https://mempool.space"}
    except Exception as e:  # noqa: BLE001
        return {"chain": "Bitcoin", "status": "unreachable", "error": str(e)[:200]}


def solana():
    for u in ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"]:
        try:
            slot = rpc(u, "getSlot", [{"commitment": "finalized"}])
            t = rpc(u, "getBlockTime", [slot])
            age = time.time() - t
            return {"chain": "Solana", "chain_id": None, "height": slot, "head_age_s": round(age, 1),
                    "status": "ok" if age <= 60 else "stalled", "threshold_s": 60, "rpc": u, "explorer": "https://explorer.solana.com"}
        except Exception as e:  # noqa: BLE001
            last = e
    return {"chain": "Solana", "status": "unreachable", "error": str(last)[:200]}


def main():
    rows = pmap(evm, CHAINS) + [bitcoin(), solana()]
    ok = sum(r["status"] == "ok" for r in rows)
    write("liveness.json", {"count": len(rows), "ok": ok, "chains": rows},
          source="Public JSON-RPC eth_getBlockByNumber / Solana getBlockTime / mempool.space",
          source_url="https://ethereum.org/en/developers/docs/apis/json-rpc/", description="Chain liveness monitor (head block age)")
    print(f"liveness: {ok}/{len(rows)} ok")
    assert sum(r["status"] != "unreachable" for r in rows) >= len(rows) * 0.8


if __name__ == "__main__":
    main()
