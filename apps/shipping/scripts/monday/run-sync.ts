/**
 * CLI: Monday product catalogue → Supabase mirror.
 *
 * Usage:
 *   npm run catalog:sync:monday -- --dry-run
 *   npm run catalog:sync:monday
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runMondayCatalogSync } from "../../src/lib/monday/sync";

function loadEnvFiles() {
  const root = process.cwd();
  for (const name of [".env.local", ".env"]) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const equals = trimmed.indexOf("=");
      if (equals <= 0) continue;
      const key = trimmed.slice(0, equals).trim();
      let value = trimmed.slice(equals + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

function parseArgs(args: string[]) {
  let dryRun = false;
  let pageSize: number | undefined;
  let concurrency: number | undefined;
  for (const arg of args) {
    if (arg === "--dry-run") dryRun = true;
    if (arg.startsWith("--page-size=")) {
      const parsed = Number(arg.slice("--page-size=".length));
      if (Number.isFinite(parsed) && parsed > 0) pageSize = parsed;
    }
    if (arg.startsWith("--concurrency=")) {
      const parsed = Number(arg.slice("--concurrency=".length));
      if (Number.isFinite(parsed) && parsed > 0) concurrency = parsed;
    }
  }
  return { dryRun, pageSize, concurrency };
}

async function main() {
  loadEnvFiles();
  const options = parseArgs(process.argv.slice(2));
  console.log(
    `Monday product catalogue sync (dryRun=${options.dryRun}, pageSize=${options.pageSize || "default"}, concurrency=${options.concurrency || "default"})`,
  );

  const result = await runMondayCatalogSync(options);
  console.log(`run_id=${result.runId}`);
  console.log(JSON.stringify(result.stats, null, 2));

  if (result.issues.length) {
    console.log(`\nReview required for ${result.issues.length} item(s):`);
    for (const issue of result.issues.slice(0, 25)) {
      console.log(
        `- [${issue.code}] board=${issue.boardId || "-"} item=${issue.itemId || "-"}: ${issue.message}`,
      );
    }
    if (result.issues.length > 25) {
      console.log(`- ...and ${result.issues.length - 25} more`);
    }
  }
}

main().catch((error) => {
  console.error(
    "Monday catalogue sync failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
