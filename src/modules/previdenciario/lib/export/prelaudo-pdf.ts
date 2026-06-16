/**
 * Exportador de PDF do Pré-Laudo Previdenciário.
 * Independente do módulo Trabalhista. Usa jspdf (já no projeto).
 */
import { jsPDF } from "jspdf";
import type { PrelaudoData, CidItem, MedicacaoItem } from "../prelaudo-structure";

const PAGE = { w: 210, h: 297, marginX: 18, marginTop: 20, marginBottom: 18 };
const CONTENT_W = PAGE.w - PAGE.marginX * 2;
const COLOR = {
  primary: [42, 157, 143] as [number, number, number], // #2A9D8F teal
  text: [31, 41, 55] as [number, number, number],
  muted: [107, 114, 128] as [number, number, number],
  border: [209, 213, 219] as [number, number, number],
  bg: [248, 250, 252] as [number, number, number],
};

interface BuildContext {
  doc: jsPDF;
  y: number;
  pageNum: number;
  periciado: string;
  dataPericia: string;
}

function fmtDate(iso?: string): string {
  if (!iso) return "";
  // YYYY-MM-DD -> DD/MM/YYYY
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso;
}

function ensureSpace(ctx: BuildContext, needed: number) {
  if (ctx.y + needed > PAGE.h - PAGE.marginBottom) {
    drawFooter(ctx);
    ctx.doc.addPage();
    ctx.pageNum++;
    drawHeader(ctx);
    ctx.y = PAGE.marginTop + 18;
  }
}

function drawHeader(ctx: BuildContext) {
  const { doc } = ctx;
  doc.setFillColor(...COLOR.primary);
  doc.rect(0, 0, PAGE.w, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("PRÉ-LAUDO PERICIAL PREVIDENCIÁRIO", PAGE.marginX, 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(fmtDate(ctx.dataPericia), PAGE.w - PAGE.marginX, 8, { align: "right" });
}

function drawFooter(ctx: BuildContext) {
  const { doc } = ctx;
  const y = PAGE.h - 10;
  doc.setDrawColor(...COLOR.border);
  doc.setLineWidth(0.2);
  doc.line(PAGE.marginX, y - 4, PAGE.w - PAGE.marginX, y - 4);
  doc.setTextColor(...COLOR.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(ctx.periciado || "Pré-laudo", PAGE.marginX, y);
  doc.text(`Página ${ctx.pageNum}`, PAGE.w - PAGE.marginX, y, { align: "right" });
}

function sectionTitle(ctx: BuildContext, num: number, title: string) {
  ensureSpace(ctx, 14);
  const { doc } = ctx;
  doc.setFillColor(...COLOR.primary);
  doc.rect(PAGE.marginX, ctx.y, 4, 7, "F");
  doc.setTextColor(...COLOR.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`${num}. ${title.toUpperCase()}`, PAGE.marginX + 7, ctx.y + 5.5);
  ctx.y += 10;
}

function kv(ctx: BuildContext, label: string, value: string) {
  if (!value) return;
  const { doc } = ctx;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLOR.muted);
  const labelW = doc.getTextWidth(`${label}: `);
  ensureSpace(ctx, 6);
  doc.text(`${label}:`, PAGE.marginX, ctx.y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLOR.text);
  const lines = doc.splitTextToSize(value, CONTENT_W - labelW - 2);
  doc.text(lines, PAGE.marginX + labelW, ctx.y);
  ctx.y += Math.max(5, lines.length * 4.5);
}

function paragraph(ctx: BuildContext, text: string) {
  if (!text) return;
  const { doc } = ctx;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COLOR.text);
  const lines = doc.splitTextToSize(text, CONTENT_W);
  for (const line of lines) {
    ensureSpace(ctx, 5);
    doc.text(line, PAGE.marginX, ctx.y);
    ctx.y += 5;
  }
  ctx.y += 2;
}

function emptyNote(ctx: BuildContext) {
  const { doc } = ctx;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...COLOR.muted);
  ensureSpace(ctx, 5);
  doc.text("— Não informado.", PAGE.marginX, ctx.y);
  ctx.y += 6;
}

const hasAny = (obj: any): boolean =>
  obj && Object.values(obj).some((v) => (Array.isArray(v) ? v.length > 0 : !!v));

export interface PrelaudoPdfMeta {
  periciado: string;
  dataPericia: string; // ISO
  local?: string;
  numeroProcesso?: string;
  peritoNome?: string;
}

