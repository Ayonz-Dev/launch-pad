'use client';

import { useMemo, useState } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  buildChartModel,
  type ForecastPoint,
  type ForecastBandPoint,
  type BankRangePoint,
  type ForwardPoint,
  type SpotPoint,
} from '../lib/chart/series';
import { formatMonth, formatRate } from '../lib/format';

export interface RateChartProps {
  pair: string;
  spotHistory: SpotPoint[];
  bankForecasts: ForecastPoint[];
  modelForecasts?: ForecastBandPoint[];
  bankRanges?: BankRangePoint[];
  forwards: ForwardPoint[];
  rateBase: number;
  rateQuote: number;
  horizonMonths?: number;
}

// Distinct dash styles encode epistemic status: solid actuals, a clean dash for
// the arbitrage-free IRP line, a sparse dot for the bank opinion, and a dash-dot
// for the manual guess. The bank RANGE (from pasted commentary) is a teal band
// with a midline, kept visually apart from the purple model forecast band.
const STROKE = {
  spot: '#e8edf7',
  irp: '#60a5fa',
  bank: '#fbbf24',
  manual: '#f472b6',
  forecast: '#a78bfa',
  bankRange: '#2dd4bf',
  forward: '#4ade80',
};

export function RateChart({
  pair,
  spotHistory,
  bankForecasts,
  modelForecasts = [],
  bankRanges = [],
  forwards,
  rateBase,
  rateQuote,
  horizonMonths = 12,
}: RateChartProps) {
  const anchorRate =
    spotHistory.length > 0
      ? [...spotHistory].sort((a, b) => a.date.localeCompare(b.date))[spotHistory.length - 1]!.rate
      : 1;

  const [manualEndpointRate, setManualEndpointRate] = useState(anchorRate);

  const model = useMemo(
    () =>
      buildChartModel({
        spotHistory,
        bankForecasts,
        modelForecasts,
        bankRanges,
        forwards,
        rateBase,
        rateQuote,
        manualEndpointRate,
        horizonMonths,
      }),
    [spotHistory, bankForecasts, modelForecasts, bankRanges, forwards, rateBase, rateQuote, manualEndpointRate, horizonMonths],
  );

  const scatterData = useMemo(
    () =>
      model.forwards.map((f) => ({
        t: Date.parse(`${f.date}T00:00:00Z`),
        forward: f.rate,
        orderNumber: f.orderNumber,
      })),
    [model.forwards],
  );

  if (model.rows.length === 0) {
    return <p className="empty">No spot history for {pair} yet.</p>;
  }

  const tickToMonth = (t: number) => formatMonth(new Date(t).toISOString().slice(0, 10));
  // Drive both axes explicitly from every series, so neither the spot history
  // nor a stray high/low point gets clipped by the scatter's own domain.
  const tMin = model.rows[0]!.t;
  const tMax = model.rows[model.rows.length - 1]!.t;

  const ys: number[] = [];
  for (const r of model.rows) {
    for (const v of [r.spot, r.irp, r.bank, r.manual, r.forecast, r.bankMid]) {
      if (v != null) ys.push(v);
    }
    if (r.forecastBand) ys.push(r.forecastBand[0], r.forecastBand[1]);
    if (r.bankBand) ys.push(r.bankBand[0], r.bankBand[1]);
  }
  for (const f of scatterData) ys.push(f.forward);
  const yLow = Math.min(...ys);
  const yHigh = Math.max(...ys);
  const yPad = (yHigh - yLow) * 0.08 || 0.01;
  const yDomain: [number, number] = [yLow - yPad, yHigh + yPad];

  const sliderMin = Number((anchorRate * 0.85).toFixed(4));
  const sliderMax = Number((anchorRate * 1.15).toFixed(4));

  return (
    <div className="rate-chart">
      <div className="rate-chart-controls">
        <label htmlFor="manual-endpoint">
          Manual endpoint ({pair}): <strong>{formatRate(manualEndpointRate)}</strong>
        </label>
        <input
          id="manual-endpoint"
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={0.0001}
          value={manualEndpointRate}
          onChange={(e) => setManualEndpointRate(Number(e.target.value))}
        />
        <button type="button" className="link-button" onClick={() => setManualEndpointRate(anchorRate)}>
          Reset to spot
        </button>
      </div>

      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={model.rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="#26324f" strokeDasharray="3 3" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[tMin, tMax]}
            allowDataOverflow
            tickFormatter={tickToMonth}
            stroke="#93a1c0"
            fontSize={12}
            minTickGap={32}
          />
          <YAxis
            stroke="#93a1c0"
            fontSize={12}
            domain={yDomain}
            tickFormatter={(v: number) => v.toFixed(3)}
            width={56}
          />
          <Tooltip
            contentStyle={{ background: '#131c31', border: '1px solid #26324f', borderRadius: 8 }}
            labelFormatter={(label) => (typeof label === 'number' ? tickToMonth(label) : String(label))}
            formatter={(value) =>
              typeof value === 'number' ? formatRate(value) : '—'
            }
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area
            type="monotone"
            dataKey="forecastBand"
            name="Model forecast band"
            stroke="none"
            fill={STROKE.forecast}
            fillOpacity={0.14}
            connectNulls
            isAnimationActive={false}
            activeDot={false}
          />
          <Area
            type="stepAfter"
            dataKey="bankBand"
            name="Bank forecast range"
            stroke="none"
            fill={STROKE.bankRange}
            fillOpacity={0.12}
            connectNulls
            isAnimationActive={false}
            activeDot={false}
          />
          <Line
            type="monotone"
            dataKey="spot"
            name="Spot (actual)"
            stroke={STROKE.spot}
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="irp"
            name="IRP (arbitrage-free)"
            stroke={STROKE.irp}
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="bank"
            name="Bank forecast (opinion)"
            stroke={STROKE.bank}
            strokeWidth={2}
            strokeDasharray="2 4"
            dot={{ r: 2 }}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="manual"
            name="Manual (what-if)"
            stroke={STROKE.manual}
            strokeWidth={2}
            strokeDasharray="8 3 2 3"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="forecast"
            name="Model forecast (damped Holt)"
            stroke={STROKE.forecast}
            strokeWidth={2}
            strokeDasharray="1 3"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="stepAfter"
            dataKey="bankMid"
            name="Bank forecast (range mid)"
            stroke={STROKE.bankRange}
            strokeWidth={2}
            strokeDasharray="4 2"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Scatter
            data={scatterData}
            dataKey="forward"
            name="Forward orders"
            fill={STROKE.forward}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
