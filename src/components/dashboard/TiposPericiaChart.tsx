import { useMemo, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface TiposPericiaChartProps {
  laudos: Array<{
    id: string;
    // In the future, add tipo field to classify pericias
  }>;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
];

export const TiposPericiaChart = memo(function TiposPericiaChart({ laudos }: TiposPericiaChartProps) {
  // Mock data for demonstration - in real app, this would come from laudos
  const data = useMemo(() => {
    const total = laudos.length || 1;
    return [
      { name: "Ortopedia", value: Math.ceil(total * 0.45), color: COLORS[0] },
      { name: "Psiquiatria", value: Math.ceil(total * 0.25), color: COLORS[1] },
      { name: "Med. Trabalho", value: Math.ceil(total * 0.20), color: COLORS[2] },
      { name: "Outros", value: Math.floor(total * 0.10), color: COLORS[3] },
    ].filter(item => item.value > 0);
  }, [laudos.length]);

  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Tipos de Perícia</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          {/* Donut Chart */}
          <div className="relative h-[140px] w-[140px] flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={2}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* Center text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-foreground">{total}</span>
              <span className="text-xs text-muted-foreground">Total</span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-2 flex-1">
            {data.map((item, index) => (
              <div key={index} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span 
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-muted-foreground">{item.name}</span>
                </div>
                <span className="text-sm font-medium text-foreground">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
