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

// Helper function to format dates
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

// Helper function to calculate age from birth date
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

// Helper to add section title
const addSectionTitle = (doc: jsPDF, title: string, y: number): number => {
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 51, 102);
  doc.text(title, 20, y);
  doc.setDrawColor(0, 51, 102);
  doc.line(20, y + 2, 190, y + 2);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  return y + 10;
};

// Helper to add paragraph text with word wrap
const addParagraph = (doc: jsPDF, text: string, y: number, maxWidth: number = 170): number => {
  if (!text) return y;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, 20, y);
  return y + (lines.length * 5) + 5;
};

// Helper to check if we need a new page
const checkNewPage = (doc: jsPDF, currentY: number, neededSpace: number = 40): number => {
  if (currentY > 270 - neededSpace) {
    doc.addPage();
    return 30;
  }
  return currentY;
};

// Helper to add labeled field
const addLabeledField = (doc: jsPDF, label: string, value: string, y: number): number => {
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`${label}: `, 20, y);
  doc.setFont("helvetica", "normal");
  const labelWidth = doc.getTextWidth(`${label}: `);
  const valueLines = doc.splitTextToSize(value || "Não informado", 170 - labelWidth);
  doc.text(valueLines, 20 + labelWidth, y);
  return y + (valueLines.length * 5) + 3;
};

// Add header to each page
const addHeader = (doc: jsPDF, laudo: LaudoData) => {
  const pageCount = doc.getNumberOfPages();
  
  for (let i = 2; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Header line
    doc.setDrawColor(0, 51, 102);
    doc.setLineWidth(0.5);
    doc.line(20, 15, 190, 15);
    
    // Perito info in header
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`${laudo.peritoNome} | CRM: ${laudo.peritoCRM} | ${laudo.peritoEspecialidade}`, 20, 12);
    doc.text(`Processo: ${laudo.processoNumero}`, 190, 12, { align: "right" });
    
    doc.setTextColor(0, 0, 0);
  }
};

