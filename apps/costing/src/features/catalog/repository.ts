import type { CostingInputs } from "@/lib/costing";
import type {
  CatalogProductHit,
  PurchaseOrderAsset,
  PurchaseOrderPreview,
} from "@/lib/catalog/types";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

async function authHeaders(): Promise<HeadersInit> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  const { data, error } = await createClient().auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in before searching the product catalogue.");
  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function searchCatalog(query: string): Promise<CatalogProductHit[]> {
  const headers = await authHeaders();
  const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(query)}&limit=20`, {
    headers,
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    hits?: CatalogProductHit[];
    error?: string;
  };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Catalogue search failed.");
  }
  return payload.hits ?? [];
}

export function catalogToInputs(hit: CatalogProductHit): Partial<CostingInputs> {
  const patch: Partial<CostingInputs> = {
    catalogProductId: hit.id,
    sku: hit.model || hit.sku || hit.agl || "",
    description: hit.productName,
    brand: hit.brand || "",
  };
  if (hit.agl) patch.agl = hit.agl;
  if (hit.factoryName) patch.factoryName = hit.factoryName;
  if (hit.fobPrice != null) patch.factoryUnitUsd = hit.fobPrice;
  if (hit.currency) patch.factoryCurrency = hit.currency;
  if (hit.moq && hit.moq > 0) patch.orderQuantity = hit.moq;
  return patch;
}

export async function listProductPurchaseOrders(
  productId: string,
): Promise<PurchaseOrderAsset[]> {
  const headers = await authHeaders();
  const response = await fetch(`/api/catalog/products/${encodeURIComponent(productId)}/purchase-orders`, {
    headers,
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    assets?: PurchaseOrderAsset[];
    error?: string;
  };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Could not list purchase orders.");
  }
  return payload.assets ?? [];
}

export async function previewProductPurchaseOrder(
  productId: string,
  assetId: string,
): Promise<PurchaseOrderPreview> {
  const headers = await authHeaders();
  const response = await fetch(
    `/api/catalog/products/${encodeURIComponent(productId)}/purchase-orders/${encodeURIComponent(assetId)}/preview`,
    { headers, cache: "no-store" },
  );
  const payload = (await response.json()) as {
    ok?: boolean;
    preview?: PurchaseOrderPreview;
    error?: string;
  };
  if (!response.ok || !payload.ok || !payload.preview) {
    throw new Error(payload.error || "Could not preview purchase order.");
  }
  return payload.preview;
}

export async function downloadProductPurchaseOrder(
  productId: string,
  assetId: string,
  fallbackName: string,
): Promise<void> {
  const headers = await authHeaders();
  const response = await fetch(
    `/api/catalog/products/${encodeURIComponent(productId)}/purchase-orders/${encodeURIComponent(assetId)}/download`,
    { headers, cache: "no-store" },
  );
  if (!response.ok) {
    let message = "Could not download purchase order.";
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // Ignore JSON parse failures for binary error responses.
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/i);
  const filename = match?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
