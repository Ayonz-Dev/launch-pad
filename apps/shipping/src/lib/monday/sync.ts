import type { SupabaseClient } from "@supabase/supabase-js";
import { getSourcingSupabaseServer } from "@/lib/sourcing-supabase";
import { fetchMondayBoard } from "./client";
import {
  MONDAY_BOARD_IDS,
  mapArtworkItem,
  mapSocialItem,
  mergeProductSources,
  normalizeModel,
} from "./mapping";
import type {
  CanonicalMondayProduct,
  NormalizedAsset,
  NormalizedProductSource,
  NormalizedSocialPost,
} from "./types";

export type MondayCatalogSyncOptions = {
  dryRun?: boolean;
  pageSize?: number;
  concurrency?: number;
};

export type MondayCatalogSyncStats = {
  activeItems: number;
  completedItems: number;
  socialItems: number;
  canonicalProducts: number;
  duplicateProductSources: number;
  missingAgl: number;
  suppliersUpserted: number;
  productsUpserted: number;
  productSourcesUpserted: number;
  workflowsUpserted: number;
  assetsUpserted: number;
  socialMatched: number;
  socialUnmatched: number;
  socialPostsUpserted: number;
  errors: number;
};

type SyncIssue = {
  boardId: string | null;
  itemId: string | null;
  code: string;
  message: string;
  payload?: unknown;
};

export type ProductRef = {
  id: string;
  aglKey: string;
  modelKey: string | null;
};

function boardIds() {
  return {
    active:
      process.env.MONDAY_ARTWORK_BOARD_ID?.trim() ||
      MONDAY_BOARD_IDS.artworkActive,
    completed:
      process.env.MONDAY_COMPLETED_ARTWORK_BOARD_ID?.trim() ||
      process.env.MONDAY_PRODUCTS_BOARD_ID?.trim() ||
      MONDAY_BOARD_IDS.artworkCompleted,
    social:
      process.env.MONDAY_SOCIAL_MEDIA_BOARD_ID?.trim() ||
      MONDAY_BOARD_IDS.socialMedia,
  };
}

function emptyStats(): MondayCatalogSyncStats {
  return {
    activeItems: 0,
    completedItems: 0,
    socialItems: 0,
    canonicalProducts: 0,
    duplicateProductSources: 0,
    missingAgl: 0,
    suppliersUpserted: 0,
    productsUpserted: 0,
    productSourcesUpserted: 0,
    workflowsUpserted: 0,
    assetsUpserted: 0,
    socialMatched: 0,
    socialUnmatched: 0,
    socialPostsUpserted: 0,
    errors: 0,
  };
}

async function forEachConcurrent<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  }
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
}

function assertNoError(error: { message: string } | null, context: string) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

async function startRun(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from("monday_catalog_sync_runs")
    .insert({ status: "running", dry_run: false })
    .select("id")
    .single();
  assertNoError(error, "start Monday catalogue sync");
  if (!data?.id) throw new Error("Monday sync run did not return an ID.");
  return String(data.id);
}

