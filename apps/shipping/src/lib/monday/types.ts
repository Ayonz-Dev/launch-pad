export type MondayAsset = {
  id: string;
  name: string | null;
  url: string | null;
  public_url: string | null;
  file_extension: string | null;
  file_size: number | null;
};

export type MondayColumnValue = {
  id: string;
  text: string | null;
  type: string;
  value: string | null;
};

export type MondayItem = {
  id: string;
  name: string;
  created_at: string | null;
  updated_at: string | null;
  group: { id: string; title: string } | null;
  column_values: MondayColumnValue[];
  assets: MondayAsset[];
};

export type MondayBoard = {
  id: string;
  name: string;
  items: MondayItem[];
};

export type ProductSourceKind = "artwork_active" | "artwork_completed";

export type NormalizedAsset = {
  boardId: string;
  itemId: string;
  columnId: string;
  columnTitle: string;
  assetId: string;
  name: string | null;
  fileExtension: string | null;
  fileSize: number | null;
  assetUrl: string | null;
  publicUrl: string | null;
  sourceUpdatedAt: string | null;
};

export type ArtworkWorkflow = {
  designer: string | null;
  silkscreenStatus: string | null;
  packagingStatus: string | null;
  manualsStatus: string | null;
  popStickerStatus: string | null;
  ratingLabelStatus: string | null;
  energyLabelStatus: string | null;
  outerCartonStatus: string | null;
  presentationStatus: string | null;
  productServerStatus: string | null;
  productCatalogueStatus: string | null;
  websiteUploadStatus: string | null;
  imUploadStatus: string | null;
  artworkDue: string | null;
  frd: string | null;
  inspectionStatus: string | null;
};

export type NormalizedProductSource = {
  boardId: string;
  itemId: string;
  sourceKind: ProductSourceKind;
  groupId: string | null;
  groupTitle: string | null;
  itemName: string;
  sourceCreatedAt: string | null;
  sourceUpdatedAt: string | null;
  rawColumns: Record<string, { text: string | null; type: string; value: unknown }>;
  agl: string | null;
  aglKey: string | null;
  model: string | null;
  productName: string;
  factoryName: string | null;
  country: string | null;
  brand: string | null;
  retailer: string | null;
  retailerId: string | null;
  salesPerson: string | null;
  orderType: string | null;
  barcode: string | null;
  outerCartonBarcode: string | null;
  poNumber: string | null;
  features: string[];
  packagingType: string | null;
  packagingMaterial: string | null;
  cartonQty: number | null;
  unitDims: string | null;
  giftboxDims: string | null;
  unitWeight: string | null;
  outerCartonDims: string | null;
  outerCartonWeight: string | null;
  workflow: ArtworkWorkflow;
  assets: NormalizedAsset[];
};

export type CanonicalMondayProduct = Omit<
  NormalizedProductSource,
  | "boardId"
  | "itemId"
  | "sourceKind"
  | "groupId"
  | "groupTitle"
  | "itemName"
  | "sourceCreatedAt"
  | "sourceUpdatedAt"
  | "rawColumns"
  | "workflow"
  | "assets"
> & {
  agl: string;
  aglKey: string;
  sources: NormalizedProductSource[];
};

export type NormalizedSocialPost = {
  boardId: string;
  itemId: string;
  groupId: string | null;
  groupTitle: string | null;
  name: string;
  agl: string | null;
  aglKey: string | null;
  model: string | null;
  brand: string | null;
  salesPerson: string | null;
  country: string | null;
  retailer: string | null;
  retailerWeblink: string | null;
  status: string | null;
  priority: string | null;
  designer: string | null;
  dueDate: string | null;
  postDate: string | null;
  contentType: string | null;
  postText: string | null;
  description: string | null;
  notes: string | null;
  onOurWebsite: string | null;
  ourWeblink: string | null;
  rrp: number | null;
  salePrice: number | null;
  boostAmount: number | null;
  boostDays: string | null;
  boostedStatus: string | null;
  rawColumns: Record<string, { text: string | null; type: string; value: unknown }>;
  sourceCreatedAt: string | null;
  sourceUpdatedAt: string | null;
  assets: NormalizedAsset[];
};
