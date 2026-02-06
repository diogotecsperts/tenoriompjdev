import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  Header, 
  Footer, 
  ImageRun, 
  AlignmentType, 
  BorderStyle,
  PageNumber,
  NumberFormat,
  HeadingLevel,
  convertInchesToTwip,
  SectionType,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
  VerticalPositionAlign,
  TextWrappingType,
} from "docx";
import { saveAs } from "file-saver";
import { LaudoData } from "@/contexts/LaudoContext";

// ========== CONSTANTES DE CONFIGURAÇÃO ==========
const COLORS = {
  primary: "1B3665",       // Azul Institucional
  secondary: "1F2937",     // Cinza chumbo
  text: "1F2937",          // Texto principal
  muted: "4B5563",         // Texto secundário
};

const FONT = {
  name: "Arial",
  sizeDefault: 20,  // 10pt em half-points
  sizeTitle: 24,    // 12pt
  sizeSubtitle: 22, // 11pt
  sizeSmall: 16,    // 8pt
};

// ========== FUNÇÕES AUXILIARES ==========

// Sanitiza markdown convertendo **texto** e __texto__ para CAIXA ALTA
const sanitizeMarkdown = (text: string): string => {
  if (!text) return "";
  return text
    .replace(/\*\*(.+?)\*\*/g, (_, p1) => p1.toUpperCase())
    .replace(/__(.+?)__/g, (_, p1) => p1.toUpperCase())
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1');
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

// Formata quesitos garantindo quebra de linha para cada item numerado
const formatQuesitos = (text: string): string => {
  if (!text) return "";
  let sanitized = sanitizeMarkdown(text);
  sanitized = sanitized.replace(/(\d+[\.\)\-])\s*/g, '\n$1 ');
  sanitized = sanitized.replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
  return sanitized.trim();
};

// ========== CARREGAMENTO DE IMAGENS ==========

const loadImageAsArrayBuffer = async (url: string): Promise<ArrayBuffer | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch {
    return null;
  }
};

const getImageDimensions = (url: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = url;
  });
};

// ========== FUNÇÕES DE CRIAÇÃO DE ELEMENTOS ==========

// Cria título de seção com formatação
const createSectionTitle = (title: string): Paragraph => {
  return new Paragraph({
    children: [
      new TextRun({
        text: title.toUpperCase(),
        bold: true,
        size: FONT.sizeTitle,
        color: COLORS.primary,
        font: FONT.name,
      }),
    ],
    spacing: { before: 300, after: 100 },
    border: {
      bottom: {
        color: COLORS.primary,
        size: 8,
        style: BorderStyle.SINGLE,
        space: 4,
      },
    },
  });
};

// Cria subtítulo
const createSubtitle = (title: string): Paragraph => {
  return new Paragraph({
    children: [
      new TextRun({
        text: title,
        bold: true,
        size: FONT.sizeSubtitle,
        color: COLORS.secondary,
        font: FONT.name,
      }),
    ],
    spacing: { before: 200, after: 80 },
  });
};

// Cria parágrafo justificado
const createParagraph = (text: string): Paragraph => {
  if (!text) return new Paragraph({});
  
  const sanitizedText = sanitizeMarkdown(text);
  
  return new Paragraph({
    children: [
      new TextRun({
        text: sanitizedText,
        size: FONT.sizeDefault,
        color: COLORS.text,
        font: FONT.name,
      }),
    ],
    alignment: AlignmentType.BOTH,
    spacing: { after: 120 },
  });
};

// Cria campo com label em negrito e valor normal
const createLabeledField = (label: string, value: string): Paragraph => {
  if (!value) return new Paragraph({});
  
  return new Paragraph({
    children: [
      new TextRun({
        text: `${label}: `,
        bold: true,
        size: FONT.sizeDefault,
        color: COLORS.text,
        font: FONT.name,
      }),
      new TextRun({
        text: value,
        size: FONT.sizeDefault,
        color: COLORS.text,
        font: FONT.name,
      }),
    ],
    spacing: { after: 80 },
  });
};

