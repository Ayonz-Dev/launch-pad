import type {
  CanonicalMondayProduct,
  MondayColumnValue,
  MondayItem,
  NormalizedAsset,
  NormalizedProductSource,
  NormalizedSocialPost,
  ProductSourceKind,
} from "./types";

export const MONDAY_BOARD_IDS = {
  artworkActive: "659128200",
  artworkCompleted: "660792519",
  socialMedia: "3738736764",
} as const;

type ArtworkColumnMap = {
  model: string;
  productName: string;
  features: string;
  country: string;
  designer: string;
  orderType: string;
  brand: string;
  barcode: string;
  outerCartonBarcode: string;
  factory: string;
  retailerId: string;
  salesPerson: string;
  retailer: string;
  silkscreen: string;
  packagingType: string;
  packagingMaterial: string;
  packaging: string;
  manuals: string;
  popSticker: string;
  ratingLabel: string;
  energyLabel: string;
  outerCartonStatus: string;
  presentation: string;
  productServer?: string;
  productCatalogue: string;
  websiteUpload: string;
  imUpload: string;
  artworkDue: string;
  frd: string;
  inspection: string;
  unitDims: string;
  giftboxDims: string;
  unitWeight: string;
  outerCartonDims: string;
  outerCartonWeight: string;
  cartonQty: string;
  poNumber?: string;
  fileColumns: Record<string, string>;
};

const ACTIVE_COLUMNS: ArtworkColumnMap = {
  model: "model",
  productName: "product_name",
  features: "dropdown__1",
  country: "status6",
  designer: "people",
  orderType: "status",
  brand: "brand",
  barcode: "text",
  outerCartonBarcode: "text0",
  factory: "factory",
  retailerId: "text3",
  salesPerson: "status71",
  retailer: "retailer",
  silkscreen: "status9",
  packagingType: "dropdown",
  packagingMaterial: "dropdown8",
  packaging: "status7",
  manuals: "packaging4",
  popSticker: "manuals0",
  ratingLabel: "pop_sticker6",
  energyLabel: "rating_label0",
  outerCartonStatus: "status89",
  presentation: "status18",
  productServer: "color_mm07n3r5",
  productCatalogue: "color__1",
  websiteUpload: "color4__1",
  imUpload: "color_mkpwbzf0",
  artworkDue: "date_16",
  frd: "date_13",
  inspection: "status8",
  unitDims: "text8",
  giftboxDims: "text9",
  unitWeight: "text00",
  outerCartonDims: "text5",
  outerCartonWeight: "text91",
  cartonQty: "text94",
  poNumber: "text_mkxc19ts",
  fileColumns: {
    files: "Product Image",
    files_10: "PO",
    files_1: "Artwork Approval",
    files5: "Inspection Report",
    files2: "Outer Carton",
  },
};

const COMPLETED_COLUMNS: ArtworkColumnMap = {
  model: "model",
  productName: "product_name",
  features: "dropdown__1",
  country: "status71",
  designer: "people",
  orderType: "status93",
  brand: "brand",
  barcode: "text9",
  outerCartonBarcode: "text0",
  factory: "factory",
  retailerId: "text98",
  salesPerson: "status",
  retailer: "retailer",
  silkscreen: "status9",
  packagingType: "dropdown",
  packagingMaterial: "dropdown8",
  packaging: "status7",
  manuals: "packaging4",
  popSticker: "manuals0",
  ratingLabel: "pop_sticker6",
  energyLabel: "rating_label0",
  outerCartonStatus: "status4",
  presentation: "status3",
  productCatalogue: "color_mknxeg70",
  websiteUpload: "color_mknxvaw8",
  imUpload: "color_mkq3h64",
  artworkDue: "date_16",
  frd: "date_13",
  inspection: "status8",
  unitDims: "text",
  giftboxDims: "text5",
  unitWeight: "text2",
  outerCartonDims: "text1",
  outerCartonWeight: "text50",
  cartonQty: "text29",
  fileColumns: {
    files9: "Product Image",
    files_19: "PO",
    files_1: "Artwork Approval",
    files3: "Inspection Report",
    files90: "Files",
    files8: "Outer Carton",
  },
};