async function finishRun(
  supabase: SupabaseClient,
  runId: string,
  status: "completed" | "failed",
  stats: MondayCatalogSyncStats,
  errorMessage?: string,
) {
  const { error } = await supabase
    .from("monday_catalog_sync_runs")
    .update({
      status,
      counts: stats,
      error_message: errorMessage || null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  assertNoError(error, "finish Monday catalogue sync");
}

async function writeIssues(
  supabase: SupabaseClient,
  runId: string,
  issues: SyncIssue[],
) {
  if (!issues.length) return;
  const { error } = await supabase.from("monday_catalog_sync_errors").insert(
    issues.map((issue) => ({
      run_id: runId,
      board_id: issue.boardId,
      item_id: issue.itemId,
      code: issue.code,
      message: issue.message,
      payload: issue.payload ?? null,
    })),
  );
  assertNoError(error, "write Monday sync issues");
}

async function upsertSupplier(
  supabase: SupabaseClient,
  product: CanonicalMondayProduct,
): Promise<{ id: string | null; changed: boolean }> {
  if (!product.factoryName) return { id: null, changed: false };
  const now = new Date().toISOString();
  const { data: existing, error: findError } = await supabase
    .from("sourcing_catalog_suppliers")
    .select("id")
    .eq("relationship", "preferred")
    .ilike("name", product.factoryName)
    .limit(1)
    .maybeSingle();
  assertNoError(findError, `find supplier ${product.factoryName}`);

  if (existing?.id) {
    const { error } = await supabase
      .from("sourcing_catalog_suppliers")
      .update({
        country: product.country,
        source_file: "monday.com",
        updated_at: now,
      })
      .eq("id", existing.id);
    assertNoError(error, `update supplier ${product.factoryName}`);
    return { id: String(existing.id), changed: true };
  }

  const { data, error } = await supabase
    .from("sourcing_catalog_suppliers")
    .insert({
      name: product.factoryName,
      relationship: "preferred",
      country: product.country,
      source_file: "monday.com",
      updated_at: now,
    })
    .select("id")
    .single();
  assertNoError(error, `insert supplier ${product.factoryName}`);
  if (!data?.id) throw new Error(`insert supplier ${product.factoryName}: no ID returned`);
  return { id: String(data.id), changed: true };
}

async function upsertProduct(
  supabase: SupabaseClient,
  product: CanonicalMondayProduct,
  supplierId: string | null,
): Promise<string> {
  const now = new Date().toISOString();
  const payload = {
    supplier_id: supplierId,
    sku: product.model,
    product_name: product.productName,
    agl: product.agl,
    agl_key: product.aglKey,
    model: product.model,
    brand: product.brand,
    retailer: product.retailer,
    retailer_id: product.retailerId,
    sales_person: product.salesPerson,
    order_type: product.orderType,
    barcode: product.barcode,
    outer_carton_barcode: product.outerCartonBarcode,
    factory_name: product.factoryName,
    country: product.country,
    po_number: product.poNumber,
    features: product.features,
    packaging_type: product.packagingType,
    packaging_material: product.packagingMaterial,
    carton_qty: product.cartonQty,
    unit_dims: product.unitDims,
    giftbox_dims: product.giftboxDims,
    unit_weight: product.unitWeight,
    outer_carton_dims: product.outerCartonDims,
    outer_carton_weight: product.outerCartonWeight,
    updated_at: now,
  };

  const { data: existing, error: findError } = await supabase
    .from("sourcing_catalog_products")
    .select("id")
    .eq("agl_key", product.aglKey)
    .maybeSingle();
  assertNoError(findError, `find product ${product.agl}`);

  if (existing?.id) {
    const { error } = await supabase
      .from("sourcing_catalog_products")
      .update(payload)
      .eq("id", existing.id);
    assertNoError(error, `update product ${product.agl}`);
    return String(existing.id);
  }

  const { data, error } = await supabase
    .from("sourcing_catalog_products")
    .insert(payload)
    .select("id")
    .single();
  assertNoError(error, `insert product ${product.agl}`);
  if (!data?.id) throw new Error(`insert product ${product.agl}: no ID returned`);
  return String(data.id);
}

async function replaceAssets(
  supabase: SupabaseClient,
  assets: NormalizedAsset[],
  boardId: string,
  itemId: string,
  productId: string | null,
  socialPostId: string | null,
): Promise<number> {
  const { error: deleteError } = await supabase
    .from("monday_product_assets")
    .delete()
    .eq("board_id", boardId)
    .eq("item_id", itemId);
  assertNoError(deleteError, `replace assets for Monday item ${itemId}`);

  if (!assets.length) return 0;
  const { error } = await supabase.from("monday_product_assets").insert(
    assets.map((asset) => ({
      product_id: productId,
      social_post_id: socialPostId,
      board_id: asset.boardId,
      item_id: asset.itemId,
      column_id: asset.columnId,
      column_title: asset.columnTitle,
      asset_id: asset.assetId,
      name: asset.name,
      file_extension: asset.fileExtension,
      file_size: asset.fileSize,
      asset_url: asset.assetUrl,
      public_url: asset.publicUrl,
      source_updated_at: asset.sourceUpdatedAt,
      last_synced_at: new Date().toISOString(),
    })),
  );
  assertNoError(error, `insert assets for Monday item ${itemId}`);
  return assets.length;
}

async function upsertProductSource(
  supabase: SupabaseClient,
  productId: string,
  source: NormalizedProductSource,
): Promise<{ sourceId: string; assets: number }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("monday_product_sources")
    .upsert(
      {
        product_id: productId,
        board_id: source.boardId,
        item_id: source.itemId,
        source_kind: source.sourceKind,
        group_id: source.groupId,
        group_title: source.groupTitle,
        item_name: source.itemName,
        source_created_at: source.sourceCreatedAt,
        source_updated_at: source.sourceUpdatedAt,
        raw_columns: source.rawColumns,
        last_synced_at: now,
      },
      { onConflict: "board_id,item_id" },
    )
    .select("id")
    .single();
  assertNoError(error, `upsert Monday source item ${source.itemId}`);
  if (!data?.id) {
    throw new Error(`upsert Monday source item ${source.itemId}: no ID returned`);
  }
  const sourceId = String(data.id);

  const workflow = source.workflow;
  const { error: workflowError } = await supabase
    .from("monday_artwork_workflows")
    .upsert(
      {
        product_id: productId,
        source_id: sourceId,
        designer: workflow.designer,
        silkscreen_status: workflow.silkscreenStatus,
        packaging_status: workflow.packagingStatus,
        manuals_status: workflow.manualsStatus,
        pop_sticker_status: workflow.popStickerStatus,
        rating_label_status: workflow.ratingLabelStatus,
        energy_label_status: workflow.energyLabelStatus,
        outer_carton_status: workflow.outerCartonStatus,
        presentation_status: workflow.presentationStatus,
        product_server_status: workflow.productServerStatus,
        product_catalogue_status: workflow.productCatalogueStatus,
        website_upload_status: workflow.websiteUploadStatus,
        im_upload_status: workflow.imUploadStatus,
        artwork_due: workflow.artworkDue,
        frd: workflow.frd,
        inspection_status: workflow.inspectionStatus,
        updated_at: now,
      },
      { onConflict: "source_id" },
    );
  assertNoError(workflowError, `upsert workflow for Monday item ${source.itemId}`);
  const assets = await replaceAssets(
    supabase,
    source.assets,
    source.boardId,
    source.itemId,
    productId,
    null,
  );
  return { sourceId, assets };
}

export function buildProductLookups(products: ProductRef[]) {
  const byAgl = new Map(products.map((product) => [product.aglKey, product.id]));
  const byModel = new Map<string, string | null>();
  for (const product of products) {
    if (!product.modelKey) continue;
    if (byModel.has(product.modelKey)) byModel.set(product.modelKey, null);
    else byModel.set(product.modelKey, product.id);
  }
  return { byAgl, byModel };
}

export function matchSocialProduct(
  social: NormalizedSocialPost,
  lookups: ReturnType<typeof buildProductLookups>,
): { productId: string | null; issue: SyncIssue | null } {
  if (social.aglKey) {
    const productId = lookups.byAgl.get(social.aglKey);
    if (productId) return { productId, issue: null };
  }

  const modelKey = normalizeModel(social.model);
  if (modelKey) {
    const productId = lookups.byModel.get(modelKey);
    if (productId) {
      return {
        productId,
        issue: {
          boardId: social.boardId,
          itemId: social.itemId,
          code: "SOCIAL_MODEL_FALLBACK",
          message: `Linked to a catalogue product using model ${social.model}; confirm the missing or unmatched AGL.`,
        },
      };
    }
    if (lookups.byModel.has(modelKey)) {
      return {
        productId: null,
        issue: {
          boardId: social.boardId,
          itemId: social.itemId,
          code: "AMBIGUOUS_SOCIAL_MODEL",
          message: `Model ${social.model} matches multiple catalogue products.`,
        },
      };
    }
  }

  return {
    productId: null,
    issue: {
      boardId: social.boardId,
      itemId: social.itemId,
      code: "UNMATCHED_SOCIAL_ITEM",
      message: "Social item could not be linked by AGL or model.",
      payload: { agl: social.agl, model: social.model, name: social.name },
    },
  };
}

async function upsertSocialPost(
  supabase: SupabaseClient,
  social: NormalizedSocialPost,
  productId: string | null,
): Promise<{ id: string; assets: number }> {
  const { data, error } = await supabase
    .from("monday_social_posts")
    .upsert(
      {
        product_id: productId,
        board_id: social.boardId,
        item_id: social.itemId,
        group_id: social.groupId,
        group_title: social.groupTitle,
        name: social.name,
        agl: social.agl,
        agl_key: social.aglKey,
        model: social.model,
        brand: social.brand,
        sales_person: social.salesPerson,
        country: social.country,
        retailer: social.retailer,
        retailer_weblink: social.retailerWeblink,
        status: social.status,
        priority: social.priority,
        designer: social.designer,
        due_date: social.dueDate,
        post_date: social.postDate,
        content_type: social.contentType,
        post_text: social.postText,
        description: social.description,
        notes: social.notes,
        on_our_website: social.onOurWebsite,
        our_weblink: social.ourWeblink,
        rrp: social.rrp,
        sale_price: social.salePrice,
        boost_amount: social.boostAmount,
        boost_days: social.boostDays,
        boosted_status: social.boostedStatus,
        raw_columns: social.rawColumns,
        source_created_at: social.sourceCreatedAt,
        source_updated_at: social.sourceUpdatedAt,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "board_id,item_id" },
    )
    .select("id")
    .single();
  assertNoError(error, `upsert social item ${social.itemId}`);
  if (!data?.id) {
    throw new Error(`upsert social item ${social.itemId}: no ID returned`);
  }
  const id = String(data.id);
  const assets = await replaceAssets(
    supabase,
    social.assets,
    social.boardId,
    social.itemId,
    productId,
    id,
  );
  return { id, assets };
}

export async function runMondayCatalogSync(
  options: MondayCatalogSyncOptions = {},
): Promise<{ runId: string; stats: MondayCatalogSyncStats; issues: SyncIssue[] }> {
  const dryRun = Boolean(options.dryRun);
  const configuredConcurrency =
    options.concurrency ?? Number(process.env.MONDAY_SYNC_CONCURRENCY || "8");
  const concurrency = Math.max(
    1,
    Math.min(
      Math.floor(Number.isFinite(configuredConcurrency) ? configuredConcurrency : 8),
      16,
    ),
  );
  const ids = boardIds();
  const stats = emptyStats();
  const issues: SyncIssue[] = [];
  const supabase = dryRun ? null : getSourcingSupabaseServer();
  let runId = "dry-run";

  try {
    if (supabase) runId = await startRun(supabase);

    const [activeBoard, completedBoard, socialBoard] = await Promise.all([
      fetchMondayBoard(ids.active, options.pageSize),
      fetchMondayBoard(ids.completed, options.pageSize),
      fetchMondayBoard(ids.social, options.pageSize),
    ]);
    stats.activeItems = activeBoard.items.length;
    stats.completedItems = completedBoard.items.length;
    stats.socialItems = socialBoard.items.length;

    const sources = [
      ...activeBoard.items.map((item) =>
        mapArtworkItem(item, activeBoard.id, "artwork_active"),
      ),
      ...completedBoard.items.map((item) =>
        mapArtworkItem(item, completedBoard.id, "artwork_completed"),
      ),
    ];
    for (const source of sources) {
      if (source.aglKey) continue;
      stats.missingAgl += 1;
      issues.push({
        boardId: source.boardId,
        itemId: source.itemId,
        code: "MISSING_AGL",
        message: `Artwork item "${source.itemName}" has no valid AGL identifier.`,
        payload: { itemName: source.itemName, model: source.model },
      });
    }

    const products = mergeProductSources(sources);
    const socialPosts = socialBoard.items.map((item) =>
      mapSocialItem(item, socialBoard.id),
    );
    stats.canonicalProducts = products.length;
    stats.duplicateProductSources =
      sources.filter((source) => source.aglKey).length - products.length;

    const refs: ProductRef[] = [];
    if (supabase) {
      const supplierCache = new Map<
        string,
        Promise<{ id: string | null; changed: boolean }>
      >();
      await forEachConcurrent(products, concurrency, async (product) => {
        const supplierKey = product.factoryName?.trim().toLowerCase() || null;
        let firstSupplierUse = false;
        let supplierPromise: Promise<{ id: string | null; changed: boolean }>;
        if (supplierKey) {
          const cached = supplierCache.get(supplierKey);
          if (cached) supplierPromise = cached;
          else {
            firstSupplierUse = true;
            supplierPromise = upsertSupplier(supabase, product);
            supplierCache.set(supplierKey, supplierPromise);
          }
        } else {
          supplierPromise = Promise.resolve({ id: null, changed: false });
        }
        const supplier = await supplierPromise;
        if (firstSupplierUse && supplier.changed) stats.suppliersUpserted += 1;
        const productId = await upsertProduct(supabase, product, supplier.id);
        stats.productsUpserted += 1;
        refs.push({
          id: productId,
          aglKey: product.aglKey,
          modelKey: normalizeModel(product.model),
        });

        for (const source of product.sources) {
          const result = await upsertProductSource(supabase, productId, source);
          stats.productSourcesUpserted += 1;
          stats.workflowsUpserted += 1;
          stats.assetsUpserted += result.assets;
        }
      });
    } else {
      refs.push(
        ...products.map((product) => ({
          id: `dry-run:${product.aglKey}`,
          aglKey: product.aglKey,
          modelKey: normalizeModel(product.model),
        })),
      );
      stats.suppliersUpserted = products.filter(
        (product) => product.factoryName,
      ).length;
      stats.productsUpserted = products.length;
      stats.productSourcesUpserted = products.reduce(
        (sum, product) => sum + product.sources.length,
        0,
      );
      stats.workflowsUpserted = stats.productSourcesUpserted;
      stats.assetsUpserted = products.reduce(
        (sum, product) =>
          sum +
          product.sources.reduce(
            (sourceSum, source) => sourceSum + source.assets.length,
            0,
          ),
        0,
      );
    }

    const lookups = buildProductLookups(refs);
    await forEachConcurrent(socialPosts, concurrency, async (social) => {
      const match = matchSocialProduct(social, lookups);
      if (match.productId) stats.socialMatched += 1;
      else stats.socialUnmatched += 1;
      if (match.issue) issues.push(match.issue);

      if (supabase) {
        const result = await upsertSocialPost(
          supabase,
          social,
          match.productId,
        );
        stats.socialPostsUpserted += 1;
        stats.assetsUpserted += result.assets;
      } else {
        stats.socialPostsUpserted += 1;
        stats.assetsUpserted += social.assets.length;
      }
    });

    stats.errors = issues.length;
    if (supabase) {
      await writeIssues(supabase, runId, issues);
      await finishRun(supabase, runId, "completed", stats);
    }
    return { runId, stats, issues };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (supabase && runId !== "dry-run") {
      await finishRun(supabase, runId, "failed", stats, message);
    }
    throw error;
  }
}
