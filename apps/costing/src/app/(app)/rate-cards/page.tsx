"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, PageHeader, RequireOrg, Workspace } from "@/components/PageShell";
import { Modal } from "@/components/Modal";
import { NumberInput, RateInput, TextInput } from "@/components/fields";
import { useSession } from "@/components/SessionProvider";
import {
  DEFAULT_CURRENCIES,
  DEFAULT_DUTY_CATEGORIES,
  DEFAULT_LICENCES,
  EMPTY_CURRENCY,
  EMPTY_LICENCE,
  EMPTY_LOGISTICS,
  EMPTY_TERMS,
  EMPTY_THRESHOLDS,
  deleteRateCard,
  listRateCards,
  mergeDefaultLicences,
  saveRateCard,
  type RateCardInput,
  type RateCardRecord,
} from "@/features/rate-cards/repository";
import { formatFxTimestamp, unitsPerUsd, type SpotBundle } from "@/lib/fx";
import { formatDate, formatMoney } from "@/lib/format";

function updateAt<T>(items: T[], index: number, patch: Partial<T>): T[] {
  return items.map((item, i) => (i === index ? { ...item, ...patch } : item));
}

function blank(): RateCardInput {
  return {
    name: "",
    isActive: true,
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: "",
    costingBasis: "FIW",
    currency: { ...EMPTY_CURRENCY },
    logistics: { ...EMPTY_LOGISTICS },
    licence: { ...EMPTY_LICENCE },
    terms: { ...EMPTY_TERMS },
    thresholds: { ...EMPTY_THRESHOLDS },
    currencies: DEFAULT_CURRENCIES.map((item) => ({ ...item })),
    licences: DEFAULT_LICENCES.map((item) => ({ ...item })),
    dutyCategories: DEFAULT_DUTY_CATEGORIES.map((item) => ({ ...item })),
  };
}

function fromRecord(card: RateCardRecord): RateCardInput {
  return {
    id: card.id,
    name: card.name,
    isActive: card.isActive,
    effectiveFrom: card.effectiveFrom,
    effectiveTo: card.effectiveTo ?? "",
    costingBasis: card.costingBasis,
    currency: { ...card.currency },
    logistics: { ...card.logistics },
    licence: { ...card.licence },
    terms: { ...card.terms },
    thresholds: { ...card.thresholds },
    currencies: card.currencies.map((item) => ({ ...item })),
    licences: mergeDefaultLicences(card.licences),
    dutyCategories: card.dutyCategories.map((item) => ({ ...item })),
  };
}

function duplicateFrom(card: RateCardRecord): RateCardInput {
  const base = fromRecord(card);
  delete base.id;
  return {
    ...base,
    name: `${card.name} (copy)`,
    isActive: false,
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: "",
  };
}

export default function RateCardsPage() {
  return (
    <Workspace>
      <RequireOrg>
        <RateCardsView />
      </RequireOrg>
    </Workspace>
  );
}

