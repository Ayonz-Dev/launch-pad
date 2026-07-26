// Parse a bank's FX macro commentary (pasted from email) into structured
// forecast ranges the chart can plot.
//
// Banks rarely give point forecasts; they give a range over a horizon, e.g.
//
//   1-3wks: Range 0.6865-0.7100.
//   3-12wks: Range 0.6830-0.7150.
//   12wks+: 0.7250-0.7300 in H2.
//
// This is a pure, dependency-free unit. It reads the horizon and the low/high
// off each line and anchors them to calendar dates from an as-of date (the
// email date). It never reaches a database or a component; the app persists and
// draws the result. Rates are treated as strings until the boundary so we never
// lose the numeric(12,6) precision the rest of the app keeps.

export interface BankForecastRange {
  /** Reconstructed horizon label, e.g. "1-3wks" or "12wks+". */
  horizonLabel: string;
  /** Weeks from the as-of date to the start of the horizon. */
  startWeeks: number;
  /** Weeks from the as-of date to the end of the horizon. */
  endWeeks: number;
  /** True when the horizon is open-ended ("12wks+"), so endWeeks is a nominal cap. */
  openEnded: boolean;
  /** ISO date at the start of the horizon. */
  startDate: string;
  /** ISO date at the end of the horizon. */
  endDate: string;
  low: number;
  high: number;
  /** Midpoint of the range, the central line drawn for the band. */
  mid: number;
}

export interface ParsedBankForecast {
  pair: string;
  asOf: string;
  ranges: BankForecastRange[];
}

export interface ParseOptions {
  /** Weeks to extend an open-ended ("Nwks+") horizon past its start. Default 12. */
  openEndedSpanWeeks?: number;
}

const MS_PER_WEEK = 7 * 86_400_000;

// Horizon descriptor then the first low-high decimal pair on the same span.
// [^0-9] between the two keeps the match inside one horizon: it stops at the
// first digit, which is the low rate, so a stray "0.6950-65" or "Mar-27" later
// in the paragraph cannot be picked up. Rates need a decimal point and 3-4
// fractional digits, which excludes basis points, dates and round levels.
const RANGE_RE =
  /(\d+)\s*(?:[-–—]\s*(\d+))?\s*wk?s?\s*(\+)?[^0-9]{0,40}?(\d?\.\d{3,4})\s*[-–—]\s*(\d?\.\d{3,4})/gi;

function parseIsoUtc(date: string): number {
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
}

function addWeeksIso(baseMs: number, weeks: number): string {
  return new Date(baseMs + weeks * MS_PER_WEEK).toISOString().slice(0, 10);
}

/**
 * Extract forecast ranges from pasted commentary. Returns them sorted by start
 * horizon, de-duplicated by horizon label (first mention wins). An unparseable
 * paste yields an empty ranges array rather than throwing, so the UI can show
 * "nothing recognised" instead of an error.
 */
export function parseBankCommentary(
  text: string,
  pair: string,
  asOf: string,
  options: ParseOptions = {},
): ParsedBankForecast {
  const openSpan = options.openEndedSpanWeeks ?? 12;
  const asOfMs = parseIsoUtc(asOf);
  const seen = new Set<string>();
  const ranges: BankForecastRange[] = [];

  if (Number.isNaN(asOfMs)) {
    return { pair, asOf, ranges };
  }

  RANGE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RANGE_RE.exec(text)) !== null) {
    const first = Number(match[1]);
    const second = match[2] != null ? Number(match[2]) : null;
    const plus = match[3] === '+';
    const low = Number(match[4]);
    const high = Number(match[5]);

    if (!Number.isFinite(low) || !Number.isFinite(high)) continue;

    let startWeeks: number;
    let endWeeks: number;
    let openEnded = false;
    let horizonLabel: string;

    if (second != null) {
      startWeeks = first;
      endWeeks = second;
      horizonLabel = `${first}-${second}wks`;
    } else if (plus) {
      startWeeks = first;
      endWeeks = first + openSpan;
      openEnded = true;
      horizonLabel = `${first}wks+`;
    } else {
      startWeeks = first;
      endWeeks = first;
      horizonLabel = `${first}wks`;
    }

    if (seen.has(horizonLabel)) continue;
    seen.add(horizonLabel);

    // Normalise a reversed range so low is always the lower bound.
    const lo = Math.min(low, high);
    const hi = Math.max(low, high);

    ranges.push({
      horizonLabel,
      startWeeks,
      endWeeks,
      openEnded,
      startDate: addWeeksIso(asOfMs, startWeeks),
      endDate: addWeeksIso(asOfMs, endWeeks),
      low: lo,
      high: hi,
      mid: Number(((lo + hi) / 2).toFixed(6)),
    });
  }

  ranges.sort((a, b) => a.startWeeks - b.startWeeks || a.endWeeks - b.endWeeks);
  return { pair, asOf, ranges };
}

/** A dated band point: [lower, upper] plus the midpoint, for the chart. */
export interface BankBandPoint {
  date: string;
  low: number;
  high: number;
  mid: number;
}

/** The minimal fields needed to plot a range: works for parsed or stored rows. */
export type BandableRange = Pick<
  BankForecastRange,
  'startDate' | 'endDate' | 'low' | 'high' | 'mid'
>;

/**
 * Flatten ranges into dated band points for plotting. Each horizon becomes a
 * flat segment: a point at its start date and one at its end date, both carrying
 * the same low/high/mid, so the band reads as a step per horizon. Accepts either
 * freshly parsed ranges or rows loaded from the database.
 */
export function rangesToBandPoints(ranges: BandableRange[]): BankBandPoint[] {
  const points: BankBandPoint[] = [];
  for (const r of ranges) {
    points.push({ date: r.startDate, low: r.low, high: r.high, mid: r.mid });
    if (r.endDate !== r.startDate) {
      points.push({ date: r.endDate, low: r.low, high: r.high, mid: r.mid });
    }
  }
  return points;
}
