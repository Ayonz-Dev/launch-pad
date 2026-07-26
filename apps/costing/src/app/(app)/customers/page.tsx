"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, PageHeader, RequireOrg, Workspace } from "@/components/PageShell";
import { Modal } from "@/components/Modal";
import { NumberInput, RateInput, TextInput } from "@/components/fields";
import { useSession } from "@/components/SessionProvider";
import { useAccessPersona } from "@/components/AccessPersonaProvider";
import {
  EMPTY_ACCOUNT_RATES,
  EMPTY_TRADING_TERMS,
  FREIGHT_MODEL_LABEL,
  listCustomers,
  saveCustomer,
  type CustomerInput,
  type CustomerRecord,
  type FreightModel,
  type TradingTerms,
} from "@/features/customers/repository";
import { contactLabel, listContacts, type ContactRecord } from "@/features/contacts/repository";
import { listTeams, type TeamRecord } from "@/features/teams/repository";
import {
  listCustomerRateCardLinks,
  listRateCards,
  rateCardTermsForCustomer,
  setCustomerRateCards,
  type RateCardRecord,
} from "@/features/rate-cards/repository";
import type { CostingBasis } from "@/lib/costing";

function describeError(cause: unknown, fallback: string): string {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === "object" && "message" in cause) {
    const message = (cause as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

const BLANK: CustomerInput = {
  name: "",
  customerCode: "",
  contactName: "",
  contactEmail: "",
  paymentTerms: "",
  contactId: "",
  teamId: "",
  tradingTerms: { ...EMPTY_TRADING_TERMS },
  ...EMPTY_ACCOUNT_RATES,
};

export default function CustomersPage() {
  return (
    <Workspace>
      <RequireOrg>
        <CustomersView />
      </RequireOrg>
    </Workspace>
  );
}

function CustomersView() {
  const session = useSession();
  const access = useAccessPersona();
  const router = useRouter();
  const canManage = session.can("quotes.create") || access.can("create_quote");
  const [customers, setCustomers] = useState<CustomerRecord[] | null>(null);
  const [customerContacts, setCustomerContacts] = useState<ContactRecord[]>([]);
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [rateCards, setRateCards] = useState<RateCardRecord[]>([]);
  const [linksByCustomer, setLinksByCustomer] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomerInput | null>(null);

  const load = useCallback(async () => {
    try {
      const [rows, contacts, teamRows, cards] = await Promise.all([
        listCustomers(),
        listContacts("customer").catch(() => []),
        listTeams().catch(() => []),
        listRateCards().catch(() => []),
      ]);
      setCustomers(rows);
      setCustomerContacts(contacts);
      setTeams(teamRows);
      setRateCards(cards);

      const linkEntries = await Promise.all(
        rows.map(async (customer) => {
          try {
            const links = await listCustomerRateCardLinks(customer.id);
            return [customer.id, links.map((link) => link.rateCardId)] as const;
          } catch {
            return [customer.id, []] as const;
          }
        }),
      );
      setLinksByCustomer(Object.fromEntries(linkEntries));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load customers.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setEditing({
      ...BLANK,
      tradingTerms: { ...EMPTY_TRADING_TERMS },
      teamId: access.isTeamScoped ? access.teamId ?? "" : "",
    });
  }

  function openEdit(customer: CustomerRecord) {
    setEditing({
      id: customer.id,
      name: customer.name,
      customerCode: customer.customerCode ?? "",
      contactName: customer.contactName ?? "",
      contactEmail: customer.contactEmail ?? "",
      paymentTerms: customer.paymentTerms ?? "",
      contactId: customer.contactId ?? "",
      teamId: customer.teamId ?? "",
      tradingTerms: { ...customer.tradingTerms },
      freightModel: customer.freightModel,
      freightPerContainerAud: customer.freightPerContainerAud,
      distributionCostUnitAud: customer.distributionCostUnitAud,
      ewasteFeeUnitAud: customer.ewasteFeeUnitAud,
      costBufferRate: customer.costBufferRate,
      defaultCostingBasis: customer.defaultCostingBasis,
    });
  }

  const visibleCustomers = (customers ?? []).filter((customer) => {
    if (!access.isTeamScoped) return true;
    if (!access.teamId) return false;
    return customer.teamId === access.teamId;
  });
  const teamName = (id: string | null) => teams.find((team) => team.id === id)?.name ?? "Unassigned";
  const cardName = (id: string) => rateCards.find((card) => card.id === id)?.name ?? id.slice(0, 8);

  return (
    <>
      <PageHeader
        eyebrow="CUSTOMERS"
        title="Customers"
        subtitle="Trading terms and linked rate cards here prefill the costing calculator."
        actions={canManage ? <button onClick={openNew}>＋ New customer</button> : undefined}
      />
      <div className="page">
        {error && <EmptyState icon="⚠️" title="Something went wrong">{error}</EmptyState>}
        {!customers ? (
          <EmptyState icon="⏳" title="Loading customers…" />
        ) : (
          <div className="card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Team</th>
                  <th>Code</th>
                  <th>Rate cards</th>
                  <th>Contact</th>
                  <th>Payment terms</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleCustomers.length === 0 ? (
                  <tr>
                    <td className="row-empty" colSpan={7}>
                      No customers yet.{canManage ? " Add your first one." : ""}
                    </td>
                  </tr>
                ) : (
                  visibleCustomers.map((customer) => {
                    const linked = linksByCustomer[customer.id] ?? [];
                    return (
                      <tr key={customer.id} onClick={() => (canManage ? openEdit(customer) : undefined)}>
                        <td className="strong">{customer.name}</td>
                        <td>{teamName(customer.teamId)}</td>
                        <td>{customer.customerCode ?? "—"}</td>
                        <td>
                          {linked.length === 0
                            ? "—"
                            : linked.map(cardName).join(", ")}
                        </td>
                        <td>
                          {customer.contactName ?? "—"}
                          {customer.contactEmail ? <div className="muted">{customer.contactEmail}</div> : null}
                        </td>
                        <td>{customer.paymentTerms ?? "—"}</td>
                        <td className="num">
                          <button
                            className="button-sm secondary"
                            onClick={(event) => {
                              event.stopPropagation();
                              router.push(`/new?customer=${customer.id}`);
                            }}
                          >
                            Use in costing
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <CustomerForm
          value={editing}
          contacts={customerContacts}
          teams={teams}
          rateCards={rateCards}
          initialRateCardIds={editing.id ? linksByCustomer[editing.id] ?? [] : []}
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

function CustomerForm({
  value,
  contacts,
  teams,
  rateCards,
  initialRateCardIds,
  onClose,
  onSaved,
}: {
  value: CustomerInput;
  contacts: ContactRecord[];
  teams: TeamRecord[];
  rateCards: RateCardRecord[];
  initialRateCardIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CustomerInput>(value);
  const [linkedIds, setLinkedIds] = useState<string[]>(initialRateCardIds);
  const [defaultRateCardId, setDefaultRateCardId] = useState(initialRateCardIds[0] ?? "");
  const [addCardId, setAddCardId] = useState("");
  const [prefillCardId, setPrefillCardId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!value.id) return;
    listCustomerRateCardLinks(value.id)
      .then((links) => {
        if (cancelled) return;
        setLinkedIds(links.map((link) => link.rateCardId));
        setDefaultRateCardId(links.find((link) => link.isDefault)?.rateCardId ?? links[0]?.rateCardId ?? "");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [value.id]);

  const availableToAdd = useMemo(
    () => rateCards.filter((card) => !linkedIds.includes(card.id)),
    [rateCards, linkedIds],
  );

  const setField = (
    key: "name" | "customerCode" | "contactName" | "contactEmail" | "paymentTerms",
    next: string,
  ) => setForm((prev) => ({ ...prev, [key]: next }));
  const setTerm = (key: keyof TradingTerms, next: number) =>
    setForm((prev) => ({ ...prev, tradingTerms: { ...prev.tradingTerms, [key]: next } }));

  function addLinkedCard() {
    if (!addCardId) return;
    setLinkedIds((prev) => (prev.includes(addCardId) ? prev : [...prev, addCardId]));
    setDefaultRateCardId((prev) => prev || addCardId);
    setAddCardId("");
  }

  function removeLinkedCard(rateCardId: string) {
    setLinkedIds((prev) => prev.filter((id) => id !== rateCardId));
    setDefaultRateCardId((prev) => (prev === rateCardId ? "" : prev));
  }

  function prefillTradingTermsFromCard() {
    const card = rateCards.find((item) => item.id === prefillCardId);
    if (!card) return;
    setForm((prev) => ({
      ...prev,
      tradingTerms: { ...prev.tradingTerms, ...rateCardTermsForCustomer(card) },
      defaultCostingBasis: card.costingBasis,
    }));
  }

  async function submit() {
    if (!form.name.trim()) {
      setError("A customer name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const customerId = await saveCustomer(form);
      const defaultId =
        defaultRateCardId && linkedIds.includes(defaultRateCardId)
          ? defaultRateCardId
          : linkedIds[0] ?? null;
      await setCustomerRateCards(customerId, linkedIds, defaultId);
      onSaved();
    } catch (cause) {
      setError(describeError(cause, "Could not save this customer."));
      setSaving(false);
    }
  }

  return (
    <Modal title={form.id ? "Edit customer" : "New customer"} onClose={onClose} wide>
      <div className="form-grid" style={{ padding: 0, gridTemplateColumns: "1fr 1fr" }}>
        <TextInput label="Name" value={form.name} onChange={(v) => setField("name", v)} required />
        <TextInput label="Customer code / reference" value={form.customerCode} onChange={(v) => setField("customerCode", v)} />
        <TextInput label="Contact name" value={form.contactName} onChange={(v) => setField("contactName", v)} />
        <TextInput label="Contact email" type="email" value={form.contactEmail} onChange={(v) => setField("contactEmail", v)} />
        <TextInput label="Payment terms" value={form.paymentTerms} onChange={(v) => setField("paymentTerms", v)} placeholder="e.g. 30 days EOM" />
      </div>

      <div style={{ marginTop: 16 }}>
        <label className="field">
          <span>Team</span>
          <span className="control">
            <select value={form.teamId} onChange={(event) => setForm((prev) => ({ ...prev, teamId: event.target.value }))}>
              <option value="">— unassigned —</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </span>
        </label>
        <label className="field" style={{ marginTop: 12 }}>
          <span>Linked address-book contact</span>
          <span className="control">
            <select value={form.contactId} onChange={(event) => setForm((prev) => ({ ...prev, contactId: event.target.value }))}>
              <option value="">— none —</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>{contactLabel(contact)}</option>
              ))}
            </select>
          </span>
        </label>
      </div>

      <h3 style={{ margin: "22px 0 4px", fontSize: 14 }}>Linked rate cards</h3>
      <p className="inline-note" style={{ marginBottom: 12 }}>
        Associate org rate cards with this customer. New costings for this account will offer these cards first.
      </p>
      {linkedIds.length === 0 ? (
        <p className="inline-note">No rate cards linked yet.</p>
      ) : (
        <ul className="customer-rate-card-list">
          {linkedIds.map((id) => {
            const card = rateCards.find((item) => item.id === id);
            return (
              <li key={id}>
                <label>
                  <input
                    type="radio"
                    name="default-rate-card"
                    checked={defaultRateCardId === id}
                    onChange={() => setDefaultRateCardId(id)}
                  />
                  <span>
                    <strong>{card?.name ?? id}</strong>
                    {card ? ` · ${card.costingBasis}` : ""}
                    {defaultRateCardId === id ? " · default" : ""}
                  </span>
                </label>
                <button type="button" className="button-sm secondary" onClick={() => removeLinkedCard(id)}>
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="form-grid" style={{ padding: 0, gridTemplateColumns: "1fr auto", gap: 10, marginTop: 10 }}>
        <label className="field">
          <span>Add rate card</span>
          <span className="control">
            <select value={addCardId} onChange={(event) => setAddCardId(event.target.value)}>
              <option value="">Select a rate card…</option>
              {availableToAdd.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name}
                  {card.isActive ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </span>
        </label>
        <div style={{ alignSelf: "end" }}>
          <button type="button" className="secondary" onClick={addLinkedCard} disabled={!addCardId}>
            Add
          </button>
        </div>
      </div>

      <h3 style={{ margin: "22px 0 4px", fontSize: 14 }}>Trading programme</h3>
      <p className="inline-note" style={{ marginBottom: 10 }}>
        Applied as a percentage of invoice value (plus a per-unit freight allowance). For an existing
        customer, saved terms load automatically; you can also prefill from a linked or org rate card.
      </p>
      <div className="form-grid" style={{ padding: 0, gridTemplateColumns: "1fr auto", gap: 10, marginBottom: 14 }}>
        <label className="field">
          <span>Prefill trading terms from rate card</span>
          <span className="control">
            <select value={prefillCardId} onChange={(event) => setPrefillCardId(event.target.value)}>
              <option value="">Select a rate card…</option>
              {(linkedIds.length > 0 ? rateCards.filter((card) => linkedIds.includes(card.id)) : rateCards).map(
                (card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ),
              )}
            </select>
          </span>
        </label>
        <div style={{ alignSelf: "end" }}>
          <button type="button" className="secondary" onClick={prefillTradingTermsFromCard} disabled={!prefillCardId}>
            Prefill terms
          </button>
        </div>
      </div>
      <div className="form-grid" style={{ padding: 0, gridTemplateColumns: "1fr 1fr 1fr", gap: "16px 18px" }}>
        <RateInput label="Volume / growth rebate" value={form.tradingTerms.rebateRate} onChange={(v) => setTerm("rebateRate", v)} />
        <RateInput label="Co-op marketing" value={form.tradingTerms.coopMarketingRate} onChange={(v) => setTerm("coopMarketingRate", v)} />
        <RateInput label="Settlement discount" value={form.tradingTerms.settlementDiscountRate} onChange={(v) => setTerm("settlementDiscountRate", v)} />
        <RateInput label="Returns allowance" value={form.tradingTerms.returnsAllowanceRate} onChange={(v) => setTerm("returnsAllowanceRate", v)} />
        <RateInput label="Warranty allowance" value={form.tradingTerms.warrantyRate} onChange={(v) => setTerm("warrantyRate", v)} />
        <RateInput label="Sales commission" value={form.tradingTerms.commissionRate} onChange={(v) => setTerm("commissionRate", v)} />
        <NumberInput
          label="Freight allowance / unit"
          prefix="A$"
          value={form.tradingTerms.freightAllowanceUnitAud}
          onChange={(v) => setTerm("freightAllowanceUnitAud", v)}
        />
      </div>

      <h3 style={{ margin: "22px 0 4px", fontSize: 14 }}>Supply & account rates</h3>
      <p className="inline-note" style={{ marginBottom: 14 }}>
        How this account is supplied, plus any freight, e-waste or margin buffer specific to them. Freight
        override of 0 uses the rate-card standard.
      </p>
      <div className="form-grid" style={{ padding: 0, gridTemplateColumns: "1fr 1fr 1fr", gap: "16px 18px" }}>
        <label className="field">
          <span>Default costing basis</span>
          <span className="control">
            <select
              value={form.defaultCostingBasis}
              onChange={(event) => setForm((prev) => ({ ...prev, defaultCostingBasis: event.target.value as CostingBasis }))}
            >
              <option value="FIW">FIW — into warehouse</option>
              <option value="FOB">FOB — at port</option>
            </select>
          </span>
        </label>
        <label className="field">
          <span>Freight model</span>
          <span className="control">
            <select
              value={form.freightModel}
              onChange={(event) => setForm((prev) => ({ ...prev, freightModel: event.target.value as FreightModel }))}
            >
              {(Object.keys(FREIGHT_MODEL_LABEL) as FreightModel[]).map((model) => (
                <option key={model} value={model}>{FREIGHT_MODEL_LABEL[model]}</option>
              ))}
            </select>
          </span>
        </label>
        <NumberInput label="Freight / container override" prefix="A$" value={form.freightPerContainerAud} onChange={(v) => setForm((prev) => ({ ...prev, freightPerContainerAud: v }))} />
        {form.freightModel === "distribution" && (
          <NumberInput label="Distribution cost / unit" prefix="A$" value={form.distributionCostUnitAud} onChange={(v) => setForm((prev) => ({ ...prev, distributionCostUnitAud: v }))} />
        )}
        <NumberInput label="E-waste levy / unit" prefix="A$" value={form.ewasteFeeUnitAud} onChange={(v) => setForm((prev) => ({ ...prev, ewasteFeeUnitAud: v }))} />
        <RateInput label="Management buffer" value={form.costBufferRate} onChange={(v) => setForm((prev) => ({ ...prev, costBufferRate: v }))} />
      </div>

      {error && <p className="auth-message" style={{ marginTop: 16 }}>{error}</p>}
      <div className="form-actions" style={{ marginTop: 20 }}>
        <button className="secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save customer"}</button>
      </div>
    </Modal>
  );
}
