import { useState } from "react";
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
import { useAuth } from "@/contexts/AuthContext";
import { createPauta } from "../api/pautas";
import type { PrevPauta } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (pauta: PrevPauta) => void;
}

const UF_LIST = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

export function NovaPautaDialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [local, setLocal] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setData(new Date().toISOString().slice(0, 10));
    setLocal("");
    setCidade("");
    setUf("");
    setObs("");
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (!data || !local.trim()) {
      toast({ variant: "destructive", title: "Preencha data e local" });
      return;
    }
    setSaving(true);
    try {
      const pauta = await createPauta({
        user_id: user.id,
        data,
        local: local.trim(),
        cidade: cidade.trim() || null,
        uf: uf.trim() ? uf.trim().toUpperCase() : null,
        observacoes: obs.trim() || null,
      });
      toast({ title: "Pauta criada" });
      reset();
      onOpenChange(false);
      onCreated(pauta);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro ao criar", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Nova pauta</DialogTitle>
          <DialogDescription>
            Crie uma pasta por data e local. Você poderá agrupar várias perícias dentro dela.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="data">Data</Label>
              <Input
                id="data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uf">UF</Label>
              <select
                id="uf"
                value={uf}
                onChange={(e) => setUf(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {UF_LIST.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="local">Local *</Label>
            <Input
              id="local"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="Ex: 7ª Vara Federal — União dos Palmares"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cidade">Cidade</Label>
            <Input
              id="cidade"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              placeholder="Ex: União dos Palmares"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="obs">Observações</Label>
            <Textarea
              id="obs"
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
            {saving ? "Salvando…" : "Criar pauta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
