import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { LaudoData } from "@/contexts/LaudoContext";

// Extend jsPDF type to include autoTable
declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

// ========== CONSTANTES DE CONFIGURAÇÃO ==========
const COLORS = {
  primary: { r: 27, g: 54, b: 101 },       // #1B3665 - Azul Institucional
  secondary: { r: 31, g: 41, b: 55 },      // #1F2937 - Cinza chumbo
  text: { r: 31, g: 41, b: 55 },           // #1F2937 - Texto principal
  muted: { r: 75, g: 85, b: 99 },          // #4B5563 - Texto secundário
  white: { r: 255, g: 255, b: 255 },       // Branco puro
  background: { r: 243, g: 244, b: 246 },  // #F3F4F6 - Fundo box
};

const MARGINS = {
  left: 20,
  right: 15,
};

const PAGE = {
  width: 210,
  height: 297,
  contentWidth: 175, // PAGE.width - MARGINS.left - MARGINS.right
};

// Margens de segurança fixas
const HEADER_SAFETY_MARGIN = 6;  // 6mm abaixo do cabeçalho
const FOOTER_SAFETY_MARGIN = 12; // 12mm acima do rodapé

// Layout dinâmico - será calculado baseado nas imagens reais
interface PageLayout {
  headerBottomY: number;
  footerTopY: number;
  contentStartY: number;
  contentEndY: number;
}

// Layout padrão (fallback se imagens não carregarem)
const DEFAULT_LAYOUT: PageLayout = {
  headerBottomY: 45,
  footerTopY: 270,
  contentStartY: 45 + HEADER_SAFETY_MARGIN, // 51mm
  contentEndY: 270 - FOOTER_SAFETY_MARGIN,   // 258mm
};

// Layout global que será atualizado após carregar imagens
let pageLayout: PageLayout = { ...DEFAULT_LAYOUT };

// ========== FUNÇÕES AUXILIARES ==========

// Padrões que indicam campo técnico/vazio que NÃO deve aparecer no documento
const PLACEHOLDER_PATTERNS = [
  /\[INSERIR/i,              // [INSERIR algo] em qualquer posição
  /\[.{3,}\]/,              // [qualquer placeholder] de 3+ chars
  /^erro\s*cr[ií]tico/i,    // "erro crítico: ..."
  /^aguardando/i,            // "aguardando..."
  /^undefined$/i,
  /^null$/i,
  /^n\/a$/i,
  /^-{2,}$/,                // só traços
  /^erro:/i,                // "Erro: ..."
  /como voc[eê] n[aã]o forneceu/i,        // Vazamento conversacional da IA
  /elaborei um modelo padr[aã]o/i,         // IA inventando conteúdo genérico
  /nota t[eé]cnica do perito/i,            // Metatexto da IA
  /n[aã]o foi poss[ií]vel gerar/i,         // Erro de geração
  /aqui est[aá] o resumo t[eé]cnico/i,     // IA conversando
];

// Verifica se o campo está vazio ou contém conteúdo inválido/técnico
const isFieldEmpty = (value: string | null | undefined): boolean => {
  if (!value) return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  return PLACEHOLDER_PATTERNS.some(pattern => pattern.test(trimmed));
};

// ========== DEBUG MODE (apenas em desenvolvimento — eliminado no build de produção) ==========
// Uso: debugField("nomeDoCampo", laudo.campo) — imprime original, sanitizado e isEmpty
const debugField = (fieldName: string, value: string | null | undefined): void => {
  if (!import.meta.env.DEV) return;
  const empty = isFieldEmpty(value);
  const original = (value ?? "").substring(0, 200);
  const sanitized = empty ? "[SUPRIMIDO]" : sanitizeMarkdown(value!).substring(0, 200);
  console.group(`[PDF DEBUG] ${fieldName}`);
  console.log("Original :", original || "(vazio)");
  console.log("Sanitized:", sanitized);
  console.log("isEmpty  :", empty);
  console.groupEnd();
};

// Sanitiza markdown — converte formatação para texto plano estruturado
const sanitizeMarkdown = (text: string): string => {
  if (!text) return "";
  return text
    // 1. Headings: ### Título → Título
    .replace(/^#{1,6}\s+/gm, '')
    // 2. Bold multi-linha → CAIXA ALTA (flag 's' para dotAll)
    .replace(/\*\*(.+?)\*\*/gs, (_, p1) => p1.toUpperCase())
    .replace(/__(.+?)__/gs, (_, p1) => p1.toUpperCase())
    // 3. Bullets com asterisco no início de linha: "* item" → "item"
    .replace(/^\*\s+/gm, '')
    // 4. Itálico simples (após remover bullets)
    .replace(/\*(.+?)\*/gs, '$1')
    .replace(/_(.+?)_/gs, '$1')
    // 5. Linhas separadoras: --- ou *** sozinhos numa linha
    .replace(/^[-*]{3,}\s*$/gm, '')
    // 6. Backtick code: `código` → código
    .replace(/`(.+?)`/g, '$1')
    // 7. Normalizar quebras de linha múltiplas
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

// Formata quesitos garantindo quebra de linha para cada item numerado
const formatQuesitos = (text: string): string => {
  if (!text) return "";
  // Primeiro sanitiza o markdown
  let sanitized = sanitizeMarkdown(text);
  // Garante quebra de linha antes de cada quesito numerado
  // Padrões: "1.", "1)", "1 -", "1-", etc.
  sanitized = sanitized.replace(/(\d+[\.\)\-])\s*/g, '\n$1 ');
  // Remove possíveis quebras duplas e limpa início
  sanitized = sanitized.replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
  return sanitized.trim();
};

const formatDate = (dateString: string): string => {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateString;
  }
};

const calculateAge = (birthDate: string): string => {
  if (!birthDate) return "";
  try {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return `${age} anos`;
  } catch {
    return "";
  }
};

// ========== FUNÇÕES DE MEDIÇÃO (para calcular altura real do conteúdo) ==========

const SECTION_TITLE_HEIGHT = 12;
const SUBTITLE_HEIGHT = 7;
const LINE_HEIGHT = 5;
const PARAGRAPH_AFTER_SPACING = 3;
const LABELED_FIELD_AFTER_SPACING = 3;

// Mede altura de um parágrafo
const measureParagraphHeight = (doc: jsPDF, text: string, maxWidth: number = PAGE.contentWidth): number => {
  if (!text) return 0;
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(text, maxWidth);
  return (lines.length * LINE_HEIGHT) + PARAGRAPH_AFTER_SPACING;
};

// Mede altura de um campo com label
const measureLabeledFieldHeight = (doc: jsPDF, label: string, value: string): number => {
  if (!value) return 0;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  const labelWidth = doc.getTextWidth(`${label}: `) + 2;
  doc.setFont("helvetica", "normal");
  const valueLines = doc.splitTextToSize(value, PAGE.contentWidth - labelWidth);
  return (valueLines.length * LINE_HEIGHT) + LABELED_FIELD_AFTER_SPACING;
};

// ========== FUNÇÕES DE RENDERIZAÇÃO ==========

// Verifica necessidade de nova página - USA LAYOUT DINÂMICO
const checkNewPage = (doc: jsPDF, currentY: number, neededSpace: number = 10): number => {
  if (currentY + neededSpace > pageLayout.contentEndY) {
    doc.addPage();
    return pageLayout.contentStartY;
  }
  return currentY;
};

// Garante espaço suficiente ou quebra página
const ensureSpace = (doc: jsPDF, y: number, requiredHeight: number): number => {
  const remainingSpace = pageLayout.contentEndY - y;
  if (requiredHeight > remainingSpace) {
    doc.addPage();
    return pageLayout.contentStartY;
  }
  return y;
};

// Adiciona título de seção com numeração
const addSectionTitle = (doc: jsPDF, title: string, y: number): number => {
  y = checkNewPage(doc, y, SECTION_TITLE_HEIGHT);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  doc.text(title.toUpperCase(), MARGINS.left, y);
  doc.setDrawColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  doc.setLineWidth(0.5);
  doc.line(MARGINS.left, y + 2, PAGE.width - MARGINS.right, y + 2);
  doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  doc.setFont("helvetica", "normal");
  return y + SECTION_TITLE_HEIGHT;
};

// Adiciona subtítulo
const addSubtitle = (doc: jsPDF, title: string, y: number): number => {
  y = checkNewPage(doc, y, SUBTITLE_HEIGHT);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLORS.secondary.r, COLORS.secondary.g, COLORS.secondary.b);
  doc.text(title, MARGINS.left, y);
  doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  doc.setFont("helvetica", "normal");
  return y + SUBTITLE_HEIGHT;
};

