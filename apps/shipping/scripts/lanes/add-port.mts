/**
 * Add (or update) a port and, optionally, the lanes that reach it.
 *
 *   npm run lanes:add-port -- --name "GOTHENBURG" --code SEGOT --lat 57.68 --lng 11.84 \
 *       --alias "GOTEBORG" --lane SHEKOU__GOTHENBURG --lane NINGBO__GOTHENBURG
 *
 * Writes ports.data.json (coordinates + aliases) and lanes.config.json (new
 * pairs). It does not route anything itself — follow with `npm run lanes:generate`
 * to draw the sea lanes. Coordinates alone already give a straight-line route on
 * the map, so a port is usable immediately even before lanes are regenerated.
 *
 * This is the maintenance task assigned to the visibility "lane_maintainer" role.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalPortKey } from "../../src/lib/import/ports";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(here, "..", "..", "src", "lib", "import", "ports.data.json");
const configPath = path.join(here, "lanes.config.json");

// --- parse args (repeatable --alias and --lane) ---
type Args = { name?: string; code?: string; lat?: string; lng?: string; alias: string[]; lane: string[] };
const args: Args = { alias: [], lane: [] };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const flag = argv[i];
  if (!flag.startsWith("--")) continue;
  const key = flag.slice(2);
  const val = argv[i + 1];
  i++;
  if (key === "alias") args.alias.push(val);
  else if (key === "lane") args.lane.push(val);
  else (args as Record<string, unknown>)[key] = val;
}

if (!args.name || args.lat == null || args.lng == null) {
  console.error(
    'Required: --name "<PORT>" --lat <lat> --lng <lng>. Optional: --code <UNLOCODE>, ' +
      "--alias <spelling> (repeatable), --lane POL__POD (repeatable).",
  );
  process.exit(1);
}

const key = canonicalPortKey(args.name);
const lat = Number(args.lat);
const lng = Number(args.lng);
if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
  console.error(`Invalid coordinates: lat=${args.lat} lng=${args.lng}.`);
  process.exit(1);
}

// --- ports.data.json ---
const data = JSON.parse(fs.readFileSync(dataPath, "utf8")) as {
  coords: Record<string, { port: string; lat: number; lng: number }>;
  aliases: Record<string, string>;
};
const existed = key in data.coords;
data.coords[key] = { port: (args.code ?? "").toUpperCase(), lat, lng };
for (const alias of args.alias) {
  const ak = canonicalPortKey(alias);
  if (ak !== key) data.aliases[ak] = key;
}
// Stable, readable ordering: coords by key, aliases by key.
data.coords = sortByKey(data.coords);
data.aliases = sortByKey(data.aliases);
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + "\n");

// --- lanes.config.json ---
let addedLanes = 0;
if (args.lane.length) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
    _comment?: string;
    pairs: { pol: string; pod: string }[];
  };
  const seen = new Set(config.pairs.map((p) => `${canonicalPortKey(p.pol)}__${canonicalPortKey(p.pod)}`));
  for (const lane of args.lane) {
    const [pol, pod] = lane.split("__");
    if (!pol || !pod) {
      console.warn(`Skipping malformed --lane "${lane}" (expected POL__POD).`);
      continue;
    }
    const laneKey = `${canonicalPortKey(pol)}__${canonicalPortKey(pod)}`;
    if (seen.has(laneKey)) continue;
    seen.add(laneKey);
    config.pairs.push({ pol: canonicalPortKey(pol), pod: canonicalPortKey(pod) });
    addedLanes++;
  }
  config.pairs.sort((a, b) => `${a.pol}__${a.pod}`.localeCompare(`${b.pol}__${b.pod}`));
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

console.log(
  `${existed ? "Updated" : "Added"} port ${key} (${lat}, ${lng})` +
    (args.alias.length ? `, aliases: ${args.alias.join(", ")}` : "") +
    (addedLanes ? `, +${addedLanes} lane(s)` : "") +
    ".",
);
console.log("Next: npm run lanes:generate  (to draw the sea lanes)");

function sortByKey<T>(obj: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}
