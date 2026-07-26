import { describe, it, expect } from 'vitest';
import { parseBankCommentary, rangesToBandPoints } from './parse';

// The real AUD FX macro commentary the tool is built to ingest, trimmed to the
// paragraphs that carry the numbers plus enough noise to catch false positives.
const COMMENTARY = `AUD FX Macro Strategy Comment

Everything in the G10 bent to a broadening USD bid overnight except AUD, which held > 0.7000, making it an outlier. 40yr lows in JPY (USD/JPY 163+), a GBP breakdown around UK jobs data. AUD sat it out (O/N high 0.7027) before settling back towards 0.7000.

1-3wks: Range 0.6865-0.7100.  We stick with what we know: AUD continues to quietly burrow higher. Support at 0.6950-65 remain robust and then in the 0,68s there is a confluence of support. Local June jobs Thu (consensus +15k, U-rate 4.4%).

3-12wks: Range 0.6830-0.7150. The configuration remains slanted in AUD's favour. Fed hike pricing (~48bp to Mar-27) still looks too aggressive and RBA easing risk priced from Feb-2027 is overdone.

12wks+: 0.7250-0.7300 in H2, unchanged. Structural AUD positives remain intact but deferred in timing.`;

const AS_OF = '2026-07-15';

describe('parseBankCommentary', () => {
  it('extracts exactly the three horizon ranges, ignoring stray numbers', () => {
    const parsed = parseBankCommentary(COMMENTARY, 'AUD/USD', AS_OF);
    expect(parsed.pair).toBe('AUD/USD');
    expect(parsed.ranges).toHaveLength(3);
    expect(parsed.ranges.map((r) => r.horizonLabel)).toEqual([
      '1-3wks',
      '3-12wks',
      '12wks+',
    ]);
  });

  it('reads the low and high off each horizon correctly', () => {
    const { ranges } = parseBankCommentary(COMMENTARY, 'AUD/USD', AS_OF);
    expect(ranges[0]).toMatchObject({ low: 0.6865, high: 0.71 });
    expect(ranges[1]).toMatchObject({ low: 0.683, high: 0.715 });
    expect(ranges[2]).toMatchObject({ low: 0.725, high: 0.73 });
  });

  it('computes the midpoint of each range', () => {
    const { ranges } = parseBankCommentary(COMMENTARY, 'AUD/USD', AS_OF);
    expect(ranges[0]!.mid).toBeCloseTo(0.69825, 6);
    expect(ranges[1]!.mid).toBeCloseTo(0.699, 6);
    expect(ranges[2]!.mid).toBeCloseTo(0.7275, 6);
  });

  it('does not pick up the "0.6950-65" support level or "Mar-27" date', () => {
    const { ranges } = parseBankCommentary(COMMENTARY, 'AUD/USD', AS_OF);
    // Only the three clean ranges survive; no 0.6950-based or date-based rows.
    for (const r of ranges) {
      expect(r.low).toBeGreaterThan(0.68);
      expect(r.high).toBeLessThan(0.74);
    }
  });

  it('anchors horizons to calendar dates from the as-of date', () => {
    const { ranges } = parseBankCommentary(COMMENTARY, 'AUD/USD', AS_OF);
    // 1-3wks: one week to three weeks past 2026-07-15.
    expect(ranges[0]!.startDate).toBe('2026-07-22');
    expect(ranges[0]!.endDate).toBe('2026-08-05');
    // 3-12wks.
    expect(ranges[1]!.startDate).toBe('2026-08-05');
    expect(ranges[1]!.endDate).toBe('2026-10-07');
    // 12wks+ is open-ended: end defaults to 12 weeks past its start.
    expect(ranges[2]!.openEnded).toBe(true);
    expect(ranges[2]!.startDate).toBe('2026-10-07');
    expect(ranges[2]!.endWeeks).toBe(24);
  });

  it('returns nothing for text with no recognisable ranges', () => {
    const parsed = parseBankCommentary('No numbers of interest here.', 'AUD/USD', AS_OF);
    expect(parsed.ranges).toEqual([]);
  });

  it('handles an en-dash range and a reversed low/high', () => {
    const parsed = parseBankCommentary('2-4wks: 0.7100–0.6900', 'AUD/USD', AS_OF);
    expect(parsed.ranges).toHaveLength(1);
    expect(parsed.ranges[0]).toMatchObject({ low: 0.69, high: 0.71 });
  });
});

describe('rangesToBandPoints', () => {
  it('emits a start and end point per horizon carrying low/high/mid', () => {
    const { ranges } = parseBankCommentary(COMMENTARY, 'AUD/USD', AS_OF);
    const pts = rangesToBandPoints(ranges);
    // Three horizons, two points each.
    expect(pts).toHaveLength(6);
    expect(pts[0]).toMatchObject({ date: '2026-07-22', low: 0.6865, high: 0.71 });
    expect(pts[0]!.mid).toBeCloseTo(0.69825, 6);
  });
});
