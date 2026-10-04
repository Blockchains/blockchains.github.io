"""Build the org-wide building-block catalogue for AI tools and humans.

Writes (site root): blocks.json (every live Blockchains repo's blocks.json, aggregated), llms.txt (llmstxt.org map),
llms-full.txt (Build-with-Blocks guide + schema doc + every repo's AGENTS.md). The /blocks/ page (gen_site.py) renders blocks.json.
Run: python scripts/blocks.py   (GH_TOKEN optional; raises the GitHub API rate limit)
"""
import json, os, sys, datetime, urllib.request, urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parent.parent
OWNER, SITE = "Blockchains", "https://blockchains.github.io"
RAW = "https://raw.githubusercontent.com"
SCHEMA = f"{RAW}/{OWNER}/.github/main/docs/blocks.schema.json"
GUIDE = f"https://github.com/{OWNER}/.github/blob/main/docs/BUILD-WITH-BLOCKS.md"
REQUIRED = ["schema_version", "name", "repo", "summary", "kind", "stability", "license", "entrypoints", "inputs", "outputs", "deps", "compatible_with", "tests", "docs"]
HUB = f"{OWNER}/blockchains.github.io"


def get(url, api=False):
    h = {"User-Agent": "blockchains-hub-blocks"}
    if api:
        h["Accept"] = "application/vnd.github+json"
        if os.environ.get("GH_TOKEN"):
            h["Authorization"] = "Bearer " + os.environ["GH_TOKEN"]
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=30) as r:
                return r.read().decode()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if attempt == 2:
                raise
        except urllib.error.URLError:
            if attempt == 2:
                raise


def repos():
    out, page = [], 1
    while True:
        batch = json.loads(get(f"https://api.github.com/users/{OWNER}/repos?type=owner&per_page=100&page={page}", api=True))
        out += [r for r in batch if not r["fork"] and not r["archived"] and not r["private"]]
        if len(batch) < 100:
            return out
        page += 1


def fetch(r):
    name, br = r["name"], r["default_branch"]
    if r["full_name"] == HUB:
        m = json.loads((ROOT / "blocks/hub.json").read_text())
        agents = (ROOT / "AGENTS.md").read_text() if (ROOT / "AGENTS.md").exists() else ""
        return r, m, agents, f"{SITE}/blocks/hub.json"
    txt = get(f"{RAW}/{OWNER}/{name}/{br}/blocks.json")
    if not txt:
        return r, None, None, None
    return r, json.loads(txt), get(f"{RAW}/{OWNER}/{name}/{br}/AGENTS.md") or "", f"{RAW}/{OWNER}/{name}/{br}/blocks.json"


