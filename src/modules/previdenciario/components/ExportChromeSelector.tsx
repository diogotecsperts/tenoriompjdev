import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LayoutTemplate } from "lucide-react";

export interface ExportChromeValue {
  header: boolean;
  footer: boolean;
}

interface Props {
  value: ExportChromeValue;
  onChange: (next: ExportChromeValue) => void;
  disabled?: boolean;
}

export function ExportChromeSelector({ value, onChange, disabled }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="px-2"
          title="Cabeçalho e rodapé"
          aria-label="Cabeçalho e rodapé no export"
        >
          <LayoutTemplate className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="text-xs font-semibold text-foreground mb-1">
          Cabeçalho e rodapé no export
        </div>
        <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
          Escolha se o timbrado deve aparecer no PDF e no DOCX. Sua preferência é
          lembrada para os próximos laudos.
        </p>

        <div className="space-y-1">
          <label className="flex items-center gap-2 px-1.5 py-1.5 rounded hover:bg-muted cursor-pointer">
            <Checkbox
              checked={value.header}
              onCheckedChange={(c) => onChange({ ...value, header: c === true })}
            />
            <span className="text-xs text-foreground flex-1">Cabeçalho timbrado</span>
          </label>
          <label className="flex items-center gap-2 px-1.5 py-1.5 rounded hover:bg-muted cursor-pointer">
            <Checkbox
              checked={value.footer}
              onCheckedChange={(c) => onChange({ ...value, footer: c === true })}
            />
            <span className="text-xs text-foreground flex-1">
              Rodapé timbrado (com nº de página)
            </span>
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}
