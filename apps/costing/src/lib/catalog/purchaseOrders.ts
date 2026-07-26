import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PurchaseOrderAsset,
  PurchaseOrderPreview,
  PurchaseOrderSheetPreview,
} from "./types";

const MONDAY_ENDPOINT = "https://api.monday.com/v2";
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_SHEETS = 8;
const MAX_ROWS = 80;
const MAX_COLS = 24;
const FETCH_TIMEOUT_MS = 20_000;

type StoredPoAsset = {
  asset_id: string;
  name: string | null;
  file_extension: string | null;
  file_size: number | null;
  column_title: string | null;
  board_id: string;
  item_id: string;
};

function requireMondayToken(): string {
  const token = process.env.MONDAY_API_TOKEN?.trim();
  if (!token) throw new Error("MONDAY_API_TOKEN is not configured.");
  return token;
}

export function isXlsxExtension(ext: string | null | undefined): boolean {
  const value = (ext || "").toLowerCase().replace(/^\./, "");
  return value === "xlsx" || value === "xlsm";
}

export async function listPurchaseOrderAssets(
  supabase: SupabaseClient,
  productId: string,
): Promise<PurchaseOrderAsset[]> {
  const { data, error } = await supabase
    .from("monday_product_assets")
    .select("asset_id, name, file_extension, file_size, column_title")
    .eq("product_id", productId)
    .eq("column_title", "PO")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((row) => isXlsxExtension(row.file_extension as string | null))
    .map((row) => ({
      assetId: String(row.asset_id),
      name: String(row.name || `PO ${row.asset_id}`),
      fileExtension: (row.file_extension as string) || null,
      fileSize: row.file_size == null ? null : Number(row.file_size),
      columnTitle: String(row.column_title || "PO"),
    }));
}

async function loadOwnedPoAsset(
  supabase: SupabaseClient,
  productId: string,
  assetId: string,
): Promise<StoredPoAsset> {
  const { data, error } = await supabase
    .from("monday_product_assets")
    .select("asset_id, name, file_extension, file_size, column_title, board_id, item_id")
    .eq("product_id", productId)
    .eq("asset_id", assetId)
    .eq("column_title", "PO")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw Object.assign(new Error("Purchase order not found for this product."), { status: 404 });
  if (!isXlsxExtension(data.file_extension as string | null)) {
    throw Object.assign(new Error("Only Excel purchase-order files can be opened."), { status: 400 });
  }
  return data as StoredPoAsset;
}

async function requestMondayAssetUrl(assetId: string): Promise<{
  url: string;
  name: string;
  fileSize: number | null;
}> {
  const response = await fetch(MONDAY_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: requireMondayToken(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `query ($ids: [ID!]!) {
        assets(ids: $ids) {
          id
          name
          url
          public_url
          file_extension
          file_size
        }
      }`,
      variables: { ids: [assetId] },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Monday API HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: {
      assets?: Array<{
        id: string;
        name: string | null;
        url: string | null;
        public_url: string | null;
        file_size: number | null;
      }>;
    };
    errors?: Array<{ message: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  const asset = payload.data?.assets?.[0];
  const url = asset?.url || asset?.public_url;
  if (!asset || !url) {
    throw Object.assign(new Error("Monday did not return a downloadable purchase-order URL."), {
      status: 404,
    });
  }

  return {
    url,
    name: asset.name || `PO ${assetId}`,
    fileSize: asset.file_size == null ? null : Number(asset.file_size),
  };
}

async function downloadWorkbook(url: string, knownSize: number | null): Promise<ArrayBuffer> {
  if (knownSize != null && knownSize > MAX_FILE_BYTES) {
    throw Object.assign(
      new Error(`Purchase order exceeds the ${MAX_FILE_BYTES / (1024 * 1024)} MB preview limit.`),
      { status: 413 },
    );
  }

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Could not download purchase order (HTTP ${response.status}).`);
  }

  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > MAX_FILE_BYTES) {
    throw Object.assign(
      new Error(`Purchase order exceeds the ${MAX_FILE_BYTES / (1024 * 1024)} MB preview limit.`),
      { status: 413 },
    );
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw Object.assign(
      new Error(`Purchase order exceeds the ${MAX_FILE_BYTES / (1024 * 1024)} MB preview limit.`),
      { status: 413 },
    );
  }
  return buffer;
}

function cellToText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return String(value);
}

export async function buildPurchaseOrderPreview(
  supabase: SupabaseClient,
  productId: string,
  assetId: string,
): Promise<PurchaseOrderPreview> {
  const owned = await loadOwnedPoAsset(supabase, productId, assetId);
  const monday = await requestMondayAssetUrl(owned.asset_id);
  const workbook = await downloadWorkbook(monday.url, owned.file_size ?? monday.fileSize);
  const readXlsxFile = (await import("read-excel-file/node")).default;
  const sheetsRaw = await readXlsxFile(Buffer.from(workbook));
  const limitedSheets = sheetsRaw.slice(0, MAX_SHEETS);
  const sheets: PurchaseOrderSheetPreview[] = limitedSheets.map((entry) => {
    const matrix = entry.data;
    const totalRows = matrix.length;
    const totalColumns = matrix.reduce((max, row) => Math.max(max, row.length), 0);
    const truncated = totalRows > MAX_ROWS || totalColumns > MAX_COLS;
    const rows = matrix.slice(0, MAX_ROWS).map((row) => {
      const cells = row.slice(0, MAX_COLS).map(cellToText);
      while (cells.length < Math.min(totalColumns, MAX_COLS)) cells.push("");
      return cells;
    });
    return {
      name: String(entry.sheet || "Sheet"),
      rows,
      truncated,
      totalRows,
      totalColumns,
    };
  });

  return {
    assetId: owned.asset_id,
    name: owned.name || monday.name,
    sheets,
  };
}

export async function downloadPurchaseOrderFile(
  supabase: SupabaseClient,
  productId: string,
  assetId: string,
): Promise<{ buffer: ArrayBuffer; name: string; contentType: string }> {
  const owned = await loadOwnedPoAsset(supabase, productId, assetId);
  const monday = await requestMondayAssetUrl(owned.asset_id);
  const buffer = await downloadWorkbook(monday.url, owned.file_size ?? monday.fileSize);
  const safeName = (owned.name || monday.name || `purchase-order-${assetId}`).replace(
    /[^\w.\-() ]+/g,
    "_",
  );
  const withExt = /\.xlsx?$/i.test(safeName) ? safeName : `${safeName}.xlsx`;
  return {
    buffer,
    name: withExt,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}
