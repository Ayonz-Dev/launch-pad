#!/usr/bin/env python3
"""Route a set of port pairs over the searoute marine network.

Usage: gen_lanes.py <pairs.json> <lanes.json>

Input  (pairs.json): [{ "key": "SHEKOU__SYDNEY", "pol": [lng, lat], "pod": [lng, lat] }, ...]
Output (lanes.json): { "SHEKOU__SYDNEY": { "pts": [[lng, lat], ...], "km": 8354 }, ... }

The Node orchestrator (generate.mts) resolves coordinates from ports.data.json,
calls this, then emits src/lib/import/lanes.ts. Requires `searoute` (see README).
"""
import json
import sys

try:
    import searoute as sr
except ImportError:
    sys.exit(
        "searoute is not installed. In this folder run:\n"
        "  python3 -m venv venv && ./venv/bin/pip install 'setuptools==65.5.1' wheel\n"
        "  ./venv/bin/pip install --no-build-isolation searoute\n"
        "then re-run with ./venv/bin/python."
    )

pairs_path, lanes_path = sys.argv[1], sys.argv[2]
pairs = json.load(open(pairs_path))


def simplify(coords, max_pts=28):
    """Keep the endpoints, downsample the middle evenly to at most max_pts."""
    if len(coords) <= max_pts:
        return coords
    keep = [coords[0]]
    step = (len(coords) - 1) / (max_pts - 1)
    for i in range(1, max_pts - 1):
        keep.append(coords[round(i * step)])
    keep.append(coords[-1])
    return keep


lanes = {}
fails = []
for p in pairs:
    try:
        route = sr.searoute(p["pol"], p["pod"], append_orig_dest=True)
        coords = route["geometry"]["coordinates"]
        # Keep longitude continuous across the antimeridian so a Pacific lane
        # draws as one line instead of wrapping the whole map.
        fixed, prev = [], None
        for lng, lat in coords:
            if prev is not None:
                while lng - prev > 180:
                    lng -= 360
                while lng - prev < -180:
                    lng += 360
            fixed.append([round(lng, 3), round(lat, 3)])
            prev = lng
        # Snap the exact endpoints to the port coordinates.
        fixed[0] = [round(p["pol"][0], 3), round(p["pol"][1], 3)]
        fixed[-1] = [round(p["pod"][0], 3), round(p["pod"][1], 3)]
        lanes[p["key"]] = {"pts": simplify(fixed), "km": round(route["properties"]["length"])}
    except Exception as e:  # noqa: BLE001 - report and continue
        fails.append((p["key"], str(e)[:80]))

json.dump(lanes, open(lanes_path, "w"))
print(f"routed {len(lanes)} lanes, {len(fails)} failed")
for key, msg in fails[:20]:
    print(f"  FAIL {key}: {msg}")
