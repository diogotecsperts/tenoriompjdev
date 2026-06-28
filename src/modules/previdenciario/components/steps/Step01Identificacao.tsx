import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ESTADO_CIVIL_OPCOES,
  ESCOLARIDADE_OPCOES,
  type IdentificacaoData,
} from "../../lib/prelaudo-structure";

interface Props {
  value: Partial<IdentificacaoData>;
  onChange: (patch: Partial<IdentificacaoData>) => void;
}

export function Step01Identificacao({ value, onChange }: Props) {
  const set =
    (k: keyof IdentificacaoData) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ [k]: e.target.value } as Partial<IdentificacaoData>);

  const ecOutros = (value.estado_civil ?? "").toLowerCase() === "outros";
  const escOutros = (value.escolaridade ?? "").toLowerCase() === "outros";

  return (
    <div className="space-y-6">
      <Header
        title="1. Identificação"
        subtitle="Confirme os dados do periciado. Campos pré-preenchidos pela IA aparecem em itálico — revise tudo."
      />

      <Section title="Dados pessoais">
        <Grid>
          <Field label="Nome completo" full>
            <Input value={value.nome ?? ""} onChange={set("nome")} />
          </Field>
          <Field label="CPF">
            <Input value={value.cpf ?? ""} onChange={set("cpf")} />
          </Field>
          <Field label="RG">
            <Input value={value.rg ?? ""} onChange={set("rg")} />
          </Field>
          <Field label="Data de nascimento">
            <Input
              type="date"
              value={value.data_nascimento ?? ""}
              onChange={set("data_nascimento")}
            />
          </Field>
          <Field label="Idade">
            <Input value={value.idade ?? ""} onChange={set("idade")} />
          </Field>
          <Field label="Sexo">
            <Input value={value.sexo ?? ""} onChange={set("sexo")} placeholder="M / F" />
          </Field>

          <Field label="Estado civil">
            <Select
              value={value.estado_civil ?? ""}
              onValueChange={(v) =>
                onChange({
                  estado_civil: v,
                  ...(v.toLowerCase() !== "outros" ? { estado_civil_outros: "" } : {}),
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {ESTADO_CIVIL_OPCOES.map((op) => (
                  <SelectItem key={op} value={op}>
                    {op}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {ecOutros && (
              <Input
                className="mt-2"
                value={value.estado_civil_outros ?? ""}
                onChange={set("estado_civil_outros")}
                placeholder="Especifique o estado civil"
              />
            )}
          </Field>

          <Field label="Escolaridade">
            <Select
              value={value.escolaridade ?? ""}
              onValueChange={(v) =>
                onChange({
                  escolaridade: v,
                  ...(v.toLowerCase() !== "outros" ? { escolaridade_outros: "" } : {}),
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {ESCOLARIDADE_OPCOES.map((op) => (
                  <SelectItem key={op} value={op}>
                    {op}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {escOutros && (
              <Input
                className="mt-2"
                value={value.escolaridade_outros ?? ""}
                onChange={set("escolaridade_outros")}
                placeholder="Especifique a escolaridade"
              />
            )}
          </Field>

          <Field label="Pessoas que vivem sob o mesmo teto" full>
            <Input
              value={value.pessoas_mesmo_teto ?? ""}
              onChange={set("pessoas_mesmo_teto")}
              placeholder='Preenchido automaticamente apenas em BPC/LOAS. Edite livremente.'
            />
          </Field>
        </Grid>
      </Section>

      <Section title="Atividade laboral">
        <Grid>
          <Field label="Profissão">
            <Input value={value.profissao ?? ""} onChange={set("profissao")} />
          </Field>
          <Field label="Última atividade exercida">
            <Input value={value.ultima_atividade ?? ""} onChange={set("ultima_atividade")} />
          </Field>
          <Field label="Tempo que está sem trabalhar" full>
            <Input
              value={value.tempo_sem_trabalhar ?? ""}
              onChange={set("tempo_sem_trabalhar")}
              placeholder='Preenchimento manual (ex.: "8 meses" ou "desde 03/2024")'
            />
          </Field>
        </Grid>
      </Section>
    </div>
  );
}

// ----- shared layout helpers (re-usados pelos outros steps) -----
export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}
export function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>;
}
export function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="text-xs text-muted-foreground mb-1 block">{label}</Label>
      {children}
    </div>
  );
}
