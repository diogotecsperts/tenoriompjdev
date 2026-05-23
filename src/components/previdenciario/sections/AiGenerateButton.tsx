import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  generatePrevField,
  type PrevCampo,
} from "@/lib/previdenciario/api/generate-prev-field";

interface Props {
  laudoId: string | undefined;
  campo: PrevCampo;
  escolha?: string | string[];
  cidsManuais?: string[];
  disabledReason?: string | null;
  label?: string;
  onGenerated: (texto: string) => void;
  className?: string;
}

/**
 * Botão "Gerar com IA" para o módulo Previdenciário.
 * Princípio: Médico Decide / IA Redige.
 * - Se `disabledReason` estiver setado, o botão fica disabled e o tooltip
 *   explica qual decisão precisa ser tomada primeiro.
 * - Caso contrário, chama a Edge Function `gerar-justificativa-medica`
 *   e devolve o texto gerado via `onGenerated`.
 */
export function AiGenerateButton({
  laudoId,
  campo,
  escolha,
  cidsManuais,
  disabledReason,
  label = "Gerar com IA",
  onGenerated,
  className,
}: Props) {
  const [loading, setLoading] = useState(false);
  const isDisabled = !!disabledReason || !laudoId || loading;

  const handleClick = async () => {
    if (!laudoId) {
      toast.error("Salve o laudo antes de usar a IA.");
      return;
    }
    setLoading(true);
    try {
      const texto = await generatePrevField({
        laudoId,
        campo,
        escolha,
        cidsManuais,
      });
      if (texto && texto.trim().length > 0) {
        onGenerated(texto.trim());
        toast.success("Texto gerado com sucesso.");
      } else {
        toast.error("A IA retornou texto vazio. Tente novamente.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const button = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isDisabled}
      onClick={handleClick}
      className={className}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
      ) : (
        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
      )}
      {loading ? "Gerando..." : label}
    </Button>
  );

  if (disabledReason) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          {/* span wrapper para o tooltip funcionar sobre botão disabled */}
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-block">{button}</span>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs">
            {disabledReason}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}