// Add page numbers
const addPageNumbers = (doc: jsPDF) => {
  const pageCount = doc.getNumberOfPages();
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Página ${i} de ${pageCount}`, 105, 290, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }
};

export const generateLaudoPDF = async (laudo: LaudoData): Promise<void> => {
  const doc = new jsPDF();
  
  // ========== CAPA ==========
  // Border
  doc.setDrawColor(0, 51, 102);
  doc.setLineWidth(2);
  doc.rect(10, 10, 190, 277);
  doc.setLineWidth(0.5);
  doc.rect(12, 12, 186, 273);
  
  // Header with perito info
  doc.setFillColor(0, 51, 102);
  doc.rect(12, 12, 186, 35, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(laudo.peritoNome || "MÉDICO PERITO", 105, 25, { align: "center" });
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  if (laudo.peritoEspecialidade) {
    doc.text(laudo.peritoEspecialidade, 105, 32, { align: "center" });
  }
  if (laudo.peritoCRM) {
    doc.text(`CRM: ${laudo.peritoCRM}`, 105, 39, { align: "center" });
  }
  
  // Main title
  doc.setTextColor(0, 51, 102);
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text("LAUDO PERICIAL", 105, 90, { align: "center" });
  doc.setFontSize(18);
  doc.text("MÉDICO", 105, 102, { align: "center" });
  
  // Decorative line
  doc.setDrawColor(0, 51, 102);
  doc.setLineWidth(1);
  doc.line(50, 115, 160, 115);
  
  // Process info
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  
  let coverY = 135;
  
  if (laudo.processoNumero) {
    doc.setFont("helvetica", "bold");
    doc.text("Processo nº:", 40, coverY);
    doc.setFont("helvetica", "normal");
    doc.text(laudo.processoNumero, 75, coverY);
    coverY += 10;
  }
  
  if (laudo.processoVara) {
    doc.setFont("helvetica", "bold");
    doc.text("Vara:", 40, coverY);
    doc.setFont("helvetica", "normal");
    doc.text(laudo.processoVara, 75, coverY);
    coverY += 10;
  }
  
  coverY += 10;
  
  if (laudo.reclamante) {
    doc.setFont("helvetica", "bold");
    doc.text("Reclamante:", 40, coverY);
    doc.setFont("helvetica", "normal");
    const reclamanteLines = doc.splitTextToSize(laudo.reclamante, 110);
    doc.text(reclamanteLines, 75, coverY);
    coverY += reclamanteLines.length * 6 + 5;
  }
  
  if (laudo.reclamada) {
    doc.setFont("helvetica", "bold");
    doc.text("Reclamada:", 40, coverY);
    doc.setFont("helvetica", "normal");
    const reclamadaLines = doc.splitTextToSize(laudo.reclamada, 110);
    doc.text(reclamadaLines, 75, coverY);
    coverY += reclamadaLines.length * 6 + 5;
  }
  
  // Periciando box
  if (laudo.vitimaName) {
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(30, coverY + 10, 150, 30, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("PERICIANDO", 105, coverY + 20, { align: "center" });
    doc.setFontSize(12);
    doc.text(laudo.vitimaName, 105, coverY + 32, { align: "center" });
  }
  
  // Date at bottom
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const examDate = laudo.dataPericia ? formatDate(laudo.dataPericia) : new Date().toLocaleDateString("pt-BR");
  doc.text(`Data da Perícia: ${examDate}`, 105, 260, { align: "center" });
  
  // Perito contact at bottom
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  if (laudo.peritoEmail) {
    doc.text(laudo.peritoEmail, 105, 272, { align: "center" });
  }
  if (laudo.peritoTelefone) {
    doc.text(`Tel: ${laudo.peritoTelefone}`, 105, 278, { align: "center" });
  }
  
  // ========== CORPO DO LAUDO ==========
  doc.addPage();
  let y = 30;
  
  // 1. PREÂMBULO
  y = addSectionTitle(doc, "1. PREÂMBULO", y);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  const preambulo = `O presente laudo foi elaborado por ${laudo.peritoNome || "[NOME DO PERITO]"}, ${laudo.peritoEspecialidade || "Médico Perito"}, inscrito no CRM sob o número ${laudo.peritoCRM || "[CRM]"}, nomeado Perito Judicial nos autos do processo nº ${laudo.processoNumero || "[NÚMERO DO PROCESSO]"}, em trâmite na ${laudo.processoVara || "[VARA]"}, tendo por objetivo realizar avaliação médico-pericial do(a) Reclamante ${laudo.vitimaName || laudo.reclamante || "[NOME]"}.`;
  
  y = addParagraph(doc, preambulo, y);
  y += 5;
  
  // 2. IDENTIFICAÇÃO DO PERICIANDO
  y = checkNewPage(doc, y, 50);
  y = addSectionTitle(doc, "2. IDENTIFICAÇÃO DO PERICIANDO", y);
  
  y = addLabeledField(doc, "Nome", laudo.vitimaName || laudo.reclamante, y);
  if (laudo.vitimaNascimento) {
    y = addLabeledField(doc, "Data de Nascimento", `${formatDate(laudo.vitimaNascimento)} (${calculateAge(laudo.vitimaNascimento)})`, y);
  }
  y = addLabeledField(doc, "Profissão", laudo.vitimaProfissao, y);
  y = addLabeledField(doc, "Escolaridade", laudo.vitimaEscolaridade, y);
  y = addLabeledField(doc, "Dominância", laudo.vitimaDominancia, y);
  y += 5;
  
  // 3. HISTÓRICO DO CASO
  y = checkNewPage(doc, y, 40);
  y = addSectionTitle(doc, "3. HISTÓRICO DO CASO", y);
  
  if (laudo.dataAcidente) {
    y = addLabeledField(doc, "Data do Acidente/Evento", formatDate(laudo.dataAcidente), y);
  }
  
  if (laudo.historiaAcidente) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Descrição do Acidente:", 20, y);
    y += 5;
    y = addParagraph(doc, laudo.historiaAcidente, y);
  }
  
  if (laudo.historicoOcupacional) {
    y = checkNewPage(doc, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Histórico Ocupacional:", 20, y);
    y += 5;
    y = addParagraph(doc, laudo.historicoOcupacional, y);
  }
  
  // 4. ANAMNESE
  y = checkNewPage(doc, y, 40);
  y = addSectionTitle(doc, "4. ANAMNESE", y);
  
  if (laudo.historiaAtual) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Queixas Atuais:", 20, y);
    y += 5;
    y = addParagraph(doc, laudo.historiaAtual, y);
  }
  
  if (laudo.tratamentos) {
    y = checkNewPage(doc, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Tratamentos Realizados:", 20, y);
    y += 5;
    y = addParagraph(doc, laudo.tratamentos, y);
  }
  
  if (laudo.afastamentos) {
    y = checkNewPage(doc, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Afastamentos:", 20, y);
    y += 5;
    y = addParagraph(doc, laudo.afastamentos, y);
  }
  
  if (laudo.antecedentes) {
    y = checkNewPage(doc, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Antecedentes Patológicos:", 20, y);
    y += 5;
    y = addParagraph(doc, laudo.antecedentes, y);
  }
  
  // 5. DOCUMENTOS ANALISADOS
  if (laudo.documentos && laudo.documentos.length > 0) {
    y = checkNewPage(doc, y, 40);
    y = addSectionTitle(doc, "5. DOCUMENTOS ANALISADOS", y);
    
    laudo.documentos.forEach((doc_item, index) => {
      y = checkNewPage(doc, y);
      doc.setFontSize(10);
      doc.text(`${index + 1}. ${doc_item}`, 25, y);
      y += 6;
    });
    y += 5;
  }
  
  // 6. LAUDOS MÉDICOS APRESENTADOS
  if (laudo.laudosMedicos) {
    y = checkNewPage(doc, y, 40);
    y = addSectionTitle(doc, "6. LAUDOS MÉDICOS APRESENTADOS", y);
    y = addParagraph(doc, laudo.laudosMedicos, y);
  }
  
  // 7. EXAMES COMPLEMENTARES
  if (laudo.examesComplementares) {
    y = checkNewPage(doc, y, 40);
    y = addSectionTitle(doc, "7. EXAMES COMPLEMENTARES", y);
    y = addParagraph(doc, laudo.examesComplementares, y);
  }
  
  // 8. EXAME FÍSICO
  if (laudo.exameFisico) {
    y = checkNewPage(doc, y, 40);
    y = addSectionTitle(doc, "8. EXAME FÍSICO", y);
    y = addParagraph(doc, laudo.exameFisico, y);
  }
  
  // 9. DISCUSSÃO E ANÁLISE
  if (laudo.conclusaoAnalise) {
    y = checkNewPage(doc, y, 40);
    y = addSectionTitle(doc, "9. DISCUSSÃO E ANÁLISE", y);
    y = addParagraph(doc, laudo.conclusaoAnalise, y);
  }
  
  // 10. NEXO CAUSAL
  y = checkNewPage(doc, y, 40);
  y = addSectionTitle(doc, "10. NEXO CAUSAL", y);
  
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
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Justificativa:", 20, y);
    y += 5;
    y = addParagraph(doc, laudo.nexoCausalJustificativa, y);
  }
  
  // 11. AVALIAÇÃO DE SEQUELAS
  const hasSequelas = laudo.tabelaSUSEP || laudo.danoEstetico || laudo.auxilioTerceiros;
  if (hasSequelas) {
    y = checkNewPage(doc, y, 50);
    y = addSectionTitle(doc, "11. AVALIAÇÃO DE SEQUELAS", y);
    
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
  }
  
  // 12. CONCLUSÃO
  y = checkNewPage(doc, y, 60);
  y = addSectionTitle(doc, "12. CONCLUSÃO", y);
  
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
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Justificativa:", 20, y);
    y += 5;
    y = addParagraph(doc, laudo.conclusaoJustificativa, y);
  }
  
  // 13. RESPOSTAS AOS QUESITOS
  const hasQuesitos = laudo.quesitosJuizo || laudo.quesitosReclamante || laudo.quesitosReclamada;
  if (hasQuesitos) {
    y = checkNewPage(doc, y, 40);
    y = addSectionTitle(doc, "13. RESPOSTAS AOS QUESITOS", y);
    
    if (laudo.quesitosJuizo) {
      y = checkNewPage(doc, y);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("13.1 Quesitos do Juízo", 20, y);
      y += 7;
      y = addParagraph(doc, laudo.quesitosJuizo, y);
    }
    
    if (laudo.quesitosReclamante) {
      y = checkNewPage(doc, y);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("13.2 Quesitos do Reclamante", 20, y);
      y += 7;
      y = addParagraph(doc, laudo.quesitosReclamante, y);
    }
    
    if (laudo.quesitosReclamada) {
      y = checkNewPage(doc, y);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("13.3 Quesitos da Reclamada", 20, y);
      y += 7;
      y = addParagraph(doc, laudo.quesitosReclamada, y);
    }
  }
  
  // ========== ENCERRAMENTO ==========
  y = checkNewPage(doc, y, 80);
  y += 10;
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "italic");
  const encerramento = "Nada mais havendo a relatar, encerra-se o presente laudo pericial, que vai assinado digitalmente pelo perito responsável.";
  y = addParagraph(doc, encerramento, y);
  
  y += 15;
  
  // Local and date
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
  
  y += 30;
  
  // Signature line
  doc.setDrawColor(0, 0, 0);
  doc.line(55, y, 155, y);
  
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(laudo.peritoNome || "MÉDICO PERITO", 105, y, { align: "center" });
  
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
  
  // Add headers and page numbers
  addHeader(doc, laudo);
  addPageNumbers(doc);
  
  // Generate filename
  const processNumber = laudo.processoNumero?.replace(/[^0-9]/g, "") || "sem-numero";
  const periciandoName = (laudo.vitimaName || laudo.reclamante || "periciando")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .toLowerCase();
  
  const filename = `laudo-pericial-${processNumber}-${periciandoName}.pdf`;
  
  // Download the PDF
  doc.save(filename);
};

// Validation function to check required fields
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
