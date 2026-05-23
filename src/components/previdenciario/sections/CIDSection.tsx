import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { useLaudoPrev } from "@/contexts/previdenciario/LaudoPrevidenciarioContext";
import { AiGenerateButton } from "./AiGenerateButton";

interface CidItem {
  codigo: string;
  descricao: string;
}

export function CIDSection() {
  const { laudo, updateLaudo, updatePrevData } = useLaudoPrev();
  const [novo, setNovo] = useState<CidItem>({ codigo: "", descricao: "" });

  if (!laudo) return null;
  const l: any = laudo;
  const cids: CidItem[] = Array.isArray(l.cids_selecionados) ? l.cids_selecionados : [];

  const setCids = (next: CidItem[]) =>
    updateLaudo({ cids_selecionados: next } as any);

  const handleAdd = () => {
    if (!novo.codigo.trim()) return;
    setCids([...cids, { codigo: novo.codigo.trim().toUpperCase(), descricao: novo.descricao.trim() }]);
    setNovo({ codigo: "", descricao: "" });
  };

  const handleRemove = (i: number) => setCids(cids.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Diagnóstico (CID-10)</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              CIDs identificados na perícia e que fundamentam a análise da incapacidade.
            </p>
          </div>

          <div className="space-y-2">
            {cids.length === 0 && (
              <p className="text-sm text-muted-foreground italic">
                Nenhum CID adicionado ainda.
              </p>
            )}
            {cids.map((c, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                <span className="font-mono text-sm font-medium text-primary w-20">{c.codigo}</span>
                <span className="text-sm text-foreground flex-1 truncate">{c.descricao || "—"}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleRemove(i)}
                  title="Remover"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[120px_1fr_auto] gap-2 items-end pt-2 border-t">
            <div className="space-y-1.5">
              <Label className="text-xs">Código CID</Label>
              <Input
                value={novo.codigo}
                onChange={(e) => setNovo({ ...novo, codigo: e.target.value })}
                placeholder="M54.5"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição</Label>
              <Input
                value={novo.descricao}
                onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
                placeholder="Dor lombar baixa"
              />
            </div>
            <Button onClick={handleAdd} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Descrição Técnica das Doenças</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Fundamentação médica detalhada de cada quadro nosológico.
            </p>
          </div>
          <Textarea
            rows={6}
            value={l.descricao_tecnica_doencas ?? ""}
            onChange={(e) =>
              updateLaudo({ descricao_tecnica_doencas: e.target.value } as any)
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
