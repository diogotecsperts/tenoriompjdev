/**
 * Smart Chunker - Intelligent text chunking for field-specific extraction
 * 
 * Maps each laudo field to the most relevant region of the document,
 * reducing token usage and improving extraction precision.
 */

export interface FieldRegion {
  start: number;  // Start position (0-1 as percentage)
  end: number;    // End position (0-1 as percentage)
  priority: 'high' | 'medium' | 'low';
  description: string;
}

/**
 * Field regions mapping
 * Based on typical structure of Brazilian labor lawsuit documents:
 * - First 10%: Process headers, parties identification
 * - 10-40%: Initial petition, occupational history, accident description
 * - 40-70%: Medical documents, exams, reports
 * - 70-100%: Court questions (quesitos), final documents
 */
export const FIELD_REGIONS: Record<string, FieldRegion> = {
  // === Dados Iniciais (início do documento) ===
  'vitima.nome': { start: 0, end: 0.10, priority: 'high', description: 'Nome da vítima/reclamante' },
  'vitima.cpf': { start: 0, end: 0.10, priority: 'high', description: 'CPF do reclamante' },
  'vitima.data_nascimento': { start: 0, end: 0.15, priority: 'high', description: 'Data de nascimento' },
  'vitima.profissao': { start: 0, end: 0.20, priority: 'medium', description: 'Profissão' },
  'vitima.escolaridade': { start: 0, end: 0.20, priority: 'low', description: 'Escolaridade' },
  'vitima.dominancia': { start: 0, end: 0.15, priority: 'medium', description: 'Dominância (mão dominante)' },
  
  'processo.numero': { start: 0, end: 0.05, priority: 'high', description: 'Número do processo' },
  'processo.vara': { start: 0, end: 0.05, priority: 'high', description: 'Vara do processo' },
  'processo.reclamante': { start: 0, end: 0.10, priority: 'high', description: 'Nome do reclamante' },
  'processo.reclamada': { start: 0, end: 0.10, priority: 'high', description: 'Nome da reclamada' },
  
  // === Histórico e Acidente (primeiros 40%) ===
  'acidente.data': { start: 0, end: 0.40, priority: 'high', description: 'Data do acidente' },
  'acidente.descricao': { start: 0.05, end: 0.45, priority: 'high', description: 'Descrição do acidente' },
  'acidente.local': { start: 0.05, end: 0.40, priority: 'medium', description: 'Local do acidente' },
  
  'historico.historia_atual': { start: 0.05, end: 0.35, priority: 'high', description: 'Queixas atuais' },
  'historico.historico_ocupacional': { start: 0.05, end: 0.40, priority: 'high', description: 'Histórico de empregos' },
  'historico.antecedentes_patologicos': { start: 0.10, end: 0.50, priority: 'medium', description: 'Doenças prévias' },
  'historico.tratamentos_realizados': { start: 0.15, end: 0.60, priority: 'medium', description: 'Tratamentos feitos' },
  'historico.afastamentos': { start: 0.10, end: 0.50, priority: 'medium', description: 'Afastamentos do trabalho' },
  
  // === Documentos Médicos (meio do documento) ===
  'exame_clinico.laudos_medicos': { start: 0.20, end: 0.70, priority: 'high', description: 'Laudos médicos' },
  'exame_clinico.exames_complementares': { start: 0.25, end: 0.70, priority: 'high', description: 'Exames de imagem/lab' },
  'exame_clinico.lesoes_descritas': { start: 0.20, end: 0.65, priority: 'medium', description: 'Lesões descritas' },
  
  // === Informações Médicas (documento inteiro para CIDs) ===
  'informacoes_medicas.cids_mencionados': { start: 0, end: 1.0, priority: 'high', description: 'Códigos CID' },
  'informacoes_medicas.incapacidade_alegada': { start: 0.10, end: 0.60, priority: 'medium', description: 'Incapacidade alegada' },
  'informacoes_medicas.nexo_sugerido': { start: 0.10, end: 0.70, priority: 'medium', description: 'Nexo causal sugerido' },
  
  // === Quesitos (final do documento) ===
  'quesitos.juizo': { start: 0.65, end: 1.0, priority: 'high', description: 'Perguntas do juiz' },
  'quesitos.reclamante': { start: 0.65, end: 1.0, priority: 'high', description: 'Perguntas do reclamante' },
  'quesitos.reclamada': { start: 0.65, end: 1.0, priority: 'high', description: 'Perguntas da reclamada' },
  
  // === Textos Brutos ===
  'textos_brutos.peticao_inicial': { start: 0.05, end: 0.40, priority: 'high', description: 'Petição inicial completa' },
  'textos_brutos.contestacao': { start: 0.35, end: 0.70, priority: 'high', description: 'Contestação completa' },
  
  // === Campos de descrição/análise (documento inteiro) ===
  'descricao_tecnica_doencas': { start: 0, end: 1.0, priority: 'high', description: 'Descrição das doenças' },
  'nexo_causal': { start: 0, end: 1.0, priority: 'high', description: 'Análise de nexo causal' },
  'incapacidade': { start: 0, end: 1.0, priority: 'high', description: 'Análise de incapacidade' },
  
  // === Posto de Trabalho ===
  'descricao_posto_trabalho': { start: 0.10, end: 0.45, priority: 'medium', description: 'Descrição do posto' },
  'descricao_atividades_laborais': { start: 0.10, end: 0.45, priority: 'medium', description: 'Atividades realizadas' },
};

