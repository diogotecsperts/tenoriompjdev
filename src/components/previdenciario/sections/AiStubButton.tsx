import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

interface Props {
  label?: string;
  className?: string;
}

/**
 * Botão placeholder para geração de texto por IA.
 * Visualmente pronto; sem handler — será ativado na Fase 5.8 quando
 * a Edge Function `gerar-justificativa-medica` for estendida.
 *
 * Princípio: "Médico Decide / IA Redige".
 */
export function AiStubButton({ label = "Gerar com IA", className }: Props) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled
      title="Disponível em breve — geração assistida por IA"
      className={className}
    >
      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
      {label}
    </Button>
  );
}
