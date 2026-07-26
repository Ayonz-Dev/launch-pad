import assert from "node:assert/strict";
import test from "node:test";
import {
  mapArtworkItem,
  mapSocialItem,
  mergeProductSources,
  normalizeAgl,
} from "./mapping";
import { buildProductLookups, matchSocialProduct } from "./sync";
import type { MondayItem } from "./types";

function item(
  name: string,
  values: Record<string, string>,
  id = "item-1",
): MondayItem {
  return {
    id,
    name,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    group: { id: "group-1", title: "Test" },
    assets: [],
    column_values: Object.entries(values).map(([columnId, value]) => ({
      id: columnId,
      text: value,
      type: "text",
      value: JSON.stringify(value),
    })),
  };
}

test("normalizes AGL values and rejects non-AGL names", () => {
  assert.deepEqual(normalizeAgl(" agl-61 6551 "), {
    agl: "AGL-616551",
    key: "AGL616551",
  });
  assert.deepEqual(normalizeAgl("Projector"), { agl: null, key: null });
});

test("merges duplicate boards with active values taking precedence", () => {
  const completed = mapArtworkItem(
    item(
      "AGL100",
      { product_name: "Old Name", model: "MODEL-1", factory: "Factory A" },
      "completed",
    ),
    "660792519",
    "artwork_completed",
  );
  const active = mapArtworkItem(
    item(
      "AGL100",
      { product_name: "Current Name", model: "MODEL-1", brand: "Brand A" },
      "active",
    ),
    "659128200",
    "artwork_active",
  );

  const products = mergeProductSources([completed, active]);
  assert.equal(products.length, 1);
  assert.equal(products[0].productName, "Current Name");
  assert.equal(products[0].factoryName, "Factory A");
  assert.equal(products[0].brand, "Brand A");
  assert.equal(products[0].sources.length, 2);
});

test("does not silently catalogue artwork rows without an AGL", () => {
  const source = mapArtworkItem(
    item("Projector", { product_name: "Projector", model: "P100" }),
    "659128200",
    "artwork_active",
  );
  assert.equal(source.aglKey, null);
  assert.deepEqual(mergeProductSources([source]), []);
});

test("deduplicates repeated assets within a Monday file column", () => {
  const sourceItem = item("AGL101", { product_name: "Speaker" });
  sourceItem.column_values.push({
    id: "files",
    text: "speaker.jpg",
    type: "file",
    value: JSON.stringify({
      files: [
        { assetId: 123, name: "speaker.jpg" },
        { assetId: 123, name: "speaker.jpg" },
      ],
    }),
  });
  sourceItem.assets.push({
    id: "123",
    name: "speaker.jpg",
    url: "https://example.test/speaker.jpg",
    public_url: null,
    file_extension: "jpg",
    file_size: 100,
  });

  const source = mapArtworkItem(
    sourceItem,
    "659128200",
    "artwork_active",
  );
  assert.equal(source.assets.length, 1);
  assert.equal(source.assets[0].assetId, "123");
});

test("links social posts by normalized AGL before model fallback", () => {
  const social = mapSocialItem(
    item("Projector post", { text3: "agl 100", text: "MODEL-OTHER" }),
    "3738736764",
  );
  const lookups = buildProductLookups([
    { id: "product-1", aglKey: "AGL100", modelKey: "MODEL1" },
    { id: "product-2", aglKey: "AGL200", modelKey: "MODELOTHER" },
  ]);

  assert.deepEqual(matchSocialProduct(social, lookups), {
    productId: "product-1",
    issue: null,
  });
});

test("flags ambiguous model-only social links for review", () => {
  const social = mapSocialItem(
    item("Model-only post", { text: "MODEL-1" }),
    "3738736764",
  );
  const lookups = buildProductLookups([
    { id: "product-1", aglKey: "AGL100", modelKey: "MODEL-1" },
    { id: "product-2", aglKey: "AGL200", modelKey: "MODEL-1" },
  ]);

  const match = matchSocialProduct(social, lookups);
  assert.equal(match.productId, null);
  assert.equal(match.issue?.code, "AMBIGUOUS_SOCIAL_MODEL");
});
