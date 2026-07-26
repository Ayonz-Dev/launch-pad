"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, PageHeader, RequireOrg, Workspace } from "@/components/PageShell";
import { Modal } from "@/components/Modal";
import { ProductImageUploader } from "@/components/ProductImageUploader";
import { listProducts, type ProductSummary } from "@/features/products/repository";

export default function ProductsPage() {
  return (
    <Workspace>
      <PageHeader
        eyebrow="PRODUCTS"
        title="Products"
        subtitle="Every SKU with its image, reused across quotes and offer sheets."
      />
      <div className="page">
        <RequireOrg>
          <ProductsView />
        </RequireOrg>
      </div>
    </Workspace>
  );
}

function ProductsView() {
  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [manageSku, setManageSku] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setProducts(await listProducts());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load products.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (products ?? []).filter(
      (product) =>
        !term ||
        product.sku.toLowerCase().includes(term) ||
        (product.description ?? "").toLowerCase().includes(term) ||
        (product.brand ?? "").toLowerCase().includes(term),
    );
  }, [products, search]);

  if (error) return <EmptyState icon="⚠️" title="Something went wrong">{error}</EmptyState>;
  if (!products) return <EmptyState icon="⏳" title="Loading products…" />;
  if (products.length === 0) {
    return (
      <EmptyState icon="📦" title="No products yet">
        SKUs appear here once you save a costing or upload a product image in the New Costing product step.
      </EmptyState>
    );
  }

  return (
    <>
      <div className="toolbar">
        <div />
        <input
          className="search-input"
          placeholder="Search SKU, description or brand"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="product-grid">
        {visible.map((product) => (
          <button key={product.sku} className="product-card" onClick={() => setManageSku(product.sku)}>
            <div className="product-card-image">
              {product.primaryUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.primaryUrl} alt={product.description ?? product.sku} />
              ) : (
                <div className="product-card-empty">No image</div>
              )}
            </div>
            <div className="product-card-body">
              <b>{product.sku}</b>
              <span>{product.description ?? "—"}</span>
              <small>
                {product.brand ? `${product.brand} · ` : ""}
                {product.imageCount} image{product.imageCount === 1 ? "" : "s"} · {product.quoteCount} quote
                {product.quoteCount === 1 ? "" : "s"}
              </small>
            </div>
          </button>
        ))}
        {visible.length === 0 && <p className="muted" style={{ padding: 20 }}>No products match your search.</p>}
      </div>

      {manageSku && (
        <Modal
          title={`Images · ${manageSku}`}
          onClose={() => {
            setManageSku(null);
            void load();
          }}
        >
          <ProductImageUploader sku={manageSku} />
        </Modal>
      )}
    </>
  );
}
