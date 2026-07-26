import type { CoverageRow } from '../lib/coverage/types';
import { formatMonth, formatPercent, formatRate, formatUsd } from '../lib/format';

export interface CoveragePairTableProps {
  rows: CoverageRow[];
}

/**
 * Per month, per pair coverage. Blended forward rate is a per-pair figure, so
 * it lives here rather than in the rolled-up KPI cards where it cannot be summed.
 */
export function CoveragePairTable({ rows }: CoveragePairTableProps) {
  if (rows.length === 0) {
    return <p className="empty">No coverage rows for this scenario yet.</p>;
  }
  return (
    <div className="table-scroll">
      <table className="coverage-table">
        <thead>
          <tr>
            <th>Month</th>
            <th>Pair</th>
            <th className="num">Gross payable</th>
            <th className="num">Hedged buy</th>
            <th className="num">Coverage</th>
            <th className="num">Unhedged</th>
            <th className="num">Blended fwd</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.bucket_month}-${row.pair}`}>
              <td>{formatMonth(row.bucket_month)}</td>
              <td>{row.pair}</td>
              <td className="num">{formatUsd(row.gross_payable_usd)}</td>
              <td className="num">{formatUsd(row.hedged_buy_usd)}</td>
              <td className="num">{formatPercent(row.payable_coverage_ratio)}</td>
              <td className="num">{formatUsd(row.unhedged_payable_usd)}</td>
              <td className="num">{formatRate(row.blended_forward_rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
