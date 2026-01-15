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
  footer: { r: 96, g: 97, b: 97 },         // #606161 - Rodapé (cinza neutro)
  sidebar: { r: 96, g: 97, b: 97 },        // #606161 - Sidebar lateral esquerda
};

const MARGINS = {
  left: 25,       // Margem esquerda ajustada (não precisa de sidebar extra pois é imagem)
  right: 15,
  top: 35,        // Espaço para cabeçalho compacto
  bottom: 35,     // Espaço para rodapé compacto
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

// Função para obter dimensões reais da imagem
const getImageDimensions = (base64: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = base64;
  });
};

// Função para recortar e converter parte de uma imagem
const cropImageToBase64 = async (
  sourceBase64: string,
  cropX: number, // percentual da largura (0-1)
  cropY: number, // percentual da altura (0-1) 
  cropWidth: number, // percentual da largura (0-1)
  cropHeight: number // percentual da altura (0-1)
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const sX = img.width * cropX;
      const sY = img.height * cropY;
      const sWidth = img.width * cropWidth;
      const sHeight = img.height * cropHeight;
      
      canvas.width = sWidth;
      canvas.height = sHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, sX, sY, sWidth, sHeight, 0, 0, sWidth, sHeight);
        resolve(canvas.toDataURL("image/png"));
      } else {
        reject(new Error("Failed to get canvas context"));
      }
    };
    img.onerror = reject;
    img.src = sourceBase64;
  });
};

const addHeaderToPages = async (doc: jsPDF, headerImageBase64: string | null) => {
  const pageCount = doc.getNumberOfPages();
  
  if (!headerImageBase64) return;
  
  // Recortar apenas a parte do cabeçalho (topo da imagem: ~10% da altura)
  let croppedHeader: string;
  try {
    croppedHeader = await cropImageToBase64(headerImageBase64, 0, 0, 1, 0.12);
  } catch {
    return; // Se falhar o crop, não adiciona cabeçalho
  }
  
  // Obter dimensões da imagem recortada
  let aspectRatio = 0.1;
  try {
    const dimensions = await getImageDimensions(croppedHeader);
    aspectRatio = dimensions.height / dimensions.width;
  } catch {
    // Usa fallback se falhar
  }
  
  // Aplicar em TODAS as páginas (incluindo a primeira)
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    try {
      // Cabeçalho posicionado no canto superior direito
      const imgWidth = PAGE.width - 40; // Largura quase total da página
      const imgHeight = imgWidth * aspectRatio;
      
      // Centralizado horizontalmente
      const xPos = (PAGE.width - imgWidth) / 2;
      const yPos = 3;
      
      doc.addImage(croppedHeader, "PNG", xPos, yPos, imgWidth, imgHeight);
    } catch {
      // Se falhar, não adiciona cabeçalho
    }
    
    doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  }
};

const addFooterToPages = async (doc: jsPDF, laudo: LaudoData, footerImageBase64: string | null) => {
  const pageCount = doc.getNumberOfPages();
  const footerHeight = 22;
  const sidebarWidth = 30;
  const footerY = PAGE.height - footerHeight;
  
  // Tentar recortar apenas o rodapé da imagem (parte inferior: últimos ~8%)
  let croppedFooter: string | null = null;
  if (footerImageBase64) {
    try {
      croppedFooter = await cropImageToBase64(footerImageBase64, 0, 0.92, 1, 0.08);
    } catch {
      // Se falhar, cria rodapé programaticamente
    }
  }
  
  // Aplicar em TODAS as páginas
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    if (croppedFooter) {
      // Usar a imagem recortada do rodapé
      try {
        const dimensions = await getImageDimensions(croppedFooter);
        const aspectRatio = dimensions.height / dimensions.width;
        const imgWidth = PAGE.width;
        const imgHeight = imgWidth * aspectRatio;
        
        doc.addImage(croppedFooter, "PNG", 0, PAGE.height - imgHeight, imgWidth, imgHeight);
      } catch {
        // Se falhar, usa rodapé programático abaixo
      }
    }
    
    // Rodapé programático (backup ou complemento)
    // Barra lateral cinza (estilo sidebar do papel timbrado)
    doc.setFillColor(COLORS.sidebar.r, COLORS.sidebar.g, COLORS.sidebar.b);
    doc.rect(0, footerY, sidebarWidth, footerHeight, "F");
    
    // Fundo cinza do rodapé (continuação)
    doc.rect(sidebarWidth, footerY, PAGE.width - sidebarWidth, footerHeight, "F");
    
    // Logo "BT" estilizado na sidebar (simulado com texto)
    doc.setTextColor(120, 120, 120); // Cinza mais claro para "BT" fantasma
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.text("BT", 4, footerY + 15);
    
    doc.setTextColor(COLORS.white.r, COLORS.white.g, COLORS.white.b);
    
    // === TEXTOS NO LADO DIREITO ===
    // Linha 1 - Nome completo do Perito
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("Dr. Bruno Victor Tenório Cavalcanti Padilha", PAGE.width - MARGINS.right, footerY + 8, { align: "right" });
    
    // Linha 2 - Cargo + CRM
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("Médico Perito Judicial - CRM/AL 11313", PAGE.width - MARGINS.right, footerY + 13, { align: "right" });
    
    // Linha 3 - Contato
    doc.text("(82) 99669-6656 | brunovctenorio@gmail.com", PAGE.width - MARGINS.right, footerY + 18, { align: "right" });
    
    // Número da página no canto inferior esquerdo (após a sidebar)
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6);
    doc.text(`Página ${i} de ${pageCount}`, sidebarWidth + 5, footerY + 18);
    
    doc.setTextColor(COLORS.text.r, COLORS.text.g, COLORS.text.b);
  }
};

// ========== FUNÇÃO PRINCIPAL ==========

export const generateLaudoPDF = async (laudo: LaudoData): Promise<void> => {
  const doc = new jsPDF();
  let sectionNumber = 1;
  
  // Carregar imagem do papel timbrado (página completa para recortar cabeçalho e rodapé)
  const timbradoImageBase64 = await loadImageAsBase64("/timbrado-header.jpg");
  
  // ========== PÁGINA 1 - INÍCIO DO CONTEÚDO (SEM CAPA) ==========
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
  
  // Adicionar cabeçalho e rodapé em TODAS as páginas (sem capa)
  await addHeaderToPages(doc, timbradoImageBase64);
  await addFooterToPages(doc, laudo, timbradoImageBase64);
  
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
