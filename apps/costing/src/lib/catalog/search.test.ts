import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeTerm } from "./search";
import { isXlsxExtension } from "./purchaseOrders";

test("sanitizes catalogue query terms for PostgREST filters", () => {
  assert.equal(sanitizeTerm("  AGL,100%  "), "AGL 100");
  assert.equal(sanitizeTerm("a".repeat(100)).length, 80);
});

test("accepts PO spreadsheet extensions with or without a leading dot", () => {
  assert.equal(isXlsxExtension(".xlsx"), true);
  assert.equal(isXlsxExtension("xlsx"), true);
  assert.equal(isXlsxExtension("XLSM"), true);
  assert.equal(isXlsxExtension("pdf"), false);
});
