import assert from "node:assert/strict";
import test from "node:test";
import { catalogToInputs } from "@/features/catalog/repository";
import type { CatalogProductHit } from "@/lib/catalog/types";

test("maps catalogue hits into quote inputs without clearing missing prices", () => {
  const hit: CatalogProductHit = {
    id: "prod-1",
    agl: "AGL100",
    sku: "MODEL-1",
    model: "MODEL-1",
    productName: "Demo Speaker",
    brand: "Blaupunkt",
    factoryName: "Factory Co",
    country: "China",
    fobPrice: null,
    currency: "USD",
    moq: 500,
    moqUnit: "pcs",
    hasPurchaseOrder: true,
  };

  const patch = catalogToInputs(hit);
  assert.equal(patch.catalogProductId, "prod-1");
  assert.equal(patch.sku, "MODEL-1");
  assert.equal(patch.description, "Demo Speaker");
  assert.equal(patch.brand, "Blaupunkt");
  assert.equal(patch.agl, "AGL100");
  assert.equal(patch.factoryName, "Factory Co");
  assert.equal(patch.orderQuantity, 500);
  assert.equal("factoryUnitUsd" in patch, false);
});

test("prefers model for SKU and keeps FOB when present", () => {
  const hit: CatalogProductHit = {
    id: "prod-2",
    agl: "AGL200",
    sku: null,
    model: "BP15",
    productName: "Portable Monitor",
    brand: "Urbanworx",
    factoryName: null,
    country: null,
    fobPrice: 18.5,
    currency: "USD",
    moq: null,
    moqUnit: null,
    hasPurchaseOrder: false,
  };

  const patch = catalogToInputs(hit);
  assert.equal(patch.sku, "BP15");
  assert.equal(patch.factoryUnitUsd, 18.5);
  assert.equal(patch.factoryCurrency, "USD");
  assert.equal("orderQuantity" in patch, false);
});
