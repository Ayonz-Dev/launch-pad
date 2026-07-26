export function shipmentHref(id: string): string {
  return `/shipments/${encodeURIComponent(id)}`;
}

export function containerHref(containerNo: string): string {
  return `/containers/${encodeURIComponent(containerNo)}`;
}

/** SKUs section is keyed by Model. */
export function modelHref(model: string): string {
  return `/skus/${encodeURIComponent(model)}`;
}

/** @deprecated Use modelHref — SKUs are model-based. */
export function skuHref(sku: string): string {
  return modelHref(sku);
}

export function aglHref(agl: string): string {
  return `/agls/${encodeURIComponent(agl)}`;
}
