"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { EmptyState, RequireOrg, Workspace } from "@/components/PageShell";
import { getQuote, setQuoteOfferContacts, type QuoteDetail } from "@/features/quotes/repository";
import { contactLabel, listContacts, type ContactRecord } from "@/features/contacts/repository";
import { findCustomerContactByName } from "@/features/customers/repository";
import { getPrimaryImageUrl } from "@/features/products/repository";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";

export default function OfferSheetPage() {
  return (
    <Workspace>
      <RequireOrg>
        <OfferView />
      </RequireOrg>
    </Workspace>
  );
}

function OfferView() {
  const params = useParams<{ id: string }>();
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [customers, setCustomers] = useState<ContactRecord[]>([]);
  const [reps, setReps] = useState<ContactRecord[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [repId, setRepId] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState("");

  const load = useCallback(async () => {
    try {
      const detail = await getQuote(params.id);
      if (!detail) {
        setState("missing");
        return;
      }
      const [customerContacts, repContacts, primaryUrl] = await Promise.all([
        listContacts("customer"),
        listContacts("representative"),
        getPrimaryImageUrl(detail.sku).catch(() => null),
      ]);
      // Default the customer contact to the quote's saved choice, else the
      // address-book contact linked to the customer of the same name.
      let defaultCustomerId = detail.customerContactId ?? "";
      if (!defaultCustomerId && detail.customerName) {
        defaultCustomerId = (await findCustomerContactByName(detail.customerName).catch(() => null)) ?? "";
      }

      setQuote(detail);
      setCustomers(customerContacts);
      setReps(repContacts);
      setImageUrl(primaryUrl);
      setCustomerId(defaultCustomerId);
      setRepId(detail.representativeContactId ?? repContacts.find((c) => c.isDefault)?.id ?? "");
      setState("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the offer sheet.");
      setState("error");
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function persist(nextCustomerId: string, nextRepId: string) {
    if (!quote) return;
    setSaveState("Saving…");
    try {
      await setQuoteOfferContacts(quote.id, nextCustomerId || null, nextRepId || null);
      setSaveState("Saved");
    } catch {
      setSaveState("Couldn't save selection");
    }
  }

  if (state === "loading") return <EmptyState icon="⏳" title="Loading offer sheet…" />;
  if (state === "missing")
    return (
      <EmptyState icon="🔍" title="Quote not found" action={<Link className="button-link" href="/quotes">Back to quotes</Link>} />
    );
  if (state === "error" || !quote) return <EmptyState icon="⚠️" title="Could not load the offer sheet">{error}</EmptyState>;

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const rep = reps.find((c) => c.id === repId) ?? null;
  const { inputs, result } = quote;

  return (
    <>
      <div className="offer-controls no-print">
        <Link className="button-link secondary" href={`/quotes/${quote.id}`}>← Back to quote</Link>
        <label className="offer-select">
          <span>Customer</span>
          <select
            value={customerId}
            onChange={(event) => {
              setCustomerId(event.target.value);
              void persist(event.target.value, repId);
            }}
          >
            <option value="">— none —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{contactLabel(c)}</option>
            ))}
          </select>
        </label>
        <label className="offer-select">
          <span>Representative</span>
          <select
            value={repId}
            onChange={(event) => {
              setRepId(event.target.value);
              void persist(customerId, event.target.value);
            }}
          >
            <option value="">— none —</option>
            {reps.map((c) => (
              <option key={c.id} value={c.id}>{contactLabel(c)}</option>
            ))}
          </select>
        </label>
        {saveState && <span className="inline-note">{saveState}</span>}
        <button onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      {customers.length === 0 && (
        <p className="inline-note no-print" style={{ padding: "0 34px" }}>
          Tip: add customer and representative contacts under <Link href="/contacts">Contacts</Link> to address this offer.
        </p>
      )}

      <article className="offer-sheet">
        <header className="offer-head">
          <div className="offer-brand">
            <div className="offer-logo">A</div>
            <div>
              <b>AYONZ</b>
              <span>Product Offer</span>
            </div>
          </div>
          <div className="offer-rep">
            {rep ? (
              <>
                <b>{rep.personName ?? rep.companyName}</b>
                {rep.jobTitle && <span>{rep.jobTitle}</span>}
                {rep.email && <span>{rep.email}</span>}
                {rep.phone && <span>{rep.phone}</span>}
              </>
            ) : (
              <span className="muted">Select a representative</span>
            )}
          </div>
        </header>

        <div className="offer-meta">
          <div>
            <span className="offer-label">Offer reference</span>
            <b>{quote.quoteNumber}</b>
          </div>
          <div>
            <span className="offer-label">Date</span>
            <b>{formatDate(quote.updatedAt)}</b>
          </div>
          <div>
            <span className="offer-label">Prepared for</span>
            <b>{customer ? contactLabel(customer) : quote.customerName ?? "—"}</b>
            {customer?.personName && customer?.companyName && <div className="muted">{customer.personName}</div>}
            {customer?.address && <div className="muted">{customer.address}</div>}
            {customer?.email && <div className="muted">{customer.email}</div>}
          </div>
        </div>

        <section className="offer-product">
          <div className="offer-image">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={inputs.description || quote.sku} />
            ) : (
              <div className="offer-image-empty">No product image</div>
            )}
          </div>
          <div className="offer-product-details">
            <h1>{inputs.description || quote.sku}</h1>
            <p className="offer-brand-line">{inputs.brand}</p>
            <table className="offer-spec">
              <tbody>
                <tr><th>SKU</th><td>{quote.sku}</td></tr>
                <tr><th>Brand</th><td>{inputs.brand || "—"}</td></tr>
                <tr><th>Order quantity</th><td>{inputs.orderQuantity.toLocaleString("en-AU")} units</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="offer-pricing">
          <h2>Commercial offer</h2>
          <div className="offer-price-grid">
            <div className="offer-price">
              <span>Wholesale price (ex GST)</span>
              <strong>{formatMoney(inputs.sellExGstAud)}</strong>
              <small>per unit</small>
            </div>
            <div className="offer-price">
              <span>Recommended retail (inc GST)</span>
              <strong>{formatMoney(inputs.rrpIncGstAud)}</strong>
              <small>{formatMoney(result.rrpExGstAud)} ex GST</small>
            </div>
            <div className="offer-price highlight">
              <span>Retailer margin</span>
              <strong>{formatPercent(result.retailerMarginRate)}</strong>
              <small>at RRP</small>
            </div>
          </div>
        </section>

        <footer className="offer-foot">
          <p>
            This offer is indicative and subject to written confirmation. Prices are in AUD and exclude GST unless
            stated. Freight and trading terms apply per your account agreement.
          </p>
        </footer>
      </article>
    </>
  );
}
