import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { getActiveMembership } from "@/lib/supabase/queries";
import type { CostingInputs } from "@/lib/costing";

const BUCKET = "product-images";
const SIGNED_URL_TTL = 60 * 60; // 1 hour

export interface ProductImage {
  id: string;
  sku: string;
  storagePath: string;
  isPrimary: boolean;
  url: string | null;
}

function requireClient() {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured.");
  return createClient();
}

function sanitizeSegment(value: string): string {
  return (value || "unknown").trim().replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "unknown";
}

export async function listProductImages(sku: string): Promise<ProductImage[]> {
  if (!sku.trim()) return [];
  const supabase = requireClient();
  const { data, error } = await supabase
    .schema("costing")
    .from("product_images")
    .select("id, sku, storage_path, is_primary")
    .eq("sku", sku)
    .order("is_primary", { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  return Promise.all(
    rows.map(async (row) => {
      const storagePath = row.storage_path as string;
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL);
      return {
        id: row.id as string,
        sku: row.sku as string,
        storagePath,
        isPrimary: Boolean(row.is_primary),
        url: signed?.signedUrl ?? null,
      };
    }),
  );
}

/** Signed URL of the primary (or first) image for a SKU, or null. */
export async function getPrimaryImageUrl(sku: string): Promise<string | null> {
  const images = await listProductImages(sku);
  const primary = images.find((image) => image.isPrimary) ?? images[0];
  return primary?.url ?? null;
}

export async function uploadProductImage(sku: string, file: File): Promise<void> {
  const supabase = requireClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Sign in before uploading images.");
  const membership = await getActiveMembership(supabase, userData.user.id);
  if (!membership) throw new Error("No active organisation membership was found.");

  const path = `${membership.organizationId}/${sanitizeSegment(sku)}/${Date.now()}_${sanitizeSegment(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (uploadError) throw uploadError;

  // The first image for a SKU becomes its primary.
  const { data: existing } = await supabase
    .schema("costing")
    .from("product_images")
    .select("id")
    .eq("sku", sku)
    .limit(1);
  const isPrimary = !existing || existing.length === 0;

  const { error } = await supabase.schema("costing").from("product_images").insert({
    organization_id: membership.organizationId,
    sku,
    storage_path: path,
    is_primary: isPrimary,
    created_by: userData.user.id,
  });
  if (error) throw error;
}

export interface ProductSummary {
  sku: string;
  description: string | null;
  brand: string | null;
  primaryUrl: string | null;
  imageCount: number;
  quoteCount: number;
}

/** Aggregate a per-SKU product registry from image and quote records. */
export async function listProducts(): Promise<ProductSummary[]> {
  const supabase = requireClient();
  const [imagesRes, quotesRes] = await Promise.all([
    supabase.schema("costing").from("product_images").select("sku, storage_path, is_primary"),
    supabase.schema("costing").from("quotes").select("sku, input_snapshot").order("updated_at", { ascending: false }),
  ]);
  if (imagesRes.error) throw imagesRes.error;
  if (quotesRes.error) throw quotesRes.error;

  const imagesBySku = new Map<string, { isPrimary: boolean; path: string }[]>();
  (imagesRes.data ?? []).forEach((row) => {
    const sku = row.sku as string;
    const list = imagesBySku.get(sku) ?? [];
    list.push({ isPrimary: Boolean(row.is_primary), path: row.storage_path as string });
    imagesBySku.set(sku, list);
  });

  const metaBySku = new Map<string, { description: string | null; brand: string | null; quoteCount: number }>();
  (quotesRes.data ?? []).forEach((row) => {
    const sku = row.sku as string;
    const input = row.input_snapshot as CostingInputs | null;
    const meta = metaBySku.get(sku) ?? { description: null, brand: null, quoteCount: 0 };
    // Rows arrive newest-first, so the first values seen are the latest.
    if (meta.description === null) meta.description = input?.description ?? null;
    if (meta.brand === null) meta.brand = input?.brand ?? null;
    meta.quoteCount += 1;
    metaBySku.set(sku, meta);
  });

  const skus = new Set<string>([...imagesBySku.keys(), ...metaBySku.keys()]);
  const summaries = await Promise.all(
    [...skus].map(async (sku) => {
      const images = imagesBySku.get(sku) ?? [];
      const primary = images.find((image) => image.isPrimary) ?? images[0];
      let primaryUrl: string | null = null;
      if (primary) {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrl(primary.path, SIGNED_URL_TTL);
        primaryUrl = data?.signedUrl ?? null;
      }
      const meta = metaBySku.get(sku);
      return {
        sku,
        description: meta?.description ?? null,
        brand: meta?.brand ?? null,
        primaryUrl,
        imageCount: images.length,
        quoteCount: meta?.quoteCount ?? 0,
      };
    }),
  );
  return summaries.sort((a, b) => a.sku.localeCompare(b.sku));
}

export async function setPrimaryImage(sku: string, imageId: string): Promise<void> {
  const supabase = requireClient();
  await supabase.schema("costing").from("product_images").update({ is_primary: false }).eq("sku", sku);
  const { error } = await supabase.schema("costing").from("product_images").update({ is_primary: true }).eq("id", imageId);
  if (error) throw error;
}

export async function deleteProductImage(image: ProductImage): Promise<void> {
  const supabase = requireClient();
  await supabase.storage.from(BUCKET).remove([image.storagePath]);
  const { error } = await supabase.schema("costing").from("product_images").delete().eq("id", image.id);
  if (error) throw error;
}
