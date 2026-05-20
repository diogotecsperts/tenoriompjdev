import { useState } from "react";
import { useLaudo } from "@/contexts/LaudoContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function ReferenciasBibliograficas() {
  const { currentLaudo, updateLaudo } = useLaudo();
  const [isLoading, setIsLoading] = useState(false);

  if (!currentLaudo) return null;

  const extractErrorMessage = (err: unknown, fallback: string): string => {
    let msg = fallback;
    if (err instanceof Error) msg = err.message;
    else if (typeof err === 'string') msg = err;
    else if (err && typeof err === 'object') {
      const anyErr = err as any;
      msg = anyErr?.context?.error || anyErr?.error || anyErr?.message || fallback;
    }
    // A mensagem pode conter JSON embutido vindo da Edge Function (ex: 'Edge function returned 400: {"error":"..."}')
    try {
      const match = typeof msg === 'string' ? msg.match(/\{[\s\S]*\}/) : null;
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed?.error) msg = parsed.error;
      }
    } catch { /* ignora falha de parse */ }
    return msg || fallback;
  };

  const handleGerarReferencias = async () => {
    if (!currentLaudo.id) {
      toast.error("Salve o laudo antes de gerar as referências.");
      return;
    }
    setIsLoading(true);
    try {
      let response: { data?: any; error?: any } | undefined;

      // Captura erros lançados diretamente pelo client do Supabase
      try {
        response = await supabase.functions.invoke('gerar-justificativa-medica', {
          body: {
            laudoId: currentLaudo.id,
            campo: 'referencias',
          }
        });
      } catch (invokeErr) {
        console.warn('[ReferenciasBibliograficas] invoke lançou erro:', invokeErr);
        toast.error(extractErrorMessage(invokeErr, 'Erro ao gerar referências. Tente novamente.'));
        return;
      }

      if (response?.error) {
        toast.error(extractErrorMessage(response.error, 'Erro ao gerar referências.'));
        return;
      }

      if (response?.data?.error) {
        toast.error(extractErrorMessage(response.data.error, 'Erro ao gerar referências.'));
        return;
      }

      if (response?.data?.texto) {
        updateLaudo({ referenciasBibliograficas: response.data.texto });
        toast.success('Referências geradas com sucesso!');
      } else {
        toast.error('Resposta vazia. Tente novamente.');
      }
    } catch (error) {
      // Última linha de defesa — garante que a tela nunca quebre
      console.error('Erro inesperado ao gerar referências:', error);
      toast.error(extractErrorMessage(error, 'Erro ao gerar referências. Tente novamente.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Referências Bibliográficas</CardTitle>
        <CardDescription>
          Clique em "Gerar Referências" para que a IA produza referências reais e específicas ao contexto clínico do laudo. A IA usa CIDs, Anamnese, Exame Físico e Conclusão como contexto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="referenciasBibliograficas">Referências</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGerarReferencias}
              disabled={isLoading}
              className="h-8 text-xs"
            >
              {isLoading ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3 w-3" />
              )}
              Gerar Referências
            </Button>
          </div>
          <Textarea
            id="referenciasBibliograficas"
            value={currentLaudo.referenciasBibliograficas || ""}
            onChange={(e) => updateLaudo({ referenciasBibliograficas: e.target.value })}
            placeholder="Preencha ao menos os CIDs ou a Conclusão e clique em Gerar Referências, ou redija manualmente."
            rows={8}
          />
        </div>
      </CardContent>
    </Card>
  );
}
