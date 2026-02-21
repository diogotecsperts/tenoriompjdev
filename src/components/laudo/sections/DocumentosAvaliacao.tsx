import { useLaudo } from "@/contexts/LaudoContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const documentosOptions = [
  { id: "cat", label: "CAT - Comunicação de Acidente de Trabalho" },
  { id: "prontuario", label: "Prontuário Médico" },
  { id: "receitas", label: "Receitas Médicas" },
  { id: "exames", label: "Exames Complementares" },
  { id: "laudos_anteriores", label: "Laudos Médicos Anteriores" },
  { id: "atestados", label: "Atestados Médicos" },
];

export function DocumentosAvaliacao() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  const handleDocChange = (docId: string, checked: boolean) => {
    const current = currentLaudo.documentos || [];
    const updated = checked
      ? [...current, docId]
      : current.filter((d) => d !== docId);
    updateLaudo({ documentos: updated });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documentos da Avaliação</CardTitle>
        <CardDescription>
          Marque os documentos que foram apresentados e analisados durante a perícia
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {documentosOptions.map((doc) => (
          <div key={doc.id} className="flex items-center space-x-2">
            <Checkbox
              id={doc.id}
              checked={currentLaudo.documentos?.includes(doc.id)}
              onCheckedChange={(checked) => handleDocChange(doc.id, checked as boolean)}
            />
            <Label htmlFor={doc.id} className="cursor-pointer font-normal">
              {doc.label}
            </Label>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
