'use client';

import { useState, useTransition } from 'react';
import { parseBankCommentary, type BankForecastRange } from '../lib/bankForecast';
import { saveBankForecast, type SaveResult } from '../app/bank-forecast/actions';

const PAIRS = ['AUD/USD', 'EUR/USD', 'GBP/USD'];

export interface BankForecastFormProps {
  /** ISO date pre-filled as the email's as-of date. */
  defaultAsOf: string;
  /** Whether the server can persist (Supabase configured). */
  canSave: boolean;
}

/**
 * Paste bank commentary, parse the horizon ranges client-side (the parser is a
 * pure lib, so it runs in the browser with no round-trip), review and tweak the
 * result, then save it to Supabase via a server action. Editing a rate here
 * overrides what the parser read, so a garbled paste can still be corrected.
 */
export function BankForecastForm({ defaultAsOf, canSave }: BankForecastFormProps) {
  const [commentary, setCommentary] = useState('');
  const [pair, setPair] = useState('AUD/USD');
  const [bank, setBank] = useState('');
  const [asOf, setAsOf] = useState(defaultAsOf);
  const [ranges, setRanges] = useState<BankForecastRange[]>([]);
  const [parsed, setParsed] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [pending, startTransition] = useTransition();

  function onParse() {
    const p = parseBankCommentary(commentary, pair, asOf);
    setRanges(p.ranges);
    setParsed(true);
    setResult(null);
  }

  function updateRange(index: number, patch: Partial<BankForecastRange>) {
    setRanges((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRange(index: number) {
    setRanges((prev) => prev.filter((_, i) => i !== index));
  }

  function onSave() {
    startTransition(async () => {
      const res = await saveBankForecast({
        pair,
        bank,
        asOf,
        commentary,
        ranges: ranges.map((r) => ({
          horizonLabel: r.horizonLabel,
          startDate: r.startDate,
          endDate: r.endDate,
          low: r.low,
          high: r.high,
        })),
      });
      setResult(res);
    });
  }

  return (
    <div className="form-stack">
      <div className="field-row">
        <label className="field">
          <span>Currency pair</span>
          <select value={pair} onChange={(e) => setPair(e.target.value)}>
            {PAIRS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Bank</span>
          <input
            type="text"
            placeholder="e.g. NAB, Westpac"
            value={bank}
            onChange={(e) => setBank(e.target.value)}
          />
        </label>
        <label className="field">
          <span>As-of date (email date)</span>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </label>
      </div>

      <label className="field">
        <span>Paste the bank commentary</span>
        <textarea
          rows={10}
          placeholder="Paste the FX macro comment here, including lines like&#10;1-3wks: Range 0.6865-0.7100&#10;3-12wks: Range 0.6830-0.7150&#10;12wks+: 0.7250-0.7300 in H2"
          value={commentary}
          onChange={(e) => setCommentary(e.target.value)}
        />
      </label>

      <div className="field-row">
        <button type="button" className="btn" onClick={onParse} disabled={!commentary.trim()}>
          Parse ranges
        </button>
      </div>

      {parsed && ranges.length === 0 ? (
        <p className="notice">
          No forecast ranges recognised. The parser looks for lines like{' '}
          <code>1-3wks: 0.6865-0.7100</code> or <code>12wks+: 0.7250-0.7300</code>.
        </p>
      ) : null}

      {ranges.length > 0 ? (
        <>
          <div className="table-scroll">
            <table className="coverage-table">
              <thead>
                <tr>
                  <th>Horizon</th>
                  <th>Start</th>
                  <th>End</th>
                  <th className="num">Low</th>
                  <th className="num">High</th>
                  <th className="num">Mid</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ranges.map((r, i) => (
                  <tr key={`${r.horizonLabel}-${i}`}>
                    <td>{r.horizonLabel}</td>
                    <td>
                      <input
                        type="date"
                        value={r.startDate}
                        onChange={(e) => updateRange(i, { startDate: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        value={r.endDate}
                        onChange={(e) => updateRange(i, { endDate: e.target.value })}
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        step={0.0001}
                        value={r.low}
                        onChange={(e) => updateRange(i, { low: Number(e.target.value) })}
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        step={0.0001}
                        value={r.high}
                        onChange={(e) => updateRange(i, { high: Number(e.target.value) })}
                      />
                    </td>
                    <td className="num">{((r.low + r.high) / 2).toFixed(4)}</td>
                    <td className="num">
                      <button type="button" className="link-button" onClick={() => removeRange(i)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="field-row">
            <button type="button" className="btn" onClick={onSave} disabled={!canSave || pending}>
              {pending ? 'Saving…' : 'Save forecast'}
            </button>
            {!canSave ? (
              <span className="kpi-sub">Supabase is not configured, so saving is disabled.</span>
            ) : null}
          </div>
        </>
      ) : null}

      {result ? (
        <p className="notice">
          {result.ok
            ? `Saved ${result.savedCount} range(s) for ${pair}. The chart band will refresh.`
            : `Could not save: ${result.error}`}
        </p>
      ) : null}
    </div>
  );
}