export function generatePrelaudoPdf(data: PrelaudoData, meta: PrelaudoPdfMeta): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ctx: BuildContext = {
    doc,
    y: PAGE.marginTop,
    pageNum: 1,
    periciado: meta.periciado || data.identificacao?.nome || "",
    dataPericia: meta.dataPericia,
  };

  drawHeader(ctx);
  ctx.y = PAGE.marginTop + 18;

  // ----- Cabeçalho do documento -----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...COLOR.text);
  doc.text("Pré-Laudo Pericial", PAGE.marginX, ctx.y);
  ctx.y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLOR.muted);
  if (meta.local) doc.text(`Local: ${meta.local}`, PAGE.marginX, ctx.y), (ctx.y += 4);
  if (meta.dataPericia)
    doc.text(`Data da perícia: ${fmtDate(meta.dataPericia)}`, PAGE.marginX, ctx.y), (ctx.y += 4);
  if (meta.peritoNome) doc.text(`Perito: ${meta.peritoNome}`, PAGE.marginX, ctx.y), (ctx.y += 4);
  ctx.y += 4;

  // ----- 1. Identificação -----
  sectionTitle(ctx, 1, "Identificação");
  if (!hasAny(data.identificacao)) emptyNote(ctx);
  else {
    const id = data.identificacao;
    kv(ctx, "Nome", id.nome || "");
    kv(ctx, "CPF", id.cpf || "");
    kv(ctx, "RG", id.rg || "");
    kv(ctx, "Data de nascimento", fmtDate(id.data_nascimento));
    kv(ctx, "Idade", id.idade || "");
    kv(ctx, "Sexo", id.sexo || "");
    kv(ctx, "Estado civil", id.estado_civil || "");
    kv(ctx, "Escolaridade", id.escolaridade || "");
    kv(ctx, "Profissão", id.profissao || "");
    kv(ctx, "Última atividade", id.ultima_atividade || "");
    kv(ctx, "Endereço", id.endereco || "");
    kv(ctx, "Telefone", id.telefone || "");
    if (id.numero_processo || id.vara || id.comarca || id.beneficio_pleiteado) {
      ctx.y += 2;
      kv(ctx, "Nº do processo", id.numero_processo || "");
      kv(ctx, "Vara", id.vara || "");
      kv(ctx, "Comarca", id.comarca || "");
      kv(ctx, "Benefício pleiteado", id.beneficio_pleiteado || "");
    }
  }

  // ----- 2. Queixa -----
  sectionTitle(ctx, 2, "Queixa principal");
  if (!hasAny(data.queixa)) emptyNote(ctx);
  else {
    const q = data.queixa;
    if (q.queixa_principal) paragraph(ctx, q.queixa_principal);
    kv(ctx, "Início dos sintomas", q.inicio_sintomas || "");
    kv(ctx, "Evolução", q.evolucao || "");
    kv(ctx, "Lateralidade", q.lateralidade || "");
    kv(ctx, "Fatores agravantes", q.fatores_agravantes || "");
  }

  // ----- 3. Medicação -----
  sectionTitle(ctx, 3, "Medicação em uso");
  const itens = data.medicacao?.itens ?? [];
  if (itens.length === 0 && !data.medicacao?.observacoes) emptyNote(ctx);
  else {
    itens.forEach((m: MedicacaoItem) => {
      const parts = [m.nome, m.dose, m.frequencia].filter(Boolean).join(" — ");
      const status = m.em_uso === false ? " (suspensa)" : "";
      paragraph(ctx, `• ${parts}${status}`);
    });
    if (data.medicacao?.observacoes) {
      ctx.y += 1;
      kv(ctx, "Observações", data.medicacao.observacoes);
    }
  }

  // ----- 4. Acompanhamento -----
  sectionTitle(ctx, 4, "Acompanhamento médico");
  if (!hasAny(data.acompanhamento)) emptyNote(ctx);
  else {
    const a = data.acompanhamento;
    kv(ctx, "Faz acompanhamento", a.faz_acompanhamento === "sim" ? "Sim" : a.faz_acompanhamento === "nao" ? "Não" : "");
    kv(ctx, "Especialistas", a.especialistas || "");
    kv(ctx, "Frequência", a.frequencia || "");
    kv(ctx, "Última consulta", a.ultima_consulta || "");
    if (a.observacoes) { ctx.y += 1; kv(ctx, "Observações", a.observacoes); }
  }

  // ----- 5. Comorbidades -----
  sectionTitle(ctx, 5, "Comorbidades");
  const c = data.comorbidades;
  if (!hasAny(c)) emptyNote(ctx);
  else {
    if (c.lista && c.lista.length > 0) paragraph(ctx, c.lista.join(" • "));
    if (c.texto) paragraph(ctx, c.texto);
    kv(ctx, "Cirurgias prévias", c.cirurgias_previas || "");
    kv(ctx, "Internações", c.internacoes || "");
    kv(ctx, "Histórico familiar", c.historico_familiar || "");
  }

  // ----- 6. Estado mental -----
  sectionTitle(ctx, 6, "Estado mental");
  const em = data.estado_mental;
  if (!hasAny(em)) emptyNote(ctx);
  else {
    kv(ctx, "Orientação", em.orientacao || "");
    kv(ctx, "Humor", em.humor || "");
    kv(ctx, "Afeto", em.afeto || "");
    kv(ctx, "Pensamento", em.pensamento || "");
    kv(ctx, "Memória", em.memoria || "");
    kv(ctx, "Atenção", em.atencao || "");
    kv(ctx, "Juízo e crítica", em.juizo_critica || "");
    if (em.observacoes) { ctx.y += 1; kv(ctx, "Observações", em.observacoes); }
  }

  // ----- 7. Ectoscopia -----
  sectionTitle(ctx, 7, "Ectoscopia / Exame geral");
  const ec = data.ectoscopia;
  if (!hasAny(ec)) emptyNote(ctx);
  else {
    kv(ctx, "Estado geral", ec.estado_geral || "");
    kv(ctx, "Hidratação", ec.hidratacao || "");
    kv(ctx, "Corado", ec.corado || "");
    kv(ctx, "Acianótico", ec.acianotico || "");
    kv(ctx, "Anictérico", ec.anicterico || "");
    kv(ctx, "Marcha", ec.marcha || "");
    kv(ctx, "Postura", ec.postura || "");
    kv(ctx, "Peso", ec.peso || "");
    kv(ctx, "Altura", ec.altura || "");
    kv(ctx, "IMC", ec.imc || "");
    kv(ctx, "Pressão arterial", ec.pressao_arterial || "");
    if (ec.observacoes) { ctx.y += 1; kv(ctx, "Observações", ec.observacoes); }
  }

  // ----- 8. Exame ortopédico -----
  sectionTitle(ctx, 8, "Exame ortopédico");
  const ort = data.exame_ortopedico;
  if (!hasAny(ort)) emptyNote(ctx);
  else {
    kv(ctx, "Segmento avaliado", ort.segmento_avaliado || "");
    kv(ctx, "Inspeção", ort.inspecao || "");
    kv(ctx, "Palpação", ort.palpacao || "");
    kv(ctx, "Amplitude de movimento", ort.amplitude_movimento || "");
    kv(ctx, "Força muscular", ort.forca_muscular || "");
    kv(ctx, "Reflexos", ort.reflexos || "");
    kv(ctx, "Testes especiais", ort.testes_especiais || "");
    kv(ctx, "Manobras", ort.manobras || "");
    if (ort.observacoes) { ctx.y += 1; kv(ctx, "Observações", ort.observacoes); }
  }

  // ----- 9. CID-10 -----
  sectionTitle(ctx, 9, "CID-10");
  const cid = data.cid;
  if (!cid?.itens || cid.itens.length === 0) emptyNote(ctx);
  else {
    cid.itens.forEach((it: CidItem) => {
      const prefix = it.principal ? "★ " : "• ";
      const desc = it.descricao ? ` — ${it.descricao}` : "";
      paragraph(ctx, `${prefix}${it.codigo}${desc}`);
    });
    if (cid.observacoes) { ctx.y += 1; kv(ctx, "Observações", cid.observacoes); }
  }

  // ----- 10. Conclusão -----
  sectionTitle(ctx, 10, "Conclusão");
  const con = data.conclusao;
  if (!hasAny(con)) emptyNote(ctx);
  else {
    if (con.diagnostico) {
      kv(ctx, "Diagnóstico", con.diagnostico);
      ctx.y += 1;
    }
    const nexoMap: Record<string, string> = { sim: "Sim", nao: "Não", parcial: "Parcial" };
    kv(ctx, "Nexo causal", nexoMap[con.nexo_causal || ""] || "");
    if (con.nexo_justificativa) kv(ctx, "Justificativa do nexo", con.nexo_justificativa);
    const incapMap: Record<string, string> = { total: "Total", parcial: "Parcial", ausente: "Ausente" };
    kv(ctx, "Incapacidade", incapMap[con.incapacidade || ""] || "");
    const tempMap: Record<string, string> = { temporaria: "Temporária", permanente: "Permanente" };
    kv(ctx, "Temporalidade", tempMap[con.temporalidade || ""] || "");
    kv(ctx, "Data de início da incapacidade (DII)", fmtDate(con.data_inicio_incapacidade));
    kv(ctx, "Prazo para reavaliação", con.prazo_reavaliacao || "");
    kv(ctx, "Reabilitação indicada", con.reabilitacao_indicada === "sim" ? "Sim" : con.reabilitacao_indicada === "nao" ? "Não" : "");
    if (con.consideracoes_finais) {
      ctx.y += 1;
      kv(ctx, "Considerações finais", con.consideracoes_finais);
    }
  }

  // Assinatura
  ctx.y += 12;
  ensureSpace(ctx, 25);
  doc.setDrawColor(...COLOR.text);
  doc.setLineWidth(0.3);
  const sigW = 80;
  const sigX = (PAGE.w - sigW) / 2;
  doc.line(sigX, ctx.y, sigX + sigW, ctx.y);
  ctx.y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLOR.text);
  doc.text(meta.peritoNome || "Perito médico", PAGE.w / 2, ctx.y, { align: "center" });
  ctx.y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLOR.muted);
  doc.text("Médico Perito Judicial", PAGE.w / 2, ctx.y, { align: "center" });

  drawFooter(ctx);
  return doc;
}

export function downloadPrelaudoPdf(data: PrelaudoData, meta: PrelaudoPdfMeta) {
  const doc = generatePrelaudoPdf(data, meta);
  const safeName = (meta.periciado || "prelaudo").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
  const dateStr = (meta.dataPericia || new Date().toISOString().slice(0, 10)).slice(0, 10);
  doc.save(`prelaudo_${safeName}_${dateStr}.pdf`);
}
