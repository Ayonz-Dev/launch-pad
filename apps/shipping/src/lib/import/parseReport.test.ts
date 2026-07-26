import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReport, mergeParseResults, type CommentLookup } from "./parseReport";

// A tiny Australia-style sheet: header row, then two lines in one container
// (different AGLs), one carrying a retailer note and a spare part, plus an ETA
// cell comment recording a delay.
const HEADER = [
  "AGL",
  "Description",
  "Brand",
  "Model",
  "QTY",
  "Spare part",
  "Spare unit",
  "Price",
  "Total",
  "Port of load",
  "ETD",
  "Via HK/Sin",
  "ETD status",
  "Port of destination",
  "ETA ",
  "Vessal",
  "Agent",
  "Container No.",
  "Container qty",
  "20'",
  "40'",
  "Liner",
  "Sales",
  "", // unnamed retailer/notes column
];

function row(values: Record<number, unknown>): unknown[] {
  const r: unknown[] = new Array(HEADER.length).fill(null);
  for (const [k, v] of Object.entries(values)) r[Number(k)] = v;
  return r;
}

const ROWS: unknown[][] = [
  HEADER,
  // AGL2000, container ABCU1, with a spare part and a BIG W retailer note
  row({ 0: "AGL2000", 1: "Air fryer", 2: "EKO", 3: "GR8LDAF", 4: 254, 5: "1ctn", 6: 12, 7: 10, 8: 2540, 9: "NINGBO", 10: "2026-08-01", 13: "SYDNEY", 14: "2026-09-10", 15: "CSL SOPHIE\tTLO2", 17: "ABCU1", 21: "CMA", 22: "John S", 23: "BIG W" }),
  // AGL2001 in the same container, a free-text note ("14 DAYS") not a retailer
  row({ 0: "AGL2001", 1: "Toaster", 2: "EKO", 3: "EGBP4SL", 4: 100, 7: 5, 8: 500, 9: "NINGBO", 10: "2026-08-01", 13: "SYDNEY", 14: "2026-09-10", 17: "ABCU1", 21: "CMA", 22: "Jane D", 23: "14 DAYS" }),
];

// ETA is column 14; put a delay comment on both data rows (rows 1 and 2).
const commentAt: CommentLookup = (r, c) => {
  if (c === 14 && (r === 1 || r === 2)) return { text: "Flora Mai:\nDelay 2 days", author: "Flora Mai" };
  return undefined;
};

test("groups a container, captures AGLs, spare part, retailer and ETA note", () => {
  const { shipments } = parseReport(ROWS, "2026-07-26", commentAt);
  assert.equal(shipments.length, 1);
  const s = shipments[0];
  assert.equal(s.containerNo, "ABCU1");
  assert.deepEqual(s.agls, ["AGL2000", "AGL2001"]);
  assert.equal(s.retailer, "Big W");
  // FOB is the sum of line totals, computed values never trusted from a comment.
  assert.equal(s.fobValueUsd, 3040);

  // Spare part rode along on its line.
  const withSpare = s.skus.find((k) => k.agl === "AGL2000");
  assert.equal(withSpare?.sparePart, "1ctn");
  assert.equal(withSpare?.spareUnit, 12);

  // ETA cell comment became the delay note, boilerplate and author prefix stripped.
  assert.equal(s.etaNote, "Delay 2 days");
  const etaComment = s.notes?.comments?.find((c) => c.field === "eta");
  assert.equal(etaComment?.text, "Delay 2 days");
  assert.equal(etaComment?.author, "Flora Mai");

  // The non-retailer note was kept verbatim rather than forced into retailer.
  assert.ok(s.notes?.lineNotes?.some((n) => n.text === "14 DAYS"));
});

test("sea shipment follows the marine lane; the dot sits on it", () => {
  const rows: unknown[][] = [
    HEADER,
    row({ 0: "AGL9", 1: "TV", 3: "M1", 4: 10, 9: "Shekou", 10: "2026-08-01", 12: "ON WATER", 13: "Sydney", 14: "2026-09-10", 17: "SEAU1" }),
  ];
  const { shipments } = parseReport(rows, "2026-07-26");
  const s = shipments[0];
  // Many waypoints, not a 2-point straight line, and it starts/ends at the ports.
  assert.ok(s.routePath.length > 5);
  assert.ok(Math.abs(s.routePath[0].lat - 22.48) < 0.2); // Shekou
  const end = s.routePath[s.routePath.length - 1];
  assert.ok(Math.abs(end.lat - -33.97) < 0.2); // Sydney
  // On-water dot is placed on the lane (between the China coast and Australia).
  assert.ok(s.currentPosition);
  assert.ok(s.currentPosition!.lat < 22 && s.currentPosition!.lat > -34);
});

test("train shipment draws a straight overland line, not a sea lane", () => {
  const H = ["AGL", "Description", "Brand", "Model", "QTY", "Port of load", "ETD", "ETD status", "Port of destination", "ETA ", "Container No.", "Transport"];
  const r = new Array(H.length).fill(null);
  r[0] = "AGLT"; r[3] = "M1"; r[4] = 5; r[5] = "Chengdu"; r[6] = "2026-08-01"; r[8] = "Warsaw"; r[9] = "2026-09-10"; r[10] = "TRAINU1"; r[11] = "TRAIN";
  const { shipments } = parseReport([H, r], "2026-07-26");
  assert.equal(shipments[0].routePath.length, 2); // straight, overland
});

test("merge de-duplicates a shipment seen on two sheets, filling missing fields", () => {
  const priced = parseReport(ROWS, "2026-07-26", commentAt);
  // A second sheet with the same container but a barcode column instead of price.
  const HEADER2 = ["AGL", "Description", "Brand", "Model", "QTY", "Spare part", "Spare unit", "Port of load", "ETD", "Via HK/SG", "Shipping status", "Port of destination", "ETA ", "Vessel", "Agent", "Container No.", "Container qty", "20'", "40'", "Liner", "Sales", "Barcode"];
  const rows2: unknown[][] = [
    HEADER2,
    (() => { const r = new Array(HEADER2.length).fill(null); r[0] = "AGL2000"; r[3] = "GR8LDAF"; r[4] = 254; r[8] = "2026-08-01"; r[12] = "2026-09-10"; r[15] = "ABCU1"; r[21] = "9312345678900"; return r; })(),
  ];
  const plain = parseReport(rows2, "2026-07-26");
  const merged = mergeParseResults([priced, plain]);
  assert.equal(merged.shipments.length, 1);
  const line = merged.shipments[0].skus.find((k) => k.agl === "AGL2000");
  // Price from sheet one, barcode from sheet two, on the same line.
  assert.equal(line?.lineTotal, 2540);
  assert.equal(line?.barcode, "9312345678900");
});
