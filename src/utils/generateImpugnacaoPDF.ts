import { jsPDF } from "jspdf";

// ========== CONSTANTES DE CONFIGURAÇÃO ==========
const COLORS = {
  primary: { r: 27, g: 54, b: 101 },       // #1B3665 - Azul Institucional
  secondary: { r: 31, g: 41, b: 55 },      // #1F2937 - Cinza chumbo
  text: { r: 31, g: 41, b: 55 },           // #1F2937 - Texto principal
  muted: { r: 75, g: 85, b: 99 },          // #4B5563 - Texto secundário
  white: { r: 255, g: 255, b: 255 },       // Branco puro
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

// Layout dinâmico
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
  contentStartY: 45 + HEADER_SAFETY_MARGIN,
  contentEndY: 270 - FOOTER_SAFETY_MARGIN,
};

let pageLayout: PageLayout = { ...DEFAULT_LAYOUT };

// ========== INTERFACE DE DADOS ==========

export interface ImpugnacaoPDFData {
  // Dados do processo (do laudo vinculado)
  processoNumero: string;
  processoVara: string;
  reclamante: string;
  reclamada: string;
  
  // Dados do laudo original
  laudoData: string;
  laudoVitima: string;
  laudoConclusao: string;
  
  // Quesitos respondidos
  quesitos: Array<{
    numero: number;
    texto: string;
    resposta: string;
  }>;
  
  // Dados do perito (do perfil)
  peritoNome: string;
  peritoCRM: string;
  peritoEspecialidade: string;
  peritoEndereco: string;
}

// ========== FUNÇÕES AUXILIARES ==========

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

