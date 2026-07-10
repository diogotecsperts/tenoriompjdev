import { useEffect, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Lock, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export type BlockMode = "none" | "notice" | "blocked";

interface BlockConfigPopoverProps {
  userId: string;
  module: "trabalhista" | "previdenciario";
  currentMode: BlockMode;
  currentMessage: string;
  onSaved: (mode: BlockMode, message: string) => void;
}

export function BlockConfigPopover({
  userId,
  module,
  currentMode,
  currentMessage,
  onSaved,
}: BlockConfigPopoverProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<BlockMode>(currentMode);
  const [message, setMessage] = useState(currentMessage);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(currentMode);
      setMessage(currentMessage);
    }
  }, [open, currentMode, currentMessage]);

  const save = async () => {
    setSaving(true);
    const payload = {
      user_id: userId,
      module,
      block_mode: mode === "none" ? null : mode,
      block_message: message.trim() || null,
    };
    const { error } = await (supabase.from as any)("user_modules").upsert(
      payload,
      { onConflict: "user_id,module" },
    );
    setSaving(false);
    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar bloqueio",
        description: error.message,
      });
      return;
    }
    toast({ title: "Bloqueio atualizado" });
    onSaved(mode, message.trim());
    setOpen(false);
  };

  const badge =
    currentMode === "blocked" ? (
      <Badge variant="destructive" className="gap-1">
        <Lock className="h-3 w-3" /> Bloqueado
      </Badge>
    ) : currentMode === "notice" ? (
      <Badge className="gap-1 bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200">
        <AlertTriangle className="h-3 w-3" /> Aviso
      </Badge>
    ) : (
      <Badge variant="outline" className="text-muted-foreground">
        Livre
      </Badge>
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted",
          )}
          title="Configurar bloqueio/aviso"
        >
          {badge}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 pointer-events-auto" align="end">
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-sm">Bloqueio do módulo</h4>
            <p className="text-xs text-muted-foreground">
              Configure aviso ou bloqueio total para este módulo/usuário.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Modo</Label>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as BlockMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="pointer-events-auto">
                <SelectItem value="none">Nenhum</SelectItem>
                <SelectItem value="notice">Só aviso (permite entrar)</SelectItem>
                <SelectItem value="blocked">Bloquear acesso</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Mensagem exibida no card</Label>
            <Textarea
              rows={3}
              placeholder="Ex.: Em manutenção até 15/07"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={mode === "none"}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
