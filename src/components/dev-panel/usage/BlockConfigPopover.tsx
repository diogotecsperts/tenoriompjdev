import { useEffect, useRef, useState } from "react";
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
  onSaved: (mode: BlockMode, message: string, enabled: boolean) => void;
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
  const initializedRef = useRef(false);

  // Initialize state only when transitioning from closed -> open
  useEffect(() => {
    if (open && !initializedRef.current) {
      setMode(currentMode);
      setMessage(currentMessage);
      initializedRef.current = true;
    } else if (!open) {
      initializedRef.current = false;
    }
  }, [open, currentMode, currentMessage]);

  const trimmed = message.trim();
  const needsMessage = mode !== "none" && trimmed.length === 0;

  const save = async () => {
    if (needsMessage) return;
    setSaving(true);
    // Integrate with enabled toggle: blocked -> disable access; notice/none -> enable
    const nextEnabled = mode !== "blocked";
    const payload = {
      user_id: userId,
      module,
      enabled: nextEnabled,
      block_mode: mode === "none" ? null : mode,
      block_message: mode === "none" ? null : trimmed,
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
    onSaved(mode, mode === "none" ? "" : trimmed, nextEnabled);
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
              O modo escolhido aqui já sincroniza o toggle de acesso ao lado.
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
                <SelectItem value="none">Nenhum (livre)</SelectItem>
                <SelectItem value="notice">Só aviso (permite entrar)</SelectItem>
                <SelectItem value="blocked">Bloquear acesso</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              Mensagem exibida no card
              {mode !== "none" && <span className="text-destructive"> *</span>}
            </Label>
            <Textarea
              rows={3}
              placeholder="Ex.: Em manutenção até 15/07"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={mode === "none"}
            />
            {needsMessage && (
              <p className="text-[11px] text-destructive">
                Informe uma mensagem para exibir ao usuário.
              </p>
            )}
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
            <Button size="sm" onClick={save} disabled={saving || needsMessage}>
              {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
