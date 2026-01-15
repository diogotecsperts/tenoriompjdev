import { useMemo, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Separator } from "@/components/ui/separator";

interface LaudosAnalyticsChartProps {
  laudos: Array<{
    id: string;
    status?: string | null;
    nexo_causal_tipo?: string | null;
  }>;
}

// Cores para Status
const STATUS_COLORS = {
  "Rascunho": "hsl(var(--chart-4))",
  "Finalizado": "hsl(var(--chart-1))",
};

// Cores para Nexo Causal
const NEXO_COLORS = {
  "Nexo Causal": "hsl(var(--chart-1))",
  "Concausal": "hsl(var(--chart-2))",
  "Ausência de Nexo Causal": "hsl(var(--chart-3))",
  "Não definido": "hsl(var(--muted-foreground))",
};

const NEXO_LABELS = {
  "Nexo Causal": "Nexo Direto",
  "Concausal": "Concausa",
  "Ausência de Nexo Causal": "Sem Nexo",
  "Não definido": "Não definido",
};

// Normaliza status
const normalizeStatus = (status: string | null | undefined): string => {
  if (!status) return "Rascunho";
  const normalized = status.toLowerCase().trim();
  if (normalized === "finalizado") return "Finalizado";
  return "Rascunho";
};

// Normaliza nexo_causal_tipo
const normalizeNexoTipo = (tipo: string | null | undefined): string => {
  if (!tipo) return "Não definido";
  
  const normalized = tipo.toLowerCase().trim();
  
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

// Mini Donut Chart Component
const MiniDonutChart = memo(function MiniDonutChart({ 
  data, 
  total 
}: { 
  data: Array<{ name: string; value: number; color: string }>; 
  total: number;
}) {
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-[70px] w-[70px] flex-shrink-0">
        <div className="h-[70px] w-[70px] rounded-full border-4 border-muted flex items-center justify-center">
          <span className="text-xs text-muted-foreground">0</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[70px] w-[70px] flex-shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={22}
            outerRadius={32}
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
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-foreground">{total}</span>
      </div>
    </div>
  );
});

export const LaudosAnalyticsChart = memo(function LaudosAnalyticsChart({ laudos }: LaudosAnalyticsChartProps) {
  // Dados de Status
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {
      "Rascunho": 0,
      "Finalizado": 0,
    };

    laudos.forEach((laudo) => {
      const statusNormalizado = normalizeStatus(laudo.status);
      counts[statusNormalizado]++;
    });

    return Object.entries(counts)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({
        name,
        value,
        color: STATUS_COLORS[name as keyof typeof STATUS_COLORS],
      }));
  }, [laudos]);

  // Dados de Nexo Causal
  const nexoData = useMemo(() => {
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
        label: NEXO_LABELS[name as keyof typeof NEXO_LABELS],
        value,
        color: NEXO_COLORS[name as keyof typeof NEXO_COLORS],
      }));
  }, [laudos]);

  const statusTotal = statusData.reduce((sum, item) => sum + item.value, 0);
  const nexoTotal = nexoData.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold">Análise de Laudos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Section */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Status</p>
          <div className="flex items-center gap-3">
            <MiniDonutChart data={statusData} total={statusTotal} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 flex-1">
              {statusData.map((item, index) => (
                <div key={index} className="flex items-center gap-1.5">
                  <span 
                    className="h-2 w-2 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs text-muted-foreground">{item.name}</span>
                  <span className="text-xs font-medium text-foreground">{item.value}</span>
                </div>
              ))}
              {statusTotal === 0 && (
                <span className="text-xs text-muted-foreground">Nenhum laudo</span>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Nexo Causal Section */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Nexo Causal</p>
          <div className="flex items-center gap-3">
            <MiniDonutChart data={nexoData} total={nexoTotal} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 flex-1">
              {nexoData.map((item, index) => (
                <div key={index} className="flex items-center gap-1.5">
                  <span 
                    className="h-2 w-2 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <span className="text-xs font-medium text-foreground">{item.value}</span>
                </div>
              ))}
              {nexoTotal === 0 && (
                <span className="text-xs text-muted-foreground">Nenhum laudo</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
