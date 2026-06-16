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
import { Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { createPericia, updatePericia, uploadPericiaPdf } from "../api/pautas";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pautaId: string;
  proximaOrdem: number;
  onCreated: () => void;
}

export function NovaPericiaDialog({
  open,
  onOpenChange,
  pautaId,
  proximaOrdem,
  onCreated,
}: Props) {
  const { user } = useAuth();
  const [nome, setNome] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setNome("");
    setFile(null);
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (!nome.trim() && !file) {
      toast({ variant: "destructive", title: "Informe o nome do periciado ou anexe o PDF" });
      return;
    }
    setSaving(true);
    try {
      const pericia = await createPericia({
        pauta_id: pautaId,
        user_id: user.id,
        ordem: proximaOrdem,
        periciado_nome: nome.trim() || null,
      });

      if (file) {
        const path = await uploadPericiaPdf(user.id, pericia.id, file);
        await updatePericia(pericia.id, { pdf_path: path });
      }

      toast({ title: "Perícia adicionada" });
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Nova perícia</DialogTitle>
          <DialogDescription>
            Adicione um periciado à pauta. Anexe o PDF do processo (opcional agora).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome do periciado</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
              className="uppercase"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pdf">PDF do processo (opcional)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="pdf"
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="cursor-pointer"
              />
              {file && (
                <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                  <Upload className="h-3 w-3 inline mr-1" />
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              O PDF será processado pela IA antes da perícia (próxima fase).
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Salvando…" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