// Cria lista numerada
const createNumberedList = (items: string[]): Paragraph[] => {
  return items.map((item, index) => 
    new Paragraph({
      children: [
        new TextRun({
          text: `${index + 1}. ${item}`,
          size: FONT.sizeDefault,
          color: COLORS.text,
          font: FONT.name,
        }),
      ],
      spacing: { after: 40 },
      indent: { left: convertInchesToTwip(0.25) },
    })
  );
};

// ========== FUNÇÃO PRINCIPAL ==========

export const generateLaudoDOCX = async (laudo: LaudoData): Promise<void> => {
  let sectionNumber = 1;
  const paragraphs: Paragraph[] = [];
  
  // Carregar imagens do timbrado
  const headerImageBuffer = await loadImageAsArrayBuffer("/timbrado-cabecalho.png");
  const footerImageBuffer = await loadImageAsArrayBuffer("/timbrado-rodape.png");
  
  // Obter dimensões das imagens para calcular proporção
  let headerDimensions = { width: 595, height: 89 };
  let footerDimensions = { width: 595, height: 71 };
  
  try {
    headerDimensions = await getImageDimensions("/timbrado-cabecalho.png");
  } catch { /* usa padrão */ }
  
  try {
    footerDimensions = await getImageDimensions("/timbrado-rodape.png");
  } catch { /* usa padrão */ }

  // ========== ENDEREÇAMENTO JUDICIAL ==========
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA",
          bold: true,
          size: FONT.sizeSubtitle,
          color: COLORS.text,
          font: FONT.name,
        }),
      ],
      spacing: { before: 400, after: 80 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: laudo.processoVara?.toUpperCase() || "[VARA]",
          bold: true,
          size: FONT.sizeSubtitle,
          color: COLORS.text,
          font: FONT.name,
        }),
      ],
      spacing: { after: 300 },
    }),
    createLabeledField("Processo nº", laudo.processoNumero || "[NÚMERO]"),
    createLabeledField("Reclamante", laudo.reclamante || "[RECLAMANTE]"),
    createLabeledField("Reclamada", laudo.reclamada || "[RECLAMADA]"),
    new Paragraph({ spacing: { after: 300 } })
  );

  // ========== 1. OBJETIVO DA PERÍCIA ==========
  if (laudo.objetivoPericia) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. OBJETIVO DA PERÍCIA`),
      createParagraph(laudo.objetivoPericia)
    );
    sectionNumber++;
  }

  // ========== 2. ASSISTENTES TÉCNICOS ==========
  if (laudo.assistenteTecnicoReclamante || laudo.assistenteTecnicoReclamada) {
    paragraphs.push(createSectionTitle(`${sectionNumber}. ASSISTENTES TÉCNICOS`));
    if (laudo.assistenteTecnicoReclamante) {
      paragraphs.push(createLabeledField("Assistente do Reclamante", laudo.assistenteTecnicoReclamante));
    }
    if (laudo.assistenteTecnicoReclamada) {
      paragraphs.push(createLabeledField("Assistente da Reclamada", laudo.assistenteTecnicoReclamada));
    }
    sectionNumber++;
  }

  // ========== 3. IDENTIFICAÇÃO DO PERICIANDO ==========
  paragraphs.push(createSectionTitle(`${sectionNumber}. IDENTIFICAÇÃO DO PERICIANDO`));
  paragraphs.push(createLabeledField("Nome", laudo.vitimaName || laudo.reclamante || ""));
  if (laudo.vitimaNascimento) {
    paragraphs.push(createLabeledField("Data de Nascimento", `${formatDate(laudo.vitimaNascimento)} (${calculateAge(laudo.vitimaNascimento)})`));
  }
  paragraphs.push(createLabeledField("Profissão", laudo.vitimaProfissao || ""));
  paragraphs.push(createLabeledField("Escolaridade", laudo.vitimaEscolaridade || ""));
  paragraphs.push(createLabeledField("Dominância", laudo.vitimaDominancia || ""));
  sectionNumber++;

  // ========== 4. RESUMO DA PETIÇÃO INICIAL ==========
  if (laudo.resumoPeticaoInicial) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. RESUMO DA PETIÇÃO INICIAL`),
      createParagraph(laudo.resumoPeticaoInicial)
    );
    sectionNumber++;
  }

  // ========== 5. RESUMO DA CONTESTAÇÃO ==========
  if (laudo.resumoContestacao) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. RESUMO DA CONTESTAÇÃO`),
      createParagraph(laudo.resumoContestacao)
    );
    sectionNumber++;
  }

  // ========== 6. METODOLOGIA PERICIAL ==========
  if (laudo.metodologiaPericial) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. METODOLOGIA PERICIAL`),
      createParagraph(laudo.metodologiaPericial)
    );
    sectionNumber++;
  }

  // ========== 7. DADOS DO POSTO DE TRABALHO ==========
  const hasDadosPosto = laudo.dadosFuncionaisCargo || laudo.descricaoAtividadesLaborais;
  if (hasDadosPosto) {
    paragraphs.push(createSectionTitle(`${sectionNumber}. DADOS DO POSTO DE TRABALHO`));
    if (laudo.dadosFuncionaisCargo) {
      paragraphs.push(createLabeledField("Cargo/Função", laudo.dadosFuncionaisCargo));
    }
    if (laudo.dadosFuncionaisAdmissao) {
      paragraphs.push(createLabeledField("Data de Admissão", formatDate(laudo.dadosFuncionaisAdmissao)));
    }
    if (laudo.dadosFuncionaisAfastamento) {
      paragraphs.push(createLabeledField("Data de Afastamento", formatDate(laudo.dadosFuncionaisAfastamento)));
    }
    if (laudo.descricaoAtividadesLaborais) {
      paragraphs.push(
        createSubtitle("Ambiente e Atividades Laborais:"),
        createParagraph(laudo.descricaoAtividadesLaborais)
      );
    }
    sectionNumber++;
  }

  // ========== 8. ANAMNESE ==========
  paragraphs.push(createSectionTitle(`${sectionNumber}. ANAMNESE`));
  if (laudo.dataAcidente) {
    paragraphs.push(createLabeledField("Data do Acidente/Evento", formatDate(laudo.dataAcidente)));
  }
  if (laudo.historiaAcidente) {
    paragraphs.push(createSubtitle("Descrição do Acidente:"), createParagraph(laudo.historiaAcidente));
  }
  if (laudo.historicoOcupacional) {
    paragraphs.push(createSubtitle("Histórico Ocupacional:"), createParagraph(laudo.historicoOcupacional));
  }
  if (laudo.historiaAtual) {
    paragraphs.push(createSubtitle("Queixas Atuais:"), createParagraph(laudo.historiaAtual));
  }
  if (laudo.tratamentos) {
    paragraphs.push(createSubtitle("Tratamentos Realizados:"), createParagraph(laudo.tratamentos));
  }
  if (laudo.afastamentos) {
    paragraphs.push(createSubtitle("Afastamentos:"), createParagraph(laudo.afastamentos));
  }
  sectionNumber++;

  // ========== 9. ANTECEDENTES PATOLÓGICOS ==========
  if (laudo.antecedentes) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. ANTECEDENTES PATOLÓGICOS`),
      createParagraph(laudo.antecedentes)
    );
    sectionNumber++;
  }

  // ========== 10. DOCUMENTOS ANALISADOS ==========
  if (laudo.documentos && laudo.documentos.length > 0) {
    paragraphs.push(createSectionTitle(`${sectionNumber}. DOCUMENTOS ANALISADOS`));
    paragraphs.push(...createNumberedList(laudo.documentos));
    sectionNumber++;
  }

  // ========== 11. LAUDOS MÉDICOS APRESENTADOS ==========
  if (laudo.laudosMedicos) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. LAUDOS MÉDICOS APRESENTADOS`),
      createParagraph(laudo.laudosMedicos)
    );
    sectionNumber++;
  }

  // ========== 12. EXAMES COMPLEMENTARES ==========
  if (laudo.examesComplementares) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. EXAMES COMPLEMENTARES`),
      createParagraph(laudo.examesComplementares)
    );
    sectionNumber++;
  }

  // ========== 13. EXAME FÍSICO ==========
  if (laudo.exameFisico) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. EXAME FÍSICO`),
      createParagraph(laudo.exameFisico)
    );
    sectionNumber++;
  }

  // ========== 14. DESCRIÇÃO TÉCNICA DAS DOENÇAS ==========
  if (laudo.descricaoTecnicaDoencas) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. DESCRIÇÃO TÉCNICA DAS DOENÇAS`),
      createParagraph(laudo.descricaoTecnicaDoencas)
    );
    sectionNumber++;
  }

  // ========== 15. NEXO CAUSAL ==========
  paragraphs.push(createSectionTitle(`${sectionNumber}. NEXO CAUSAL`));
  if (laudo.nexoCausalTipo) {
    const nexoMap: Record<string, string> = {
      "direto": "Nexo Causal Direto",
      "concausa": "Concausa",
      "agravamento": "Agravamento de Condição Preexistente",
      "inexistente": "Nexo Causal Inexistente",
    };
    paragraphs.push(createLabeledField("Tipo de Nexo", nexoMap[laudo.nexoCausalTipo] || laudo.nexoCausalTipo));
  }
  if (laudo.nexoCausalJustificativa) {
    paragraphs.push(createSubtitle("Justificativa:"), createParagraph(laudo.nexoCausalJustificativa));
  }
  sectionNumber++;

  // ========== 16. ANÁLISE DA INCAPACIDADE LABORAL ==========
  if (laudo.analiseIncapacidadeLaboral) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. ANÁLISE DA INCAPACIDADE LABORAL`),
      createParagraph(laudo.analiseIncapacidadeLaboral)
    );
    sectionNumber++;
  }

  // ========== 17. AVALIAÇÃO DE SEQUELAS ==========
  const hasSequelas = laudo.tabelaSUSEP || laudo.danoEstetico || laudo.auxilioTerceiros;
  if (hasSequelas) {
    paragraphs.push(createSectionTitle(`${sectionNumber}. AVALIAÇÃO DE SEQUELAS`));
    if (laudo.tabelaSUSEP) {
      paragraphs.push(createLabeledField("Tabela SUSEP", laudo.tabelaSUSEP));
    }
    if (laudo.danoEstetico) {
      paragraphs.push(createLabeledField("Dano Estético", laudo.danoEstetico));
    }
    if (laudo.auxilioTerceiros) {
      paragraphs.push(createLabeledField("Auxílio de Terceiros", laudo.auxilioTerceiros));
    }
    sectionNumber++;
  }

  // ========== 18. DISCUSSÃO E ANÁLISE ==========
  if (laudo.conclusaoAnalise) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. DISCUSSÃO E ANÁLISE`),
      createParagraph(laudo.conclusaoAnalise)
    );
    sectionNumber++;
  }

  // ========== 19. CONCLUSÃO ==========
  paragraphs.push(createSectionTitle(`${sectionNumber}. CONCLUSÃO`));
  if (laudo.conclusaoCID) {
    paragraphs.push(createLabeledField("CID-10 Sugerido", laudo.conclusaoCID));
  }
  if (laudo.conclusaoIncapacidade) {
    const incapacidadeText = laudo.conclusaoIncapacidade === "sim" ? "Sim" : "Não";
    paragraphs.push(createLabeledField("Há Incapacidade", incapacidadeText));
  }
  if (laudo.conclusaoStatus) {
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
      const parsed = JSON.parse(laudo.conclusaoStatus);
      if (Array.isArray(parsed) && parsed.length > 0) {
        statusText = parsed.map(v => statusMap[v] || v).join("; ");
      }
    } catch {
      statusText = statusMap[laudo.conclusaoStatus] || laudo.conclusaoStatus;
    }
    
    if (statusText) {
      paragraphs.push(createLabeledField("Tipo(s) de Incapacidade", statusText));
    }
  }
  if (laudo.conclusaoDestino) {
    const destinoMap: Record<string, string> = {
      "alta": "Alta Médica",
      "tratamento": "Continuidade de Tratamento",
      "reabilitacao": "Reabilitação Profissional",
      "aposentadoria": "Aposentadoria por Invalidez",
    };
    paragraphs.push(createLabeledField("Destino Sugerido", destinoMap[laudo.conclusaoDestino] || laudo.conclusaoDestino));
  }
  if (laudo.conclusaoJustificativa) {
    paragraphs.push(createSubtitle("Justificativa:"), createParagraph(laudo.conclusaoJustificativa));
  }
  sectionNumber++;

  // ========== 20. RESPOSTAS AOS QUESITOS ==========
  const hasQuesitos = laudo.quesitosJuizo || laudo.quesitosReclamante || laudo.quesitosReclamada;
  if (hasQuesitos) {
    paragraphs.push(createSectionTitle(`${sectionNumber}. RESPOSTAS AOS QUESITOS`));
    let subSection = 1;
    
    if (laudo.quesitosJuizo) {
      paragraphs.push(createSubtitle(`${sectionNumber}.${subSection} Quesitos do Juízo`));
      paragraphs.push(createParagraph(formatQuesitos(laudo.quesitosJuizo)));
      subSection++;
    }
    if (laudo.quesitosReclamante) {
      paragraphs.push(createSubtitle(`${sectionNumber}.${subSection} Quesitos do Reclamante`));
      paragraphs.push(createParagraph(formatQuesitos(laudo.quesitosReclamante)));
      subSection++;
    }
    if (laudo.quesitosReclamada) {
      paragraphs.push(createSubtitle(`${sectionNumber}.${subSection} Quesitos da Reclamada`));
      paragraphs.push(createParagraph(formatQuesitos(laudo.quesitosReclamada)));
    }
    sectionNumber++;
  }

  // ========== 21. REFERÊNCIAS BIBLIOGRÁFICAS ==========
  if (laudo.referenciasBibliograficas) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. REFERÊNCIAS BIBLIOGRÁFICAS`),
      createParagraph(laudo.referenciasBibliograficas)
    );
    sectionNumber++;
  }

  // ========== ENCERRAMENTO ==========
  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  
  let localString = today;
  if (laudo.peritoEndereco) {
    const localParts = laudo.peritoEndereco.split(",");
    const cidade = localParts.length > 1 ? localParts[localParts.length - 1].trim() : laudo.peritoEndereco;
    localString = `${cidade}, ${today}`;
  }

  paragraphs.push(
    new Paragraph({ spacing: { before: 400 } }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Nada mais havendo a relatar, encerra-se o presente laudo pericial, que vai assinado digitalmente pelo perito responsável.",
          italics: true,
          size: FONT.sizeDefault,
          color: COLORS.text,
          font: FONT.name,
        }),
      ],
      alignment: AlignmentType.BOTH,
      spacing: { after: 500 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: localString,
          size: FONT.sizeDefault,
          color: COLORS.text,
          font: FONT.name,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 700 },
    }),
    // Linha de assinatura
    new Paragraph({
      children: [
        new TextRun({
          text: "________________________________________",
          size: FONT.sizeDefault,
          color: COLORS.text,
          font: FONT.name,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: laudo.peritoNome?.toUpperCase() || "MÉDICO PERITO",
          bold: true,
          size: FONT.sizeTitle,
          color: COLORS.text,
          font: FONT.name,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    })
  );

  if (laudo.peritoEspecialidade) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: laudo.peritoEspecialidade,
            size: FONT.sizeDefault,
            color: COLORS.text,
            font: FONT.name,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
      })
    );
  }

  if (laudo.peritoCRM) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `CRM: ${laudo.peritoCRM}`,
            size: FONT.sizeDefault,
            color: COLORS.text,
            font: FONT.name,
          }),
        ],
        alignment: AlignmentType.CENTER,
      })
    );
  }

  // ========== CRIAR DOCUMENTO ==========
  
  // Calcular dimensões proporcionais das imagens
  // A biblioteca docx usa pixels internamente para transformation
  // A4 em pontos = 595.28, em pixels = 595.28 * 1.333 ≈ 793
  const A4_WIDTH_PIXELS = 793;
  
  const headerWidth = A4_WIDTH_PIXELS;
  const headerHeight = Math.round(headerWidth * (headerDimensions.height / headerDimensions.width));
  const footerWidth = A4_WIDTH_PIXELS;
  const footerHeight = Math.round(footerWidth * (footerDimensions.height / footerDimensions.width));

  // Preparar header
  let headerContent: Paragraph[] = [];
  if (headerImageBuffer) {
    headerContent = [
      new Paragraph({
        children: [
          new ImageRun({
            data: headerImageBuffer,
            transformation: {
              width: headerWidth,
              height: headerHeight,
            },
            type: "png",
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ];
  }

  // Preparar footer com imagem edge-to-edge e numeração sobreposta
  let footerContent: Paragraph[] = [];
  
  if (footerImageBuffer) {
    // Imagem flutuante posicionada na borda inferior da página
    footerContent = [
      new Paragraph({
        children: [
          new ImageRun({
            data: footerImageBuffer,
            transformation: {
              width: footerWidth,  // Largura total A4 em pixels (793)
              height: footerHeight,
            },
            floating: {
              horizontalPosition: {
                relative: HorizontalPositionRelativeFrom.PAGE,
                offset: 0,
              },
              verticalPosition: {
                relative: VerticalPositionRelativeFrom.PAGE,
                align: VerticalPositionAlign.BOTTOM,
              },
              wrap: {
                type: TextWrappingType.NONE,
              },
              behindDocument: true,
            },
            type: "png",
          }),
        ],
      }),
    ];
  }
  
  // Numeração de página posicionada sobre a imagem do rodapé
  footerContent.push(
    new Paragraph({
      children: [
        new TextRun({
          children: ["Página ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES],
          size: FONT.sizeSmall,
          color: "FFFFFF", // Branco para contraste sobre o banner
          font: FONT.name,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 }, // Espaçamento para posicionar sobre a imagem
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1.2),
              bottom: convertInchesToTwip(0.5), // Reduzido para acomodar footer edge-to-edge
              left: convertInchesToTwip(0.79), // ~20mm
              right: convertInchesToTwip(0.59), // ~15mm
              footer: convertInchesToTwip(0.3), // Footer mais próximo da borda
            },
          },
        },
        headers: {
          default: new Header({
            children: headerContent,
          }),
        },
        footers: {
          default: new Footer({
            children: footerContent,
          }),
        },
        children: paragraphs,
      },
    ],
  });

  // Gerar e baixar
  const blob = await Packer.toBlob(doc);
  
  // Gerar nome do arquivo
  const processNumber = laudo.processoNumero?.replace(/[^0-9]/g, "") || "sem-numero";
  const periciandoName = (laudo.vitimaName || laudo.reclamante || "periciando")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .toLowerCase();
  
  const filename = `laudo-pericial-${processNumber}-${periciandoName}.docx`;
  
  saveAs(blob, filename);
};

// Reutiliza a validação do PDF
export { validateLaudoForPDF as validateLaudoForDOCX } from "./generateLaudoPDF";
