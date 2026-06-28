/**
 * Helpers compartilhados entre os exports de PDF e DOCX do Pré-Laudo Previdenciário.
 * Vive 100% dentro do módulo — não importa nada de src/utils/* nem do Trabalhista.
 */

// ---------- Paleta institucional ----------
export const COLORS = {
  primary:   { r: 27, g: 54,  b: 101 },   // #1B3665
  secondary: { r: 31, g: 41,  b: 55  },   // #1F2937
  text:      { r: 31, g: 41,  b: 55  },
  muted:     { r: 75, g: 85,  b: 99  },   // #4B5563
  red:       { r: 192, g: 0,  b: 0   },   // C00000 — grifo das comorbidades
  white:     { r: 255, g: 255, b: 255 },
};

export const COLORS_HEX = {
  primary:   "1B3665",
  secondary: "1F2937",
  text:      "1F2937",
  muted:     "4B5563",
  red:       "C00000",
};

// ---------- Tipografia ----------
export const FONT = {
  name: "Arial",
  sizeDefault:  20, // 10pt
  sizeTitle:    24, // 12pt
  sizeSubtitle: 22, // 11pt
  sizeSmall:    16, // 8pt
};

// ---------- Página A4 ----------
export const MARGINS = { left: 20, right: 15 };
export const PAGE = { width: 210, height: 297, contentWidth: 175 };

export const HEADER_SAFETY_MARGIN = 6;
export const FOOTER_SAFETY_MARGIN = 12;

export const MM_TO_EMU = 36000;

export interface PageLayout {
  headerBottomY: number;
  footerTopY: number;
  contentStartY: number;
  contentEndY: number;
}

export const DEFAULT_LAYOUT: PageLayout = {
  headerBottomY: 45,
  footerTopY: 270,
  contentStartY: 45 + HEADER_SAFETY_MARGIN,
  contentEndY: 270 - FOOTER_SAFETY_MARGIN,
};

// ---------- Carregamento de imagens ----------
export const loadImageAsBase64 = (url: string): Promise<string | null> =>
  new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });

export const loadImageAsArrayBuffer = async (url: string): Promise<ArrayBuffer | null> => {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch {
    return null;
  }
};

export const getImageDimensions = (src: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = src;
  });

// ---------- Identificação do perito ----------
export interface PeritoMeta {
  peritoNome?: string;
  peritoCRM?: string;
}
export const buildPeritoIdLine = (m: PeritoMeta): string | null => {
  const nome = (m.peritoNome || "").trim();
  const crm = (m.peritoCRM || "").trim();
  if (!nome && !crm) return null;
  let crmFmt = "";
  if (crm) {
    const m1 = crm.match(/^(\d+)\s*[\/\-]?\s*([A-Za-z]{2})$/);
    const m2 = !m1 ? crm.match(/^([A-Za-z]{2})\s*[\/\-]?\s*(\d+)$/) : null;
    if (m1) crmFmt = `CRM/${m1[2].toUpperCase()} ${m1[1]}`;
    else if (m2) crmFmt = `CRM/${m2[1].toUpperCase()} ${m2[2]}`;
    else crmFmt = `CRM ${crm}`;
  }
  const left = nome ? `Perito Judicial: ${nome}` : "Perito Judicial";
  return crmFmt ? `${left} - ${crmFmt}` : left;
};

// ---------- Helpers gerais ----------
export const fmtDate = (iso?: string): string => {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

export const slugify = (s: string): string =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

export const buildFilename = (
  ext: "pdf" | "docx",
  meta: { numeroProcesso?: string; periciado?: string },
): string => {
  const proc = (meta.numeroProcesso || "").replace(/[^0-9]/g, "") || "sem-numero";
  const periciado = slugify(meta.periciado || "periciando");
  return `prelaudo-previdenciario-${proc}-${periciado}.${ext}`;
};

const PLACEHOLDER_PATTERNS = [
  /\[INSERIR/i,
  /^\s*\[.{3,}\]\s*$/,
  /^undefined$/i,
  /^null$/i,
  /^n\/a$/i,
  /^-{2,}$/,
];

export const isFieldEmpty = (v: string | null | undefined): boolean => {
  if (!v) return true;
  const t = String(v).trim();
  if (!t) return true;
  return PLACEHOLDER_PATTERNS.some((p) => p.test(t));
};

export const stripLightMarkdown = (text: string): string =>
  (text || "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/gs, (_, p1) => p1.toUpperCase())
    .replace(/__(.+?)__/gs, (_, p1) => p1.toUpperCase())
    .replace(/^\*\s+/gm, "")
    .replace(/\*(.+?)\*/gs, "$1")
    .replace(/_(.+?)_/gs, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * Resolve o texto exibido de Estado Civil / Escolaridade considerando "Outros".
 */
export const resolveEnumValue = (value?: string, outros?: string): string => {
  const v = (value || "").trim();
  const o = (outros || "").trim();
  if (v.toLowerCase() === "outros") return o || "Outros";
  return v;
};

// =====================================================================
// "Prova escolar": listas (X)/( ) compartilhadas entre PDF e DOCX.
// =====================================================================

export interface OptionRow {
  label: string;
  marked: boolean;
}

/**
 * Constrói a lista para exportação a partir das opções fixas e do valor
 * selecionado. Quando `outrosTexto` é informado e a seleção é "Outros", a
 * opção "Outros" é substituída por "Outros: <texto>". Se o valor selecionado
 * não está nas opções fixas, é acrescentado como linha extra marcada.
 */
export const buildOptionRows = (
  opcoes: readonly string[],
  selected: string | undefined,
  outrosTexto?: string,
): OptionRow[] => {
  const sel = (selected || "").trim();
  const outros = (outrosTexto || "").trim();
  const norm = (s: string) => s.toLowerCase();
  const rows: OptionRow[] = opcoes.map((label) => {
    const isOutros = norm(label) === "outros";
    const marked = !!sel && norm(sel) === norm(label);
    return {
      label: isOutros && marked && outros ? `Outros: ${outros}` : label,
      marked,
    };
  });
  if (sel && !opcoes.some((o) => norm(o) === norm(sel))) {
    rows.push({ label: sel, marked: true });
  }
  return rows;
};

/**
 * Versão para listas com múltiplos marcados (comorbidades).
 * `extras` são linhas adicionais livres (renderizadas se tiverem texto).
 */
export interface MultiOption { key: string; label: string }

export const buildMultiOptionRows = (
  opcoes: readonly MultiOption[],
  marcados: Record<string, boolean | undefined>,
  extras?: { marcado: boolean; texto: string }[],
): OptionRow[] => {
  const rows: OptionRow[] = opcoes.map((o) => ({
    label: o.label,
    marked: !!marcados[o.key],
  }));
  if (Array.isArray(extras)) {
    for (const e of extras) {
      const t = (e.texto || "").trim();
      if (t) rows.push({ label: t, marked: !!e.marcado });
    }
  }
  return rows;
};
