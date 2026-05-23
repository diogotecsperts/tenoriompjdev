import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useLaudoPrev } from "@/contexts/previdenciario/LaudoPrevidenciarioContext";

export function PeritoSection() {
  const { laudo } = useLaudoPrev();
  if (!laudo) return null;

  const fields: Array<[string, string]> = [
    ["Nome", laudo.perito_nome ?? ""],
    ["CRM", laudo.perito_crm ?? ""],
    ["Especialidade", laudo.perito_especialidade ?? ""],
    ["E-mail", laudo.perito_email ?? ""],
    ["Telefone", laudo.perito_telefone ?? ""],
    ["Endereço", laudo.perito_endereco ?? ""],
  ];

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Dados do Perito</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Estes dados vêm do seu perfil e ficam congelados no laudo. Para editar, vá em Configurações.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map(([label, value]) => (
            <div key={label} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <Input value={value} readOnly className="bg-muted/40" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