// Adiciona parágrafo com quebra de linha e JUSTIFICAÇÃO
// IMPORTANTE: Aplica sanitização de markdown automaticamente
const addParagraph = (doc: jsPDF, text: string, y: number, maxWidth: number = PAGE.contentWidth): number => {
  if (!text) return y;
  
  // Sanitiza markdown antes de processar
  const sanitizedText = sanitizeMarkdown(text);
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  const lines = doc.splitTextToSize(sanitizedText, maxWidth);
  
  lines.forEach((line: string, index: number) => {
    // Verificar nova página para cada linha
    y = checkNewPage(doc, y, LINE_HEIGHT);
    
    const isLastLine = index === lines.length - 1;
    const trimmedLine = line.trim();
    
    // Se é última linha ou linha curta, não justificar (alinha à esquerda)
    if (isLastLine || doc.getTextWidth(trimmedLine) < maxWidth * 0.7) {
      doc.text(trimmedLine, MARGINS.left, y);
    } else {
      // Justificar: distribuir espaço entre palavras
      const words = trimmedLine.split(/\s+/);
      if (words.length > 1) {
        let totalWordsWidth = 0;
        words.forEach(word => {
          totalWordsWidth += doc.getTextWidth(word);
        });
        
        const totalSpaces = words.length - 1;
        const extraSpacePerGap = (maxWidth - totalWordsWidth) / totalSpaces;
        
        let xPos = MARGINS.left;
        words.forEach((word, wordIndex) => {
          doc.text(word, xPos, y);
          if (wordIndex < words.length - 1) {
            xPos += doc.getTextWidth(word) + extraSpacePerGap;
          }
        });
      } else {
        doc.text(trimmedLine, MARGINS.left, y);
      }
    }
    y += LINE_HEIGHT;
  });
  
  return y + PARAGRAPH_AFTER_SPACING;
};

// Adiciona campo com label - AGORA COM VERIFICAÇÃO POR LINHA
const addLabeledField = (doc: jsPDF, label: string, value: string, y: number): number => {
  if (!value) return y;
  
  // Verificar espaço antes de começar
  const height = measureLabeledFieldHeight(doc, label, value);
  y = checkNewPage(doc, y, Math.min(height, LINE_HEIGHT * 2)); // Pelo menos 2 linhas
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  const labelText = `${label}: `;
  const labelWidth = doc.getTextWidth(labelText) + 2;
  doc.text(labelText, MARGINS.left, y);
  
  doc.setFont("helvetica", "normal");
  const valueLines = doc.splitTextToSize(value, PAGE.contentWidth - labelWidth);
  
  // Renderizar linha por linha para respeitar limite da página
  valueLines.forEach((line: string, index: number) => {
    if (index === 0) {
      doc.text(line, MARGINS.left + labelWidth, y);
    } else {
      y = checkNewPage(doc, y + LINE_HEIGHT, LINE_HEIGHT);
      doc.text(line, MARGINS.left + labelWidth, y);
    }
    if (index < valueLines.length - 1) {
      y += LINE_HEIGHT;
    }
  });
  
  return y + LINE_HEIGHT + LABELED_FIELD_AFTER_SPACING;
};

