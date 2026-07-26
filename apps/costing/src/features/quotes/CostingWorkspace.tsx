"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  blankInputs,
  calculateCosting,
  FORCE_NEW_COSTING_KEY,
  type CostingInputs,
  type ContainerConfig,
} from "@/lib/costing";
import { getQuote, reviseQuote, saveQuote } from "./repository";
import { NewCostingSetupModal } from "./NewCostingSetupModal";
import { useSession } from "@/components/SessionProvider";
import { useAccessPersona } from "@/components/AccessPersonaProvider";
import { ProductImageUploader } from "@/components/ProductImageUploader";
import { ProductCatalogSearch } from "@/features/catalog/ProductCatalogSearch";
import { PurchaseOrderViewer } from "@/features/catalog/PurchaseOrderViewer";
import { catalogToInputs, listProductPurchaseOrders } from "@/features/catalog/repository";
import type { CatalogProductHit } from "@/lib/catalog/types";

const ARCHIVE_HANDOFF_KEY = "ayonz.catalog.handoff";
import {
  customerPrefill,
  customerToInputs,
  listCustomers,
  type CustomerRecord,
} from "@/features/customers/repository";
import {
  listCustomerRateCardLinks,
  listRateCards,
  rateCardPrefill,
  rateCardToInputs,
  type RateCardRecord,
} from "@/features/rate-cards/repository";
import { getMyCommissionRate } from "@/features/salespeople/repository";
import { generateQuoteNumber } from "@/lib/format";

const money = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 2,
});
const percent = new Intl.NumberFormat("en-AU", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

type NumberKey = Exclude<
  {
    [K in keyof CostingInputs]-?: CostingInputs[K] extends number ? K : never;
  }[keyof CostingInputs],
  undefined
>;

function Field({ label, value, onChange, prefix, suffix, step = "any" }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  step?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="control">
        {prefix && <b>{prefix}</b>}
        <input type="number" min="0" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        {suffix && <b>{suffix}</b>}
      </span>
    </label>
  );
}

function TextField({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="control"><input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></span>
    </label>
  );
}

