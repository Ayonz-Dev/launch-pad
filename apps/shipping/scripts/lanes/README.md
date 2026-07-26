# Ports and sea lanes

The map draws each **sea** shipment along a real maritime route (through Malacca,
Suez, the Torres Strait, and so on) rather than a straight line across land.
Train and air legs draw straight, which is correct for an overland or flight leg.

Two pieces of committed data drive this:

- `../../src/lib/import/ports.data.json` — port coordinates and spelling aliases.
- `../../src/lib/import/lanes.ts` — the precomputed marine routes, keyed by
  `${canonicalPol}__${canonicalPod}`. Generated from `lanes.config.json` (the
  list of pairs to route) with the [`searoute`](https://pypi.org/project/searoute/)
  marine network, and committed so the app carries no routing dependency.

## Who maintains it

This is the job of the **Lane Maintainer** role (visibility application; see
`database/05_lane_maintainer_role.sql`). Assign that role to one person in IAM;
they run the two commands below when a new destination appears in the reports.

## Add a port (and its lanes)

From `apps/shipping`:

```
npm run lanes:add-port -- \
  --name "GOTHENBURG" --code SEGOT --lat 57.68 --lng 11.84 \
  --alias "GOTEBORG" \
  --lane SHEKOU__GOTHENBURG --lane NINGBO__GOTHENBURG
```

- `--name` (required) the port as it appears in the report; `--lat`/`--lng`
  (required) its coordinates; `--code` its UN/LOCODE (optional).
- `--alias` a variant spelling that should map to this port (repeatable).
- `--lane POL__POD` a route to draw to/from this port (repeatable). Use the
  canonical port names.

This edits `ports.data.json` and `lanes.config.json` only. Coordinates alone
already give the port a straight-line route on the map, so it is usable
immediately, even before the sea lanes are regenerated.

## Regenerate the sea lanes

One-time setup (Python, kept out of git):

```
cd apps/shipping/scripts/lanes
python3 -m venv venv
./venv/bin/pip install "setuptools==65.5.1" wheel
./venv/bin/pip install --no-build-isolation searoute
```

Then, whenever `lanes.config.json` or a port's coordinates change:

```
cd apps/shipping
npm run lanes:generate
```

It resolves each configured pair to coordinates (via the app's own port lookup),
routes them over the marine network, and rewrites `src/lib/import/lanes.ts`.
Commit the regenerated file. Re-import the daily report (or reload) to see the
new lanes on the map.
