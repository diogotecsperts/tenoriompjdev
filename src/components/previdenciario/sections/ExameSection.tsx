import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLaudoPrev } from "@/contexts/previdenciario/LaudoPrevidenciarioContext";

export function ExameSection() {
  const { laudo, updateLaudo } = useLaudoPrev();
  if (!laudo) return null;
  const l: any = laudo;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Laudos Médicos</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Documentos médicos apresentados na perícia ou constantes nos autos.
            </p>
          </div>
          <Textarea
            rows={6}
            value={l.laudos_medicos ?? ""}
            onChange={(e) => updateLaudo({ laudos_medicos: e.target.value } as any)}
            placeholder="Relacione os laudos, atestados e relatórios médicos avaliados."
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Exames Complementares</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Exames de imagem e laboratoriais relevantes.
            </p>
          </div>
          <Textarea
            rows={5}
            value={l.exames_complementares ?? ""}
            onChange={(e) =>
              updateLaudo({ exames_complementares: e.target.value } as any)
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Exame Físico Pericial</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Achados do exame físico realizado na perícia.
            </p>
          </div>
          <Textarea
            rows={6}
            value={l.exame_fisico ?? ""}
            onChange={(e) => updateLaudo({ exame_fisico: e.target.value } as any)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
