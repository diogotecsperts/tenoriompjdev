import { useMemo, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface NexoCausalChartProps {
  laudos: Array<{
    id: string;
    nexo_causal_tipo?: string | null;
  }>;
}

const COLORS = {
  "Nexo Causal": "hsl(var(--chart-1))",
  "Concausal": "hsl(var(--chart-2))",
  "Ausência de Nexo Causal": "hsl(var(--chart-3))",
  "Não definido": "hsl(var(--muted-foreground))",
};

const LABELS = {
  "Nexo Causal": "Nexo Direto",
  "Concausal": "Concausa",
  "Ausência de Nexo Causal": "Sem Nexo",
  "Não definido": "Não definido",
};

// Normaliza todos os formatos possíveis de nexo_causal_tipo
const normalizeNexoTipo = (tipo: string | null | undefined): string => {
  if (!tipo) return "Não definido";
  
  const normalized = tipo.toLowerCase().trim();
  
  // Mapear todas as variações para categorias padronizadas
  if (normalized === "nexo_causal" || normalized === "nexo causal" || normalized === "direto") {
    return "Nexo Causal";
  }
  if (normalized === "concausal" || normalized === "concausa") {
    return "Concausal";
  }
  if (normalized === "ausencia" || normalized === "ausência de nexo causal" || normalized === "sem_nexo" || normalized === "ausência") {
    return "Ausência de Nexo Causal";
  }
  
  return "Não definido";
};

export const NexoCausalChart = memo(function NexoCausalChart({ laudos }: NexoCausalChartProps) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {
      "Nexo Causal": 0,
      "Concausal": 0,
      "Ausência de Nexo Causal": 0,
      "Não definido": 0,
    };

    laudos.forEach((laudo) => {
      const tipoNormalizado = normalizeNexoTipo(laudo.nexo_causal_tipo);
      counts[tipoNormalizado]++;
    });

    return Object.entries(counts)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({
        name,
        label: LABELS[name as keyof typeof LABELS],
        value,
        color: COLORS[name as keyof typeof COLORS],
      }));
  }, [laudos]);

  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Nexo Causal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[140px] text-muted-foreground text-sm">
            Nenhum laudo cadastrado
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Nexo Causal</CardTitle>
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
                  <span className="text-sm text-muted-foreground">{item.label}</span>
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
