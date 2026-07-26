'use client';

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

// A compact price chart: actual spot as a solid line, the damped-Holt
// projection as a dashed line with a low-opacity band. Self-contained (its own
// row type) so it does not clash with the richer multi-line RateChart the
// coverage dashboard uses. Ported from the crossrate-rebuild branch.
//
// Australian English. No em dashes.

export interface SpotChartRow {
  label: string;
  rate?: number;
  forecast?: number;
  band?: [number, number];
}

// Dark-theme palette matching app/globals.css.
const SPOT = '#4ade80';
const PROJ = '#fbbf24';
const AXIS = '#93a1c0';
const GRID = '#ffffff12';

export function SpotRateChart({
  data,
  domain,
}: {
  data: SpotChartRow[];
  domain: [number, number];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 16, right: 8, bottom: 6, left: 6 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: AXIS, fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: '#26324f' }}
          minTickGap={44}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={domain}
          tick={{ fill: AXIS, fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => v.toFixed(4)}
          orientation="right"
        />
        <Tooltip
          contentStyle={{
            background: '#131c31',
            border: '1px solid #26324f',
            borderRadius: 6,
            fontSize: 11,
            color: '#e8edf7',
          }}
          formatter={(value: number | number[], name: string) => {
            if (Array.isArray(value)) {
              const lo = value[0] ?? 0;
              const hi = value[1] ?? 0;
              return [`${lo.toFixed(4)} - ${hi.toFixed(4)}`, 'Band (80%)'];
            }
            return [value.toFixed(4), name === 'forecast' ? 'Projection' : 'Spot'];
          }}
        />
        <Area
          dataKey="band"
          stroke="none"
          fill={PROJ}
          fillOpacity={0.12}
          isAnimationActive={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="rate"
          name="Spot"
          stroke={SPOT}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="forecast"
          name="Projection"
          stroke={PROJ}
          strokeWidth={1.6}
          strokeDasharray="5 4"
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