/**
 * Get the relevant chunk of text for a specific field
 */
export function getRelevantChunk(
  fullText: string,
  fieldKey: string,
  options: {
    minChars?: number;   // Minimum chunk size
    maxChars?: number;   // Maximum chunk size
    overlap?: number;    // Overlap percentage for boundaries
  } = {}
): string {
  const {
    minChars = 5000,
    maxChars = 500000,  // ~125K tokens
    overlap = 0.05      // 5% overlap at boundaries
  } = options;

  const region = FIELD_REGIONS[fieldKey];
  
  if (!region) {
    // Unknown field - return full text (capped)
    console.warn(`[smart-chunker] Unknown field: ${fieldKey}, using full text`);
    return fullText.slice(0, maxChars);
  }
  
  const textLength = fullText.length;
  
  // Apply overlap to extend boundaries slightly
  const adjustedStart = Math.max(0, region.start - overlap);
  const adjustedEnd = Math.min(1, region.end + overlap);
  
  let startChar = Math.floor(textLength * adjustedStart);
  let endChar = Math.floor(textLength * adjustedEnd);
  
  // Ensure minimum chunk size
  const chunkSize = endChar - startChar;
  if (chunkSize < minChars) {
    const deficit = minChars - chunkSize;
    const halfDeficit = Math.floor(deficit / 2);
    startChar = Math.max(0, startChar - halfDeficit);
    endChar = Math.min(textLength, endChar + halfDeficit);
  }
  
  // Cap at maximum size
  if (endChar - startChar > maxChars) {
    endChar = startChar + maxChars;
  }
  
  // Try to find clean boundaries (paragraph/page breaks)
  const chunk = fullText.slice(startChar, endChar);
  
  // Adjust start to paragraph boundary if possible
  if (startChar > 0) {
    const paragraphStart = chunk.indexOf('\n\n');
    if (paragraphStart > 0 && paragraphStart < 200) {
      // Found paragraph break within first 200 chars
      const adjustedChunk = chunk.slice(paragraphStart + 2);
      if (adjustedChunk.length >= minChars) {
        return adjustedChunk;
      }
    }
  }
  
  return chunk;
}

/**
 * Get field-specific extraction prompt
 */
