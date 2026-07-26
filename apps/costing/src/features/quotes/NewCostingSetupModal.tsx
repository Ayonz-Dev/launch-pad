"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import type { CustomerRecord } from "@/features/customers/repository";
import {
  listCustomerRateCardLinks,
  type RateCardRecord,
} from "@/features/rate-cards/repository";

export function NewCostingSetupModal({
  customers,
  rateCards,
  initialCustomerId = "",
  onConfirm,
}: {
  customers: CustomerRecord[];
  rateCards: RateCardRecord[];
  initialCustomerId?: string;
  onConfirm: (selection: { customerId: string; rateCardId: string }) => void;
}) {
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [rateCardId, setRateCardId] = useState("");
  const [linkedIds, setLinkedIds] = useState<string[] | null>(null);
  const [defaultLinkedId, setDefaultLinkedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCustomerId(initialCustomerId);
  }, [initialCustomerId]);

  useEffect(() => {
    if (!customerId) {
      setLinkedIds(null);
      setDefaultLinkedId(null);
      return;
    }
    let cancelled = false;
    listCustomerRateCardLinks(customerId)
      .then((links) => {
        if (cancelled) return;
        const ids = links.map((link) => link.rateCardId);
        const preferred = links.find((link) => link.isDefault)?.rateCardId ?? ids[0] ?? null;
        setLinkedIds(ids);
        setDefaultLinkedId(preferred);
        setRateCardId((current) => {
          if (current && ids.includes(current)) return current;
          return preferred ?? "";
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLinkedIds([]);
          setDefaultLinkedId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const offeredCards = useMemo(() => {
    if (customerId && linkedIds && linkedIds.length > 0) {
      return rateCards.filter((card) => linkedIds.includes(card.id));
    }
    return rateCards.filter((card) => card.isActive).concat(rateCards.filter((card) => !card.isActive));
  }, [customerId, linkedIds, rateCards]);

  useEffect(() => {
    if (!rateCardId && defaultLinkedId) setRateCardId(defaultLinkedId);
    else if (!rateCardId && offeredCards[0]) setRateCardId(offeredCards[0].id);
  }, [offeredCards, defaultLinkedId, rateCardId]);

  function submit() {
    if (!rateCardId) {
      setError("Select a rate card to continue.");
      return;
    }
    setError(null);
    onConfirm({ customerId, rateCardId });
  }

  return (
    <Modal title="Start new costing" onClose={() => undefined} dismissible={false}>
      <p className="inline-note" style={{ marginTop: 0, marginBottom: 16 }}>
        Optionally pick a customer, then choose the rate card for this costing. A rate card is required.
      </p>
      <label className="field">
        <span>Customer <small style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</small></span>
        <span className="control">
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">No customer — enter later</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
                {customer.customerCode ? ` (${customer.customerCode})` : ""}
              </option>
            ))}
          </select>
        </span>
      </label>
      <label className="field" style={{ marginTop: 12 }}>
        <span>Rate card</span>
        <span className="control">
          <select value={rateCardId} onChange={(event) => setRateCardId(event.target.value)}>
            <option value="">Select a rate card…</option>
            {offeredCards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
                {card.costingBasis ? ` · ${card.costingBasis}` : ""}
                {card.isActive ? "" : " (inactive)"}
                {defaultLinkedId === card.id ? " · default" : ""}
              </option>
            ))}
          </select>
        </span>
      </label>
      {customerId && linkedIds && linkedIds.length === 0 && (
        <p className="inline-note" style={{ marginTop: 8 }}>
          This customer has no linked rate cards — showing all organisation rate cards.
        </p>
      )}
      {error && <p className="auth-message" style={{ marginTop: 12 }}>{error}</p>}
      <div className="form-actions" style={{ marginTop: 20 }}>
        <button type="button" onClick={submit}>
          Continue
        </button>
      </div>
    </Modal>
  );
}
