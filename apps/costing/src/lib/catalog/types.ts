export type CatalogProductHit = {
  id: string;
  agl: string | null;
  sku: string | null;
  model: string | null;
  productName: string;
  brand: string | null;
  factoryName: string | null;
  country: string | null;
  fobPrice: number | null;
  currency: string;
  moq: number | null;
  moqUnit: string | null;
  hasPurchaseOrder: boolean;
};

export type PurchaseOrderAsset = {
  assetId: string;
  name: string;
  fileExtension: string | null;
  fileSize: number | null;
  columnTitle: string;
};

export type PurchaseOrderSheetPreview = {
  name: string;
  rows: string[][];
  truncated: boolean;
  totalRows: number;
  totalColumns: number;
};

export type PurchaseOrderPreview = {
  assetId: string;
  name: string;
  sheets: PurchaseOrderSheetPreview[];
};
