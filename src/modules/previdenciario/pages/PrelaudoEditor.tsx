import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Loader2, Construction } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getPericia } from "../api/pautas";
import { PERICIA_STATUS_COLOR, PERICIA_STATUS_LABEL } from "../types";
import type { PrevPericia } from "../types";
import { Badge } from "@/components/ui/badge";

/**
 * Esqueleto do editor de pré-laudo (Fase A+B).
 * Implementação dos 10 steps acontece nas Fases D+E.
 */
export default function PrelaudoEditor() {
  const { periciaId } = useParams<{ periciaId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [pericia, setPericia] = useState<PrevPericia | null>(null);

  useEffect(() => {
    if (!periciaId) return;
    (async () => {
      try {
        setPericia(await getPericia(periciaId));
      } catch (err: any) {
        toast({ variant: "destructive", title: "Erro", description: err.message });
      } finally {
        setLoading(false);
      }
    })();
  }, [periciaId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!pericia) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-muted-foreground">Perícia não encontrada.</p>
        <Button variant="ghost" className="mt-3" onClick={() => navigate("/previdenciario")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(`/previdenciario/pauta/${pericia.pauta_id}`)}
        className="-ml-2"
      >
        <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar para pauta
      </Button>

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-foreground">
          {pericia.periciado_nome || "Sem nome"}
        </h1>
        <Badge variant="outline" className={`text-[10px] ${PERICIA_STATUS_COLOR[pericia.status]}`}>
          {PERICIA_STATUS_LABEL[pericia.status]}
        </Badge>
      </div>

      <Card className="p-8 text-center border-dashed">
        <Construction className="h-10 w-10 text-amber-500 mx-auto mb-3" />
        <h2 className="text-base font-semibold text-foreground">Editor em construção</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          O editor de pré-laudo (10 etapas) e o painel lateral do processo serão
          implementados nas próximas fases (D+E). A fundação, a agenda e o upload de PDFs
          já estão funcionando.
        </p>
      </Card>
    </div>
  );
}
