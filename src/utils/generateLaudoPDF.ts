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
  footer: { r: 75, g: 85, b: 99 },         // #4B5563 - Rodapé
};

const MARGINS = {
  left: 20,
  right: 20,
  top: 35,      // Espaço para cabeçalho
  bottom: 30,   // Espaço para rodapé
};

const PAGE = {
  width: 210,
  height: 297,
  contentWidth: 170,
};

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

// Adiciona título de seção com numeração
const addSectionTitle = (doc: jsPDF, title: string, y: number): number => {
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  doc.text(title.toUpperCase(), MARGINS.left, y);
  doc.setDrawColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  doc.setLineWidth(0.5);
  doc.line(MARGINS.left, y + 2, PAGE.width - MARGINS.right, y + 2);
  doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  doc.setFont("helvetica", "normal");
  return y + 12;
};

// Adiciona subtítulo
const addSubtitle = (doc: jsPDF, title: string, y: number): number => {
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLORS.secondary.r, COLORS.secondary.g, COLORS.secondary.b);
  doc.text(title, MARGINS.left, y);
  doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  doc.setFont("helvetica", "normal");
  return y + 7;
};

// Adiciona parágrafo com quebra de linha
const addParagraph = (doc: jsPDF, text: string, y: number, maxWidth: number = PAGE.contentWidth): number => {
  if (!text) return y;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, MARGINS.left, y);
  return y + (lines.length * 5) + 5;
};

// Verifica necessidade de nova página
const checkNewPage = (doc: jsPDF, currentY: number, neededSpace: number = 40): number => {
  if (currentY > PAGE.height - MARGINS.bottom - neededSpace) {
    doc.addPage();
    return MARGINS.top;
  }
  return currentY;
};

// Adiciona campo com label
const addLabeledField = (doc: jsPDF, label: string, value: string, y: number): number => {
  if (!value) return y;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  const labelText = `${label}: `;
  const labelWidth = doc.getTextWidth(labelText) + 2; // Calcular ANTES de mudar fonte + buffer
  doc.text(labelText, MARGINS.left, y);
  doc.setFont("helvetica", "normal");
  const valueLines = doc.splitTextToSize(value, PAGE.contentWidth - labelWidth);
  doc.text(valueLines, MARGINS.left + labelWidth, y);
  return y + (valueLines.length * 5) + 3;
};