function RateCardsView() {
  const session = useSession();
  const router = useRouter();
  const canManage = session.can("rates.manage");
  const [cards, setCards] = useState<RateCardRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RateCardInput | null>(null);

  const load = useCallback(async () => {
    try {
      setCards(await listRateCards());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load rate cards.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(card: RateCardRecord) {
    if (!window.confirm(`Delete rate card "${card.name}"? This cannot be undone.`)) return;
    try {
      await deleteRateCard(card.id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this rate card.");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="RATE CARDS"
        title="Rate cards"
        subtitle="Reusable FX (USD base), logistics, licences and trading terms that prefill a new costing."
        actions={canManage ? <button onClick={() => setEditing(blank())}>＋ New rate card</button> : undefined}
      />
      <div className="page">
        {error && <EmptyState icon="⚠️" title="Something went wrong">{error}</EmptyState>}
        {!cards ? (
          <EmptyState icon="⏳" title="Loading rate cards…" />
        ) : (
          <div className="card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Basis</th>
                  <th className="num">Forex A$/US$</th>
                  <th>Currency</th>
                  <th className="num">Freight / container</th>
                  <th>Effective</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cards.length === 0 ? (
                  <tr>
                    <td className="row-empty" colSpan={8}>
                      No rate cards yet.{canManage ? " Create one to speed up new costings." : ""}
                    </td>
                  </tr>
                ) : (
                  cards.map((card) => (
                    <tr key={card.id}>
                      <td className="strong">{card.name}</td>
                      <td>
                        <span className={card.isActive ? "status status--ready_for_export" : "status status--draft"}>
                          {card.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>{card.costingBasis}</td>
                      <td className="num">{card.currency.audPerUsd.toFixed(4)}</td>
                      <td>{card.currency.selectedCurrency ?? "USD"}</td>
                      <td className="num">{formatMoney(card.logistics.freightPerContainerAud)}</td>
                      <td>
                        {formatDate(card.effectiveFrom)}
                        {card.effectiveTo ? ` → ${formatDate(card.effectiveTo)}` : ""}
                      </td>
                      <td className="num" onClick={(event) => event.stopPropagation()}>
                        <button className="button-sm secondary" onClick={() => router.push(`/new?ratecard=${card.id}`)}>
                          Use
                        </button>
                        {canManage && (
                          <>
                            <button className="button-sm secondary" style={{ marginLeft: 8 }} onClick={() => setEditing(fromRecord(card))}>
                              Edit
                            </button>
                            <button className="button-sm secondary" style={{ marginLeft: 8 }} onClick={() => setEditing(duplicateFrom(card))}>
                              Duplicate
                            </button>
                            <button className="button-sm button-danger" style={{ marginLeft: 8 }} onClick={() => remove(card)}>
                              Delete
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <RateCardForm
          value={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </>
  );
}

function RateCardForm({
  value,
  onClose,
  onSaved,
}: {
  value: RateCardInput;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<RateCardInput>(value);
  const [saving, setSaving] = useState(false);
  const [fetchingFx, setFetchingFx] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setLogistics = (key: keyof RateCardInput["logistics"], next: number) =>
    setForm((prev) => ({ ...prev, logistics: { ...prev.logistics, [key]: next } }));
  const setTerm = (key: keyof RateCardInput["terms"], next: number) =>
    setForm((prev) => ({ ...prev, terms: { ...prev.terms, [key]: next } }));
  const setThreshold = (key: keyof RateCardInput["thresholds"], next: number) =>
    setForm((prev) => ({ ...prev, thresholds: { ...prev.thresholds, [key]: next } }));

  const syncUsdBase = (
    currencies: RateCardInput["currencies"],
    fxFetchedAt?: string | null,
    fallbackAud = form.currency.audPerUsd,
    fallbackFetchedAt = form.currency.fxFetchedAt,
    selectedCurrency = form.currency.selectedCurrency ?? "USD",
  ) => {
    const usd = currencies.find((row) => row.code === "USD");
    const selected = currencies.some((row) => row.code === selectedCurrency) ? selectedCurrency : "USD";
    return {
      currencies,
      currency: {
        audPerUsd: usd?.rate ?? fallbackAud,
        selectedCurrency: selected,
        fxBase: "USD" as const,
        fxFetchedAt: fxFetchedAt === undefined ? fallbackFetchedAt : fxFetchedAt,
      },
    };
  };

  const selectCostingCurrency = (code: string) => {
    const next = code.toUpperCase();
    setForm((p) => ({
      ...p,
      ...syncUsdBase(p.currencies, undefined, p.currency.audPerUsd, p.currency.fxFetchedAt, next),
    }));
  };

  async function refreshSpotRates() {
    setFetchingFx(true);
    setError(null);
    try {
      const codes = form.currencies.map((row) => row.code).filter(Boolean).join(",");
      const response = await fetch(`/api/fx/spot?codes=${encodeURIComponent(codes)}`);
      const payload = (await response.json()) as SpotBundle & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not fetch spot rates.");
      const byCode = new Map(payload.quotes.map((quote) => [quote.code, quote]));
      const currencies = form.currencies.map((row) => {
        const quote = byCode.get(row.code);
        if (!quote || !(quote.audPerUnit > 0)) return row;
        return {
          ...row,
          rate: Number(quote.audPerUnit.toFixed(6)),
          spotRate: quote.audPerUnit,
          spotUnitsPerUsd: quote.unitsPerUsd,
          spotFetchedAt: payload.fetchedAt,
        };
      });
      setForm((prev) => ({
        ...prev,
        ...syncUsdBase(currencies, payload.fetchedAt),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not fetch spot rates.");
    } finally {
      setFetchingFx(false);
    }
  }

  async function submit() {
    if (!form.name.trim()) {
      setError("A rate card name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const licences = mergeDefaultLicences(form.licences);
      await saveRateCard({
        ...form,
        licences,
        ...syncUsdBase(form.currencies),
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this rate card.");
      setSaving(false);
    }
  }

  const audPerUsd = form.currencies.find((row) => row.code === "USD")?.rate ?? form.currency.audPerUsd;
  const selectedCurrency = form.currency.selectedCurrency ?? "USD";

  return (
    <Modal title={form.id ? "Edit rate card" : "New rate card"} onClose={onClose}>
      <div className="form-grid" style={{ padding: 0, gridTemplateColumns: "2fr 1fr 1fr 1fr" }}>
        <TextInput label="Name" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} required />
        <label className="field">
          <span>Costing basis</span>
          <span className="control">
            <select
              value={form.costingBasis}
              onChange={(event) =>
                setForm((p) => ({ ...p, costingBasis: event.target.value === "FOB" ? "FOB" : "FIW" }))
              }
            >
              <option value="FIW">FIW — into warehouse</option>
              <option value="FOB">FOB — at port</option>
            </select>
          </span>
        </label>
        <TextInput label="Effective from" type="date" value={form.effectiveFrom} onChange={(v) => setForm((p) => ({ ...p, effectiveFrom: v }))} />
        <TextInput label="Effective to (optional)" type="date" value={form.effectiveTo} onChange={(v) => setForm((p) => ({ ...p, effectiveTo: v }))} />
      </div>

      <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 10, margin: "16px 0 4px" }}>
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(event) => setForm((p) => ({ ...p, isActive: event.target.checked }))}
          style={{ width: 18, height: 18 }}
        />
        <span>Active (available to apply to new costings)</span>
      </label>

      <h3 style={{ margin: "20px 0 12px", fontSize: 14 }}>Currency & licences</h3>
      <div className="form-grid" style={{ padding: 0, gridTemplateColumns: "1fr 1fr", gap: "16px 18px" }}>
        <label className="field">
          <span>Currency for costings</span>
          <span className="control">
            <select value={selectedCurrency} onChange={(event) => selectCostingCurrency(event.target.value)}>
              {form.currencies
                .filter((row) => row.code)
                .map((row) => (
                  <option key={row.code} value={row.code}>
                    {row.code}
                    {row.code === "USD" ? " · purchase orders" : ""}
                  </option>
                ))}
            </select>
          </span>
        </label>
        <NumberInput
          label="Forex — cost per US$ (POs are USD)"
          prefix="A$"
          suffix="per US$1"
          step="0.0001"
          value={audPerUsd}
          onChange={(v) =>
            setForm((p) => {
              const currencies = p.currencies.map((row) => (row.code === "USD" ? { ...row, rate: v } : row));
              if (!currencies.some((row) => row.code === "USD")) currencies.unshift({ code: "USD", rate: v });
              return { ...p, ...syncUsdBase(currencies) };
            })
          }
        />
        <NumberInput
          label="Technology licences (aggregate)"
          prefix="US$"
          suffix="/ unit"
          value={form.licence.licenceCostUnitUsd}
          onChange={(v) => setForm((p) => ({ ...p, licence: { licenceCostUnitUsd: v } }))}
        />
      </div>
      <p className="inline-note" style={{ margin: "0 0 8px" }}>
        Selected currency applies to every costing that uses this rate card. Factory costs come from USD purchase orders — forex is always A$ per US$1.
      </p>

      <h3 style={{ margin: "20px 0 12px", fontSize: 14 }}>Logistics & import</h3>
      <div className="form-grid" style={{ padding: 0, gridTemplateColumns: "1fr 1fr 1fr", gap: "16px 18px" }}>
        <NumberInput label="Freight per container" prefix="A$" value={form.logistics.freightPerContainerAud} onChange={(v) => setLogistics("freightPerContainerAud", v)} />
        <RateInput label="Marine insurance" value={form.logistics.insuranceRate} onChange={(v) => setLogistics("insuranceRate", v)} />
        <RateInput label="Import duty" value={form.logistics.dutyRate} onChange={(v) => setLogistics("dutyRate", v)} />
        <RateInput label="Wharf / port" value={form.logistics.wharfRate} onChange={(v) => setLogistics("wharfRate", v)} />
        <NumberInput label="Customs clearance" prefix="A$" value={form.logistics.customsClearanceAud} onChange={(v) => setLogistics("customsClearanceAud", v)} />
        <NumberInput label="Biosecurity / AQIS" prefix="A$" value={form.logistics.biosecurityAud} onChange={(v) => setLogistics("biosecurityAud", v)} />
        <NumberInput label="Cartage" prefix="A$" value={form.logistics.cartageAud} onChange={(v) => setLogistics("cartageAud", v)} />
        <NumberInput label="E-waste fee / unit" prefix="A$" value={form.logistics.ewasteFeeUnitAud} onChange={(v) => setLogistics("ewasteFeeUnitAud", v)} />
        <RateInput label="Internal overhead" value={form.logistics.overheadRate} onChange={(v) => setLogistics("overheadRate", v)} />
      </div>

      <h3 style={{ margin: "20px 0 12px", fontSize: 14 }}>Baseline trading terms</h3>
      <p className="inline-note" style={{ marginBottom: 12 }}>Standard programme applied to a new costing before the account&apos;s own terms.</p>
      <div className="form-grid" style={{ padding: 0, gridTemplateColumns: "1fr 1fr 1fr", gap: "16px 18px" }}>
        <RateInput label="Volume / growth rebate" value={form.terms.rebateRate} onChange={(v) => setTerm("rebateRate", v)} />
        <RateInput label="Co-op marketing" value={form.terms.coopMarketingRate} onChange={(v) => setTerm("coopMarketingRate", v)} />
        <RateInput label="Settlement discount" value={form.terms.settlementDiscountRate} onChange={(v) => setTerm("settlementDiscountRate", v)} />
        <RateInput label="Returns allowance" value={form.terms.returnsAllowanceRate} onChange={(v) => setTerm("returnsAllowanceRate", v)} />
        <RateInput label="Warranty allowance" value={form.terms.warrantyRate} onChange={(v) => setTerm("warrantyRate", v)} />
        <RateInput label="Sales commission" value={form.terms.commissionRate} onChange={(v) => setTerm("commissionRate", v)} />
      </div>

      <h3 style={{ margin: "20px 0 12px", fontSize: 14 }}>Approval floors</h3>
      <div className="form-grid" style={{ padding: 0, gridTemplateColumns: "1fr 1fr", gap: "16px 18px" }}>
        <RateInput label="Minimum net GP" value={form.thresholds.minimumGpRate} onChange={(v) => setThreshold("minimumGpRate", v)} />
        <RateInput label="Minimum retailer margin" value={form.thresholds.minimumRetailerMarginRate} onChange={(v) => setThreshold("minimumRetailerMarginRate", v)} />
      </div>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, margin: "22px 0 8px" }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>
          Currencies <small style={{ fontWeight: 400, color: "var(--muted)" }}>(select one for costings — forex remains A$ per US$1)</small>
        </h3>
        <button type="button" className="secondary button-sm" onClick={() => void refreshSpotRates()} disabled={fetchingFx}>
          {fetchingFx ? "Fetching…" : "Refresh spot rates"}
        </button>
      </div>
      <p className="inline-note" style={{ marginBottom: 10 }}>
        Spot pulled {formatFxTimestamp(form.currency.fxFetchedAt)}. Costings always convert factory USD at the US$ forex rate.
      </p>
      <div className="rate-row rate-row--head">
        <span style={{ width: 44 }}>Use</span>
        <span style={{ width: 70 }}>Code</span>
        <span style={{ width: 110 }}>Card A$</span>
        <span style={{ width: 90 }}>/ USD</span>
        <span style={{ width: 110 }}>Spot A$</span>
        <span style={{ flex: 1 }}>Spot updated</span>
        <span style={{ width: 36 }} />
      </div>
      {form.currencies.map((row, i) => {
        const perUsd = unitsPerUsd(audPerUsd, row.rate);
        const isSelected = row.code === selectedCurrency;
        return (
          <div key={i} className={`rate-row${isSelected ? " rate-row--selected" : ""}`}>
            <label style={{ width: 44, display: "flex", justifyContent: "center" }} title="Use for costings">
              <input
                type="radio"
                name="selected-currency"
                checked={isSelected}
                disabled={!row.code}
                onChange={() => selectCostingCurrency(row.code)}
              />
            </label>
            <input
              style={{ width: 70 }}
              value={row.code}
              placeholder="USD"
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  ...syncUsdBase(updateAt(p.currencies, i, { code: e.target.value.toUpperCase() })),
                }))
              }
            />
            <input
              style={{ width: 110 }}
              type="number"
              step="0.0001"
              value={row.rate}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  ...syncUsdBase(updateAt(p.currencies, i, { rate: Number(e.target.value) })),
                }))
              }
            />
            <span className="rate-meta" style={{ width: 90 }} title="Units of this currency per 1 USD">
              {perUsd > 0 ? perUsd.toFixed(2) : "—"}
            </span>
            <span className="rate-meta" style={{ width: 110 }}>
              {row.spotRate != null && row.spotRate > 0 ? row.spotRate.toFixed(4) : "—"}
            </span>
            <span className="rate-meta" style={{ flex: 1, fontSize: 12 }}>
              {formatFxTimestamp(row.spotFetchedAt ?? form.currency.fxFetchedAt)}
            </span>
            <button
              type="button"
              className="icon-button"
              onClick={() =>
                setForm((p) => {
                  const currencies = p.currencies.filter((_, idx) => idx !== i);
                  const nextSelected =
                    p.currency.selectedCurrency === row.code
                      ? currencies.find((c) => c.code === "USD")?.code ?? currencies[0]?.code ?? "USD"
                      : p.currency.selectedCurrency;
                  return {
                    ...p,
                    ...syncUsdBase(currencies, undefined, p.currency.audPerUsd, p.currency.fxFetchedAt, nextSelected),
                  };
                })
              }
            >
              ✕
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="secondary button-sm rate-add"
        onClick={() => setForm((p) => ({ ...p, currencies: [...p.currencies, { code: "", rate: 0 }] }))}
      >
        ＋ Add currency
      </button>

      <h3 style={{ margin: "22px 0 8px", fontSize: 14 }}>
        Technology licences <small style={{ fontWeight: 400, color: "var(--muted)" }}>(USD royalty / unit — from workbook licence list)</small>
      </h3>
      <p className="inline-note" style={{ marginBottom: 10 }}>
        Workbook had Y/N toggles only (no $ amounts). Enter commercial USD royalties here; costing checkboxes sum the selected rows into FOB.
      </p>
      {form.licences.map((row, i) => (
        <div key={i} className="rate-row">
          <input
            style={{ flex: 1 }}
            value={row.name}
            placeholder="Dolby"
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                licences: updateAt(p.licences, i, { name: e.target.value, key: e.target.value.toLowerCase().replace(/\s+/g, "_") }),
              }))
            }
          />
          <span className="rate-meta" style={{ width: 40 }}>
            US$
          </span>
          <input
            style={{ width: 110 }}
            type="number"
            step="0.01"
            value={row.rate}
            onChange={(e) => setForm((p) => ({ ...p, licences: updateAt(p.licences, i, { rate: Number(e.target.value) }) }))}
          />
          <button type="button" className="icon-button" onClick={() => setForm((p) => ({ ...p, licences: p.licences.filter((_, idx) => idx !== i) }))}>
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary button-sm rate-add"
        onClick={() => setForm((p) => ({ ...p, licences: [...p.licences, { key: "", name: "", rate: 0 }] }))}
      >
        ＋ Add licence
      </button>

      <h3 style={{ margin: "22px 0 8px", fontSize: 14 }}>Duty categories <small style={{ fontWeight: 400, color: "var(--muted)" }}>(rate as decimal — 0.05 = 5%)</small></h3>
      {form.dutyCategories.map((row, i) => (
        <div key={i} className="rate-row">
          <input style={{ flex: 1 }} value={row.name} placeholder="Electronics / ICT" onChange={(e) => setForm((p) => ({ ...p, dutyCategories: updateAt(p.dutyCategories, i, { name: e.target.value }) }))} />
          <input style={{ width: 80 }} type="number" step="0.001" value={row.rate} onChange={(e) => setForm((p) => ({ ...p, dutyCategories: updateAt(p.dutyCategories, i, { rate: Number(e.target.value) }) }))} />
          <input style={{ width: 140 }} value={row.hsCodes} placeholder="HS codes" onChange={(e) => setForm((p) => ({ ...p, dutyCategories: updateAt(p.dutyCategories, i, { hsCodes: e.target.value }) }))} />
          <button type="button" className="icon-button" onClick={() => setForm((p) => ({ ...p, dutyCategories: p.dutyCategories.filter((_, idx) => idx !== i) }))}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="secondary button-sm rate-add" onClick={() => setForm((p) => ({ ...p, dutyCategories: [...p.dutyCategories, { name: "", rate: 0, hsCodes: "" }] }))}>
        ＋ Add category
      </button>

      {error && (
        <p className="auth-message" style={{ marginTop: 16 }}>
          {error}
        </p>
      )}
      <div className="form-actions" style={{ marginTop: 20 }}>
        <button className="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button onClick={submit} disabled={saving}>
          {saving ? "Saving…" : "Save rate card"}
        </button>
      </div>
    </Modal>
  );
}
