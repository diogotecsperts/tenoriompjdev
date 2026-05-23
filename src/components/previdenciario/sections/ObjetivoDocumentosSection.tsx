import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLaudoPrev } from "@/contexts/previdenciario/LaudoPrevidenciarioContext";

const OBJETIVO_PREV_DEFAULT =
  "Foi designada Perícia Médica Judicial para avaliar a existência e a extensão da incapacidade laborativa do(a) periciando(a), bem como verificar a presença de nexo previdenciário, com vistas à apreciação do direito a benefício por incapacidade, em conformidade com a Lei nº 8.213/91 e demais normas previdenciárias aplicáveis.";

export function ObjetivoSection() {
  const { laudo, updateLaudo } = useLaudoPrev();
  if (!laudo) return null;
  const l: any = laudo;
  const value = l.objetivo_pericia ?? OBJETIVO_PREV_DEFAULT;

  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Objetivo da Perícia</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Texto base sugerido para perícia previdenciária; editável.
          </p>
        </div>
        <Textarea
          rows={6}
          value={value}
          onChange={(e) => updateLaudo({ objetivo_pericia: e.target.value } as any)}
        />
      </CardContent>
    </Card>
  );
}

export function DocumentosSection() {
  const { laudo, updateLaudo } = useLaudoPrev();
  if (!laudo) return null;
  const l: any = laudo;
  const arr: string[] = Array.isArray(l.documentos) ? l.documentos : [];
  const value = arr.join("\n");

  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Documentos Avaliados</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Um documento por linha.
          </p>
        </div>
        <Textarea
          rows={6}
          value={value}
          onChange={(e) =>
            updateLaudo({
              documentos: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
            } as any)
          }
          placeholder="Ex.: Atestado do Dr. X — 12/05/2025&#10;Ressonância magnética lombar — 03/2025"
        />
      </CardContent>
    </Card>
  );
}

export function ResumoAdmSection() {
  const { laudo, updateLaudo } = useLaudoPrev();
  if (!laudo) return null;
  const l: any = laudo;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Resumo Administrativo / Petição</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Síntese do que pleiteia o autor.
            </p>
          </div>
          <Textarea
            rows={6}
            value={l.resumo_peticao_inicial ?? ""}
            onChange={(e) =>
              updateLaudo({ resumo_peticao_inicial: e.target.value } as any)
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Resumo da Contestação / INSS</h2>
          </div>
          <Textarea
            rows={5}
            value={l.resumo_contestacao ?? ""}
            onChange={(e) => updateLaudo({ resumo_contestacao: e.target.value } as any)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export function MetodologiaSection() {
  const { laudo, updateLaudo } = useLaudoPrev();
  if (!laudo) return null;
  const l: any = laudo;
  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Metodologia Pericial</h2>
        </div>
        <Textarea
          rows={6}
          value={l.metodologia_pericial ?? ""}
          onChange={(e) => updateLaudo({ metodologia_pericial: e.target.value } as any)}
        />
      </CardContent>
    </Card>
  );
}

export function ReferenciasSection() {
  const { laudo, updateLaudo } = useLaudoPrev();
  if (!laudo) return null;
  const l: any = laudo;
  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Referências Bibliográficas</h2>
        </div>
        <Textarea
          rows={8}
          value={l.referencias_bibliograficas ?? ""}
          onChange={(e) =>
            updateLaudo({ referencias_bibliograficas: e.target.value } as any)
          }
          className="font-mono text-sm"
        />
      </CardContent>
    </Card>
  );
}

export function HonorariosSection() {
  const { laudo, updateLaudo } = useLaudoPrev();
  if (!laudo) return null;
  const l: any = laudo;

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Honorários e Logística</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Valor dos honorários (R$)</Label>
            <Textarea
              rows={1}
              value={String(l.valor_honorarios ?? "")}
              onChange={(e) => {
                const n = parseFloat(e.target.value.replace(",", "."));
                updateLaudo({
                  valor_honorarios: isNaN(n) ? 0 : n,
                } as any);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Data da perícia</Label>
            <Textarea
              rows={1}
              value={l.data_pericia ?? ""}
              onChange={(e) => updateLaudo({ data_pericia: e.target.value } as any)}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Local da perícia</Label>
            <Textarea
              rows={1}
              value={l.local_pericia ?? ""}
              onChange={(e) => updateLaudo({ local_pericia: e.target.value } as any)}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Anotações internas</Label>
            <Textarea
              rows={3}
              value={l.anotacoes ?? ""}
              onChange={(e) => updateLaudo({ anotacoes: e.target.value } as any)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