// Adiciona texto de endereçamento judicial
const addJudicialAddress = (doc: jsPDF, laudo: LaudoData, y: number): number => {
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA", MARGINS.left, y);
  y += 6;
  doc.text(laudo.processoVara?.toUpperCase() || "[VARA]", MARGINS.left, y);
  y += 15;
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Processo nº: ${laudo.processoNumero || "[NÚMERO]"}`, MARGINS.left, y);
  y += 6;
  doc.text(`Reclamante: ${laudo.reclamante || "[RECLAMANTE]"}`, MARGINS.left, y);
  y += 6;
  doc.text(`Reclamada: ${laudo.reclamada || "[RECLAMADA]"}`, MARGINS.left, y);
  
  return y + 15;
};

// ========== CABEÇALHO E RODAPÉ ==========

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

const addHeaderToPages = (doc: jsPDF, laudo: LaudoData, logoBase64: string | null) => {
  const pageCount = doc.getNumberOfPages();
  
  for (let i = 2; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Fundo do cabeçalho
    doc.setFillColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
    doc.rect(0, 0, PAGE.width, 20, "F");
    
    let textStartX = MARGINS.left;
    
    // Adicionar logo se existir
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, "PNG", MARGINS.left, 2, 16, 16);
        textStartX = MARGINS.left + 20;
      } catch {
        // Se falhar, continua sem logo
      }
    }
    
    // Nome do perito
    doc.setTextColor(COLORS.white.r, COLORS.white.g, COLORS.white.b);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(laudo.peritoNome || "MÉDICO PERITO", textStartX, 12);
    
    // Especialidade e CRM
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const rightInfo = `${laudo.peritoEspecialidade || ""} | CRM: ${laudo.peritoCRM || ""}`;
    doc.text(rightInfo, PAGE.width - MARGINS.right, 12, { align: "right" });
    
    // Linha decorativa abaixo do cabeçalho
    doc.setDrawColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
    doc.setLineWidth(0.5);
    doc.line(MARGINS.left, 25, PAGE.width - MARGINS.right, 25);
    
    doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  }
};

const addFooterToPages = (doc: jsPDF, laudo: LaudoData) => {
  const pageCount = doc.getNumberOfPages();
  
  for (let i = 2; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Fundo do rodapé
    doc.setFillColor(COLORS.footer.r, COLORS.footer.g, COLORS.footer.b);
    doc.rect(0, PAGE.height - 18, PAGE.width, 18, "F");
    
    doc.setTextColor(COLORS.white.r, COLORS.white.g, COLORS.white.b);
    
    // Linha 1 - Nome do Perito (negrito, à direita)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(laudo.peritoNome || "Médico Perito", PAGE.width - MARGINS.right, PAGE.height - 14, { align: "right" });
    
    // Linha 2 - Especialidade + CRM (normal, à direita)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const cargoText = `${laudo.peritoEspecialidade || "Médico Perito Judicial"} - CRM ${laudo.peritoCRM || ""}`;
    doc.text(cargoText, PAGE.width - MARGINS.right, PAGE.height - 10, { align: "right" });
    
    // Linha 3 - Telefone | Email (normal, à direita)
    const contatoParts = [];
    if (laudo.peritoTelefone) contatoParts.push(laudo.peritoTelefone);
    if (laudo.peritoEmail) contatoParts.push(laudo.peritoEmail);
    if (contatoParts.length > 0) {
      doc.text(contatoParts.join(" | "), PAGE.width - MARGINS.right, PAGE.height - 6, { align: "right" });
    }
    
    // Número da página (à esquerda para equilíbrio)
    doc.setFontSize(7);
    doc.text(`Página ${i} de ${pageCount}`, MARGINS.left, PAGE.height - 10, { align: "left" });
    
    doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  }
};

// ========== FUNÇÃO PRINCIPAL ==========

export const generateLaudoPDF = async (laudo: LaudoData): Promise<void> => {
  const doc = new jsPDF();
  let sectionNumber = 1;
  
  // Carregar logo se existir
  const logoBase64 = await loadImageAsBase64(laudo.peritoLogoUrl);
  
  // ========== PÁGINA 1 - CAPA ==========
  
  // Moldura única grossa (border-4 ≈ 1.5mm)
  doc.setDrawColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  doc.setLineWidth(1.5);
  doc.rect(8, 8, 194, 281, "S");
  
  // Cabeçalho azul com informações do perito (py-8 ≈ padding generoso)
  doc.setFillColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  doc.rect(12, 12, 186, 38, "F");
  
  // Adicionar logo na capa se existir
  let textCenterX = 105;
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", 20, 17, 28, 28);
      textCenterX = 118;
    } catch {
      // Se falhar, continua sem logo
    }
  }
  
  // Nome do perito (text-xl, bold, uppercase)
  doc.setTextColor(COLORS.white.r, COLORS.white.g, COLORS.white.b);
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text(laudo.peritoNome?.toUpperCase() || "MÉDICO PERITO", textCenterX, 28, { align: "center" });
  
  // CRM com opacidade 90% (simular com cor mais clara)
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(230, 230, 235); // Branco com ~90% opacidade
  if (laudo.peritoCRM) {
    doc.text(`CRM: ${laudo.peritoCRM}`, textCenterX, 40, { align: "center" });
  }
  
  // Título principal "LAUDO PERICIAL" (text-4xl, bold, cor primária)
  doc.setTextColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  doc.setFontSize(32);
  doc.setFont("helvetica", "bold");
  doc.text("LAUDO PERICIAL", 105, 85, { align: "center" });
  
  // Subtítulo "MÉDICO" com tracking-widest (letter-spacing simulado)
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("M É D I C O", 105, 100, { align: "center" });
  
  // Linha decorativa mais grossa (border-t-4 ≈ 1.5mm, w-2/3)
  doc.setDrawColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  doc.setLineWidth(1.5);
  doc.line(50, 115, 160, 115);
  
  // ===== Grid de Informações (Metadados do Processo) =====
  // Layout: grid grid-cols-[1fr_3fr] - colunas alinhadas
  doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  doc.setFontSize(11);
  
  const labelColX = 40;       // Posição fixa dos labels
  const valueColX = 78;       // Posição fixa dos valores
  const gridMaxWidth = 90;    // Largura máxima para valores
  let coverY = 135;
  
  const addGridRow = (label: string, value: string | undefined | null): void => {
    if (!value) return;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
    doc.text(`${label}:`, labelColX, coverY);
    
    doc.setFont("helvetica", "normal");
    doc.setTextColor(COLORS.secondary.r, COLORS.secondary.g, COLORS.secondary.b);
    const lines = doc.splitTextToSize(value, gridMaxWidth);
    doc.text(lines, valueColX, coverY);
    coverY += lines.length * 5 + 8;
  };
  
  addGridRow("Processo nº", laudo.processoNumero);
  addGridRow("Vara", laudo.processoVara);
  addGridRow("Reclamante", laudo.reclamante);
  addGridRow("Reclamada", laudo.reclamada);
  
  // ===== Box de Destaque (Periciando) =====
  if (laudo.vitimaName) {
    coverY = Math.max(coverY + 5, 200); // Garantir espaçamento mínimo
    const boxWidth = 140;  // ~80% da largura do conteúdo
    const boxX = (PAGE.width - boxWidth) / 2;  // Centralizado (mx-auto)
    const boxHeight = 38;
    
    // Fundo cinza suave (bg-gray-100)
    doc.setFillColor(COLORS.background.r, COLORS.background.g, COLORS.background.b);
    doc.roundedRect(boxX, coverY, boxWidth, boxHeight, 5, 5, "F");
    
    // Borda mais grossa (border-2, rounded-xl)
    doc.setDrawColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
    doc.setLineWidth(0.75);
    doc.roundedRect(boxX, coverY, boxWidth, boxHeight, 5, 5, "S");
    
    // Rótulo com tracking-widest (text-xs, uppercase, text-gray-500)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b);
    doc.text("P E R I C I A N D O ( A )", 105, coverY + 13, { align: "center" });
    
    // Nome maior (text-2xl, font-black)
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
    doc.text(laudo.vitimaName.toUpperCase(), 105, coverY + 28, { align: "center" });
  }
  
  // ===== Rodapé da Capa =====
  // Data da perícia (centralizada)
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b);
  const examDate = laudo.dataPericia ? formatDate(laudo.dataPericia) : formatDate(new Date().toISOString());
  doc.text(`Data da Perícia: ${examDate}`, 105, 255, { align: "center" });
  
  // Contato separado por pipe (text-sm, cinza médio)
  doc.setFontSize(9);
  const contactParts = [];
  if (laudo.peritoEmail) contactParts.push(laudo.peritoEmail);
  if (laudo.peritoTelefone) contactParts.push(`Tel: ${laudo.peritoTelefone}`);
  if (contactParts.length > 0) {
    doc.text(contactParts.join("  |  "), 105, 268, { align: "center" });
  }
  if (laudo.peritoEndereco) {
    doc.text(laudo.peritoEndereco, 105, 277, { align: "center" });
  }
  
  // ========== CORPO DO LAUDO ==========
  doc.addPage();
  let y = MARGINS.top;
  
  // Endereçamento judicial
  y = addJudicialAddress(doc, laudo, y);
  
  // 1. OBJETIVO DA PERÍCIA
  if (laudo.objetivoPericia) {
    y = checkNewPage(doc, y, 50);
    y = addSectionTitle(doc, `${sectionNumber}. OBJETIVO DA PERÍCIA`, y);
    y = addParagraph(doc, laudo.objetivoPericia, y);
    sectionNumber++;
  }
  
  // 2. ASSISTENTES TÉCNICOS
  if (laudo.assistenteTecnicoReclamante || laudo.assistenteTecnicoReclamada) {
    y = checkNewPage(doc, y, 40);
    y = addSectionTitle(doc, `${sectionNumber}. ASSISTENTES TÉCNICOS`, y);
    if (laudo.assistenteTecnicoReclamante) {
      y = addLabeledField(doc, "Assistente do Reclamante", laudo.assistenteTecnicoReclamante, y);
    }
    if (laudo.assistenteTecnicoReclamada) {
      y = addLabeledField(doc, "Assistente da Reclamada", laudo.assistenteTecnicoReclamada, y);
    }
    y += 5;
    sectionNumber++;
  }
  
  // 3. IDENTIFICAÇÃO DO PERICIANDO
  y = checkNewPage(doc, y, 60);
  y = addSectionTitle(doc, `${sectionNumber}. IDENTIFICAÇÃO DO PERICIANDO`, y);
  y = addLabeledField(doc, "Nome", laudo.vitimaName || laudo.reclamante, y);
  if (laudo.vitimaNascimento) {
    y = addLabeledField(doc, "Data de Nascimento", `${formatDate(laudo.vitimaNascimento)} (${calculateAge(laudo.vitimaNascimento)})`, y);
  }
  y = addLabeledField(doc, "Profissão", laudo.vitimaProfissao, y);
  y = addLabeledField(doc, "Escolaridade", laudo.vitimaEscolaridade, y);
  y = addLabeledField(doc, "Dominância", laudo.vitimaDominancia, y);
  y += 5;
  sectionNumber++;
  
  // 4. RESUMO DA PETIÇÃO INICIAL
  if (laudo.resumoPeticaoInicial) {
    y = checkNewPage(doc, y, 50);
    y = addSectionTitle(doc, `${sectionNumber}. RESUMO DA PETIÇÃO INICIAL`, y);
    y = addParagraph(doc, laudo.resumoPeticaoInicial, y);
    sectionNumber++;
  }
  
  // 5. RESUMO DA CONTESTAÇÃO
  if (laudo.resumoContestacao) {
    y = checkNewPage(doc, y, 50);
    y = addSectionTitle(doc, `${sectionNumber}. RESUMO DA CONTESTAÇÃO`, y);
    y = addParagraph(doc, laudo.resumoContestacao, y);
    sectionNumber++;
  }
  
  // 6. METODOLOGIA PERICIAL
  if (laudo.metodologiaPericial) {
    y = checkNewPage(doc, y, 50);
    y = addSectionTitle(doc, `${sectionNumber}. METODOLOGIA PERICIAL`, y);
    y = addParagraph(doc, laudo.metodologiaPericial, y);
    sectionNumber++;
  }
  
  // 7. DADOS DO POSTO DE TRABALHO
  const hasDadosPosto = laudo.dadosFuncionaisCargo || laudo.descricaoPostoTrabalho || laudo.descricaoAtividadesLaborais;
  if (hasDadosPosto) {
    y = checkNewPage(doc, y, 60);
    y = addSectionTitle(doc, `${sectionNumber}. DADOS DO POSTO DE TRABALHO`, y);
    
    if (laudo.dadosFuncionaisCargo) {
      y = addLabeledField(doc, "Cargo/Função", laudo.dadosFuncionaisCargo, y);
    }
    if (laudo.dadosFuncionaisAdmissao) {
      y = addLabeledField(doc, "Data de Admissão", formatDate(laudo.dadosFuncionaisAdmissao), y);
    }
    if (laudo.dadosFuncionaisAfastamento) {
      y = addLabeledField(doc, "Data de Afastamento", formatDate(laudo.dadosFuncionaisAfastamento), y);
    }
    
    if (laudo.descricaoPostoTrabalho) {
      y = checkNewPage(doc, y);
      y = addSubtitle(doc, "Descrição do Posto de Trabalho:", y);
      y = addParagraph(doc, laudo.descricaoPostoTrabalho, y);
    }
    
    if (laudo.descricaoAtividadesLaborais) {
      y = checkNewPage(doc, y);
      y = addSubtitle(doc, "Atividades Laborais:", y);
      y = addParagraph(doc, laudo.descricaoAtividadesLaborais, y);
    }
    sectionNumber++;
  }
  
  // 8. ANAMNESE / HISTÓRICO
  y = checkNewPage(doc, y, 50);
  y = addSectionTitle(doc, `${sectionNumber}. ANAMNESE`, y);
  
  if (laudo.dataAcidente) {
    y = addLabeledField(doc, "Data do Acidente/Evento", formatDate(laudo.dataAcidente), y);
  }
  
  if (laudo.historiaAcidente) {
    y = checkNewPage(doc, y);
    y = addSubtitle(doc, "Descrição do Acidente:", y);
    y = addParagraph(doc, laudo.historiaAcidente, y);
  }
  
  if (laudo.historicoOcupacional) {
    y = checkNewPage(doc, y);
    y = addSubtitle(doc, "Histórico Ocupacional:", y);
    y = addParagraph(doc, laudo.historicoOcupacional, y);
  }
  
  if (laudo.historiaAtual) {
    y = checkNewPage(doc, y);
    y = addSubtitle(doc, "Queixas Atuais:", y);
    y = addParagraph(doc, laudo.historiaAtual, y);
  }
  
  if (laudo.tratamentos) {
    y = checkNewPage(doc, y);
    y = addSubtitle(doc, "Tratamentos Realizados:", y);
    y = addParagraph(doc, laudo.tratamentos, y);
  }
  
  if (laudo.afastamentos) {
    y = checkNewPage(doc, y);
    y = addSubtitle(doc, "Afastamentos:", y);
    y = addParagraph(doc, laudo.afastamentos, y);
  }
  sectionNumber++;
  
  // 9. ANTECEDENTES PATOLÓGICOS
  if (laudo.antecedentes) {
    y = checkNewPage(doc, y, 40);
    y = addSectionTitle(doc, `${sectionNumber}. ANTECEDENTES PATOLÓGICOS`, y);
    y = addParagraph(doc, laudo.antecedentes, y);
    sectionNumber++;
  }
  
  // 10. DOCUMENTOS ANALISADOS
  if (laudo.documentos && laudo.documentos.length > 0) {
    y = checkNewPage(doc, y, 50);
    y = addSectionTitle(doc, `${sectionNumber}. DOCUMENTOS ANALISADOS`, y);
    
    laudo.documentos.forEach((doc_item, index) => {
      y = checkNewPage(doc, y);
      doc.setFontSize(10);
      doc.text(`${index + 1}. ${doc_item}`, MARGINS.left + 5, y);
      y += 6;
    });
    y += 5;
    sectionNumber++;
  }
  
  // 11. LAUDOS MÉDICOS APRESENTADOS
  if (laudo.laudosMedicos) {
    y = checkNewPage(doc, y, 40);
    y = addSectionTitle(doc, `${sectionNumber}. LAUDOS MÉDICOS APRESENTADOS`, y);
    y = addParagraph(doc, laudo.laudosMedicos, y);
    sectionNumber++;
  }
  
  // 12. EXAMES COMPLEMENTARES
  if (laudo.examesComplementares) {
    y = checkNewPage(doc, y, 40);
    y = addSectionTitle(doc, `${sectionNumber}. EXAMES COMPLEMENTARES`, y);
    y = addParagraph(doc, laudo.examesComplementares, y);
    sectionNumber++;
  }
  
  // 13. EXAME FÍSICO
  if (laudo.exameFisico) {
    y = checkNewPage(doc, y, 40);
    y = addSectionTitle(doc, `${sectionNumber}. EXAME FÍSICO`, y);
    y = addParagraph(doc, laudo.exameFisico, y);
    sectionNumber++;
  }
  
  // 14. DESCRIÇÃO TÉCNICA DAS DOENÇAS
  if (laudo.descricaoTecnicaDoencas) {
    y = checkNewPage(doc, y, 40);
    y = addSectionTitle(doc, `${sectionNumber}. DESCRIÇÃO TÉCNICA DAS DOENÇAS`, y);
    y = addParagraph(doc, laudo.descricaoTecnicaDoencas, y);
    sectionNumber++;
  }
  
  // 15. NEXO CAUSAL
  y = checkNewPage(doc, y, 50);
  y = addSectionTitle(doc, `${sectionNumber}. NEXO CAUSAL`, y);
  
  if (laudo.nexoCausalTipo) {
    const nexoMap: Record<string, string> = {
      "direto": "Nexo Causal Direto",
      "concausa": "Concausa",
      "agravamento": "Agravamento de Condição Preexistente",
      "inexistente": "Nexo Causal Inexistente",
    };
    y = addLabeledField(doc, "Tipo de Nexo", nexoMap[laudo.nexoCausalTipo] || laudo.nexoCausalTipo, y);
  }
  
  if (laudo.nexoCausalJustificativa) {
    y = checkNewPage(doc, y);
    y = addSubtitle(doc, "Justificativa:", y);
    y = addParagraph(doc, laudo.nexoCausalJustificativa, y);
  }
  sectionNumber++;
  
  // 16. ANÁLISE DA INCAPACIDADE LABORAL
  if (laudo.analiseIncapacidadeLaboral) {
    y = checkNewPage(doc, y, 40);
    y = addSectionTitle(doc, `${sectionNumber}. ANÁLISE DA INCAPACIDADE LABORAL`, y);
    y = addParagraph(doc, laudo.analiseIncapacidadeLaboral, y);
    sectionNumber++;
  }
  
  // 17. AVALIAÇÃO DE SEQUELAS
  const hasSequelas = laudo.tabelaSUSEP || laudo.danoEstetico || laudo.auxilioTerceiros;
  if (hasSequelas) {
    y = checkNewPage(doc, y, 50);
    y = addSectionTitle(doc, `${sectionNumber}. AVALIAÇÃO DE SEQUELAS`, y);
    
    if (laudo.tabelaSUSEP) {
      y = addLabeledField(doc, "Tabela SUSEP", laudo.tabelaSUSEP, y);
    }
    if (laudo.danoEstetico) {
      y = addLabeledField(doc, "Dano Estético", laudo.danoEstetico, y);
    }
    if (laudo.auxilioTerceiros) {
      y = addLabeledField(doc, "Auxílio de Terceiros", laudo.auxilioTerceiros, y);
    }
    y += 5;
    sectionNumber++;
  }
  
  // 18. DISCUSSÃO E ANÁLISE
  if (laudo.conclusaoAnalise) {
    y = checkNewPage(doc, y, 40);
    y = addSectionTitle(doc, `${sectionNumber}. DISCUSSÃO E ANÁLISE`, y);
    y = addParagraph(doc, laudo.conclusaoAnalise, y);
    sectionNumber++;
  }
  
  // 19. CONCLUSÃO
  y = checkNewPage(doc, y, 70);
  y = addSectionTitle(doc, `${sectionNumber}. CONCLUSÃO`, y);
  
  if (laudo.conclusaoCID) {
    y = addLabeledField(doc, "CID-10 Sugerido", laudo.conclusaoCID, y);
  }
  
  if (laudo.conclusaoIncapacidade) {
    const incapacidadeText = laudo.conclusaoIncapacidade === "sim" ? "Sim" : "Não";
    y = addLabeledField(doc, "Há Incapacidade", incapacidadeText, y);
  }
  
  if (laudo.conclusaoStatus) {
    const statusMap: Record<string, string> = {
      "temporaria_total": "Incapacidade Temporária Total",
      "temporaria_parcial": "Incapacidade Temporária Parcial",
      "permanente_total": "Incapacidade Permanente Total",
      "permanente_parcial": "Incapacidade Permanente Parcial",
    };
    y = addLabeledField(doc, "Tipo de Incapacidade", statusMap[laudo.conclusaoStatus] || laudo.conclusaoStatus, y);
  }
  
  if (laudo.conclusaoDestino) {
    const destinoMap: Record<string, string> = {
      "alta": "Alta Médica",
      "tratamento": "Continuidade de Tratamento",
      "reabilitacao": "Reabilitação Profissional",
      "aposentadoria": "Aposentadoria por Invalidez",
    };
    y = addLabeledField(doc, "Destino Sugerido", destinoMap[laudo.conclusaoDestino] || laudo.conclusaoDestino, y);
  }
  
  if (laudo.conclusaoJustificativa) {
    y = checkNewPage(doc, y);
    y = addSubtitle(doc, "Justificativa:", y);
    y = addParagraph(doc, laudo.conclusaoJustificativa, y);
  }
  sectionNumber++;
  
  // 20. RESPOSTAS AOS QUESITOS
  const hasQuesitos = laudo.quesitosJuizo || laudo.quesitosReclamante || laudo.quesitosReclamada;
  if (hasQuesitos) {
    y = checkNewPage(doc, y, 40);
    y = addSectionTitle(doc, `${sectionNumber}. RESPOSTAS AOS QUESITOS`, y);
    
    let subSection = 1;
    
    if (laudo.quesitosJuizo) {
      y = checkNewPage(doc, y);
      y = addSubtitle(doc, `${sectionNumber}.${subSection} Quesitos do Juízo`, y);
      y = addParagraph(doc, laudo.quesitosJuizo, y);
      subSection++;
    }
    
    if (laudo.quesitosReclamante) {
      y = checkNewPage(doc, y);
      y = addSubtitle(doc, `${sectionNumber}.${subSection} Quesitos do Reclamante`, y);
      y = addParagraph(doc, laudo.quesitosReclamante, y);
      subSection++;
    }
    
    if (laudo.quesitosReclamada) {
      y = checkNewPage(doc, y);
      y = addSubtitle(doc, `${sectionNumber}.${subSection} Quesitos da Reclamada`, y);
      y = addParagraph(doc, laudo.quesitosReclamada, y);
    }
    sectionNumber++;
  }
  
  // 21. REFERÊNCIAS BIBLIOGRÁFICAS
  if (laudo.referenciasBibliograficas) {
    y = checkNewPage(doc, y, 50);
    y = addSectionTitle(doc, `${sectionNumber}. REFERÊNCIAS BIBLIOGRÁFICAS`, y);
    y = addParagraph(doc, laudo.referenciasBibliograficas, y);
    sectionNumber++;
  }
  
  // ========== ENCERRAMENTO ==========
  y = checkNewPage(doc, y, 100);
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
  doc.text(laudo.peritoNome?.toUpperCase() || "MÉDICO PERITO", 105, y, { align: "center" });
  
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (laudo.peritoEspecialidade) {
    doc.text(laudo.peritoEspecialidade, 105, y, { align: "center" });
    y += 5;
  }
  if (laudo.peritoCRM) {
    doc.text(`CRM: ${laudo.peritoCRM}`, 105, y, { align: "center" });
  }
  
  // Adicionar cabeçalho e rodapé em todas as páginas (exceto capa)
  addHeaderToPages(doc, laudo, logoBase64);
  addFooterToPages(doc, laudo);
  
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
