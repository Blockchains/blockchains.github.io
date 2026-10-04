"""Multi-chain gas tracker: base fee, priority fee percentiles, blob base fee (Ethereum), Bitcoin mempool fees."""
from common import rpc, get_json, write, pmap
from chains import CHAINS

GWEI = 1e9


def first_ok(rpcs, fn):
    err = None
    for u in rpcs:
        try:
            return fn(u), u
        except Exception as e:  # noqa: BLE001
            err = e
    raise RuntimeError(err)


def chain(c):
    name, cid, sym, explorer, rpcs = c
    try:
        def q(u):
            gp = int(rpc(u, "eth_gasPrice"), 16)
            fh = None
            try:
                fh = rpc(u, "eth_feeHistory", ["0x14", "latest", [10, 50, 90]])
            except Exception:  # noqa: BLE001
                pass
            blob = None
            if cid == 1:
                try:
                    blob = int(rpc(u, "eth_blobBaseFee"), 16)
                except Exception:  # noqa: BLE001
                    pass
            return gp, fh, blob
        (gp, fh, blob), used = first_ok(rpcs, q)
        row = {"chain": name, "chain_id": cid, "symbol": sym, "rpc": used, "gas_price_gwei": round(gp / GWEI, 6), "ok": True}
        if fh and fh.get("baseFeePerGas"):
            bf = [int(x, 16) for x in fh["baseFeePerGas"]]
            rw = [[int(x, 16) for x in r] for r in fh.get("reward", []) if r]
            row["base_fee_gwei"] = round(bf[-1] / GWEI, 6)
            row["base_fee_trend_gwei"] = [round(x / GWEI, 6) for x in bf]
            if rw:
                for i, k in enumerate(["slow", "standard", "fast"]):
                    vals = sorted(r[i] for r in rw)
                    row[f"priority_{k}_gwei"] = round(vals[len(vals) // 2] / GWEI, 6)
            row["gas_used_ratio_avg"] = round(sum(fh.get("gasUsedRatio", [0])) / max(1, len(fh.get("gasUsedRatio", [1]))), 4)
        if blob is not None:
            row["blob_base_fee_gwei"] = round(blob / GWEI, 9)
        return row
    except Exception as e:  # noqa: BLE001
        return {"chain": name, "chain_id": cid, "ok": False, "error": str(e)[:200]}


def main():
    rows = pmap(chain, CHAINS)
    btc = None
    try:
        btc = get_json("https://mempool.space/api/v1/fees/recommended")
    except Exception as e:  # noqa: BLE001
        btc = {"error": str(e)[:200]}
    ok = sum(r["ok"] for r in rows)
    write("gas.json", {"count": len(rows), "ok": ok, "chains": rows, "bitcoin_sat_vb": btc},
          source="Public JSON-RPC (eth_gasPrice, eth_feeHistory, eth_blobBaseFee) + mempool.space",
          source_url="https://mempool.space/docs/api/rest", description="Multi-chain gas and fee tracker")
    print(f"gas: {ok}/{len(rows)} chains ok")
    assert ok >= len(rows) * 0.7, "too many chains failed"


if __name__ == "__main__":
    main()
