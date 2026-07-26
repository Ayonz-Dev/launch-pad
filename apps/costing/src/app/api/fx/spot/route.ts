import { NextResponse } from "next/server";
import type { SpotBundle, SpotQuote } from "@/lib/fx";
import { audPerUnitFromUsdCross } from "@/lib/fx";

export const dynamic = "force-dynamic";

const DEFAULT_CODES = ["USD", "CNY", "EUR", "GBP", "NZD", "HKD", "VND", "INR"];

/**
 * Live USD-base spot rates (AUD per unit + units per USD).
 * Source: open.er-api.com (USD base, no API key).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const codes = (url.searchParams.get("codes") ?? DEFAULT_CODES.join(","))
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
  const unique = [...new Set(["USD", ...codes])];

  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate: 0 } });
    if (!response.ok) {
      return NextResponse.json({ error: `FX provider returned ${response.status}` }, { status: 502 });
    }

    const payload = (await response.json()) as {
      result?: string;
      time_last_update_utc?: string;
      rates?: Record<string, number>;
    };
    if (payload.result && payload.result !== "success") {
      return NextResponse.json({ error: "FX provider reported failure." }, { status: 502 });
    }
    const rates = payload.rates ?? {};
    const audPerUsd = Number(rates.AUD);
    if (!(audPerUsd > 0)) {
      return NextResponse.json({ error: "FX provider did not return AUD." }, { status: 502 });
    }

    const fetchedAt = payload.time_last_update_utc
      ? new Date(payload.time_last_update_utc).toISOString()
      : new Date().toISOString();

    const quotes: SpotQuote[] = unique.map((code) => {
      if (code === "USD") {
        return { code, audPerUnit: audPerUsd, unitsPerUsd: 1 };
      }
      const foreignPerUsd = Number(rates[code]);
      if (!(foreignPerUsd > 0)) {
        return { code, audPerUnit: 0, unitsPerUsd: 0 };
      }
      return {
        code,
        audPerUnit: audPerUnitFromUsdCross(audPerUsd, foreignPerUsd),
        unitsPerUsd: foreignPerUsd,
      };
    });

    const body: SpotBundle = {
      base: "USD",
      audPerUsd,
      fetchedAt,
      quotes,
    };
    return NextResponse.json(body);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Could not fetch spot rates.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
