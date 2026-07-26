// The daily Australia report carries a retailer in an unnamed column next to
// Sales (values like "BIG W", "OFFICEWORK", "JB", "COLES", "AUS POST"). We map
// the recognised ones to a canonical name so the shipment can be linked to a
// retailer; anything unrecognised (e.g. "14 DAYS", "FOC") is kept verbatim as a
// line note instead of being forced into the retailer field.

interface RetailerRule {
  canonical: string;
  // Matched against the normalised (upper, alnum-collapsed) cell value.
  patterns: string[];
}

const RETAILERS: RetailerRule[] = [
  { canonical: "Big W", patterns: ["BIGW"] },
  { canonical: "Officeworks", patterns: ["OFFICEWORK", "OFFICEWORKS"] },
  { canonical: "JB Hi-Fi", patterns: ["JB", "JBHIFI", "JBHIFI"] },
  { canonical: "Coles", patterns: ["COLES"] },
  { canonical: "Woolworths", patterns: ["WOOLWORTHS", "WOOLIES", "WOW"] },
  { canonical: "Australia Post", patterns: ["AUSPOST", "AUSTRALIAPOST"] },
  { canonical: "Kmart", patterns: ["KMART"] },
  { canonical: "Target", patterns: ["TARGET"] },
  { canonical: "Bunnings", patterns: ["BUNNINGS"] },
  { canonical: "Amazon", patterns: ["AMAZON"] },
  { canonical: "Harvey Norman", patterns: ["HARVEYNORMAN", "HN"] },
  { canonical: "The Good Guys", patterns: ["GOODGUYS", "THEGOODGUYS"] },
  { canonical: "Myer", patterns: ["MYER"] },
  { canonical: "Aldi", patterns: ["ALDI"] },
  { canonical: "Costco", patterns: ["COSTCO"] },
  { canonical: "Catch", patterns: ["CATCH"] },
  { canonical: "Kogan", patterns: ["KOGAN"] },
  { canonical: "Spotlight", patterns: ["SPOTLIGHT"] },
  { canonical: "Chemist Warehouse", patterns: ["CHEMISTWAREHOUSE"] },
];

function normalise(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Returns the canonical retailer name if the cell value names a known retailer,
 * otherwise null (so the caller can keep the raw text as a note).
 */
export function matchRetailer(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const key = normalise(value);
  if (!key) return null;
  for (const rule of RETAILERS) {
    if (rule.patterns.some((p) => key === p)) return rule.canonical;
  }
  return null;
}
