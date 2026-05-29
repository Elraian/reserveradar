#!/usr/bin/env python3
"""Download all in-force kaitse-eeskiri acts from Riigi Teataja.

Produces:
  data/kaitse-eeskirjad/index.json    -> list of all acts (metadata)
  data/kaitse-eeskirjad/<globaalID>.xml -> full legal text of each act
"""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path(__file__).parent / "kaitse-eeskirjad"
OUT.mkdir(parents=True, exist_ok=True)

SEARCH = "https://www.riigiteataja.ee/api/oigusakt_otsing/1/otsi"
UA = {"User-Agent": "ReserveRadar-hackathon/1.0 (data crawl)"}


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def fetch_index() -> list:
    """Page through all in-force kaitse-eeskiri acts."""
    acts, leht = [], 1
    while True:
        params = urllib.parse.urlencode({
            "leht": leht,
            "limiit": 200,
            "pealkiri": "kaitse-eeskiri",
            "kehtiv": "2026-05-29",
            "kehtivKehtetus": "false",
        })
        data = json.loads(get(f"{SEARCH}?{params}"))
        batch = data.get("aktid", [])
        total = data["metaandmed"]["kokku"]
        acts.extend(batch)
        print(f"  page {leht}: +{len(batch)} ({len(acts)}/{total})")
        if len(acts) >= total or not batch:
            break
        leht += 1
        time.sleep(0.3)
    return acts


def main():
    print("Fetching index of all kaitse-eeskiri ...")
    acts = fetch_index()
    (OUT / "index.json").write_text(
        json.dumps(acts, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Saved index.json with {len(acts)} acts\n")

    print("Downloading full text of each act ...")
    ok = skip = fail = 0
    for i, a in enumerate(acts, 1):
        gid = a["globaalID"]
        dest = OUT / f"{gid}.xml"
        if dest.exists() and dest.stat().st_size > 0:
            skip += 1
            continue
        try:
            dest.write_bytes(get(f"https://www.riigiteataja.ee/akt/{gid}.xml"))
            ok += 1
        except Exception as e:  # noqa: BLE001
            fail += 1
            print(f"  FAIL {gid}: {e}")
        if i % 25 == 0:
            print(f"  {i}/{len(acts)}  (ok={ok} skip={skip} fail={fail})")
        time.sleep(0.25)
    print(f"\nDone. downloaded={ok} skipped={skip} failed={fail}")
    print(f"Files in: {OUT}")


if __name__ == "__main__":
    main()
