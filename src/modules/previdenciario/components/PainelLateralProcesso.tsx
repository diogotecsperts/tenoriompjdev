import { useState } from "react";
import { FileText, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  extracao: Record<string, any> | undefined;
  hasPdf: boolean;
}

/**
 * Painel lateral fixo com o cache da extração IA (zero chamadas IA durante a perícia).
 * Mostra somente leitura — fonte de consulta rápida durante o atendimento.
 */
export function PainelLateralProcesso({ extracao, hasPdf }: Props) {
  const [open, setOpen] = useState(true);

  if (!hasPdf) {
    return (
      <aside className="w-72 shrink-0 border-l border-border bg-card/30 p-4">
        <div className="text-xs text-muted-foreground italic">
          Nenhum PDF anexado a esta perícia.
        </div>
      </aside>
    );
  }

  if (!extracao || Object.keys(extracao).length === 0) {
    return (
      <aside className="w-72 shrink-0 border-l border-border bg-card/30 p-4 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Sparkles className="h-3.5 w-3.5" /> Processo
        </div>
        <p className="text-xs text-muted-foreground">
          PDF anexado, mas ainda não processado pela IA. Volte para a pauta e clique em "Processar com IA".
        </p>
      </aside>
    );
  }

  const ident = extracao.identificacao || {};
  const proc = extracao.processo || {};
  const docs: any[] = Array.isArray(extracao.documentos) ? extracao.documentos : [];
  const meds: any[] = Array.isArray(extracao.medicacoes) ? extracao.medicacoes : [];
  const cids: any[] = Array.isArray(extracao.cids_alegados) ? extracao.cids_alegados : [];

  return (
    <aside
      className={cn(
        "shrink-0 border-l border-border bg-card/30 transition-all overflow-hidden flex flex-col h-full",
        open ? "w-80" : "w-10",
      )}
    >
      <div className="flex items-center justify-between p-2 border-b border-border">
        {open && (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <FileText className="h-3.5 w-3.5" /> Processo (IA)
          </div>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
          title={open ? "Recolher" : "Expandir"}
        >
          {open ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="p-3 space-y-4 overflow-y-auto flex-1 min-h-0 custom-scrollbar text-xs">
          <Section title="Identificação">
            <KV k="Nome" v={ident.nome} />
            <KV k="CPF" v={ident.cpf} />
            <KV k="Nasc." v={ident.data_nascimento} />
            <KV k="Sexo" v={ident.sexo} />
            <KV k="Profissão" v={ident.profissao} />
            <KV k="Última atividade" v={ident.ultima_atividade} />
            <KV k="Tempo sem trabalhar" v={ident.tempo_sem_trabalhar} />
            <KV k="Pessoas no mesmo teto" v={ident.pessoas_mesmo_teto} />
          </Section>

          <Section title="Processo">
            <KV k="Nº" v={proc.numero} />
            <KV k="Vara" v={proc.vara} />
            <KV k="Comarca" v={proc.comarca} />
            <KV k="Benefício" v={proc.beneficio_pleiteado} />
          </Section>

          {extracao.queixa_principal && (
            <Section title="Queixa principal">
              <p className="text-foreground/80 whitespace-pre-wrap">{extracao.queixa_principal}</p>
            </Section>
          )}

          {extracao.historia_clinica && (
            <Section title="História clínica">
              <p className="text-foreground/80 whitespace-pre-wrap">{extracao.historia_clinica}</p>
            </Section>
          )}

          {extracao.historia_laboral && (
            <Section title="História laboral">
              <p className="text-foreground/80 whitespace-pre-wrap">{extracao.historia_laboral}</p>
            </Section>
          )}

          {cids.length > 0 && (
            <Section title="CIDs alegados">
              <div className="flex flex-wrap gap-1">
                {cids.map((c, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-mono">
                    {String(c)}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {meds.length > 0 && (
            <Section title="Medicações mencionadas">
              <ul className="space-y-0.5 list-disc list-inside text-foreground/80">
                {meds.map((m, i) => (
                  <li key={i}>{typeof m === "string" ? m : m?.nome || "—"}</li>
                ))}
              </ul>
            </Section>
          )}

          {docs.length > 0 && (
            <Section title={`Documentos (${docs.length})`}>
              <ul className="space-y-1.5">
                {docs.map((d, i) => (
                  <li key={i} className="border-l-2 border-primary/30 pl-2">
                    <div className="text-[10px] font-mono uppercase text-muted-foreground">
                      {d?.tipo || "outro"} {d?.data ? `· ${d.data}` : ""}
                    </div>
                    <div className="text-foreground/80">{d?.resumo || "—"}</div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v?: string }) {
  if (!v) return null;
  return (
    <div className="flex gap-1.5">
      <span className="text-muted-foreground shrink-0">{k}:</span>
      <span className="text-foreground/90 break-words">{v}</span>
    </div>
  );
}
