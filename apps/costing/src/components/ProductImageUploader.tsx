"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "./SessionProvider";
import {
  deleteProductImage,
  listProductImages,
  setPrimaryImage,
  uploadProductImage,
  type ProductImage,
} from "@/features/products/repository";

export function ProductImageUploader({ sku }: { sku: string }) {
  const session = useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedSku = sku.trim();
  const enabled = session.status === "authenticated" && trimmedSku.length >= 2;

  const load = useCallback(async () => {
    if (!enabled) {
      setImages([]);
      return;
    }
    try {
      setImages(await listProductImages(trimmedSku));
    } catch {
      // Non-fatal: leave the strip empty.
    }
  }, [enabled, trimmedSku]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadProductImage(trimmedSku, file);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload the image.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  if (session.status !== "authenticated") {
    return <p className="inline-note">Sign in to attach a product image for this SKU (used on the offer sheet).</p>;
  }
  if (trimmedSku.length < 2) {
    return <p className="inline-note">Enter a SKU above to attach product images.</p>;
  }

  return (
    <div className="uploader">
      <div className="image-strip">
        {images.map((image) => (
          <div key={image.id} className={image.isPrimary ? "image-thumb primary" : "image-thumb"}>
            {image.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image.url} alt={`${trimmedSku} product`} />
            ) : (
              <div className="image-fallback">No preview</div>
            )}
            <div className="image-actions">
              {image.isPrimary ? (
                <span className="image-primary-tag">Primary</span>
              ) : (
                <button type="button" className="button-sm secondary" disabled={busy} onClick={() => act(() => setPrimaryImage(trimmedSku, image.id))}>
                  Make primary
                </button>
              )}
              <button type="button" className="button-sm button-danger" disabled={busy} onClick={() => act(() => deleteProductImage(image))}>
                Delete
              </button>
            </div>
          </div>
        ))}
        <label className="image-add">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(event) => onFile(event.target.files?.[0])}
          />
          <span>{busy ? "Uploading…" : images.length ? "＋ Add image" : "＋ Upload image"}</span>
        </label>
      </div>
      {error && <p className="inline-note" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}