const SOCIAL_COLUMNS = {
  model: "text",
  agl: "text3",
  brand: "color_mm1zxcw7",
  salesPerson: "color7",
  country: "status_1",
  retailerWeblink: "link",
  retailer: "text1",
  dueDate: "date",
  priority: "color_mkpcdrsy",
  status: "status",
  designer: "multiple_person_mkpd2yfh",
  notes: "text_mkpbx8g3",
  onOurWebsite: "color_mm0wfp91",
  ourWeblink: "text_mm0wxm3t",
  rrp: "numeric_mkpcn54y",
  salePrice: "numeric",
  postText: "post_text",
  postDate: "date9",
  boostAmount: "numbers",
  boostDays: "text5",
  boostedStatus: "color",
  contentTypeStatus: "color_mm38x8zk",
  contentTypeDropdown: "dropdown_mm387tc9",
  description: "text_mm4xa9e9",
  fileColumns: { file: "File" },
} as const;

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeAgl(raw: string | null | undefined): {
  agl: string | null;
  key: string | null;
} {
  const value = clean(raw)?.toUpperCase().replace(/\s+/g, "") || null;
  if (!value) return { agl: null, key: null };
  const key = value.replace(/[^A-Z0-9]/g, "");
  if (!key.startsWith("AGL") || key.length <= 3) {
    return { agl: null, key: null };
  }
  return { agl: value, key };
}

export function normalizeModel(raw: string | null | undefined): string | null {
  return clean(raw)?.toUpperCase().replace(/\s+/g, "") || null;
}

function columnMap(item: MondayItem): Map<string, MondayColumnValue> {
  return new Map(item.column_values.map((column) => [column.id, column]));
}

function text(columns: Map<string, MondayColumnValue>, id?: string): string | null {
  return id ? clean(columns.get(id)?.text) : null;
}

function numberValue(
  columns: Map<string, MondayColumnValue>,
  id?: string,
): number | null {
  const raw = text(columns, id)?.replace(/[$,\s]/g, "");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(
  columns: Map<string, MondayColumnValue>,
  id?: string,
): string | null {
  const raw = text(columns, id);
  const match = raw?.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] || null;
}

