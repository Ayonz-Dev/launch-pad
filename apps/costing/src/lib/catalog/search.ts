import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogProductHit } from "./types";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 40;

export function sanitizeTerm(raw: string): string {
  return raw
    .trim()
    .replace(/[%_,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function escapeIlike(term: string): string {
  return term.replace(/[%_]/g, (ch) => `\\${ch}`);
}

export async function searchCatalogProducts(
  supabase: SupabaseClient,
  query: string,
  limit = DEFAULT_LIMIT,
): Promise<CatalogProductHit[]> {
  const term = sanitizeTerm(query);
  if (term.length < 2) return [];

  const capped = Math.min(Math.max(1, limit), MAX_LIMIT);
  const pattern = `%${escapeIlike(term)}%`;

  const { data, error } = await supabase
    .from("sourcing_catalog_products")
    .select(
      "id, agl, sku, model, product_name, brand, factory_name, country, fob_price, currency, moq, moq_unit",
    )
    .or(
      [
        `agl.ilike.${pattern}`,
        `sku.ilike.${pattern}`,
        `model.ilike.${pattern}`,
        `product_name.ilike.${pattern}`,
        `brand.ilike.${pattern}`,
        `factory_name.ilike.${pattern}`,
      ].join(","),
    )
    .order("product_name", { ascending: true })
    .limit(capped);

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const productIds = rows.map((row) => row.id as string);
  const { data: assets, error: assetError } = await supabase
    .from("monday_product_assets")
    .select("product_id, file_extension")
    .eq("column_title", "PO")
    .in("product_id", productIds);

  if (assetError) {
    // Catalogue search should still work if Monday mirror tables are absent.
    if (
      !assetError.message.includes("does not exist") &&
      assetError.code !== "42P01" &&
      assetError.code !== "PGRST205"
    ) {
      throw new Error(assetError.message);
    }
  }

  const withPo = new Set(
    (assets ?? [])
      .filter((row) => {
        const ext = String(row.file_extension || "")
          .toLowerCase()
          .replace(/^\./, "");
        return ext === "xlsx" || ext === "xlsm";
      })
      .map((row) => row.product_id as string),
  );

  return rows.map((row) => ({
    id: row.id as string,
    agl: (row.agl as string) || null,
    sku: (row.sku as string) || null,
    model: (row.model as string) || null,
    productName: String(row.product_name || row.sku || row.agl || "Untitled"),
    brand: (row.brand as string) || null,
    factoryName: (row.factory_name as string) || null,
    country: (row.country as string) || null,
    fobPrice: row.fob_price == null ? null : Number(row.fob_price),
    currency: String(row.currency || "USD"),
    moq: row.moq == null ? null : Number(row.moq),
    moqUnit: (row.moq_unit as string) || null,
    hasPurchaseOrder: withPo.has(row.id as string),
  }));
}