export function getFieldPrompt(fieldKey: string): string {
  const prompts: Record<string, string> = {
    // Vítima
    'vitima.nome': 'Extraia o NOME COMPLETO do reclamante/periciando. Retorne apenas o nome.',
    'vitima.cpf': 'Extraia o CPF do reclamante. Formato: XXX.XXX.XXX-XX',
    'vitima.data_nascimento': 'Extraia a data de nascimento. Formato: YYYY-MM-DD',
    'vitima.profissao': 'Extraia a profissão ou cargo do reclamante.',
    'vitima.escolaridade': 'Extraia o nível de escolaridade (fundamental, médio, superior, etc).',
    'vitima.dominancia': 'Extraia a dominância (mão dominante): destro, canhoto ou ambidestro.',
    
    // Processo
    'processo.numero': 'Extraia o número completo do processo.',
    'processo.vara': 'Extraia a vara (ex: 1ª Vara do Trabalho de São Paulo).',
    'processo.reclamante': 'Extraia o nome do reclamante (autor da ação).',
    'processo.reclamada': 'Extraia o nome da reclamada (empresa ré).',
    
    // Acidente
    'acidente.data': 'Extraia a data do acidente de trabalho. Formato: YYYY-MM-DD',
    'acidente.descricao': 'Descreva detalhadamente o acidente ou evento que causou a lesão/doença.',
    'acidente.local': 'Extraia o local onde ocorreu o acidente.',
    
    // Histórico
    'historico.historia_atual': 'Extraia as queixas atuais, sintomas relatados, impacto nas atividades.',
    'historico.historico_ocupacional': 'Extraia o histórico de empregos, funções, tempo de serviço.',
    'historico.antecedentes_patologicos': 'Extraia doenças prévias, cirurgias anteriores, condições de saúde.',
    'historico.tratamentos_realizados': 'Extraia tratamentos feitos: medicações, fisioterapia, cirurgias.',
    'historico.afastamentos': 'Extraia períodos de afastamento, motivos, benefícios recebidos.',
    
    // Exames
    'exame_clinico.laudos_medicos': 'Resuma os laudos médicos apresentados: diagnósticos, conclusões.',
    'exame_clinico.exames_complementares': 'Liste exames de imagem/laboratoriais: tipo, data, resultado.',
    'exame_clinico.lesoes_descritas': 'Descreva as lesões mencionadas nos documentos médicos.',
    
    // Informações Médicas
    'informacoes_medicas.cids_mencionados': 'Liste TODOS os códigos CID mencionados. Formato: ["J15.9", "M54.2"]',
    'informacoes_medicas.incapacidade_alegada': 'Extraia o tipo de incapacidade alegada (parcial/total, temporária/permanente).',
    'informacoes_medicas.nexo_sugerido': 'Retorne apenas: "direto", "concausa", "agravamento" ou "" (vazio) se não houver.',
    
    // Quesitos
    'quesitos.juizo': 'Extraia TODOS os quesitos do juízo, numerados, exatamente como no documento.',
    'quesitos.reclamante': 'Extraia TODOS os quesitos do reclamante, numerados, exatamente como no documento.',
    'quesitos.reclamada': 'Extraia TODOS os quesitos da reclamada, numerados, exatamente como no documento.',
    
    // Textos brutos
    'textos_brutos.peticao_inicial': 'Transcreva o texto completo da petição inicial.',
    'textos_brutos.contestacao': 'Transcreva o texto completo da contestação.',
    
    // Descrições técnicas
    'descricao_tecnica_doencas': 'Para cada CID, forneça: definição, etiologia, sintomas, fatores ocupacionais.',
    'nexo_causal': 'Analise o nexo causal usando critérios de Bradford-Hill. Classifique como: direto, concausa, agravamento ou sem nexo.',
    'incapacidade': 'Analise a capacidade laboral: tipo de incapacidade, limitações, possibilidade de reabilitação.',
    
    // Posto de trabalho
    'descricao_posto_trabalho': 'Descreva o posto de trabalho: ambiente, equipamentos, condições ergonômicas.',
    'descricao_atividades_laborais': 'Descreva as atividades: tarefas, movimentos, esforços, jornada.',
  };
  
  return prompts[fieldKey] || `Extraia o campo "${fieldKey}" do documento de forma objetiva.`;
}

/**
 * Estimate token count for a text (rough approximation)
 */
export function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters for Portuguese
  return Math.ceil(text.length / 4);
}

/**
 * Get all fields that should be filled from text extraction
 */
export function getAllExtractableFields(): string[] {
  return Object.keys(FIELD_REGIONS);
}
