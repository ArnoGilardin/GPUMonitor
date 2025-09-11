import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

interface MetricChartProps {
  data: Array<{
    time: string;
    [key: string]: number | string;
  }>;
  dataKey: string;
  color: string;
  type?: "line" | "area";
  domain?: [number, number];
  unit?: string;
  height?: number;
}

export default function MetricChart({ 
  data, 
  dataKey, 
  color, 
  type = "line", 
  domain,
  unit = "",
  height = 200 
}: MetricChartProps) {
  const Chart = type === "area" ? AreaChart : LineChart;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis 
          dataKey="time" 
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
        />
        <YAxis 
          domain={domain}
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
        />
        <Tooltip 
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            color: "hsl(var(--foreground))"
          }}
          formatter={(value: number) => [`${value}${unit}`, dataKey]}
        />
        {type === "area" ? (
          <Area 
            type="monotone" 
            dataKey={dataKey} 
            stroke={color}
            fill={color}
            fillOpacity={0.2}
            strokeWidth={2}
          />
        ) : (
          <Line 
            type="monotone" 
            dataKey={dataKey} 
            stroke={color}
            strokeWidth={2}
            dot={false}
          />
        )}
      </Chart>
    </ResponsiveContainer>
  );
}
