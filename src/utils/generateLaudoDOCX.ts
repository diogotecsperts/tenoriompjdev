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

// Conversão de milímetros para EMUs (English Metric Units)
// 1 inch = 914400 EMUs, 1 inch = 25.4mm, então 1mm ≈ 36000 EMUs
const MM_TO_EMU = 36000;
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
];

// Verifica se o campo está vazio ou contém conteúdo inválido/técnico
const isFieldEmpty = (value: string | null | undefined): boolean => {
  if (!value) return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  return PLACEHOLDER_PATTERNS.some(pattern => pattern.test(trimmed));
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

// Cria parágrafo justificado (para campos curtos/simples)
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

// Cria múltiplos parágrafos para campos longos — divide por \n\n e trata cada bloco
const createParagraphs = (text: string): Paragraph[] => {
  if (isFieldEmpty(text)) return [];
  const sanitized = sanitizeMarkdown(text);
  const blocks = sanitized.split('\n\n').filter(b => b.trim().length > 0);

  return blocks.map(block => {
    const lines = block.split('\n');
    // Linha única em CAIXA ALTA sem pontuação final → subtítulo interno
    const isSingleLineTitle =
      lines.length === 1 &&
      block.length < 80 &&
      !block.endsWith('.') &&
      !block.endsWith(',') &&
      block === block.toUpperCase();

    if (isSingleLineTitle) {
      return createSubtitle(block);
    }

    // Quebras simples dentro do parágrafo → TextRun com break
    const textRuns = lines.flatMap((line, i) => {
      const runs: (TextRun)[] = [
        new TextRun({
          text: line,
          size: FONT.sizeDefault,
          color: COLORS.text,
          font: FONT.name,
        }),
      ];
      if (i < lines.length - 1) {
        runs.push(new TextRun({ break: 1 }));
      }
      return runs;
    });

    return new Paragraph({
      children: textRuns,
      alignment: AlignmentType.BOTH,
      spacing: { after: 120 },
    });
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
  // Operação D: sem fallbacks literais — campos vazios simplesmente não aparecem
  const judicialParagraphs: Paragraph[] = [
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
  ];
  if (!isFieldEmpty(laudo.processoVara)) {
    judicialParagraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: laudo.processoVara!.toUpperCase(),
            bold: true,
            size: FONT.sizeSubtitle,
            color: COLORS.text,
            font: FONT.name,
          }),
        ],
        spacing: { after: 300 },
      })
    );
  }
  if (!isFieldEmpty(laudo.processoNumero)) judicialParagraphs.push(createLabeledField("Processo nº", laudo.processoNumero!));
  if (!isFieldEmpty(laudo.reclamante)) judicialParagraphs.push(createLabeledField("Reclamante", laudo.reclamante!));
  if (!isFieldEmpty(laudo.reclamada)) judicialParagraphs.push(createLabeledField("Reclamada", laudo.reclamada!));
  judicialParagraphs.push(new Paragraph({ spacing: { after: 300 } }));
  paragraphs.push(...judicialParagraphs);

  // ========== 1. OBJETIVO DA PERÍCIA ==========
  if (!isFieldEmpty(laudo.objetivoPericia)) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. OBJETIVO DA PERÍCIA`),
      ...createParagraphs(laudo.objetivoPericia!)
    );
    sectionNumber++;
  }

  // ========== 2. ASSISTENTES TÉCNICOS ==========
  if (!isFieldEmpty(laudo.assistenteTecnicoReclamante) || !isFieldEmpty(laudo.assistenteTecnicoReclamada)) {
    paragraphs.push(createSectionTitle(`${sectionNumber}. ASSISTENTES TÉCNICOS`));
    if (!isFieldEmpty(laudo.assistenteTecnicoReclamante)) {
      paragraphs.push(createLabeledField("Assistente do Reclamante", laudo.assistenteTecnicoReclamante!));
    }
    if (!isFieldEmpty(laudo.assistenteTecnicoReclamada)) {
      paragraphs.push(createLabeledField("Assistente da Reclamada", laudo.assistenteTecnicoReclamada!));
    }
    sectionNumber++;
  }

  // ========== 3. IDENTIFICAÇÃO DO PERICIANDO ==========
  paragraphs.push(createSectionTitle(`${sectionNumber}. IDENTIFICAÇÃO DO PERICIANDO`));
  const nomePericiando = laudo.vitimaName || laudo.reclamante || "";
  if (!isFieldEmpty(nomePericiando)) paragraphs.push(createLabeledField("Nome", nomePericiando));
  if (!isFieldEmpty(laudo.vitimaNascimento)) {
    paragraphs.push(createLabeledField("Data de Nascimento", `${formatDate(laudo.vitimaNascimento!)} (${calculateAge(laudo.vitimaNascimento!)})`));
  }
  if (!isFieldEmpty(laudo.vitimaProfissao)) paragraphs.push(createLabeledField("Profissão", laudo.vitimaProfissao!));
  if (!isFieldEmpty(laudo.vitimaEscolaridade)) paragraphs.push(createLabeledField("Escolaridade", laudo.vitimaEscolaridade!));
  if (!isFieldEmpty(laudo.vitimaDominancia)) paragraphs.push(createLabeledField("Dominância", laudo.vitimaDominancia!));
  sectionNumber++;

  // ========== 4. RESUMO DA PETIÇÃO INICIAL ==========
  if (!isFieldEmpty(laudo.resumoPeticaoInicial)) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. RESUMO DA PETIÇÃO INICIAL`),
      ...createParagraphs(laudo.resumoPeticaoInicial!)
    );
    sectionNumber++;
  }

  // ========== 5. RESUMO DA CONTESTAÇÃO ==========
  if (!isFieldEmpty(laudo.resumoContestacao)) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. RESUMO DA CONTESTAÇÃO`),
      ...createParagraphs(laudo.resumoContestacao!)
    );
    sectionNumber++;
  }

  // ========== 6. METODOLOGIA PERICIAL ==========
  if (!isFieldEmpty(laudo.metodologiaPericial)) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. METODOLOGIA PERICIAL`),
      ...createParagraphs(laudo.metodologiaPericial!)
    );
    sectionNumber++;
  }

  // ========== 7. DADOS DO POSTO DE TRABALHO ==========
  const hasDadosPosto = !isFieldEmpty(laudo.dadosFuncionaisCargo) || !isFieldEmpty(laudo.descricaoAtividadesLaborais);
  if (hasDadosPosto) {
    paragraphs.push(createSectionTitle(`${sectionNumber}. DADOS DO POSTO DE TRABALHO`));
    if (!isFieldEmpty(laudo.dadosFuncionaisCargo)) {
      paragraphs.push(createLabeledField("Cargo/Função", laudo.dadosFuncionaisCargo!));
    }
    if (!isFieldEmpty(laudo.dadosFuncionaisAdmissao)) {
      paragraphs.push(createLabeledField("Data de Admissão", formatDate(laudo.dadosFuncionaisAdmissao!)));
    }
    if (!isFieldEmpty(laudo.dadosFuncionaisAfastamento)) {
      paragraphs.push(createLabeledField("Data de Afastamento", formatDate(laudo.dadosFuncionaisAfastamento!)));
    }
    if (!isFieldEmpty(laudo.descricaoAtividadesLaborais)) {
      paragraphs.push(
        createSubtitle("Ambiente e Atividades Laborais:"),
        ...createParagraphs(laudo.descricaoAtividadesLaborais!)
      );
    }
    sectionNumber++;
  }

  // ========== 8. ANAMNESE ==========
  const hasAnamnese = !isFieldEmpty(laudo.dataAcidente) || !isFieldEmpty(laudo.historiaAcidente) ||
    !isFieldEmpty(laudo.historicoOcupacional) || !isFieldEmpty(laudo.historiaAtual) ||
    !isFieldEmpty(laudo.tratamentos) || !isFieldEmpty(laudo.afastamentos);
  if (hasAnamnese) {
    paragraphs.push(createSectionTitle(`${sectionNumber}. ANAMNESE`));
    if (!isFieldEmpty(laudo.dataAcidente)) {
      paragraphs.push(createLabeledField("Data do Acidente/Evento", formatDate(laudo.dataAcidente!)));
    }
    if (!isFieldEmpty(laudo.historiaAcidente)) {
      paragraphs.push(createSubtitle("Descrição do Acidente:"), ...createParagraphs(laudo.historiaAcidente!));
    }
    if (!isFieldEmpty(laudo.historicoOcupacional)) {
      paragraphs.push(createSubtitle("Histórico Ocupacional:"), ...createParagraphs(laudo.historicoOcupacional!));
    }
    if (!isFieldEmpty(laudo.historiaAtual)) {
      paragraphs.push(createSubtitle("Queixas Atuais:"), ...createParagraphs(laudo.historiaAtual!));
    }
    if (!isFieldEmpty(laudo.tratamentos)) {
      paragraphs.push(createSubtitle("Tratamentos Realizados:"), ...createParagraphs(laudo.tratamentos!));
    }
    if (!isFieldEmpty(laudo.afastamentos)) {
      paragraphs.push(createSubtitle("Afastamentos:"), ...createParagraphs(laudo.afastamentos!));
    }
    sectionNumber++;
  }

  // ========== 9. ANTECEDENTES PATOLÓGICOS ==========
  if (!isFieldEmpty(laudo.antecedentes)) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. ANTECEDENTES PATOLÓGICOS`),
      ...createParagraphs(laudo.antecedentes!)
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
  if (!isFieldEmpty(laudo.laudosMedicos)) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. LAUDOS MÉDICOS APRESENTADOS`),
      ...createParagraphs(laudo.laudosMedicos!)
    );
    sectionNumber++;
  }

  // ========== 12. EXAMES COMPLEMENTARES ==========
  if (!isFieldEmpty(laudo.examesComplementares)) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. EXAMES COMPLEMENTARES`),
      ...createParagraphs(laudo.examesComplementares!)
    );
    sectionNumber++;
  }

  // ========== 13. EXAME FÍSICO ==========
  if (!isFieldEmpty(laudo.exameFisico)) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. EXAME FÍSICO`),
      ...createParagraphs(laudo.exameFisico!)
    );
    sectionNumber++;
  }

  // ========== 14. DESCRIÇÃO TÉCNICA DAS DOENÇAS ==========
  if (!isFieldEmpty(laudo.descricaoTecnicaDoencas)) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. DESCRIÇÃO TÉCNICA DAS DOENÇAS`),
      ...createParagraphs(laudo.descricaoTecnicaDoencas!)
    );
    sectionNumber++;
  }

  // ========== 15. NEXO CAUSAL ==========
  const hasNexo = !isFieldEmpty(laudo.nexoCausalTipo) || !isFieldEmpty(laudo.nexoCausalJustificativa);
  if (hasNexo) {
    paragraphs.push(createSectionTitle(`${sectionNumber}. NEXO CAUSAL`));
    if (!isFieldEmpty(laudo.nexoCausalTipo)) {
      const nexoMap: Record<string, string> = {
        "direto": "Nexo Causal Direto",
        "concausa": "Concausa",
        "agravamento": "Agravamento de Condição Preexistente",
        "inexistente": "Nexo Causal Inexistente",
      };
      paragraphs.push(createLabeledField("Tipo de Nexo", nexoMap[laudo.nexoCausalTipo!] || laudo.nexoCausalTipo!));
    }
    if (!isFieldEmpty(laudo.nexoCausalJustificativa)) {
      paragraphs.push(createSubtitle("Justificativa:"), ...createParagraphs(laudo.nexoCausalJustificativa!));
    }
    sectionNumber++;
  }

  // ========== 16. ANÁLISE DA INCAPACIDADE LABORAL ==========
  if (!isFieldEmpty(laudo.analiseIncapacidadeLaboral)) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. ANÁLISE DA INCAPACIDADE LABORAL`),
      ...createParagraphs(laudo.analiseIncapacidadeLaboral!)
    );
    sectionNumber++;
  }

  // ========== 17. AVALIAÇÃO DE SEQUELAS ==========
  const hasSequelas = !isFieldEmpty(laudo.tabelaSUSEP) || !isFieldEmpty(laudo.danoEstetico) || !isFieldEmpty(laudo.auxilioTerceiros);
  if (hasSequelas) {
    paragraphs.push(createSectionTitle(`${sectionNumber}. AVALIAÇÃO DE SEQUELAS`));
    if (!isFieldEmpty(laudo.tabelaSUSEP)) {
      paragraphs.push(createLabeledField("Tabela SUSEP", laudo.tabelaSUSEP!));
    }
    if (!isFieldEmpty(laudo.danoEstetico)) {
      paragraphs.push(createLabeledField("Dano Estético", laudo.danoEstetico!));
    }
    if (!isFieldEmpty(laudo.auxilioTerceiros)) {
      paragraphs.push(createLabeledField("Auxílio de Terceiros", laudo.auxilioTerceiros!));
    }
    sectionNumber++;
  }

  // ========== 18. DISCUSSÃO E ANÁLISE ==========
  if (!isFieldEmpty(laudo.conclusaoAnalise)) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. DISCUSSÃO E ANÁLISE`),
      ...createParagraphs(laudo.conclusaoAnalise!)
    );
    sectionNumber++;
  }

  // ========== 19. CONCLUSÃO ==========
  const hasConclusao = !isFieldEmpty(laudo.conclusaoCID) || !isFieldEmpty(laudo.conclusaoIncapacidade) ||
    !isFieldEmpty(laudo.conclusaoStatus) || !isFieldEmpty(laudo.conclusaoDestino) || !isFieldEmpty(laudo.conclusaoJustificativa);
  if (hasConclusao) {
    paragraphs.push(createSectionTitle(`${sectionNumber}. CONCLUSÃO`));
    if (!isFieldEmpty(laudo.conclusaoCID)) {
      paragraphs.push(createLabeledField("CID-10 Sugerido", laudo.conclusaoCID!));
    }
    if (!isFieldEmpty(laudo.conclusaoIncapacidade)) {
      const incapacidadeText = laudo.conclusaoIncapacidade === "sim" ? "Sim" : "Não";
      paragraphs.push(createLabeledField("Há Incapacidade", incapacidadeText));
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
      if (statusText) {
        paragraphs.push(createLabeledField("Tipo(s) de Incapacidade", statusText));
      }
    }
    if (!isFieldEmpty(laudo.conclusaoDestino)) {
      const destinoMap: Record<string, string> = {
        "alta": "Alta Médica",
        "tratamento": "Continuidade de Tratamento",
        "reabilitacao": "Reabilitação Profissional",
        "aposentadoria": "Aposentadoria por Invalidez",
      };
      paragraphs.push(createLabeledField("Destino Sugerido", destinoMap[laudo.conclusaoDestino!] || laudo.conclusaoDestino!));
    }
    if (!isFieldEmpty(laudo.conclusaoJustificativa)) {
      paragraphs.push(createSubtitle("Justificativa:"), ...createParagraphs(laudo.conclusaoJustificativa!));
    }
    sectionNumber++;
  }

  // ========== 20. RESPOSTAS AOS QUESITOS ==========
  const hasQuesitos = !isFieldEmpty(laudo.quesitosJuizo) || !isFieldEmpty(laudo.quesitosReclamante) || !isFieldEmpty(laudo.quesitosReclamada);
  if (hasQuesitos) {
    paragraphs.push(createSectionTitle(`${sectionNumber}. RESPOSTAS AOS QUESITOS`));
    let subSection = 1;
    if (!isFieldEmpty(laudo.quesitosJuizo)) {
      paragraphs.push(createSubtitle(`${sectionNumber}.${subSection} Quesitos do Juízo`));
      paragraphs.push(createParagraph(formatQuesitos(laudo.quesitosJuizo!)));
      subSection++;
    }
    if (!isFieldEmpty(laudo.quesitosReclamante)) {
      paragraphs.push(createSubtitle(`${sectionNumber}.${subSection} Quesitos do Reclamante`));
      paragraphs.push(createParagraph(formatQuesitos(laudo.quesitosReclamante!)));
      subSection++;
    }
    if (!isFieldEmpty(laudo.quesitosReclamada)) {
      paragraphs.push(createSubtitle(`${sectionNumber}.${subSection} Quesitos da Reclamada`));
      paragraphs.push(createParagraph(formatQuesitos(laudo.quesitosReclamada!)));
    }
    sectionNumber++;
  }

  // ========== 21. REFERÊNCIAS BIBLIOGRÁFICAS ==========
  if (!isFieldEmpty(laudo.referenciasBibliograficas)) {
    paragraphs.push(
      createSectionTitle(`${sectionNumber}. REFERÊNCIAS BIBLIOGRÁFICAS`),
      ...createParagraphs(laudo.referenciasBibliograficas!)
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
    ...((!isFieldEmpty(laudo.peritoNome)) ? [new Paragraph({
      children: [
        new TextRun({
          text: laudo.peritoNome!.toUpperCase(),
          bold: true,
          size: FONT.sizeTitle,
          color: COLORS.text,
          font: FONT.name,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    })] : [])
  );

  if (!isFieldEmpty(laudo.peritoEspecialidade)) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: laudo.peritoEspecialidade!,
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

  if (!isFieldEmpty(laudo.peritoCRM)) {
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
  
  // Margem de segurança entre texto e rodapé (igual ao PDF)
  const FOOTER_SAFETY_MARGIN_MM = 12;
  
  // Largura do cabeçalho = 194mm (igual ao PDF: PAGE.width - 16)
  // Proporção em relação à largura total: 194/210 = 0.924
  const HEADER_WIDTH_RATIO = 0.924;
  const headerWidth = Math.round(A4_WIDTH_PIXELS * HEADER_WIDTH_RATIO); // ~733 pixels
  const headerHeight = Math.round(headerWidth * (headerDimensions.height / headerDimensions.width));
  const footerWidth = A4_WIDTH_PIXELS;
  const footerHeight = Math.round(footerWidth * (footerDimensions.height / footerDimensions.width));
  
  // Converter altura do footer de pixels para mm (A4: 793 pixels = 210mm, 1 pixel ≈ 0.265mm)
  const footerHeightMm = Math.round(footerHeight * 0.265);
  
  // Margem inferior = altura do rodapé + margem de segurança (igual ao PDF)
  const bottomMarginMm = footerHeightMm + FOOTER_SAFETY_MARGIN_MM;

  // Preparar header com posicionamento flutuante (como no PDF: 8mm da esquerda, 2mm do topo)
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
            floating: {
              horizontalPosition: {
                relative: HorizontalPositionRelativeFrom.PAGE,
                offset: 8 * MM_TO_EMU,  // 8mm da esquerda (como no PDF: xPos = 8)
              },
              verticalPosition: {
                relative: VerticalPositionRelativeFrom.PAGE,
                offset: 2 * MM_TO_EMU,  // 2mm do topo (como no PDF: yPos = 2)
              },
              wrap: {
                type: TextWrappingType.NONE,
              },
              behindDocument: false,  // Imagem fica na frente para evitar transparência
            },
            type: "png",
          }),
        ],
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
              behindDocument: false, // Imagem fica na frente para evitar transparência
            },
            type: "png",
          }),
        ],
      }),
    ];
  }
  
  // Numeração de página posicionada sobre a imagem do rodapé
  // No PDF está a 5mm da borda inferior, calculamos o spacing adequado
  // footerHeightMm - 5mm = distância do topo do footer até a posição da numeração
  const pageNumberSpacingTwips = Math.round((footerHeightMm - 8) * 20 * 2); // ~8mm da borda inferior
  
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
      spacing: { before: pageNumberSpacingTwips },
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: "45mm",                      // Espaço para cabeçalho (imagem floating + margem)
              bottom: `${bottomMarginMm}mm`,    // Dinâmico: altura rodapé + 12mm segurança
              left: "20mm",                     // Igual ao PDF
              right: "15mm",                    // Igual ao PDF
              header: "0mm",                    // Header na borda (imagem floating)
              footer: "0mm",                    // Footer na borda (imagem floating)
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