const formatDateExtensive = (): string => {
  const today = new Date();
  return today.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

// ========== CONSTANTES DE MEDIÇÃO ==========

const SECTION_TITLE_HEIGHT = 12;
const SUBTITLE_HEIGHT = 7;
const LINE_HEIGHT = 5;
const PARAGRAPH_AFTER_SPACING = 3;

// ========== FUNÇÕES DE RENDERIZAÇÃO ==========

// Verifica necessidade de nova página
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
const addParagraph = (doc: jsPDF, text: string, y: number, maxWidth: number = PAGE.contentWidth): number => {
  if (!text) return y;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  const lines = doc.splitTextToSize(text, maxWidth);
  
  lines.forEach((line: string, index: number) => {
    y = checkNewPage(doc, y, LINE_HEIGHT);
    
    const isLastLine = index === lines.length - 1;
    const trimmedLine = line.trim();
    
    if (isLastLine || doc.getTextWidth(trimmedLine) < maxWidth * 0.7) {
      doc.text(trimmedLine, MARGINS.left, y);
    } else {
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

// Adiciona campo com label
const addLabeledField = (doc: jsPDF, label: string, value: string, y: number): number => {
  if (!value) return y;
  
  y = checkNewPage(doc, y, LINE_HEIGHT * 2);
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  const labelText = `${label}: `;
  const labelWidth = doc.getTextWidth(labelText) + 2;
  doc.text(labelText, MARGINS.left, y);
  
  doc.setFont("helvetica", "normal");
  const valueLines = doc.splitTextToSize(value, PAGE.contentWidth - labelWidth);
  
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
  
  return y + LINE_HEIGHT + 3;
};

// ========== FUNÇÕES DE IMAGEM ==========

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

const getImageDimensions = (base64: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = base64;
  });
};

const calculateDynamicLayout = async (
  headerImageBase64: string | null,
  footerImageBase64: string | null
): Promise<PageLayout> => {
  let headerBottomY = DEFAULT_LAYOUT.headerBottomY;
  let footerTopY = DEFAULT_LAYOUT.footerTopY;
  
  if (headerImageBase64) {
    try {
      const dimensions = await getImageDimensions(headerImageBase64);
      const aspectRatio = dimensions.height / dimensions.width;
      const imgWidth = PAGE.width - 16;
      const imgHeight = imgWidth * aspectRatio;
      const yPos = 2;
      headerBottomY = yPos + imgHeight;
    } catch {
      // Mantém valor padrão
    }
  }
  
  if (footerImageBase64) {
    try {
      const dimensions = await getImageDimensions(footerImageBase64);
      const aspectRatio = dimensions.height / dimensions.width;
      const imgWidth = PAGE.width;
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

const addHeaderToPages = async (doc: jsPDF, headerImageBase64: string | null) => {
  if (!headerImageBase64) return;
  
  const pageCount = doc.getNumberOfPages();
  
  let aspectRatio = 0.15;
  try {
    const dimensions = await getImageDimensions(headerImageBase64);
    aspectRatio = dimensions.height / dimensions.width;
  } catch {
    // Usa fallback
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
      // Continua sem cabeçalho
    }
  }
};

const addFooterToPages = async (doc: jsPDF, footerImageBase64: string | null) => {
  if (!footerImageBase64) return;
  
  const pageCount = doc.getNumberOfPages();
  
  let aspectRatio = 0.12;
  try {
    const dimensions = await getImageDimensions(footerImageBase64);
    aspectRatio = dimensions.height / dimensions.width;
  } catch {
    // Usa fallback
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
      // Continua sem rodapé
    }
  }
};

// ========== FUNÇÃO PRINCIPAL ==========

export const generateImpugnacaoPDF = async (data: ImpugnacaoPDFData): Promise<void> => {
  const doc = new jsPDF();
  let sectionNumber = 1;
  
  // Carregar imagens do papel timbrado
  const headerImageBase64 = await loadImageAsBase64("/timbrado-cabecalho.png");
  const footerImageBase64 = await loadImageAsBase64("/timbrado-rodape.png");
  
  // Calcular layout dinâmico
  pageLayout = await calculateDynamicLayout(headerImageBase64, footerImageBase64);
  
  // ========== INÍCIO DO CONTEÚDO ==========
  let y = pageLayout.contentStartY;
  
  // Endereçamento judicial
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA", MARGINS.left, y);
  y += 6;
  doc.text(data.processoVara?.toUpperCase() || "[VARA]", MARGINS.left, y);
  y += 15;
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Processo nº: ${data.processoNumero || "[NÚMERO]"}`, MARGINS.left, y);
  y += 6;
  doc.text(`Reclamante: ${data.reclamante || "[RECLAMANTE]"}`, MARGINS.left, y);
  y += 6;
  doc.text(`Reclamada: ${data.reclamada || "[RECLAMADA]"}`, MARGINS.left, y);
  y += 20;
  
  // Título do documento
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  doc.text("MANIFESTAÇÃO TÉCNICA PERICIAL", PAGE.width / 2, y, { align: "center" });
  y += 6;
  doc.setFontSize(11);
  doc.setFont("helvetica", "italic");
  doc.text("(Em Resposta à Impugnação)", PAGE.width / 2, y, { align: "center" });
  doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  y += 15;
  
  // 1. INTRODUÇÃO
  y = addSectionTitle(doc, `${sectionNumber}. INTRODUÇÃO`, y);
  const introducao = `O perito médico do trabalho, devidamente nomeado nos autos do processo em epígrafe, vem respeitosamente à presença de Vossa Excelência apresentar MANIFESTAÇÃO TÉCNICA em resposta à impugnação apresentada nos autos, nos termos a seguir expostos.`;
  y = addParagraph(doc, introducao, y);
  y += 5;
  sectionNumber++;
  
  // 2. DO LAUDO PERICIAL ORIGINAL
  y = ensureSpace(doc, y, 40);
  y = addSectionTitle(doc, `${sectionNumber}. DO LAUDO PERICIAL ORIGINAL`, y);
  
  if (data.laudoData) {
    y = addLabeledField(doc, "Data da Perícia", formatDate(data.laudoData), y);
  }
  if (data.laudoVitima) {
    y = addLabeledField(doc, "Periciando", data.laudoVitima, y);
  }
  if (data.laudoConclusao) {
    y = addSubtitle(doc, "Conclusão do Laudo Original:", y);
    y = addParagraph(doc, data.laudoConclusao, y);
  }
  y += 5;
  sectionNumber++;
  
  // 3. RESPOSTAS AOS QUESITOS DA IMPUGNAÇÃO
  y = ensureSpace(doc, y, 30);
  y = addSectionTitle(doc, `${sectionNumber}. RESPOSTAS AOS QUESITOS DA IMPUGNAÇÃO`, y);
  
  for (const quesito of data.quesitos) {
    // Garantir espaço mínimo para título do quesito
    y = ensureSpace(doc, y, 25);
    
    // Título do quesito
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLORS.secondary.r, COLORS.secondary.g, COLORS.secondary.b);
    y = checkNewPage(doc, y, 10);
    doc.text(`QUESITO ${quesito.numero}:`, MARGINS.left, y);
    y += 6;
    
    // Texto do quesito em itálico com aspas
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b);
    const quesitoText = `"${quesito.texto}"`;
    const quesitoLines = doc.splitTextToSize(quesitoText, PAGE.contentWidth);
    quesitoLines.forEach((line: string) => {
      y = checkNewPage(doc, y, LINE_HEIGHT);
      doc.text(line, MARGINS.left, y);
      y += LINE_HEIGHT;
    });
    y += 4;
    
    // Resposta
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
    y = checkNewPage(doc, y, 10);
    doc.text("RESPOSTA:", MARGINS.left, y);
    y += 6;
    
    doc.setFont("helvetica", "normal");
    y = addParagraph(doc, quesito.resposta, y);
    
    // Separador entre quesitos
    if (data.quesitos.indexOf(quesito) < data.quesitos.length - 1) {
      y = checkNewPage(doc, y, 10);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(MARGINS.left + 20, y, PAGE.width - MARGINS.right - 20, y);
      y += 10;
    }
  }
  y += 5;
  sectionNumber++;
  
  // 4. CONCLUSÃO
  y = ensureSpace(doc, y, 40);
  y = addSectionTitle(doc, `${sectionNumber}. CONCLUSÃO`, y);
  const conclusao = `Ante o exposto, o perito signatário ratifica integralmente as conclusões do laudo pericial originalmente apresentado nos autos, reafirmando que todas as análises técnicas foram realizadas em conformidade com os preceitos médico-legais e científicos aplicáveis ao caso.`;
  y = addParagraph(doc, conclusao, y);
  y += 5;
  sectionNumber++;
  
  // 5. ENCERRAMENTO
  y = ensureSpace(doc, y, 80);
  y = addSectionTitle(doc, `${sectionNumber}. ENCERRAMENTO`, y);
  
  const encerramento = `Nada mais havendo a esclarecer, coloco-me à disposição deste Juízo para eventuais esclarecimentos que se façam necessários.`;
  y = addParagraph(doc, encerramento, y);
  
  y += 20;
  
  // Local e data
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  
  if (data.peritoEndereco) {
    const localParts = data.peritoEndereco.split(",");
    const cidade = localParts.length > 1 ? localParts[localParts.length - 1].trim() : data.peritoEndereco;
    doc.text(`${cidade}, ${formatDateExtensive()}`, PAGE.width / 2, y, { align: "center" });
  } else {
    doc.text(formatDateExtensive(), PAGE.width / 2, y, { align: "center" });
  }
  
  y += 35;
  
  // Linha de assinatura
  doc.setDrawColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  doc.setLineWidth(0.5);
  doc.line(55, y, 155, y);
  
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(data.peritoNome?.toUpperCase() || "MÉDICO PERITO", PAGE.width / 2, y, { align: "center" });
  
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (data.peritoEspecialidade) {
    doc.text(data.peritoEspecialidade, PAGE.width / 2, y, { align: "center" });
    y += 5;
  }
  if (data.peritoCRM) {
    doc.text(`CRM: ${data.peritoCRM}`, PAGE.width / 2, y, { align: "center" });
  }
  
  // Adicionar cabeçalho e rodapé em TODAS as páginas
  await addHeaderToPages(doc, headerImageBase64);
  await addFooterToPages(doc, footerImageBase64);
  
  // Gerar nome do arquivo
  const processNumber = data.processoNumero?.replace(/[^0-9]/g, "") || "sem-numero";
  const periciandoName = (data.laudoVitima || data.reclamante || "periciando")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .toLowerCase();
  
  const filename = `manifestacao-impugnacao-${processNumber}-${periciandoName}.pdf`;
  
  // Download do PDF
  doc.save(filename);
};
