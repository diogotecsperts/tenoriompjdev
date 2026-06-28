import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IdentificacaoData } from "../lib/prelaudo-structure";

interface Props {
  value: Partial<IdentificacaoData>;
  onChange: (patch: Partial<IdentificacaoData>) => void;
}

/**
 * Cabeçalho fixo do Pré-Laudo: dados do processo, exibido no topo do editor
 * (fora dos steps) e replicado no topo do DOCX/PDF exportado.
 */
export function ProcessoHeader({ value, onChange }: Props) {
  const set =
    (k: keyof IdentificacaoData) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ [k]: e.target.value } as Partial<IdentificacaoData>);

  return (
    <div className="bg-card/60 border border-border rounded-lg p-3 mb-5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Dados do processo
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        <Field label="Nº do processo" full>
          <Input
            value={value.numero_processo ?? ""}
            onChange={set("numero_processo")}
            className="h-8 text-sm"
          />
        </Field>
        <Field label="Vara">
          <Input value={value.vara ?? ""} onChange={set("vara")} className="h-8 text-sm" />
        </Field>
        <Field label="Comarca">
          <Input value={value.comarca ?? ""} onChange={set("comarca")} className="h-8 text-sm" />
        </Field>
        <Field label="Data da perícia">
          <Input
            type="date"
            value={value.data_pericia ?? ""}
            onChange={set("data_pericia")}
            className="h-8 text-sm"
          />
        </Field>
        <Field label="Benefício pleiteado" colSpan={2}>
          <Input
            value={value.beneficio_pleiteado ?? ""}
            onChange={set("beneficio_pleiteado")}
            className="h-8 text-sm"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  full,
  colSpan,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
  colSpan?: 2 | 3;
}) {
  const cls = full
    ? "md:col-span-3"
    : colSpan === 2
    ? "md:col-span-2"
    : "";
  return (
    <div className={cls}>
      <Label className="text-[10px] text-muted-foreground mb-0.5 block">{label}</Label>
      {children}
    </div>
  );
}