def main():
    rs = repos()
    with ThreadPoolExecutor(8) as ex:
        got = list(ex.map(fetch, rs))
    blocks, agents, bad = [], {}, []
    for r, m, a, url in got:
        if m is None:
            continue
        miss = [k for k in REQUIRED if k not in m]
        if miss or m.get("repo") != r["full_name"]:
            bad.append(f"{r['full_name']}: missing {miss}" if miss else f"{r['full_name']}: repo field {m.get('repo')}")
            continue
        br = r["default_branch"]
        m = {k: v for k, v in m.items() if k != "$schema"}
        m["source"] = {"manifest": url, "html_url": r["html_url"], "agents_md": f"https://github.com/{r['full_name']}/blob/{br}/AGENTS.md",
                       "llms_txt": f"{RAW}/{r['full_name']}/{br}/llms.txt" if r["full_name"] != HUB else f"{SITE}/llms.txt", "pushed_at": r["pushed_at"]}
        blocks.append(m); agents[m["name"]] = a
    if bad:
        print("invalid manifests:\n" + "\n".join(bad)); sys.exit(1)
    if len(blocks) < 20:
        print(f"only {len(blocks)} blocks found; refusing to overwrite"); sys.exit(1)
    blocks.sort(key=lambda b: b["name"].lower())
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    (ROOT / "blocks.json").write_text(json.dumps({"generated_at": now, "schema": SCHEMA, "guide": GUIDE, "count": len(blocks), "blocks": blocks}, indent=1) + "\n")

    layers = [("Data, APIs and SDKs", {"http-api", "dataset", "library"}), ("Agents and AI", {"mcp-server"}), ("Smart contracts", {"contracts"}),
              ("Composers, CLIs, Actions and templates", {"cli", "github-action", "template", "automation"}), ("Indexes and curated lists", {"index", "curated-list"}),
              ("Apps, browser tools and sites", {"web-app", "browser-extension"}), ("Docs and learning", {"docs"})]
    seen, lines = set(), [
        "# Blockchains (Blockchain Lab) building blocks",
        "",
        f"> Open-source repositories under github.com/{OWNER} documented as composable building blocks: data APIs and SDKs, an MCP server with "
        "blockchain tools for AI agents, tested Solidity contracts, project composers, browser tools and curated fork indexes. Each repo has "
        "AGENTS.md (how to work in it), llms.txt and a blocks.json manifest (exports, inputs, outputs, compatible blocks, tests).",
        "",
        f"Start with the guide (layer map, how to assemble a project, three verified recipes). Then pick blocks from {SITE}/blocks.json, read the block's "
        "AGENTS.md, install from its entrypoints and run its tests command. Pin a tag or commit. Nothing here requires an API key except Grok (xAI) features.",
        "",
        "## Start here",
        f"- [Build with Blocks]({GUIDE}): how to assemble projects from these repos, with 3 verified end-to-end recipes",
        f"- [blocks.json]({SITE}/blocks.json): machine-readable catalogue of every block ({len(blocks)} repos)",
        f"- [Blocks schema](https://github.com/{OWNER}/.github/blob/main/docs/BLOCKS-SCHEMA.md): blocks.json format ([JSON Schema]({SCHEMA}))",
        f"- [Full text]({SITE}/llms-full.txt): guide + schema + every repo's AGENTS.md in one file",
        f"- [services.json]({SITE}/services.json): the hub's 75 hosted services",
        "",
    ]
    for title, kinds in layers:
        sel = [b for b in blocks if b["name"] not in seen and b["kind"][0] in kinds]   # first kind = primary
        if not sel:
            continue
        lines.append(f"## {title}")
        for b in sel:
            seen.add(b["name"])
            lines.append(f"- [{b['name']}]({b['source']['llms_txt']}): {b['summary']}")
        lines.append("")
    rest = [b for b in blocks if b["name"] not in seen]
    if rest:
        lines.append("## Other")
        lines += [f"- [{b['name']}]({b['source']['llms_txt']}): {b['summary']}" for b in rest] + [""]
    lines += ["## Optional",
              f"- [blockchainlab-index catalog]({RAW}/{OWNER}/blockchainlab-index/main/catalog.json): ~240 indexed forks with pinned commits, licences and per-repo `reuse` install lines",
              f"- [Fork reuse notes]({RAW}/{OWNER}/blockchainlab-index/main/taxonomy/reuse.json): how to reuse each category of fork",
              f"- [awesome-blockchainlab forge.json]({RAW}/{OWNER}/awesome-blockchainlab/main/forge.json): curated forks with docs and starters",
              f"- [grokhack-index parts]({SITE}/grokhack-index/data/parts.json): Grok/xAI integration parts", ""]
    (ROOT / "llms.txt").write_text("\n".join(lines))

    full = ["# Blockchains building blocks: full text", "", f"Generated {now} from {len(blocks)} repositories. Sections: Build with Blocks guide, blocks.json schema, then AGENTS.md of every repo.", ""]
    for title, path in [("Build with Blocks", "docs/BUILD-WITH-BLOCKS.md"), ("blocks.json schema", "docs/BLOCKS-SCHEMA.md")]:
        full += [f"\n\n=== {title} ({OWNER}/.github/{path}) ===\n", get(f"{RAW}/{OWNER}/.github/main/{path}") or "(not found)"]
    for b in blocks:
        full += [f"\n\n=== {b['repo']} / AGENTS.md ===\n", f"Summary: {b['summary']}\nManifest: {b['source']['manifest']}\n", agents.get(b["name"]) or "(no AGENTS.md)"]
    (ROOT / "llms-full.txt").write_text("\n".join(full) + "\n")
    print(json.dumps({"blocks": len(blocks), "llms_txt_lines": len(lines), "llms_full_kb": round(len("\n".join(full)) / 1024)}))


if __name__ == "__main__":
    main()
