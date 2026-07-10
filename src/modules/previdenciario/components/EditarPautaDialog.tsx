import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { updatePauta, listPautas } from "../api/pautas";
import type { PrevPauta } from "../types";
import { Info } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pauta: PrevPauta;
  onSaved: () => void;
}

const UF_LIST = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

export function EditarPautaDialog({ open, onOpenChange, pauta, onSaved }: Props) {
  const [data, setData] = useState(pauta.data);
  const [local, setLocal] = useState(pauta.local);
  const [cidade, setCidade] = useState(pauta.cidade ?? "");
  const [uf, setUf] = useState(pauta.uf ?? "");
  const [obs, setObs] = useState(pauta.observacoes ?? "");
  const [saving, setSaving] = useState(false);
  const [datasExistentes, setDatasExistentes] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setData(pauta.data);
    setLocal(pauta.local);
    setCidade(pauta.cidade ?? "");
    setUf(pauta.uf ?? "");
    setObs(pauta.observacoes ?? "");
    // Carrega datas já usadas por outras pautas do usuário para exibir aviso
    (async () => {
      try {
        const list = await listPautas();
        setDatasExistentes(new Set(list.filter((p) => p.id !== pauta.id).map((p) => p.data)));
      } catch {
        // silencioso — aviso é apenas informativo
      }
    })();
  }, [open, pauta]);

  const jaExisteNaData = data !== pauta.data && datasExistentes.has(data);

  const handleSubmit = async () => {
    if (!data || !local.trim()) {
      toast({ variant: "destructive", title: "Preencha data e local" });
      return;
    }
    setSaving(true);
    try {
      await updatePauta(pauta.id, {
        data,
        local: local.trim(),
        cidade: cidade.trim() || null,
        uf: uf.trim() ? uf.trim().toUpperCase() : null,
        observacoes: obs.trim() || null,
      });
      toast({ title: "Pauta atualizada" });
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro ao salvar", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Editar pauta</DialogTitle>
          <DialogDescription>
            Atualize os dados da pauta. As perícias e PDFs dentro dela não são afetados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-data">Data</Label>
              <Input
                id="edit-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-uf">UF</Label>
              <select
                id="edit-uf"
                value={uf}
                onChange={(e) => setUf(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {UF_LIST.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {jaExisteNaData && (
            <div className="flex items-start gap-2 text-xs rounded-md border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Já existe outra pauta neste dia — as duas continuarão listadas juntas
                no agrupamento por data.
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="edit-local">Local *</Label>
            <Input
              id="edit-local"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="Ex: 7ª Vara Federal — União dos Palmares"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-cidade">Cidade</Label>
            <Input
              id="edit-cidade"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              placeholder="Ex: União dos Palmares"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-obs">Observações</Label>
            <Textarea
              id="edit-obs"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={2}
              placeholder="Notas internas (opcional)"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
