"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import type { PurchaseOrderAsset, PurchaseOrderPreview } from "@/lib/catalog/types";
import {
  downloadProductPurchaseOrder,
  listProductPurchaseOrders,
  previewProductPurchaseOrder,
} from "./repository";

export function PurchaseOrderViewer({
  productId,
  productLabel,
  onClose,
}: {
  productId: string;
  productLabel: string;
  onClose: () => void;
}) {
  const [assets, setAssets] = useState<PurchaseOrderAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PurchaseOrderPreview | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listProductPurchaseOrders(productId)
      .then((rows) => {
        if (cancelled) return;
        setAssets(rows);
        setSelectedAssetId(rows[0]?.assetId ?? null);
        setLoadingList(false);
        if (rows.length === 0) {
          setError("No Excel purchase order is attached to this product’s PO column.");
        }
      })
      .catch((cause) => {
        if (cancelled) return;
        setLoadingList(false);
        setError(cause instanceof Error ? cause.message : "Could not load purchase orders.");
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  useEffect(() => {
    if (!selectedAssetId) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoadingPreview(true);
      setError(null);
      previewProductPurchaseOrder(productId, selectedAssetId)
        .then((next) => {
          if (cancelled) return;
          setPreview(next);
          setSheetIndex(0);
        })
        .catch((cause) => {
          if (cancelled) return;
          setPreview(null);
          setError(cause instanceof Error ? cause.message : "Could not preview purchase order.");
        })
        .finally(() => {
          if (!cancelled) setLoadingPreview(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [productId, selectedAssetId]);

  const sheet = preview?.sheets[sheetIndex] ?? null;

  return (
    <Modal title={`Purchase order · ${productLabel}`} onClose={onClose} wide>
      <div className="po-viewer">
        {assets.length > 1 && (
          <label className="field">
            <span>Attached PO file</span>
            <span className="control">
              <select
                value={selectedAssetId ?? ""}
                onChange={(event) => setSelectedAssetId(event.target.value)}
              >
                {assets.map((asset) => (
                  <option key={asset.assetId} value={asset.assetId}>
                    {asset.name}
                  </option>
                ))}
              </select>
            </span>
          </label>
        )}

        {loadingList || loadingPreview ? (
          <p className="inline-note">Loading purchase order…</p>
        ) : null}
        {error ? (
          <p className="inline-note" style={{ color: "var(--red)" }}>
            {error}
          </p>
        ) : null}

        {preview && sheet ? (
          <>
            {preview.sheets.length > 1 && (
              <div className="chips po-sheet-tabs">
                {preview.sheets.map((item, index) => (
                  <button
                    key={`${item.name}-${index}`}
                    type="button"
                    className={index === sheetIndex ? "chip active" : "chip"}
                    onClick={() => setSheetIndex(index)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            )}

            <div className="po-grid-wrap">
              <table className="po-grid">
                <tbody>
                  {sheet.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {sheet.truncated && (
              <p className="inline-note">
                Showing the first {sheet.rows.length} rows and{" "}
                {sheet.rows[0]?.length || 0} columns of {sheet.totalRows} × {sheet.totalColumns}.
                Download the original file for the full workbook.
              </p>
            )}

            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                disabled={downloading || !selectedAssetId}
                onClick={() => {
                  if (!selectedAssetId) return;
                  setDownloading(true);
                  downloadProductPurchaseOrder(
                    productId,
                    selectedAssetId,
                    preview.name || "purchase-order.xlsx",
                  )
                    .catch((cause) =>
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "Could not download purchase order.",
                      ),
                    )
                    .finally(() => setDownloading(false));
                }}
              >
                {downloading ? "Downloading…" : "Download original"}
              </button>
              <button type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
