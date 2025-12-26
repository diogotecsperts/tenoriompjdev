import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend 
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Lancamento } from "@/pages/Financeiro";

interface ResumoGraficoProps {
  lancamentos: Lancamento[];
}

export function ResumoGrafico({ lancamentos }: ResumoGraficoProps) {
  const chartData = useMemo(() => {
    const data: Array<{
      month: string;
      honorarios: number;
      despesas: number;
    }> = [];

    // Get last 6 months
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);
      const monthLabel = format(date, "MMM", { locale: ptBR });

      const monthLancamentos = lancamentos.filter(l => {
        const createdAt = new Date(l.created_at);
        return createdAt >= monthStart && createdAt <= monthEnd;
      });

      const honorarios = monthLancamentos.reduce(
        (sum, l) => sum + (Number(l.valor_honorarios) || 0), 
        0
      );
      const despesas = monthLancamentos.reduce(
        (sum, l) => sum + (Number(l.valor_despesas) || 0), 
        0
      );

      data.push({
        month: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
        honorarios,
        despesas,
      });
    }

    return data;
  }, [lancamentos]);

  const hasData = chartData.some(d => d.honorarios > 0 || d.despesas > 0);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Evolução Mensal</CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="month" 
                className="text-xs fill-muted-foreground"
              />
              <YAxis 
                className="text-xs fill-muted-foreground"
                tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
                formatter={(value: number) => [
                  `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                ]}
              />
              <Legend />
              <Bar 
                dataKey="honorarios" 
                name="Honorários" 
                fill="hsl(var(--primary))" 
                radius={[4, 4, 0, 0]}
              />
              <Bar 
                dataKey="despesas" 
                name="Despesas" 
                fill="hsl(var(--destructive))" 
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            <p>Nenhum dado financeiro registrado ainda.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