// Adiciona texto de endereçamento judicial
const addJudicialAddress = (doc: jsPDF, laudo: LaudoData, y: number): number => {
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA", MARGINS.left, y);
  y += 6;
  // Operação D: sem fallbacks literais no PDF — campo vazio não aparece
  if (!isFieldEmpty(laudo.processoVara)) {
    doc.text(laudo.processoVara!.toUpperCase(), MARGINS.left, y);
    y += 15;
  } else {
    y += 6;
  }
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  if (!isFieldEmpty(laudo.processoNumero)) {
    doc.text(`Processo nº: ${laudo.processoNumero}`, MARGINS.left, y);
    y += 6;
  }
  if (!isFieldEmpty(laudo.reclamante)) {
    doc.text(`Reclamante: ${laudo.reclamante}`, MARGINS.left, y);
    y += 6;
  }
  if (!isFieldEmpty(laudo.reclamada)) {
    doc.text(`Reclamada: ${laudo.reclamada}`, MARGINS.left, y);
    y += 6;
  }
  
  return y + 10;
};

// ========== CABEÇALHO E RODAPÉ COM IMAGENS PNG ==========

// Helper function to load image as base64
const loadImageAsBase64 = (url: string): Promise<string | null> => {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }
    
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const dataURL = canvas.toDataURL("image/png");
          resolve(dataURL);
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    };
    
    img.onerror = () => {
      resolve(null);
    };
    
    img.src = url;
  });
};

// Função para obter dimensões reais da imagem
const getImageDimensions = (base64: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = base64;
  });
};

// Calcula layout dinâmico baseado nas imagens reais
const calculateDynamicLayout = async (
  headerImageBase64: string | null,
  footerImageBase64: string | null
): Promise<PageLayout> => {
  let headerBottomY = DEFAULT_LAYOUT.headerBottomY;
  let footerTopY = DEFAULT_LAYOUT.footerTopY;
  
  // Calcular altura real do cabeçalho
  if (headerImageBase64) {
    try {
      const dimensions = await getImageDimensions(headerImageBase64);
      const aspectRatio = dimensions.height / dimensions.width;
      const imgWidth = PAGE.width - 16; // Mesma largura usada em addHeaderToPages
      const imgHeight = imgWidth * aspectRatio;
      const yPos = 2; // Mesma posição usada em addHeaderToPages
      headerBottomY = yPos + imgHeight;
    } catch {
      // Mantém valor padrão
    }
  }
  
  // Calcular posição real do rodapé
  if (footerImageBase64) {
    try {
      const dimensions = await getImageDimensions(footerImageBase64);
      const aspectRatio = dimensions.height / dimensions.width;
      const imgWidth = PAGE.width; // Mesma largura usada em addFooterToPages
      const imgHeight = imgWidth * aspectRatio;
      footerTopY = PAGE.height - imgHeight;
    } catch {
      // Mantém valor padrão
    }
  }
  
  return {
    headerBottomY,
    footerTopY,
    contentStartY: headerBottomY + HEADER_SAFETY_MARGIN,
    contentEndY: footerTopY - FOOTER_SAFETY_MARGIN,
  };
};

// Adiciona cabeçalho PNG em todas as páginas
const addHeaderToPages = async (doc: jsPDF, headerImageBase64: string | null) => {
  if (!headerImageBase64) return;
  
  const pageCount = doc.getNumberOfPages();
  
  let aspectRatio = 0.15;
  try {
    const dimensions = await getImageDimensions(headerImageBase64);
    aspectRatio = dimensions.height / dimensions.width;
  } catch {
    // Usa fallback se falhar
  }
  
  const imgWidth = PAGE.width - 16;
  const imgHeight = imgWidth * aspectRatio;
  const xPos = 8;
  const yPos = 2;
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    try {
      doc.addImage(headerImageBase64, "PNG", xPos, yPos, imgWidth, imgHeight);
    } catch {
      // Se falhar, continua sem cabeçalho nessa página
    }
  }
};

// Adiciona rodapé PNG em todas as páginas
const addFooterToPages = async (doc: jsPDF, footerImageBase64: string | null) => {
  if (!footerImageBase64) return;
  
  const pageCount = doc.getNumberOfPages();
  
  let aspectRatio = 0.12;
  try {
    const dimensions = await getImageDimensions(footerImageBase64);
    aspectRatio = dimensions.height / dimensions.width;
  } catch {
    // Usa fallback se falhar
  }
  
  const imgWidth = PAGE.width;
  const imgHeight = imgWidth * aspectRatio;
  const yPos = PAGE.height - imgHeight;
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    try {
      doc.addImage(footerImageBase64, "PNG", 0, yPos, imgWidth, imgHeight);
      
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(COLORS.white.r, COLORS.white.g, COLORS.white.b);
      doc.text(`Página ${i} de ${pageCount}`, PAGE.width / 2, PAGE.height - 5, { align: "center" });
      doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
    } catch {
      // Se falhar, continua sem rodapé nessa página
    }
  }
};

