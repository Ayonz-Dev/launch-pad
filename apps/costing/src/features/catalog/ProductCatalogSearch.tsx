"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CatalogProductHit } from "@/lib/catalog/types";
import { catalogToInputs, searchCatalog } from "./repository";
import type { CostingInputs } from "@/lib/costing";
import { useSession } from "@/components/SessionProvider";

export function ProductCatalogSearch({
  onSelect,
}: {
  onSelect: (patch: Partial<CostingInputs>, hit: CatalogProductHit) => void;
}) {
  const session = useSession();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CatalogProductHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const canSearch = session.status === "authenticated" && query.trim().length >= 2;

  useEffect(() => {
    if (!canSearch) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      searchCatalog(query.trim())
        .then((rows) => {
          if (cancelled) return;
          setHits(rows);
          setOpen(true);
          setActiveIndex(rows.length ? 0 : -1);
          setError(null);
        })
        .catch((cause) => {
          if (cancelled) return;
          setHits([]);
          setOpen(false);
          setError(cause instanceof Error ? cause.message : "Search failed.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [canSearch, query]);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, []);

  function choose(hit: CatalogProductHit) {
    onSelect(catalogToInputs(hit), hit);
    setQuery(hit.model || hit.agl || hit.productName);
    setOpen(false);
  }

  if (session.status !== "authenticated") {
    return (
      <p className="inline-note">
        Sign in to search the synchronized Monday product catalogue.
      </p>
    );
  }

  return (
    <div className="catalog-search" ref={rootRef}>
      <label className="field">
        <span>Search product catalogue</span>
        <span className="control">
          <input
            value={query}
            placeholder="AGL, model, product name, brand or factory"
            role="combobox"
            aria-expanded={open && canSearch}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
            }
            onChange={(event) => {
              setQuery(event.target.value);
              if (event.target.value.trim().length < 2) {
                setOpen(false);
                setHits([]);
                setError(null);
              }
            }}
            onFocus={() => hits.length > 0 && canSearch && setOpen(true)}
            onKeyDown={(event) => {
              if (!open || hits.length === 0) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => (index + 1) % hits.length);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => (index <= 0 ? hits.length - 1 : index - 1));
              } else if (event.key === "Enter" && activeIndex >= 0) {
                event.preventDefault();
                choose(hits[activeIndex]);
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
          />
        </span>
      </label>
      {loading && <p className="inline-note">Searching catalogue…</p>}
      {error && (
        <p className="inline-note" style={{ color: "var(--red)" }}>
          {error}
        </p>
      )}
      {open && canSearch && (
        <ul className="catalog-results" id={listId} role="listbox">
          {hits.length === 0 ? (
            <li className="catalog-empty">No catalogue matches.</li>
          ) : (
            hits.map((hit, index) => (
              <li key={hit.id}>
                <button
                  type="button"
                  id={`${listId}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={index === activeIndex ? "active" : ""}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(hit)}
                >
                  <strong>{hit.productName}</strong>
                  <span>
                    {[hit.agl, hit.model || hit.sku, hit.brand, hit.factoryName]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {hit.hasPurchaseOrder && <em>PO on file</em>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
