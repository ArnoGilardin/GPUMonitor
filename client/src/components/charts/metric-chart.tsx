import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend } from "recharts";

export const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "#22d3ee", "#a3e635", "#f472b6"];

export interface Series {
  key: string;
  label: string;
  color?: string;
}

interface MetricChartProps {
  data: Array<Record<string, number | string | null>>;
  series: Series[];
  type?: "line" | "area";
  domain?: [number | "auto", number | "auto"];
  unit?: string;
  height?: number;
  rangeHours: number;
  formatValue?: (v: number) => string;
}

export default function MetricChart({ data, series, type = "line", domain, unit = "", height = 220, rangeHours, formatValue }: MetricChartProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        No data for this period
      </div>
    );
  }

  const fmtTick = (ts: string) => {
    const d = new Date(ts);
    return rangeHours > 24
      ? d.toLocaleDateString([], { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString([], { hour: "2-digit" })
      : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };
  const fmt = formatValue ?? ((v: number) => `${Math.round(v * 10) / 10}${unit}`);
  const Chart = type === "area" ? AreaChart : LineChart;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="ts" tickFormatter={fmtTick} stroke="var(--muted-foreground)" fontSize={11} minTickGap={40} />
        <YAxis domain={domain} stroke="var(--muted-foreground)" fontSize={11} width={60} tickFormatter={(v) => fmt(v)} />
        <Tooltip
          contentStyle={{ backgroundColor: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)", fontSize: 12 }}
          labelFormatter={(ts) => new Date(ts as string).toLocaleString()}
          formatter={(value: number, name: string) => [fmt(value), name]}
        />
        {series.length > 1 && series.length <= 8 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s, i) => {
          const color = s.color ?? SERIES_COLORS[i % SERIES_COLORS.length];
          return type === "area" ? (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={color} fill={color} fillOpacity={0.15} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          ) : (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={color} strokeWidth={series.length > 4 ? 1.5 : 2} dot={false} connectNulls isAnimationActive={false} />
          );
        })}
      </Chart>
    </ResponsiveContainer>
  );
}