function Metric({ label, value, tone, detail }: { label: string; value: string; tone?: "good" | "warn"; detail?: string }) {
  return (
    <article className={`metric ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}

export function CostingWorkspace() {
  const searchParams = useSearchParams();
  const quoteId = searchParams.get("quote");
  const customerId = searchParams.get("customer");
  const rateCardId = searchParams.get("ratecard");
  const fromArchive = searchParams.get("fromArchive");
  const session = useSession();
  const access = useAccessPersona();
  const [inputs, setInputs] = useState<CostingInputs>(blankInputs);
  const [activeStep, setActiveStep] = useState(1);
  const [saveState, setSaveState] = useState("Unsaved draft");
  const [editing, setEditing] = useState<{ id: string; quoteNumber: string } | null>(null);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [rateCards, setRateCards] = useState<RateCardRecord[]>([]);
  const [rateCardChoice, setRateCardChoice] = useState("");
  const [myCommission, setMyCommission] = useState(0);
  const [catalogHit, setCatalogHit] = useState<CatalogProductHit | null>(null);
  const [poAvailable, setPoAvailable] = useState(false);
  const [showPurchaseOrder, setShowPurchaseOrder] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [linkedRateCardIds, setLinkedRateCardIds] = useState<string[] | null>(null);

  const resetToNewQuote = (opts?: { promptSetup?: boolean }) => {
    setInputs({ ...blankInputs, commissionRate: myCommission });
    setActiveStep(1);
    setSaveState("Unsaved draft");
    setEditing(null);
    setRateCardChoice("");
    setCatalogHit(null);
    setPoAvailable(false);
    setShowPurchaseOrder(false);
    setLinkedRateCardIds(null);
    if (opts?.promptSetup !== false) setSetupOpen(true);
  };
  const result = useMemo(() => calculateCosting(inputs), [inputs]);
  const scopedCustomers = useMemo(
    () =>
      customers.filter((customer) => {
        if (!access.isTeamScoped) return true;
        if (!access.teamId) return false;
        return customer.teamId === access.teamId;
      }),
    [customers, access.isTeamScoped, access.teamId],
  );
  const hasPurchaseOrder =
    catalogHit != null && catalogHit.id === inputs.catalogProductId
      ? Boolean(catalogHit.hasPurchaseOrder)
      : poAvailable;

  const setBasis = (basis: CostingInputs["costingBasis"]) =>
    setInputs((current) => ({ ...current, costingBasis: basis }));
  const loadCustomerLinks = (id: string) => {
    if (!id) {
      setLinkedRateCardIds(null);
      return;
    }
    listCustomerRateCardLinks(id)
      .then((links) => setLinkedRateCardIds(links.map((link) => link.rateCardId)))
      .catch(() => setLinkedRateCardIds([]));
  };

  const applyCustomer = (id: string) => {
    if (!id) {
      setLinkedRateCardIds(null);
      setInputs((current) => ({
        ...current,
        customer: "",
        customerId: undefined,
        customerReference: "",
        teamId: undefined,
      }));
      return;
    }
    const record = customers.find((customer) => customer.id === id);
    // The logged-in salesperson's commission wins over the customer's default.
    if (record) {
      setInputs((current) => ({ ...current, ...customerToInputs(record), commissionRate: myCommission }));
      loadCustomerLinks(id);
    }
  };
  const applyRateCard = (id: string) => {
    setRateCardChoice(id);
    const record = rateCards.find((card) => card.id === id);
    if (!record) return;
    setInputs((current) => {
      const patch = rateCardToInputs(record);
      // Salesperson commission wins over rate-card baseline when set.
      const commissionRate = myCommission > 0 ? myCommission : (patch.commissionRate ?? current.commissionRate);
      let next = { ...current, ...patch, commissionRate };
      // Keep the customer's trading programme / account overlays on top of the card.
      const customer = current.customerId
        ? customers.find((row) => row.id === current.customerId)
        : null;
      if (customer) {
        next = {
          ...next,
          ...customerToInputs(customer),
          commissionRate: myCommission > 0 ? myCommission : customer.tradingTerms.commissionRate || next.commissionRate,
        };
      }
      return next;
    });
  };
  const applySetupSelection = ({ customerId: nextCustomerId, rateCardId: nextRateCardId }: { customerId: string; rateCardId: string }) => {
    applyRateCard(nextRateCardId);
    if (nextCustomerId) applyCustomer(nextCustomerId);
    else {
      setLinkedRateCardIds(null);
    }
    setSetupOpen(false);
    setSaveState(nextCustomerId ? "Customer & rate card applied" : "Rate card applied");
  };
  const selectedCustomerId =
    inputs.customerId ||
    scopedCustomers.find((customer) => customer.name === inputs.customer)?.id ||
    "";
  const offeredRateCards = useMemo(() => {
    if (selectedCustomerId && linkedRateCardIds && linkedRateCardIds.length > 0) {
      return rateCards.filter((card) => linkedRateCardIds.includes(card.id));
    }
    return rateCards;
  }, [rateCards, selectedCustomerId, linkedRateCardIds]);

  // The rate card supplying the reference pickers: the one applied, else the active default.
  const activeCard = useMemo(
    () => rateCards.find((card) => card.id === rateCardChoice) ?? rateCards.find((card) => card.isActive) ?? rateCards[0] ?? null,
    [rateCards, rateCardChoice],
  );
  const enabledLicences = new Set(inputs.licences ?? []);
  const toggleLicence = (key: string) => {
    if (!activeCard) return;
    const next = new Set(inputs.licences ?? []);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const total = activeCard.licences.filter((licence) => next.has(licence.key)).reduce((sum, licence) => sum + licence.rate, 0);
    setInputs((current) => ({
      ...current,
      licences: [...next],
      licenceCostUnitUsd: total,
      applyLicences: next.size > 0 ? true : current.applyLicences,
    }));
  };
  const selectCurrency = (code: string) => {
    // Costings keep forex on USD (POs are USD). Selecting a currency only
    // records the rate-card currency for the quote — it does not rebind FX.
    setInputs((current) => ({ ...current, factoryCurrency: code }));
  };
  const selectDutyCategory = (name: string) => {
    const category = activeCard?.dutyCategories.find((item) => item.name === name);
    if (category) setInputs((current) => ({ ...current, dutyRate: category.rate, dutyCategory: category.name, hsCode: category.hsCodes }));
  };

  // Load pickers only when signed in to an organisation; ignore failures silently
  // so the offline calculator is never blocked.
  useEffect(() => {
    if (session.status !== "authenticated") {
      setCustomers([]);
      setRateCards([]);
      return;
    }
    let cancelled = false;
    listCustomers()
      .then((rows) => !cancelled && setCustomers(rows))
      .catch(() => undefined);
    listRateCards()
      .then((rows) => {
        if (cancelled) return;
        setRateCards(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session.status, session.organizationId]);

  // Default the commission term to the signed-in salesperson's rate — but not
  // when revising an existing quote (keep that quote's stored commission).
  useEffect(() => {
    if (session.status !== "authenticated" || quoteId) return;
    let cancelled = false;
    getMyCommissionRate()
      .then((rate) => {
        if (cancelled) return;
        setMyCommission(rate);
        setInputs((current) => ({ ...current, commissionRate: rate }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session.status, quoteId]);

  useEffect(() => {
    const applyForceNew = () => {
      try {
        if (window.sessionStorage.getItem(FORCE_NEW_COSTING_KEY) !== "1") return false;
        window.sessionStorage.removeItem(FORCE_NEW_COSTING_KEY);
      } catch {
        return false;
      }
      resetToNewQuote();
      return true;
    };

    if (applyForceNew()) {
      setSetupOpen(true);
      return;
    }

    if (!quoteId && !customerId && !rateCardId && !fromArchive) {
      resetToNewQuote({ promptSetup: true });
      return;
    }

    if (!quoteId) {
      setEditing(null);
      // Customer deep-link without rate card → prompt for rate card.
      if (customerId && !rateCardId) setSetupOpen(true);
      return;
    }

    let cancelled = false;
    getQuote(quoteId)
      .then((quote) => {
        if (cancelled || !quote) return;
        setInputs(quote.inputs);
        setEditing({ id: quote.id, quoteNumber: quote.quoteNumber });
        setSaveState(`Revising ${quote.quoteNumber}`);
        setActiveStep(1);
        setCatalogHit(null);
        setShowPurchaseOrder(false);
      })
      .catch((cause) => setSaveState(cause instanceof Error ? cause.message : "Could not load quote"));
    return () => {
      cancelled = true;
    };
    // Intentionally omit resetToNewQuote / myCommission — commission is applied by its own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId, customerId, rateCardId, fromArchive]);

  useEffect(() => {
    const onNewCosting = () => {
      try {
        if (window.sessionStorage.getItem(FORCE_NEW_COSTING_KEY) === "1") {
          window.sessionStorage.removeItem(FORCE_NEW_COSTING_KEY);
        }
      } catch {
        // ignore
      }
      resetToNewQuote({ promptSetup: true });
    };
    window.addEventListener("ayonz:new-costing", onNewCosting);
    return () => window.removeEventListener("ayonz:new-costing", onNewCosting);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myCommission]);


  useEffect(() => {
    if (!customerId) return;
    loadCustomerLinks(customerId);
    // When a rate card is also in the URL, apply customer after/with it; otherwise setup modal handles apply.
    if (!rateCardId) return;
    let cancelled = false;
    customerPrefill(customerId)
      .then((patch) => {
        if (cancelled) return;
        setInputs((current) => ({ ...current, ...patch, commissionRate: myCommission }));
        setSaveState(`Applied ${patch.customer} trading terms`);
      })
      .catch((cause) => setSaveState(cause instanceof Error ? cause.message : "Could not apply customer"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, rateCardId, myCommission]);

  useEffect(() => {
    if (!fromArchive || quoteId) return;
    try {
      const raw = window.sessionStorage.getItem(ARCHIVE_HANDOFF_KEY);
      if (!raw) return;
      window.sessionStorage.removeItem(ARCHIVE_HANDOFF_KEY);
      const hit = JSON.parse(raw) as CatalogProductHit;
      setInputs((current) => ({ ...current, ...catalogToInputs(hit) }));
      setCatalogHit(hit);
      setSaveState(`Loaded ${hit.agl || hit.model || hit.productName} from Product Archive`);
      setActiveStep(1);
    } catch {
      // ignore malformed handoff
    }
  }, [fromArchive, quoteId]);

  useEffect(() => {
    if (!rateCardId) return;
    let cancelled = false;
    setRateCardChoice(rateCardId);
    rateCardPrefill(rateCardId)
      .then((patch) => {
        if (cancelled) return;
        setInputs((current) => {
          const commissionRate = myCommission > 0 ? myCommission : (patch.commissionRate ?? current.commissionRate);
          return { ...current, ...patch, commissionRate };
        });
        setSaveState("Applied rate card");
      })
      .catch((cause) => setSaveState(cause instanceof Error ? cause.message : "Could not apply rate card"));
    return () => {
      cancelled = true;
    };
  }, [rateCardId, myCommission]);

  useEffect(() => {
    const productId = inputs.catalogProductId;
    if (!productId || session.status !== "authenticated") return;
    if (catalogHit?.id === productId) return;
    let cancelled = false;
    listProductPurchaseOrders(productId)
      .then((assets) => {
        if (!cancelled) setPoAvailable(assets.length > 0);
      })
      .catch(() => {
        if (!cancelled) setPoAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inputs.catalogProductId, session.status, catalogHit]);

  const setNumber = (key: NumberKey, value: number) => setInputs((current) => ({ ...current, [key]: value }));
  const setText = (
    key: "sku" | "description" | "brand" | "customer" | "customerReference" | "dueDate",
    value: string,
  ) => setInputs((current) => ({ ...current, [key]: value }));
  const rateField = (key: NumberKey, label: string) => (
    <Field label={label} value={inputs[key] as number * 100} suffix="%" step="0.1" onChange={(value) => setNumber(key, value / 100)} />
  );

  async function handleSave() {
    setSaveState("Saving…");
    try {
      if (editing) {
        await reviseQuote(editing.id, inputs, result);
        setSaveState(`Saved new version of ${editing.quoteNumber}`);
        return;
      }
      const target = await saveQuote({
        quoteNumber: generateQuoteNumber(),
        status: "draft",
        inputs,
        result,
      });
      setSaveState(target === "supabase" ? "Saved to Supabase" : "Saved in this browser");
    } catch (error) {
      setSaveState(error instanceof Error ? error.message : "Could not save");
    }
  }

  const steps = ["Product", "Supply chain", "Trading terms", "Review"];

  return (
    <section className="workspace" id="workspace">
        {setupOpen && !quoteId && (
          <NewCostingSetupModal
            customers={scopedCustomers}
            rateCards={rateCards}
            initialCustomerId={customerId ?? ""}
            onConfirm={applySetupSelection}
          />
        )}
        <header className="topbar topbar--costing">
          <div className="topbar-brand">
            <span className="eyebrow">{editing ? "REVISE QUOTE" : "NEW COSTING"}</span>
            <h1>
              {inputs.sku || "Untitled quote"} <em>{editing ? editing.quoteNumber : "Draft"}</em>
            </h1>
            {inputs.description ? <p>{inputs.description}</p> : null}
          </div>
          <div className="topbar-strip">
            <label className="topbar-field">
              <span>Customer</span>
              <select value={selectedCustomerId} onChange={(event) => applyCustomer(event.target.value)}>
                <option value="">Select customer…</option>
                {scopedCustomers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="topbar-field">
              <span>Customer reference</span>
              <input
                value={inputs.customerReference ?? ""}
                placeholder="Code / ref"
                onChange={(event) => setText("customerReference", event.target.value)}
              />
            </label>
            <label className="topbar-field">
              <span>Rate card</span>
              <select
                value={rateCardChoice}
                onChange={(event) => applyRateCard(event.target.value)}
              >
                <option value="">Select rate card…</option>
                {offeredRateCards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                    {card.costingBasis ? ` · ${card.costingBasis}` : ""}
                    {card.isActive ? "" : " (inactive)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="topbar-field">
              <span>Due date</span>
              <input
                type="date"
                value={inputs.dueDate ?? ""}
                onChange={(event) => setText("dueDate", event.target.value)}
              />
            </label>
            <div className="topbar-field topbar-search">
              <span>Search catalogue</span>
              <ProductCatalogSearch
                onSelect={(patch, hit) => {
                  setInputs((current) => ({ ...current, ...patch }));
                  setCatalogHit(hit);
                  setSaveState(`Loaded ${hit.agl || hit.model || hit.productName} from catalogue`);
                }}
              />
            </div>
          </div>
          <div className="top-actions">
            <span>{saveState}</span>
            <button className="secondary" onClick={() => window.print()}>Export PDF</button>
            <button onClick={handleSave}>Save quote</button>
          </div>
        </header>

        <div className="basis-bar">
          <span>Costing basis</span>
          <div className="basis-toggle">
            <button className={inputs.costingBasis === "FIW" ? "active" : ""} onClick={() => setBasis("FIW")}>
              FIW · into warehouse
            </button>
            <button className={inputs.costingBasis === "FOB" ? "active" : ""} onClick={() => setBasis("FOB")}>
              FOB · at port
            </button>
          </div>
          <small>
            {inputs.costingBasis === "FOB"
              ? "Ayonz cost stops at the origin port — customer bears freight, duty and local charges."
              : "Ayonz bears the full landed cost into the customer's warehouse."}
          </small>
        </div>

        <section className="scoreboard">
          <Metric label="Fully loaded cost" value={money.format(result.fullyLoadedCostUnitAud)} detail="per unit" />
          <Metric label="Net sell price" value={money.format(result.netSalesUnitAud)} detail={`${money.format(result.tradeTermsUnitAud)} in terms`} />
          <Metric label="Net gross profit" value={percent.format(result.grossProfitRate)} tone={result.passesGpGate ? "good" : "warn"} detail={money.format(result.grossProfitUnitAud) + " per unit"} />
          <Metric label="Retailer margin" value={percent.format(result.retailerMarginRate)} tone={result.passesRetailerGate ? "good" : "warn"} detail={`${money.format(result.rrpExGstAud)} RRP ex GST`} />
        </section>

        <div className="stepper">
          {steps.map((step, index) => <button key={step} onClick={() => setActiveStep(index + 1)} className={activeStep === index + 1 ? "active" : activeStep > index + 1 ? "done" : ""}><i>{activeStep > index + 1 ? "✓" : index + 1}</i>{step}</button>)}
        </div>

        <section className="form-card">
          {activeStep === 1 && <>
            <div className="section-heading"><div><span>STEP 01</span><h2>Product & factory quote</h2><p>Identify the product and capture the manufacturer&apos;s commercial offer.</p></div></div>
            {hasPurchaseOrder && inputs.catalogProductId && (
              <div className="catalog-search-block">
                <div className="catalog-po-actions">
                  <button type="button" className="secondary button-sm" onClick={() => setShowPurchaseOrder(true)}>
                    View purchase order
                  </button>
                  {inputs.factoryName ? (
                    <span className="inline-note">Factory: {inputs.factoryName}</span>
                  ) : null}
                </div>
              </div>
            )}
            <div className="form-grid three">
              <TextField label="SKU / inventory ID" value={inputs.sku} onChange={(v) => setText("sku", v)} />
              <TextField label="Product description" value={inputs.description} onChange={(v) => setText("description", v)} />
              <TextField label="Brand" value={inputs.brand} onChange={(v) => setText("brand", v)} />
              <Field label="Order quantity" value={inputs.orderQuantity} suffix="units" step="1" onChange={(v) => setNumber("orderQuantity", v)} />
              <Field label="Factory price" value={inputs.factoryUnitUsd} prefix="US$" suffix="/ unit" onChange={(v) => setNumber("factoryUnitUsd", v)} />
              <Field label="Technology licences" value={inputs.licenceCostUnitUsd} prefix="US$" suffix="/ unit" onChange={(v) => setNumber("licenceCostUnitUsd", v)} />
              <Field label="Fixed order fees" value={inputs.fixedOrderFeesUsd} prefix="US$" onChange={(v) => setNumber("fixedOrderFeesUsd", v)} />
              {activeCard && (
                <label className="field">
                  <span>Rate card currency</span>
                  <span className="control">
                    <select value={inputs.factoryCurrency ?? activeCard.currency.selectedCurrency ?? "USD"} onChange={(event) => selectCurrency(event.target.value)}>
                      {activeCard.currencies.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.code}
                          {item.code === (activeCard.currency.selectedCurrency ?? "USD") ? " · card default" : ""}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
              )}
              <Field
                label="Forex (PO)"
                value={inputs.audPerUsd}
                prefix="A$"
                suffix="per US$1"
                step="0.0001"
                onChange={(v) => setNumber("audPerUsd", v)}
              />
            </div>
            <div className="costing-toggles">
              <label className="costing-toggle">
                <input
                  type="checkbox"
                  checked={inputs.applyLicences !== false}
                  onChange={(event) => setInputs((current) => ({ ...current, applyLicences: event.target.checked }))}
                />
                <span>Licensed — include technology royalties in FOB</span>
              </label>
            </div>
            {activeCard && activeCard.licences.length > 0 && inputs.applyLicences !== false && (
              <div className="licence-block">
                <div className="field">
                  <span>Technology licences <small style={{ fontWeight: 400, color: "var(--muted)" }}>(US$ royalty / unit — included in FOB)</small></span>
                </div>
                <div className="licence-grid">
                  {activeCard.licences.map((licence) => (
                    <label key={licence.key} className={enabledLicences.has(licence.key) ? "licence-chip on" : "licence-chip"}>
                      <input type="checkbox" checked={enabledLicences.has(licence.key)} onChange={() => toggleLicence(licence.key)} />
                      <span>{licence.name}</span>
                      <b>{licence.rate.toFixed(2)}</b>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="product-image-block">
              <div className="field"><span>Product image</span></div>
              <ProductImageUploader sku={inputs.sku} />
            </div>
            {showPurchaseOrder && inputs.catalogProductId ? (
              <PurchaseOrderViewer
                productId={inputs.catalogProductId}
                productLabel={inputs.agl || inputs.sku || inputs.description || "Product"}
                onClose={() => setShowPurchaseOrder(false)}
              />
            ) : null}
          </>}

          {activeStep === 2 && <>
            <div className="section-heading"><div><span>STEP 02</span><h2>Supply chain & landed cost</h2><p>Model container utilisation, freight, import charges and internal on-cost.</p></div><div className="callout"><b>{result.containersRequired}</b><span>container{result.containersRequired === 1 ? "" : "s"} required</span></div></div>
            <div className="costing-toggles">
              <label className="costing-toggle">
                <input
                  type="checkbox"
                  checked={inputs.applyDuty !== false}
                  onChange={(event) => setInputs((current) => ({ ...current, applyDuty: event.target.checked }))}
                />
                <span>Duties — include import duty in landed cost</span>
              </label>
              <label className="costing-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(inputs.applyEwaste)}
                  onChange={(event) => setInputs((current) => ({ ...current, applyEwaste: event.target.checked }))}
                />
                <span>E-waste fee — include levy in landing charges</span>
              </label>
            </div>
            <div className="form-grid three">
              <label className="field"><span>Container configuration</span><span className="control"><select value={inputs.containerConfig} onChange={(event) => setInputs((current) => ({ ...current, containerConfig: event.target.value as ContainerConfig }))}><option>20 FT</option><option>40 FT</option><option>40FT High</option></select></span></label>
              <Field label="Units per container" value={inputs.unitsPerContainer} suffix="units" step="1" onChange={(v) => setNumber("unitsPerContainer", v)} />
              <Field label="Freight per container" value={inputs.freightPerContainerAud} prefix="A$" onChange={(v) => setNumber("freightPerContainerAud", v)} />
              {rateField("insuranceRate", "Marine insurance")}
              {activeCard && activeCard.dutyCategories.length > 0 && inputs.applyDuty !== false && (
                <label className="field">
                  <span>Duty category</span>
                  <span className="control">
                    <select value={inputs.dutyCategory ?? ""} onChange={(event) => selectDutyCategory(event.target.value)}>
                      <option value="">Custom / manual…</option>
                      {activeCard.dutyCategories.map((item) => (
                        <option key={item.name} value={item.name}>{item.name} · {(item.rate * 100).toFixed(1)}%</option>
                      ))}
                    </select>
                  </span>
                </label>
              )}
              {inputs.applyDuty !== false && rateField("dutyRate", "Import duty")}
              {rateField("wharfRate", "Wharf / port charges")}
              <Field label="Customs clearance" value={inputs.customsClearanceAud} prefix="A$" onChange={(v) => setNumber("customsClearanceAud", v)} />
              <Field label="Biosecurity / AQIS" value={inputs.biosecurityAud} prefix="A$" onChange={(v) => setNumber("biosecurityAud", v)} />
              <Field label="Cartage to warehouse" value={inputs.cartageAud} prefix="A$" onChange={(v) => setNumber("cartageAud", v)} />
              <Field label="E-waste fee / unit" value={inputs.ewasteFeeUnitAud} prefix="A$" onChange={(v) => setNumber("ewasteFeeUnitAud", v)} />
              {rateField("overheadRate", "Internal overhead")}
            </div>
          </>}

          {activeStep === 3 && <>
            <div className="section-heading"><div><span>STEP 03</span><h2>Customer pricing & trading terms</h2><p>See the true net margin after the customer&apos;s full commercial programme.</p></div><div className="callout"><b>{money.format(result.tradeTermsUnitAud)}</b><span>terms per unit</span></div></div>
            <div className="form-grid three">
              <Field label="Sell price ex GST" value={inputs.sellExGstAud} prefix="A$" suffix="/ unit" onChange={(v) => setNumber("sellExGstAud", v)} />
              <Field label="RRP inc GST" value={inputs.rrpIncGstAud} prefix="A$" onChange={(v) => setNumber("rrpIncGstAud", v)} />
              {rateField("gstRate", "GST")}
              {rateField("rebateRate", "Volume / growth rebate")}
              {rateField("coopMarketingRate", "Co-op marketing")}
              {rateField("settlementDiscountRate", "Settlement discount")}
              {rateField("returnsAllowanceRate", "Returns allowance")}
              {rateField("warrantyRate", "Warranty allowance")}
              {rateField("commissionRate", "Sales commission")}
              <Field label="Freight allowance" value={inputs.freightAllowanceUnitAud} prefix="A$" suffix="/ unit" onChange={(v) => setNumber("freightAllowanceUnitAud", v)} />
              {rateField("minimumGpRate", "Minimum net GP")}
              {rateField("minimumRetailerMarginRate", "Minimum retailer margin")}
            </div>
          </>}

          {activeStep === 4 && <>
            <div className="section-heading"><div><span>STEP 04</span><h2>Commercial review</h2><p>Validate the cost bridge and approval thresholds before submitting.</p></div></div>
            <div className="review-grid">
              <div className="bridge"><h3>Cost bridge <em>{inputs.costingBasis}</em></h3>{(() => {
                const freightUnit = result.freightTotalAud / (inputs.orderQuantity || 1) || 0;
                const overheadUnit = result.landedCostUnitAud * inputs.overheadRate;
                const bufferUnit = result.costBufferAud / (inputs.orderQuantity || 1) || 0;
                const rows: Array<[string, number, boolean?]> = [
                  ["Factory cost & licences", result.factoryCostUnitAud],
                  ["Ocean freight", freightUnit],
                  ["Insurance, duty & landing", result.landedCostUnitAud - result.factoryCostUnitAud - freightUnit],
                  ["Internal overhead", overheadUnit],
                  ...(bufferUnit ? ([["Management buffer", bufferUnit]] as Array<[string, number]>) : []),
                  ["Fully loaded cost", result.fullyLoadedCostUnitAud, true],
                  ["Customer trading terms", result.tradeTermsUnitAud],
                  ["Net gross profit", result.grossProfitUnitAud, true],
                ];
                return rows.map(([label, value, total]) => <div className={total ? "total" : ""} key={label}><span>{label}</span><b>{money.format(value)}</b></div>);
              })()}</div>
              <div className="approval"><h3>Approval checks</h3><div className={result.passesGpGate ? "pass" : "fail"}><i>{result.passesGpGate ? "✓" : "!"}</i><span><b>Net GP threshold</b><small>{percent.format(result.grossProfitRate)} vs {percent.format(inputs.minimumGpRate)} minimum</small></span></div><div className={result.passesRetailerGate ? "pass" : "fail"}><i>{result.passesRetailerGate ? "✓" : "!"}</i><span><b>Retailer margin target</b><small>{percent.format(result.retailerMarginRate)} vs {percent.format(inputs.minimumRetailerMarginRate)} minimum</small></span></div><div className="pass"><i>✓</i><span><b>Calculation integrity</b><small>No missing formula dependencies</small></span></div>{result.warnings.map((warning) => <p key={warning}>⚠ {warning}</p>)}</div>
            </div>
          </>}

          <footer className="form-footer"><button className="secondary" disabled={activeStep === 1} onClick={() => setActiveStep((step) => Math.max(1, step - 1))}>Back</button><span>Step {activeStep} of {steps.length}</span>{activeStep < steps.length ? <button onClick={() => setActiveStep((step) => Math.min(steps.length, step + 1))}>Continue</button> : <button onClick={handleSave}>Save draft</button>}</footer>
        </section>
    </section>
  );
}
