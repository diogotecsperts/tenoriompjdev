import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLaudoPrev } from "@/contexts/previdenciario/LaudoPrevidenciarioContext";
import { AiStubButton } from "./AiStubButton";

export function QuesitosSection() {
  const { laudo, updateLaudo } = useLaudoPrev();
  if (!laudo) return null;
  const l: any = laudo;

  const blocks: Array<{ label: string; field: string; placeholder: string }> = [
    {
      label: "Quesitos do Juízo",
      field: "quesitos_juizo",
      placeholder: "1. Pergunta...\nResposta: ...",
    },
    {
      label: "Quesitos do Autor (Segurado)",
      field: "quesitos_reclamante",
      placeholder: "1. Pergunta...\nResposta: ...",
    },
    {
      label: "Quesitos do INSS / Parte Ré",
      field: "quesitos_reclamada",
      placeholder: "1. Pergunta...\nResposta: ...",
    },
  ];

  return (
    <div className="space-y-4">
      {blocks.map((b) => (
        <Card key={b.field}>
          <CardContent className="p-6 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">{b.label}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cada pergunta numerada com a respectiva resposta logo abaixo.
                </p>
              </div>
              <AiStubButton label="Responder quesitos" />
            </div>
            <Textarea
              rows={8}
              value={l[b.field] ?? ""}
              onChange={(e) => updateLaudo({ [b.field]: e.target.value } as any)}
              placeholder={b.placeholder}
              className="font-mono text-sm"
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
