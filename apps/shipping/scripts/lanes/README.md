# Sea-lane precompute

`src/lib/import/lanes.ts` holds real maritime routes between the port pairs that
appear in the daily reports, so the map draws each sea shipment along an actual
shipping lane (through Malacca, Suez, the Torres Strait, and so on) rather than a
straight line across land. Train and air shipments intentionally draw straight,
which is correct for an overland or flight leg.

The lanes are generated offline with the [`searoute`](https://pypi.org/project/searoute/)
marine-network library and committed as data, so the app carries no routing
dependency at build or run time.

## Regenerate

1. Produce `pairs.json` — the distinct sea (and unspecified-mode) origin to
   destination pairs, keyed `${canonicalPol}__${canonicalPod}` with `[lng, lat]`
   coordinates from `src/lib/import/ports.ts`. Run the daily reports through
   `parseReport` and collect `lookupPort` coordinates for each pair (see the
   generator snippet in DECISIONS).
2. Compute the routes:
   ```
   python -m venv venv && ./venv/bin/pip install "setuptools==65.5.1" wheel
   ./venv/bin/pip install --no-build-isolation searoute
   ./venv/bin/python gen_lanes.py   # reads pairs.json, writes lanes.json
   ```
3. Emit `src/lib/import/lanes.ts` from `lanes.json` (keys sorted, points as
   `[lat, lng]`, endpoints snapped to the port coordinates).

Add a new destination port to `ports.ts` first (with coordinates and any alias),
then re-run so its lanes are included.
