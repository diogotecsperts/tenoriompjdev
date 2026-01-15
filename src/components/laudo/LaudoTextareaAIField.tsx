import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface LaudoTextareaAIFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  /** Enable the "Aprimorar Texto" button (✨) */
  enableEnhance?: boolean;
  /** Enable the "Regerar via PDF" button (🔄) */
  enableRegenerate?: boolean;
  /** The field key for regeneration - must match backend field mapping */
  fieldKey?: string;
  /** The laudo ID - required for regeneration */
  laudoId?: string;
  /** Whether the laudo has an associated PDF */
  hasPdfSource?: boolean;
}

export function LaudoTextareaAIField({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows = 6,
  enableEnhance = true,
  enableRegenerate = true,
  fieldKey,
  laudoId,
  hasPdfSource = false,
}: LaudoTextareaAIFieldProps) {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  const handleEnhance = async () => {
    if (!value?.trim()) {
      toast({
        variant: "destructive",
        title: "Campo vazio",
        description: "Escreva algum texto antes de aprimorar.",
      });
      return;
    }

    setIsEnhancing(true);
    try {
      const { data, error } = await supabase.functions.invoke('gerar-resumos', {
        body: {
          tipo: 'aprimorar_texto',
          contexto: {
            textoOriginal: value,
            campo: fieldKey || id,
          }
        }
      });

      if (error) throw error;

      if (data?.texto) {
        onChange(data.texto);
        toast({
          title: "Texto aprimorado",
          description: "Gramática, concordância e formalidade corrigidos. Use Ctrl+Z para desfazer.",
        });
      }
    } catch (error: any) {
      console.error('Erro ao aprimorar texto:', error);
      toast({
        variant: "destructive",
        title: "Erro ao aprimorar texto",
        description: error.message || "Tente novamente mais tarde.",
      });
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleRegenerate = async () => {
    if (!laudoId || !fieldKey) {
      toast({
        variant: "destructive",
        title: "Erro de configuração",
        description: "ID do laudo ou campo não configurados.",
      });
      return;
    }

    setIsRegenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('regerar-campo-pdf', {
        body: {
          laudoId,
          fieldKey,
        }
      });

      if (error) throw error;

      if (data?.texto) {
        onChange(data.texto);
        toast({
          title: "Campo regenerado",
          description: "O campo foi preenchido novamente a partir do PDF original.",
        });
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('Erro ao regerar campo:', error);
      toast({
        variant: "destructive",
        title: "Erro ao regerar campo",
        description: error.message || "Tente novamente mais tarde.",
      });
    } finally {
      setIsRegenerating(false);
      setShowRegenerateConfirm(false);
    }
  };

  const canRegenerate = enableRegenerate && hasPdfSource && laudoId && fieldKey;
  const isLoading = isEnhancing || isRegenerating;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <div className="flex items-center gap-1">
          {enableEnhance && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleEnhance}
                    disabled={isLoading}
                  >
                    {isEnhancing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Aprimorar texto (gramática e formalidade)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {enableRegenerate && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setShowRegenerateConfirm(true)}
                    disabled={isLoading || !canRegenerate}
                  >
                    {isRegenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {canRegenerate 
                    ? "Regerar a partir do PDF original" 
                    : "Laudo sem PDF de origem registrado"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={isLoading}
      />

      <AlertDialog open={showRegenerateConfirm} onOpenChange={setShowRegenerateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerar campo?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso irá sobrescrever o conteúdo atual deste campo com uma nova extração do PDF original. 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerate}>
              Regenerar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