function parseValue(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function rawColumns(
  item: MondayItem,
): Record<string, { text: string | null; type: string; value: unknown }> {
  return Object.fromEntries(
    item.column_values.map((column) => [
      column.id,
      {
        text: column.text,
        type: column.type,
        value: parseValue(column.value),
      },
    ]),
  );
}

function dropdownValues(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function assetsForColumns(
  item: MondayItem,
  boardId: string,
  fileColumns: Record<string, string>,
): NormalizedAsset[] {
  const metadata = new Map(item.assets.map((asset) => [String(asset.id), asset]));
  const output: NormalizedAsset[] = [];
  const seen = new Set<string>();

  for (const [columnId, columnTitle] of Object.entries(fileColumns)) {
    const column = item.column_values.find((value) => value.id === columnId);
    const parsed = parseValue(column?.value || null);
    if (!parsed || typeof parsed !== "object") continue;
    const files = (parsed as { files?: unknown }).files;
    if (!Array.isArray(files)) continue;

    for (const file of files) {
      if (!file || typeof file !== "object") continue;
      const raw = file as Record<string, unknown>;
      const assetId = String(raw.assetId ?? raw.id ?? "");
      if (!assetId) continue;
      const identity = `${columnId}:${assetId}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const asset = metadata.get(assetId);
      output.push({
        boardId,
        itemId: item.id,
        columnId,
        columnTitle,
        assetId,
        name: clean(asset?.name || String(raw.name || "")),
        fileExtension: clean(
          asset?.file_extension || String(raw.fileType || raw.file_extension || ""),
        ),
        fileSize:
          typeof asset?.file_size === "number" ? asset.file_size : null,
        assetUrl: clean(asset?.url),
        publicUrl: clean(asset?.public_url),
        sourceUpdatedAt: item.updated_at,
      });
    }
  }
  return output;
}

export function mapArtworkItem(
  item: MondayItem,
  boardId: string,
  sourceKind: ProductSourceKind,
): NormalizedProductSource {
  const config =
    sourceKind === "artwork_active" ? ACTIVE_COLUMNS : COMPLETED_COLUMNS;
  const columns = columnMap(item);
  const { agl, key: aglKey } = normalizeAgl(item.name);
  const model = text(columns, config.model);
  const productName = text(columns, config.productName) || model || item.name;

  return {
    boardId,
    itemId: item.id,
    sourceKind,
    groupId: item.group?.id || null,
    groupTitle: item.group?.title || null,
    itemName: item.name,
    sourceCreatedAt: item.created_at,
    sourceUpdatedAt: item.updated_at,
    rawColumns: rawColumns(item),
    agl,
    aglKey,
    model,
    productName,
    factoryName: text(columns, config.factory),
    country: text(columns, config.country),
    brand: text(columns, config.brand),
    retailer: text(columns, config.retailer),
    retailerId: text(columns, config.retailerId),
    salesPerson: text(columns, config.salesPerson),
    orderType: text(columns, config.orderType),
    barcode: text(columns, config.barcode),
    outerCartonBarcode: text(columns, config.outerCartonBarcode),
    poNumber: text(columns, config.poNumber),
    features: dropdownValues(text(columns, config.features)),
    packagingType: text(columns, config.packagingType),
    packagingMaterial: text(columns, config.packagingMaterial),
    cartonQty: numberValue(columns, config.cartonQty),
    unitDims: text(columns, config.unitDims),
    giftboxDims: text(columns, config.giftboxDims),
    unitWeight: text(columns, config.unitWeight),
    outerCartonDims: text(columns, config.outerCartonDims),
    outerCartonWeight: text(columns, config.outerCartonWeight),
    workflow: {
      designer: text(columns, config.designer),
      silkscreenStatus: text(columns, config.silkscreen),
      packagingStatus: text(columns, config.packaging),
      manualsStatus: text(columns, config.manuals),
      popStickerStatus: text(columns, config.popSticker),
      ratingLabelStatus: text(columns, config.ratingLabel),
      energyLabelStatus: text(columns, config.energyLabel),
      outerCartonStatus: text(columns, config.outerCartonStatus),
      presentationStatus: text(columns, config.presentation),
      productServerStatus: text(columns, config.productServer),
      productCatalogueStatus: text(columns, config.productCatalogue),
      websiteUploadStatus: text(columns, config.websiteUpload),
      imUploadStatus: text(columns, config.imUpload),
      artworkDue: dateValue(columns, config.artworkDue),
      frd: dateValue(columns, config.frd),
      inspectionStatus: text(columns, config.inspection),
    },
    assets: assetsForColumns(item, boardId, config.fileColumns),
  };
}

function first<T>(
  sources: NormalizedProductSource[],
  pick: (source: NormalizedProductSource) => T | null,
): T | null {
  for (const source of sources) {
    const value = pick(source);
    if (value !== null && value !== "") return value;
  }
  return null;
}

export function mergeProductSources(
  sources: NormalizedProductSource[],
): CanonicalMondayProduct[] {
  const groups = new Map<string, NormalizedProductSource[]>();
  for (const source of sources) {
    if (!source.aglKey) continue;
    const existing = groups.get(source.aglKey) || [];
    existing.push(source);
    groups.set(source.aglKey, existing);
  }

  return [...groups.entries()].map(([aglKey, grouped]) => {
    const ordered = [...grouped].sort((a, b) => {
      if (a.sourceKind !== b.sourceKind) {
        return a.sourceKind === "artwork_active" ? -1 : 1;
      }
      return (b.sourceUpdatedAt || "").localeCompare(a.sourceUpdatedAt || "");
    });
    const featureSet = new Set(ordered.flatMap((source) => source.features));
    const primary = ordered[0];

    return {
      agl: first(ordered, (source) => source.agl) || primary.itemName,
      aglKey,
      model: first(ordered, (source) => source.model),
      productName:
        first(ordered, (source) => source.productName) || primary.itemName,
      factoryName: first(ordered, (source) => source.factoryName),
      country: first(ordered, (source) => source.country),
      brand: first(ordered, (source) => source.brand),
      retailer: first(ordered, (source) => source.retailer),
      retailerId: first(ordered, (source) => source.retailerId),
      salesPerson: first(ordered, (source) => source.salesPerson),
      orderType: first(ordered, (source) => source.orderType),
      barcode: first(ordered, (source) => source.barcode),
      outerCartonBarcode: first(
        ordered,
        (source) => source.outerCartonBarcode,
      ),
      poNumber: first(ordered, (source) => source.poNumber),
      features: [...featureSet],
      packagingType: first(ordered, (source) => source.packagingType),
      packagingMaterial: first(ordered, (source) => source.packagingMaterial),
      cartonQty: first(ordered, (source) => source.cartonQty),
      unitDims: first(ordered, (source) => source.unitDims),
      giftboxDims: first(ordered, (source) => source.giftboxDims),
      unitWeight: first(ordered, (source) => source.unitWeight),
      outerCartonDims: first(ordered, (source) => source.outerCartonDims),
      outerCartonWeight: first(
        ordered,
        (source) => source.outerCartonWeight,
      ),
      sources: ordered,
    };
  });
}

export function mapSocialItem(
  item: MondayItem,
  boardId: string,
): NormalizedSocialPost {
  const columns = columnMap(item);
  const { agl, key: aglKey } = normalizeAgl(
    text(columns, SOCIAL_COLUMNS.agl),
  );

  return {
    boardId,
    itemId: item.id,
    groupId: item.group?.id || null,
    groupTitle: item.group?.title || null,
    name: item.name,
    agl,
    aglKey,
    model: text(columns, SOCIAL_COLUMNS.model),
    brand: text(columns, SOCIAL_COLUMNS.brand),
    salesPerson: text(columns, SOCIAL_COLUMNS.salesPerson),
    country: text(columns, SOCIAL_COLUMNS.country),
    retailer: text(columns, SOCIAL_COLUMNS.retailer),
    retailerWeblink: text(columns, SOCIAL_COLUMNS.retailerWeblink),
    status: text(columns, SOCIAL_COLUMNS.status),
    priority: text(columns, SOCIAL_COLUMNS.priority),
    designer: text(columns, SOCIAL_COLUMNS.designer),
    dueDate: dateValue(columns, SOCIAL_COLUMNS.dueDate),
    postDate: dateValue(columns, SOCIAL_COLUMNS.postDate),
    contentType:
      text(columns, SOCIAL_COLUMNS.contentTypeDropdown) ||
      text(columns, SOCIAL_COLUMNS.contentTypeStatus),
    postText: text(columns, SOCIAL_COLUMNS.postText),
    description: text(columns, SOCIAL_COLUMNS.description),
    notes: text(columns, SOCIAL_COLUMNS.notes),
    onOurWebsite: text(columns, SOCIAL_COLUMNS.onOurWebsite),
    ourWeblink: text(columns, SOCIAL_COLUMNS.ourWeblink),
    rrp: numberValue(columns, SOCIAL_COLUMNS.rrp),
    salePrice: numberValue(columns, SOCIAL_COLUMNS.salePrice),
    boostAmount: numberValue(columns, SOCIAL_COLUMNS.boostAmount),
    boostDays: text(columns, SOCIAL_COLUMNS.boostDays),
    boostedStatus: text(columns, SOCIAL_COLUMNS.boostedStatus),
    rawColumns: rawColumns(item),
    sourceCreatedAt: item.created_at,
    sourceUpdatedAt: item.updated_at,
    assets: assetsForColumns(item, boardId, SOCIAL_COLUMNS.fileColumns),
  };
}