// ========== FUNÇÃO PRINCIPAL ==========

export const generateLaudoPDF = async (laudo: LaudoData): Promise<void> => {
  const doc = new jsPDF();
  let sectionNumber = 1;
  
  // Carregar imagens do papel timbrado
  const headerImageBase64 = await loadImageAsBase64("/timbrado-cabecalho.png");
  const footerImageBase64 = await loadImageAsBase64("/timbrado-rodape.png");
  
  // CALCULAR LAYOUT DINÂMICO baseado nas imagens reais
  pageLayout = await calculateDynamicLayout(headerImageBase64, footerImageBase64);
  
  // ========== PÁGINA 1 - INÍCIO DO CONTEÚDO ==========
  let y = pageLayout.contentStartY;
  
  // Endereçamento judicial
  y = addJudicialAddress(doc, laudo, y);
  
  // 1. OBJETIVO DA PERÍCIA
  if (!isFieldEmpty(laudo.objetivoPericia)) {
    const sectionHeight = SECTION_TITLE_HEIGHT + measureParagraphHeight(doc, laudo.objetivoPericia!);
    y = ensureSpace(doc, y, Math.min(sectionHeight, 40));
    y = addSectionTitle(doc, `${sectionNumber}. OBJETIVO DA PERÍCIA`, y);
    y = addParagraph(doc, laudo.objetivoPericia!, y);
    sectionNumber++;
  }
  
  // 2. ASSISTENTES TÉCNICOS
  if (!isFieldEmpty(laudo.assistenteTecnicoReclamante) || !isFieldEmpty(laudo.assistenteTecnicoReclamada)) {
    let sectionHeight = SECTION_TITLE_HEIGHT;
    if (!isFieldEmpty(laudo.assistenteTecnicoReclamante)) sectionHeight += measureLabeledFieldHeight(doc, "Assistente do Reclamante", laudo.assistenteTecnicoReclamante!);
    if (!isFieldEmpty(laudo.assistenteTecnicoReclamada)) sectionHeight += measureLabeledFieldHeight(doc, "Assistente da Reclamada", laudo.assistenteTecnicoReclamada!);
    
    y = ensureSpace(doc, y, Math.min(sectionHeight, 30));
    y = addSectionTitle(doc, `${sectionNumber}. ASSISTENTES TÉCNICOS`, y);
    if (!isFieldEmpty(laudo.assistenteTecnicoReclamante)) {
      y = addLabeledField(doc, "Assistente do Reclamante", laudo.assistenteTecnicoReclamante!, y);
    }
    if (!isFieldEmpty(laudo.assistenteTecnicoReclamada)) {
      y = addLabeledField(doc, "Assistente da Reclamada", laudo.assistenteTecnicoReclamada!, y);
    }
    y += 5;
    sectionNumber++;
  }
  
  // 3. IDENTIFICAÇÃO DO PERICIANDO
  {
    const nomePericiando = laudo.vitimaName || laudo.reclamante || "";
    let sectionHeight = SECTION_TITLE_HEIGHT;
    if (!isFieldEmpty(nomePericiando)) sectionHeight += measureLabeledFieldHeight(doc, "Nome", nomePericiando);
    if (!isFieldEmpty(laudo.vitimaNascimento)) sectionHeight += measureLabeledFieldHeight(doc, "Data de Nascimento", `${formatDate(laudo.vitimaNascimento!)} (${calculateAge(laudo.vitimaNascimento!)})`);
    if (!isFieldEmpty(laudo.vitimaProfissao)) sectionHeight += measureLabeledFieldHeight(doc, "Profissão", laudo.vitimaProfissao!);
    
    y = ensureSpace(doc, y, Math.min(sectionHeight, 40));
  }
  y = addSectionTitle(doc, `${sectionNumber}. IDENTIFICAÇÃO DO PERICIANDO`, y);
  const nomePericiandoPDF = laudo.vitimaName || laudo.reclamante || "";
  if (!isFieldEmpty(nomePericiandoPDF)) y = addLabeledField(doc, "Nome", nomePericiandoPDF, y);
  if (!isFieldEmpty(laudo.vitimaNascimento)) {
    y = addLabeledField(doc, "Data de Nascimento", `${formatDate(laudo.vitimaNascimento!)} (${calculateAge(laudo.vitimaNascimento!)})`, y);
  }
  if (!isFieldEmpty(laudo.vitimaProfissao)) y = addLabeledField(doc, "Profissão", laudo.vitimaProfissao!, y);
  if (!isFieldEmpty(laudo.vitimaEscolaridade)) y = addLabeledField(doc, "Escolaridade", laudo.vitimaEscolaridade!, y);
  if (!isFieldEmpty(laudo.vitimaDominancia)) y = addLabeledField(doc, "Dominância", laudo.vitimaDominancia!, y);
  y += 5;
  sectionNumber++;
  
  // 4. RESUMO DA PETIÇÃO INICIAL
  debugField("resumoPeticaoInicial", laudo.resumoPeticaoInicial);
  if (!isFieldEmpty(laudo.resumoPeticaoInicial)) {
    const sectionHeight = SECTION_TITLE_HEIGHT + measureParagraphHeight(doc, laudo.resumoPeticaoInicial!);
    y = ensureSpace(doc, y, Math.min(sectionHeight, 40));
    y = addSectionTitle(doc, `${sectionNumber}. RESUMO DA PETIÇÃO INICIAL`, y);
    y = addParagraph(doc, laudo.resumoPeticaoInicial!, y);
    sectionNumber++;
  }
  
  // 5. RESUMO DA CONTESTAÇÃO
  debugField("resumoContestacao", laudo.resumoContestacao);
  if (!isFieldEmpty(laudo.resumoContestacao)) {
    const sectionHeight = SECTION_TITLE_HEIGHT + measureParagraphHeight(doc, laudo.resumoContestacao!);
    y = ensureSpace(doc, y, Math.min(sectionHeight, 40));
    y = addSectionTitle(doc, `${sectionNumber}. RESUMO DA CONTESTAÇÃO`, y);
    y = addParagraph(doc, laudo.resumoContestacao!, y);
    sectionNumber++;
  }
  
  // 6. METODOLOGIA PERICIAL
  debugField("metodologiaPericial", laudo.metodologiaPericial);
  if (!isFieldEmpty(laudo.metodologiaPericial)) {
    const sectionHeight = SECTION_TITLE_HEIGHT + measureParagraphHeight(doc, laudo.metodologiaPericial!);
    y = ensureSpace(doc, y, Math.min(sectionHeight, 40));
    y = addSectionTitle(doc, `${sectionNumber}. METODOLOGIA PERICIAL`, y);
    y = addParagraph(doc, laudo.metodologiaPericial!, y);
    sectionNumber++;
  }
  
  // 7. DADOS DO POSTO DE TRABALHO
  const hasDadosPosto = !isFieldEmpty(laudo.dadosFuncionaisCargo) || !isFieldEmpty(laudo.descricaoAtividadesLaborais);
  if (hasDadosPosto) {
    y = ensureSpace(doc, y, SECTION_TITLE_HEIGHT + 20);
    y = addSectionTitle(doc, `${sectionNumber}. DADOS DO POSTO DE TRABALHO`, y);
    if (!isFieldEmpty(laudo.dadosFuncionaisCargo)) {
      y = addLabeledField(doc, "Cargo/Função", laudo.dadosFuncionaisCargo!, y);
    }
    if (!isFieldEmpty(laudo.dadosFuncionaisAdmissao)) {
      y = addLabeledField(doc, "Data de Admissão", formatDate(laudo.dadosFuncionaisAdmissao!), y);
    }
    if (!isFieldEmpty(laudo.dadosFuncionaisAfastamento)) {
      y = addLabeledField(doc, "Data de Afastamento", formatDate(laudo.dadosFuncionaisAfastamento!), y);
    }
    if (!isFieldEmpty(laudo.descricaoAtividadesLaborais)) {
      y = ensureSpace(doc, y, SUBTITLE_HEIGHT + 15);
      y = addSubtitle(doc, "Ambiente e Atividades Laborais:", y);
      y = addParagraph(doc, laudo.descricaoAtividadesLaborais!, y);
    }
    sectionNumber++;
  }
  
  // 8. ANAMNESE / HISTÓRICO
  const hasAnamnese = !isFieldEmpty(laudo.dataAcidente) || !isFieldEmpty(laudo.historiaAcidente) ||
    !isFieldEmpty(laudo.historicoOcupacional) || !isFieldEmpty(laudo.historiaAtual) ||
    !isFieldEmpty(laudo.tratamentos) || !isFieldEmpty(laudo.afastamentos);
  if (hasAnamnese) {
    y = ensureSpace(doc, y, SECTION_TITLE_HEIGHT + 20);
    y = addSectionTitle(doc, `${sectionNumber}. ANAMNESE`, y);
    if (!isFieldEmpty(laudo.dataAcidente)) {
      y = addLabeledField(doc, "Data do Acidente/Evento", formatDate(laudo.dataAcidente!), y);
    }
    if (!isFieldEmpty(laudo.historiaAcidente)) {
      y = ensureSpace(doc, y, SUBTITLE_HEIGHT + 15);
      y = addSubtitle(doc, "Descrição do Acidente:", y);
      y = addParagraph(doc, laudo.historiaAcidente!, y);
    }
    if (!isFieldEmpty(laudo.historicoOcupacional)) {
      y = ensureSpace(doc, y, SUBTITLE_HEIGHT + 15);
      y = addSubtitle(doc, "Histórico Ocupacional:", y);
      y = addParagraph(doc, laudo.historicoOcupacional!, y);
    }
    if (!isFieldEmpty(laudo.historiaAtual)) {
      y = ensureSpace(doc, y, SUBTITLE_HEIGHT + 15);
      y = addSubtitle(doc, "Queixas Atuais:", y);
      y = addParagraph(doc, laudo.historiaAtual!, y);
    }
    if (!isFieldEmpty(laudo.tratamentos)) {
      y = ensureSpace(doc, y, SUBTITLE_HEIGHT + 15);
      y = addSubtitle(doc, "Tratamentos Realizados:", y);
      y = addParagraph(doc, laudo.tratamentos!, y);
    }
    if (!isFieldEmpty(laudo.afastamentos)) {
      y = ensureSpace(doc, y, SUBTITLE_HEIGHT + 15);
      y = addSubtitle(doc, "Afastamentos:", y);
      y = addParagraph(doc, laudo.afastamentos!, y);
    }
    sectionNumber++;
  }
  
  // 9. ANTECEDENTES PATOLÓGICOS
  if (!isFieldEmpty(laudo.antecedentes)) {
    const sectionHeight = SECTION_TITLE_HEIGHT + measureParagraphHeight(doc, laudo.antecedentes!);
    y = ensureSpace(doc, y, Math.min(sectionHeight, 35));
    y = addSectionTitle(doc, `${sectionNumber}. ANTECEDENTES PATOLÓGICOS`, y);
    y = addParagraph(doc, laudo.antecedentes!, y);
    sectionNumber++;
  }
  
  // 10. DOCUMENTOS ANALISADOS
  const DOCUMENTOS_LABEL_MAP: Record<string, string> = {
    "cat": "CAT - Comunicação de Acidente de Trabalho",
    "prontuario": "Prontuário Médico",
    "receitas": "Receitas Médicas",
    "exames": "Exames Complementares",
    "laudos_anteriores": "Laudos Médicos Anteriores",
    "atestados": "Atestados Médicos",
  };
  if (laudo.documentos && laudo.documentos.length > 0) {
    const docListHeight = laudo.documentos.length * 6;
    y = ensureSpace(doc, y, Math.min(SECTION_TITLE_HEIGHT + docListHeight, 40));
    y = addSectionTitle(doc, `${sectionNumber}. DOCUMENTOS ANALISADOS`, y);
    
    const docsLabels = laudo.documentos.map(d => DOCUMENTOS_LABEL_MAP[d] || d);
    docsLabels.forEach((doc_item, index) => {
      y = checkNewPage(doc, y, 6);
      doc.setFontSize(10);
      doc.text(`${index + 1}. ${doc_item}`, MARGINS.left + 5, y);
      y += 6;
    });
    y += 5;
    sectionNumber++;
  }
  
  // 11. LAUDOS MÉDICOS APRESENTADOS
  debugField("laudosMedicos", laudo.laudosMedicos);
  if (!isFieldEmpty(laudo.laudosMedicos)) {
    const sectionHeight = SECTION_TITLE_HEIGHT + measureParagraphHeight(doc, laudo.laudosMedicos!);
    y = ensureSpace(doc, y, Math.min(sectionHeight, 35));
    y = addSectionTitle(doc, `${sectionNumber}. LAUDOS MÉDICOS APRESENTADOS`, y);
    y = addParagraph(doc, laudo.laudosMedicos!, y);
    sectionNumber++;
  }
  
  // 12. EXAMES COMPLEMENTARES
  debugField("examesComplementares", laudo.examesComplementares);
  if (!isFieldEmpty(laudo.examesComplementares)) {
    const sectionHeight = SECTION_TITLE_HEIGHT + measureParagraphHeight(doc, laudo.examesComplementares!);
    y = ensureSpace(doc, y, Math.min(sectionHeight, 35));
    y = addSectionTitle(doc, `${sectionNumber}. EXAMES COMPLEMENTARES`, y);
    y = addParagraph(doc, laudo.examesComplementares!, y);
    sectionNumber++;
  }
  
  // 13. EXAME FÍSICO
  debugField("exameFisico", laudo.exameFisico);
  if (!isFieldEmpty(laudo.exameFisico)) {
    const sectionHeight = SECTION_TITLE_HEIGHT + measureParagraphHeight(doc, laudo.exameFisico!);
    y = ensureSpace(doc, y, Math.min(sectionHeight, 35));
    y = addSectionTitle(doc, `${sectionNumber}. EXAME FÍSICO`, y);
    y = addParagraph(doc, laudo.exameFisico!, y);
    sectionNumber++;
  }
  
  // 14. DESCRIÇÃO TÉCNICA DAS DOENÇAS
  debugField("descricaoTecnicaDoencas", laudo.descricaoTecnicaDoencas);
  if (!isFieldEmpty(laudo.descricaoTecnicaDoencas)) {
    const sectionHeight = SECTION_TITLE_HEIGHT + measureParagraphHeight(doc, laudo.descricaoTecnicaDoencas!);
    y = ensureSpace(doc, y, Math.min(sectionHeight, 35));
    y = addSectionTitle(doc, `${sectionNumber}. DESCRIÇÃO TÉCNICA DAS DOENÇAS`, y);
    y = addParagraph(doc, laudo.descricaoTecnicaDoencas!, y);
    sectionNumber++;
  }
  
  // 15. NEXO CAUSAL
  debugField("nexoCausalJustificativa", laudo.nexoCausalJustificativa);
  const hasNexo = !isFieldEmpty(laudo.nexoCausalTipo) || !isFieldEmpty(laudo.nexoCausalJustificativa);
  if (hasNexo) {
    let sectionHeight = SECTION_TITLE_HEIGHT;
    if (!isFieldEmpty(laudo.nexoCausalTipo)) sectionHeight += 8;
    if (!isFieldEmpty(laudo.nexoCausalJustificativa)) sectionHeight += SUBTITLE_HEIGHT + 15;
    y = ensureSpace(doc, y, Math.min(sectionHeight, 35));
    y = addSectionTitle(doc, `${sectionNumber}. NEXO CAUSAL`, y);
    if (!isFieldEmpty(laudo.nexoCausalTipo)) {
      const nexoMap: Record<string, string> = {
        "direto": "Nexo Causal Direto",
        "concausa": "Concausa",
        "agravamento": "Agravamento de Condição Preexistente",
        "inexistente": "Nexo Causal Inexistente",
      };
      y = addLabeledField(doc, "Tipo de Nexo", nexoMap[laudo.nexoCausalTipo!] || laudo.nexoCausalTipo!, y);
    }
    if (!isFieldEmpty(laudo.nexoCausalJustificativa)) {
      y = ensureSpace(doc, y, SUBTITLE_HEIGHT + 15);
      y = addSubtitle(doc, "Justificativa:", y);
      y = addParagraph(doc, laudo.nexoCausalJustificativa!, y);
    }
    sectionNumber++;
  }
  
  // 16. ANÁLISE DA INCAPACIDADE LABORAL
  debugField("analiseIncapacidadeLaboral", laudo.analiseIncapacidadeLaboral);
  if (!isFieldEmpty(laudo.analiseIncapacidadeLaboral)) {
    const sectionHeight = SECTION_TITLE_HEIGHT + measureParagraphHeight(doc, laudo.analiseIncapacidadeLaboral!);
    y = ensureSpace(doc, y, Math.min(sectionHeight, 35));
    y = addSectionTitle(doc, `${sectionNumber}. ANÁLISE DA INCAPACIDADE LABORAL`, y);
    y = addParagraph(doc, laudo.analiseIncapacidadeLaboral!, y);
    sectionNumber++;
  }
  
  // 17. AVALIAÇÃO DE SEQUELAS
  const hasSequelas = !isFieldEmpty(laudo.tabelaSUSEP) || !isFieldEmpty(laudo.danoEstetico) || !isFieldEmpty(laudo.auxilioTerceiros);
  if (hasSequelas) {
    let sectionHeight = SECTION_TITLE_HEIGHT;
    if (!isFieldEmpty(laudo.tabelaSUSEP)) sectionHeight += 8;
    if (!isFieldEmpty(laudo.danoEstetico)) sectionHeight += 8;
    if (!isFieldEmpty(laudo.auxilioTerceiros)) sectionHeight += 8;
    y = ensureSpace(doc, y, Math.min(sectionHeight, 35));
    y = addSectionTitle(doc, `${sectionNumber}. AVALIAÇÃO DE SEQUELAS`, y);
    if (!isFieldEmpty(laudo.tabelaSUSEP)) y = addLabeledField(doc, "Tabela SUSEP", laudo.tabelaSUSEP!, y);
    if (!isFieldEmpty(laudo.danoEstetico)) y = addLabeledField(doc, "Dano Estético", laudo.danoEstetico!, y);
    if (!isFieldEmpty(laudo.auxilioTerceiros)) y = addLabeledField(doc, "Auxílio de Terceiros", laudo.auxilioTerceiros!, y);
    y += 5;
    sectionNumber++;
  }
  
  // 18. DISCUSSÃO E ANÁLISE
  debugField("conclusaoAnalise", laudo.conclusaoAnalise);
  if (!isFieldEmpty(laudo.conclusaoAnalise)) {
    const sectionHeight = SECTION_TITLE_HEIGHT + measureParagraphHeight(doc, laudo.conclusaoAnalise!);
    y = ensureSpace(doc, y, Math.min(sectionHeight, 35));
    y = addSectionTitle(doc, `${sectionNumber}. DISCUSSÃO E ANÁLISE`, y);
    y = addParagraph(doc, laudo.conclusaoAnalise!, y);
    sectionNumber++;
  }
  
  // 19. CONCLUSÃO
  const hasConclusao = !isFieldEmpty(laudo.conclusaoCID) ||
    !isFieldEmpty(laudo.conclusaoStatus) || !isFieldEmpty(laudo.conclusaoDestino) || !isFieldEmpty(laudo.conclusaoJustificativa);
  if (hasConclusao) {
    let sectionHeight = SECTION_TITLE_HEIGHT;
    if (!isFieldEmpty(laudo.conclusaoCID)) sectionHeight += 8;
    if (!isFieldEmpty(laudo.conclusaoStatus)) sectionHeight += 8;
    if (!isFieldEmpty(laudo.conclusaoDestino)) sectionHeight += 8;
    if (!isFieldEmpty(laudo.conclusaoJustificativa)) sectionHeight += SUBTITLE_HEIGHT + 15;
    y = ensureSpace(doc, y, Math.min(sectionHeight, 50));
    y = addSectionTitle(doc, `${sectionNumber}. CONCLUSÃO`, y);
    if (!isFieldEmpty(laudo.conclusaoCID)) {
      y = addLabeledField(doc, "CID-10 Sugerido", laudo.conclusaoCID!, y);
    }
    if (!isFieldEmpty(laudo.conclusaoStatus)) {
      const statusMap: Record<string, string> = {
        "total_temporaria": "Incapacidade Total Temporária",
        "parcial_temporaria": "Incapacidade Parcial Temporária",
        "total_permanente": "Incapacidade Total Permanente",
        "parcial_permanente": "Incapacidade Parcial Permanente",
        "ausencia": "Ausência de Incapacidade Laboral",
        "temporaria_total": "Incapacidade Temporária Total",
        "temporaria_parcial": "Incapacidade Temporária Parcial",
        "permanente_total": "Incapacidade Permanente Total",
        "permanente_parcial": "Incapacidade Permanente Parcial",
      };
      let statusText = "";
      try {
        const parsed = JSON.parse(laudo.conclusaoStatus!);
        if (Array.isArray(parsed) && parsed.length > 0) {
          statusText = parsed.map(v => statusMap[v] || v).join("; ");
        }
      } catch {
        statusText = statusMap[laudo.conclusaoStatus!] || laudo.conclusaoStatus!;
      }
      if (statusText) y = addLabeledField(doc, "Tipo(s) de Incapacidade", statusText, y);
    }
    if (!isFieldEmpty(laudo.conclusaoDestino)) {
      const destinoMap: Record<string, string> = {
        "alta": "Alta Médica",
        "tratamento": "Continuidade de Tratamento",
        "reabilitacao": "Reabilitação Profissional",
        "aposentadoria": "Aposentadoria por Invalidez",
      };
      y = addLabeledField(doc, "Destino Sugerido", destinoMap[laudo.conclusaoDestino!] || laudo.conclusaoDestino!, y);
    }
    if (!isFieldEmpty(laudo.conclusaoJustificativa)) {
      y = ensureSpace(doc, y, SUBTITLE_HEIGHT + 15);
      y = addSubtitle(doc, "Justificativa:", y);
      y = addParagraph(doc, laudo.conclusaoJustificativa!, y);
    }
    sectionNumber++;
  }
  
  // 20. RESPOSTAS AOS QUESITOS
  const hasQuesitos = !isFieldEmpty(laudo.quesitosJuizo) || !isFieldEmpty(laudo.quesitosReclamante) || !isFieldEmpty(laudo.quesitosReclamada);
  if (hasQuesitos) {
    y = ensureSpace(doc, y, SECTION_TITLE_HEIGHT + 20);
    y = addSectionTitle(doc, `${sectionNumber}. RESPOSTAS AOS QUESITOS`, y);
    let subSection = 1;
    if (!isFieldEmpty(laudo.quesitosJuizo)) {
      y = ensureSpace(doc, y, SUBTITLE_HEIGHT + 15);
      y = addSubtitle(doc, `${sectionNumber}.${subSection} Quesitos do Juízo`, y);
      y = addParagraph(doc, formatQuesitos(laudo.quesitosJuizo!), y);
      subSection++;
    }
    if (!isFieldEmpty(laudo.quesitosReclamante)) {
      y = ensureSpace(doc, y, SUBTITLE_HEIGHT + 15);
      y = addSubtitle(doc, `${sectionNumber}.${subSection} Quesitos do Reclamante`, y);
      y = addParagraph(doc, formatQuesitos(laudo.quesitosReclamante!), y);
      subSection++;
    }
    if (!isFieldEmpty(laudo.quesitosReclamada)) {
      y = ensureSpace(doc, y, SUBTITLE_HEIGHT + 15);
      y = addSubtitle(doc, `${sectionNumber}.${subSection} Quesitos da Reclamada`, y);
      y = addParagraph(doc, formatQuesitos(laudo.quesitosReclamada!), y);
    }
    sectionNumber++;
  }
  
  // 21. REFERÊNCIAS BIBLIOGRÁFICAS
  if (!isFieldEmpty(laudo.referenciasBibliograficas)) {
    const sectionHeight = SECTION_TITLE_HEIGHT + measureParagraphHeight(doc, laudo.referenciasBibliograficas!);
    y = ensureSpace(doc, y, Math.min(sectionHeight, 40));
    y = addSectionTitle(doc, `${sectionNumber}. REFERÊNCIAS BIBLIOGRÁFICAS`, y);
    y = addParagraph(doc, laudo.referenciasBibliograficas!, y);
    sectionNumber++;
  }
  
  // ========== ENCERRAMENTO ==========
  // Calcular altura do bloco de encerramento
  const encerramentoHeight = 15 + measureParagraphHeight(doc, "Nada mais havendo a relatar, encerra-se o presente laudo pericial, que vai assinado digitalmente pelo perito responsável.") + 20 + 35 + 8 + 6 + 10;
  y = ensureSpace(doc, y, Math.min(encerramentoHeight, 80));
  y += 15;
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "italic");
  const encerramento = "Nada mais havendo a relatar, encerra-se o presente laudo pericial, que vai assinado digitalmente pelo perito responsável.";
  y = addParagraph(doc, encerramento, y);
  
  y += 20;
  
  // Local e data
  doc.setFont("helvetica", "normal");
  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  
  if (laudo.peritoEndereco) {
    const localParts = laudo.peritoEndereco.split(",");
    const cidade = localParts.length > 1 ? localParts[localParts.length - 1].trim() : laudo.peritoEndereco;
    doc.text(`${cidade}, ${today}`, 105, y, { align: "center" });
  } else {
    doc.text(today, 105, y, { align: "center" });
  }
  
  y += 35;
  
  // Linha de assinatura
  doc.setDrawColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  doc.setLineWidth(0.5);
  doc.line(55, y, 155, y);
  
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  if (!isFieldEmpty(laudo.peritoNome)) {
    doc.text(laudo.peritoNome!.toUpperCase(), 105, y, { align: "center" });
  }
  
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (!isFieldEmpty(laudo.peritoEspecialidade)) {
    doc.text(laudo.peritoEspecialidade!, 105, y, { align: "center" });
    y += 5;
  }
  if (!isFieldEmpty(laudo.peritoCRM)) {
    doc.text(`CRM: ${laudo.peritoCRM}`, 105, y, { align: "center" });
  }
  
  // Adicionar cabeçalho e rodapé em TODAS as páginas
  await addHeaderToPages(doc, headerImageBase64);
  await addFooterToPages(doc, footerImageBase64);
  
  // Gerar nome do arquivo
  const processNumber = laudo.processoNumero?.replace(/[^0-9]/g, "") || "sem-numero";
  const periciandoName = (laudo.vitimaName || laudo.reclamante || "periciando")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .toLowerCase();
  
  const filename = `laudo-pericial-${processNumber}-${periciandoName}.pdf`;
  
  // Download do PDF
  doc.save(filename);
};

// Função de validação de campos obrigatórios
export const validateLaudoForPDF = (laudo: LaudoData): { valid: boolean; missingFields: string[] } => {
  const requiredFields: { key: keyof LaudoData; label: string }[] = [
    { key: "peritoNome", label: "Nome do Perito" },
    { key: "peritoCRM", label: "CRM do Perito" },
    { key: "processoNumero", label: "Número do Processo" },
    { key: "vitimaName", label: "Nome do Periciando" },
  ];
  
  const missingFields: string[] = [];
  
  requiredFields.forEach(({ key, label }) => {
    if (!laudo[key]) {
      missingFields.push(label);
    }
  });
  
  return {
    valid: missingFields.length === 0,
    missingFields,
  };
};
