import type { QuoteDetail } from "./repository";
import { readZipText, replaceZipEntries } from "@/lib/zipReplace";

const TEMPLATE_URL = "/templates/ayonz-factory-po.xlsx";
const ORDER_PO_SHEET_PATH = "xl/worksheets/sheet1.xml";

export type FactoryPoOptions = {
  /** Sales Manager (AYONZ) shown on the PO. */
  salesManagerName?: string | null;
  /** Destination port to assign the full order quantity (template Lists ports). */
  destinationPort?:
    | "Sydney"
    | "Melbourne"
    | "Brisbane"
    | "Fremantle"
    | "Adelaide"
    | "Auckland"
    | "Lyttleton";
  /** Override order place date (defaults to today). */
  orderPlaceDate?: Date;
};

const PORT_QTY_CELLS: Record<NonNullable<FactoryPoOptions["destinationPort"]>, string> = {
  Sydney: "C101",
  Melbourne: "C102",
  Brisbane: "C103",
  Fremantle: "C104",
  Adelaide: "C105",
  Auckland: "C106",
  Lyttleton: "C107",
};

type CellScalar = string | number | Date | null;

function asDate(value: Date): Date {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

/** Excel serial date for a local calendar day (no fractional time). */
function excelSerialDate(value: Date): number {
  const utc = Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  const excelEpoch = Date.UTC(1899, 11, 30);
  return Math.round((utc - excelEpoch) / 86_400_000);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function styleAttrFromCellOpen(attrs: string): string {
  const match = attrs.match(/\ss="(\d+)"/);
  return match ? ` s="${match[1]}"` : "";
}

function buildCellXml(address: string, styleAttr: string, value: CellScalar): string {
  if (value === null || value === "") {
    return `<c r="${address}"${styleAttr}/>`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return `<c r="${address}"${styleAttr}/>`;
    }
    return `<c r="${address}"${styleAttr}><v>${value}</v></c>`;
  }
  if (value instanceof Date) {
    return `<c r="${address}"${styleAttr}><v>${excelSerialDate(value)}</v></c>`;
  }
  return `<c r="${address}"${styleAttr} t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

/**
 * Replace (or insert) a cell in worksheet XML while preserving the cell style index.
 * Leaves formulas, drawings, data validations, and extLst untouched elsewhere in the sheet.
 */
export function setWorksheetCell(sheetXml: string, address: string, value: CellScalar): string {
  const cellRe = new RegExp(`<c r="${address}"([^>/]*)(?:/>|>([\\s\\S]*?)</c>)`);
  const existing = sheetXml.match(cellRe);
  const styleAttr = existing ? styleAttrFromCellOpen(existing[1] ?? "") : "";
  const nextCell = buildCellXml(address, styleAttr, value);

  if (existing) {
    return sheetXml.replace(cellRe, nextCell);
  }

  const rowMatch = address.match(/^([A-Z]+)(\d+)$/);
  if (!rowMatch) {
    throw new Error(`Invalid cell address: ${address}`);
  }
  const rowNum = rowMatch[2];
  const rowRe = new RegExp(`(<row[^>]*\\sr="${rowNum}"[^>]*>)([\\s\\S]*?)(</row>)`);
  const row = sheetXml.match(rowRe);
  if (!row) {
    throw new Error(`PO template is missing row ${rowNum} for cell ${address}.`);
  }
  return sheetXml.replace(rowRe, `$1$2${nextCell}$3`);
}

function applyCells(sheetXml: string, cells: Record<string, CellScalar>): string {
  let next = sheetXml;
  for (const [address, value] of Object.entries(cells)) {
    next = setWorksheetCell(next, address, value);
  }
  return next;
}

const CLEAR_FACTORY_CELLS = [
  "C3",
  "C4",
  "C5",
  "C6",
  "C7",
  "C8",
  "C9",
  "C10",
  "C11",
  "C12",
  "C13",
  "C14",
  "C15",
  "C16",
  "C17",
  "C18",
] as const;

const CLEAR_PRODUCT_CELLS = [
  "C20",
  "C21",
  "C22",
  "C23",
  "C24",
  "C25",
  "C26",
  "C27",
  "C28",
  "C29",
  "C30",
  "C31",
  "C32",
  "C33",
  "C34",
  "C36",
  "C37",
  "C38",
  "F36",
  "F37",
  "F38",
  "C39",
  "C45",
  "C66",
  "C67",
  "C68",
  "C69",
  "C70",
  "C71",
  "C72",
  "C74",
  "C76",
  "C77",
  "C78",
  "F78",
  "C87",
  "C88",
] as const;

const QTY_CELLS = ["C101", "C102", "C103", "C104", "C105", "C106", "C107", "C108", "C109"] as const;

function fillOrderPoSheet(sheetXml: string, quote: QuoteDetail, options: FactoryPoOptions): string {
  const { inputs } = quote;
  const placeDate = asDate(options.orderPlaceDate ?? new Date());
  const model = (inputs.agl || inputs.sku || quote.sku || "").trim();
  const factoryName = (inputs.factoryName || "").trim();
  const quantity = Math.max(0, inputs.orderQuantity || 0);
  const port = options.destinationPort ?? "Sydney";
  const unitUsd = inputs.factoryUnitUsd || 0;

  const clears: Record<string, CellScalar> = {};
  for (const address of CLEAR_FACTORY_CELLS) clears[address] = null;
  for (const address of CLEAR_PRODUCT_CELLS) clears[address] = null;
  for (const address of QTY_CELLS) clears[address] = 0;
  let next = applyCells(sheetXml, clears);

  const fills: Record<string, CellScalar> = {
    G1: placeDate,
    C20: model || null,
    C22: quote.customerName || inputs.customer || null,
    C23: inputs.brand || null,
    C29: inputs.description || null,
    C30: unitUsd,
    C66: quote.quoteNumber,
    C67: inputs.costingBasis === "FIW" ? "FIW" : "FOB",
    C68: options.salesManagerName?.trim() || null,
    C109: quantity,
  };

  if (factoryName) {
    fills.C3 = factoryName;
    fills.C5 = factoryName;
  }

  const upc = inputs.unitsPerContainer || null;
  if (upc) {
    if (inputs.containerConfig === "40 FT") fills.C37 = upc;
    else if (inputs.containerConfig === "40FT High") fills.C38 = upc;
    else fills.C36 = upc;
  }

  for (const address of Object.values(PORT_QTY_CELLS)) fills[address] = 0;
  fills[PORT_QTY_CELLS[port]] = quantity;

  next = applyCells(next, fills);

  // Refresh cached value on the order-total formula cell (Excel recalculates on open).
  next = next.replace(
    /(<c r="C80"[^>]*>)([\s\S]*?)(<\/c>)/,
    (_full, open: string, inner: string, close: string) => {
      let body = inner;
      if (!/<f[\s>]/.test(body)) {
        body = `<f>C109*C30</f>${body.replace(/<v>[\s\S]*?<\/v>/g, "")}`;
      }
      const cached = `<v>${quantity * unitUsd}</v>`;
      body = /<v>/.test(body)
        ? body.replace(/<v>[\s\S]*?<\/v>/, cached)
        : body.replace(/<\/f>/, `</f>${cached}`);
      return `${open}${body}${close}`;
    },
  );

  return next;
}

/**
 * Fill the finance factory-PO template bytes without rewriting the whole package.
 * Untouched ZIP entries keep Excel 365 metadata that full re-zippers strip.
 */
export async function buildFactoryPurchaseOrderBytes(
  templateBytes: ArrayBuffer | Uint8Array,
  quote: QuoteDetail,
  options: FactoryPoOptions = {},
): Promise<Uint8Array> {
  const input =
    templateBytes instanceof Uint8Array
      ? templateBytes
      : new Uint8Array(templateBytes);

  const sheetXml = await readZipText(input, ORDER_PO_SHEET_PATH);
  if (!sheetXml.includes("<sheetData")) {
    throw new Error("PO template worksheet XML looks invalid.");
  }

  const filled = fillOrderPoSheet(sheetXml, quote, options);
  return replaceZipEntries(input, {
    [ORDER_PO_SHEET_PATH]: filled,
  });
}

/**
 * Build an Ayonz factory purchase-order workbook from the finance template,
 * prefilled with quote commercial fields (USD factory price, qty, basis, etc.).
 */
export async function buildFactoryPurchaseOrderWorkbook(
  quote: QuoteDetail,
  options: FactoryPoOptions = {},
): Promise<Uint8Array> {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) {
    throw new Error(`Could not load PO template (${response.status}).`);
  }
  const buffer = await response.arrayBuffer();
  return buildFactoryPurchaseOrderBytes(buffer, quote, options);
}

export async function downloadFactoryPurchaseOrder(
  quote: QuoteDetail,
  options: FactoryPoOptions = {},
): Promise<void> {
  const bytes = await buildFactoryPurchaseOrderWorkbook(quote, options);
  const blob = new Blob([Uint8Array.from(bytes)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const model = (quote.inputs.agl || quote.inputs.sku || quote.sku || "PO").replace(/[^\w.-]+/g, "_");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `PO ${quote.quoteNumber} - ${model}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
