import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pencil, Check } from "lucide-react";
import { useState } from "react";
import type { IdentificacaoData } from "../../lib/prelaudo-structure";

const ESCOLARIDADE_OPCOES = [
  "Analfabeto",
  "Ensino fundamental incompleto",
  "Ensino fundamental completo",
  "Ensino médio incompleto",
  "Ensino médio completo",
  "Ensino superior incompleto",
  "Ensino superior completo",
  "Pós-graduação",
  "Mestrado",
  "Doutorado",
];

interface Props {
  value: Partial<IdentificacaoData>;
  onChange: (patch: Partial<IdentificacaoData>) => void;
}

export function Step01Identificacao({ value, onChange }: Props) {
  const set = (k: keyof IdentificacaoData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ [k]: e.target.value } as Partial<IdentificacaoData>);
  const [escOpen, setEscOpen] = useState(false);

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
            <Input type="date" value={value.data_nascimento ?? ""} onChange={set("data_nascimento")} />
          </Field>
          <Field label="Idade">
            <Input value={value.idade ?? ""} onChange={set("idade")} />
          </Field>
          <Field label="Sexo">
            <Input value={value.sexo ?? ""} onChange={set("sexo")} placeholder="M / F" />
          </Field>
          <Field label="Estado civil">
            <Input value={value.estado_civil ?? ""} onChange={set("estado_civil")} />
          </Field>
          <Field label="Escolaridade">
            <div className="flex items-center gap-1.5">
              <Input
                value={value.escolaridade ?? ""}
                onChange={set("escolaridade")}
                className="flex-1"
              />
              <Popover open={escOpen} onOpenChange={setEscOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    title="Selecionar escolaridade da lista"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-1" align="end">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5">
                    Selecionar escolaridade
                  </div>
                  <div className="max-h-72 overflow-y-auto custom-scrollbar">
                    {ESCOLARIDADE_OPCOES.map((op) => {
                      const selected = (value.escolaridade ?? "") === op;
                      return (
                        <button
                          key={op}
                          type="button"
                          onClick={() => {
                            onChange({ escolaridade: op });
                            setEscOpen(false);
                          }}
                          className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted flex items-center justify-between"
                        >
                          <span>{op}</span>
                          {selected && <Check className="h-3.5 w-3.5 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </Field>
          <Field label="Pessoas que vivem sob o mesmo teto" full>
            <Input
              value={value.pessoas_mesmo_teto ?? ""}
              onChange={set("pessoas_mesmo_teto")}
              placeholder='ex: "3 pessoas: esposa e dois filhos"'
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
              placeholder='ex: "8 meses" ou "desde 03/2024"'
            />
          </Field>
        </Grid>
      </Section>

      <Section title="Processo judicial">
        <Grid>
          <Field label="Nº do processo" full>
            <Input value={value.numero_processo ?? ""} onChange={set("numero_processo")} />
          </Field>
          <Field label="Vara">
            <Input value={value.vara ?? ""} onChange={set("vara")} />
          </Field>
          <Field label="Comarca">
            <Input value={value.comarca ?? ""} onChange={set("comarca")} />
          </Field>
          <Field label="Benefício pleiteado" full>
            <Input value={value.beneficio_pleiteado ?? ""} onChange={set("beneficio_pleiteado")} />
          </Field>
        </Grid>
      </Section>
    </div>
  );
}

// ----- shared -----
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
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
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
