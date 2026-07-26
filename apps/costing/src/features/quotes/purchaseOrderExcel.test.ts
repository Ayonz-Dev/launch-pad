import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { blankInputs, calculateCosting } from "../../lib/costing";
import { readZipText, replaceZipEntries } from "../../lib/zipReplace";
import {
  buildFactoryPurchaseOrderBytes,
  setWorksheetCell,
} from "./purchaseOrderExcel";
import type { QuoteDetail } from "./repository";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const templatePath = path.join(root, "public/templates/ayonz-factory-po.xlsx");

function zipVersions(buf: Uint8Array): Set<string> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  assert.ok(eocd >= 0);
  const cdOffset = view.getUint32(eocd + 16, true);
  const count = view.getUint16(eocd + 10, true);
  const versions = new Set<string>();
  let p = cdOffset;
  for (let n = 0; n < count; n += 1) {
    const made = view.getUint16(p + 4, true);
    const needed = view.getUint16(p + 6, true);
    versions.add(`${made}/${needed}`);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return versions;
}

test("factory PO template exists with ORDER PO sheet and x14 validations", async () => {
  const buffer = await readFile(templatePath);
  const workbook = await readZipText(buffer, "xl/workbook.xml");
  const sheet = await readZipText(buffer, "xl/worksheets/sheet1.xml");
  assert.ok(workbook.includes('name="ORDER PO"'), "ORDER PO sheet missing");
  assert.ok(sheet.includes("<sheetData"), "ORDER PO sheetData missing");
  assert.ok(sheet.includes("extLst"), "template should keep Excel data-validation extensions");
  assert.match(sheet, /<c r="B30" s="19" t="s"><v>71<\/v><\/c>/);
  const shared = await readZipText(buffer, "xl/sharedStrings.xml");
  assert.match(shared, />USD</);
  assert.ok(zipVersions(buffer).has("45/20"), "template should be Excel 365 package version");
});

test("setWorksheetCell preserves style and supports inline text + numbers", () => {
  const xml =
    '<worksheet><sheetData><row r="20"><c r="C20" s="240" t="s"><v>264</v></c></row></sheetData></worksheet>';
  const texted = setWorksheetCell(xml, "C20", "AGL4635");
  assert.match(texted, /<c r="C20" s="240" t="inlineStr"><is><t>AGL4635<\/t><\/is><\/c>/);

  const numbered = setWorksheetCell(texted, "C20", 14.4);
  assert.match(numbered, /<c r="C20" s="240"><v>14\.4<\/v><\/c>/);

  const cleared = setWorksheetCell(numbered, "C20", null);
  assert.match(cleared, /<c r="C20" s="240"\/>/);
});

test("zip replace preserves Excel 365 version bits on untouched entries", async () => {
  const template = await readFile(templatePath);
  const noop = await replaceZipEntries(template, {});
  assert.deepEqual([...zipVersions(template)].sort(), [...zipVersions(noop)].sort());

  const sheet = await readZipText(template, "xl/worksheets/sheet1.xml");
  const edited = await replaceZipEntries(template, {
    "xl/worksheets/sheet1.xml": sheet.replace(
      /<c r="C20"[^/]*(?:\/>|>[\s\S]*?<\/c>)/,
      '<c r="C20" s="240" t="inlineStr"><is><t>AGL4635</t></is></c>',
    ),
  });
  assert.ok(zipVersions(edited).has("45/20"));
  assert.ok(zipVersions(edited).has("45/10"));
  const nextSheet = await readZipText(edited, "xl/worksheets/sheet1.xml");
  assert.match(nextSheet, /<c r="C20"[^>]*t="inlineStr"><is><t>AGL4635<\/t><\/is><\/c>/);
  assert.ok(nextSheet.includes("extLst"));
});

test("fills quote commercial fields without dropping extLst or package version", async () => {
  const inputs = {
    ...blankInputs,
    sku: "UX6RNDSL",
    agl: "UX6RNDSL",
    description: "6 pack silicone stretch lids",
    brand: "Ubanworx",
    customer: "Demo retailer",
    factoryName: "SHENZHEN HAFLY TECHNOLOGY CO., LTD",
    factoryUnitUsd: 1.92,
    orderQuantity: 7020,
    unitsPerContainer: 15600,
    containerConfig: "20 FT" as const,
    costingBasis: "FOB" as const,
  };
  const result = calculateCosting(inputs);
  assert.ok(result.fobTotalAud > 0);

  const quote: QuoteDetail = {
    id: "test",
    quoteNumber: "AGL616552",
    status: "ceo_approved",
    sku: inputs.sku,
    customerName: inputs.customer,
    teamId: null,
    customerId: null,
    inputs,
    result,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    isOwner: true,
    hasRejection: false,
    latestRejectionNotes: null,
    customerContactId: null,
    representativeContactId: null,
    versions: [],
    approvals: [],
  };

  const template = await readFile(templatePath);
  const bytes = await buildFactoryPurchaseOrderBytes(template, quote, {
    orderPlaceDate: new Date(2026, 6, 23),
    destinationPort: "Sydney",
    salesManagerName: "Alex Sales",
  });

  assert.ok(zipVersions(bytes).has("45/20"), "generated PO must keep Excel 365 create_version");
  const sheet = await readZipText(bytes, "xl/worksheets/sheet1.xml");
  assert.ok(sheet.includes("extLst"), "generated PO must keep extLst");
  assert.match(sheet, /<c r="C20"[^>]*t="inlineStr"><is><t>UX6RNDSL<\/t><\/is><\/c>/);
  assert.match(sheet, /<c r="C22"[^>]*t="inlineStr"><is><t>Demo retailer<\/t><\/is><\/c>/);
  assert.match(sheet, /<c r="C23"[^>]*t="inlineStr"><is><t>Ubanworx<\/t><\/is><\/c>/);
  assert.match(sheet, /<c r="C29"[^>]*t="inlineStr"><is><t>6 pack silicone stretch lids<\/t><\/is><\/c>/);
  assert.match(sheet, /<c r="C30"[^>]*><v>1\.92<\/v><\/c>/);
  assert.match(sheet, /<c r="C36"[^>]*><v>15600<\/v><\/c>/);
  assert.match(sheet, /<c r="C66"[^>]*t="inlineStr"><is><t>AGL616552<\/t><\/is><\/c>/);
  assert.match(sheet, /<c r="C67"[^>]*t="inlineStr"><is><t>FOB<\/t><\/is><\/c>/);
  assert.match(sheet, /<c r="C68"[^>]*t="inlineStr"><is><t>Alex Sales<\/t><\/is><\/c>/);
  assert.match(sheet, /<c r="C3"[^>]*t="inlineStr"><is><t>SHENZHEN HAFLY TECHNOLOGY CO\., LTD<\/t><\/is><\/c>/);
  assert.match(sheet, /<c r="C101"[^>]*><v>7020<\/v><\/c>/);
  assert.match(sheet, /<c r="C109"[^>]*><v>7020<\/v><\/c>/);
  assert.match(sheet, /<c r="G1"[^>]*><v>46226<\/v><\/c>/);
  assert.match(sheet, /<c r="C80"[^>]*>[\s\S]*<f>C109\*C30<\/f><v>13478\.4<\/v>/);
});
