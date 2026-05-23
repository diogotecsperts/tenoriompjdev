import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldCheck,
  FileClock,
  FilePlus2,
  TrendingUp,
  Clock,
  Wrench,
  ArrowRight,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PrevLaudoSummary {
  id: string;
  title: string;
  status: string | null;
  updated_at: string;
}

export default function PrevidenciarioHome() {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [recent, setRecent] = useState<PrevLaudoSummary[]>([]);
  const [last30Days, setLast30Days] = useState(0);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);

      const since = new Date();
      since.setDate(since.getDate() - 30);

      const [{ count: totalCount }, { data: recentRows }, { count: last30Count }] =
        await Promise.all([
          supabase
            .from("laudos")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("tipo_laudo", "previdenciario" as any),
          supabase
            .from("laudos")
            .select("id, title, status, updated_at")
            .eq("user_id", user.id)
            .eq("tipo_laudo", "previdenciario" as any)
            .order("updated_at", { ascending: false })
            .limit(5),
          supabase
            .from("laudos")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("tipo_laudo", "previdenciario" as any)
            .gte("created_at", since.toISOString()),
        ]);

      setTotal(totalCount ?? 0);
      setRecent((recentRows ?? []) as PrevLaudoSummary[]);
      setLast30Days(last30Count ?? 0);
      setLoading(false);
    };
    load();
  }, [user]);

  const firstName = profile?.nome?.split(" ")[0] ?? "Doutor(a)";

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Perícias Previdenciárias — INSS / BPC / LOAS</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Bem-vindo(a), {firstName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visão geral dos seus laudos previdenciários.
          </p>
        </div>

        <Button size="lg" disabled className="shadow-sm">
          <FilePlus2 className="h-4 w-4 mr-2" />
          Novo laudo
          <span className="ml-2 text-[10px] uppercase tracking-wider bg-primary-foreground/20 px-1.5 py-0.5 rounded">
            Em breve
          </span>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Total de laudos
              </p>
              <FileClock className="h-4 w-4 text-primary" />
            </div>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-3xl font-bold text-foreground">{total}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Todos os laudos previdenciários
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Últimos 30 dias
              </p>
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-3xl font-bold text-foreground">{last30Days}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Criados no período
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Última atividade
              </p>
              <Clock className="h-4 w-4 text-primary" />
            </div>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : recent[0] ? (
              <p className="text-base font-semibold text-foreground">
                {format(new Date(recent[0].updated_at), "dd 'de' MMM", {
                  locale: ptBR,
                })}
              </p>
            ) : (
              <p className="text-base font-semibold text-muted-foreground">
                Nenhuma ainda
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Último laudo editado
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent + module status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Laudos recentes
                </h2>
                <p className="text-xs text-muted-foreground">
                  Os 5 últimos laudos previdenciários atualizados
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/previdenciario/historico")}
              >
                Ver todos
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <div className="text-center py-10 border border-dashed rounded-lg">
                <FileClock className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Nenhum laudo previdenciário ainda.
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  O editor será liberado em breve.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recent.map((l) => (
                  <div
                    key={l.id}
                    className="py-3 flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {l.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Atualizado em{" "}
                        {format(
                          new Date(l.updated_at),
                          "dd/MM/yyyy 'às' HH:mm",
                          { locale: ptBR }
                        )}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground capitalize">
                      {l.status ?? "rascunho"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-dashed">
          <CardContent className="p-6">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 mb-3">
              <Wrench className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">
              Módulo em construção
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              A estrutura visual e o histórico já estão prontos. O editor
              completo (anamnese, exame, CID, DII/DCB, conclusão) e a
              exportação DOCX/PDF entrarão nas próximas fases.
            </p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 mt-0.5">✓</span>
                Layout dedicado e isolado
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 mt-0.5">✓</span>
                Home com indicadores
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 mt-0.5">✓</span>
                Histórico filtrado
              </li>
              <li className="flex items-start gap-2 text-muted-foreground/60">
                <span className="mt-0.5">○</span>
                Editor de laudo previdenciário
              </li>
              <li className="flex items-start gap-2 text-muted-foreground/60">
                <span className="mt-0.5">○</span>
                Exportação DOCX/PDF
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
