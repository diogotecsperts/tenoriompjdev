/**
 * Prompt Manager - Gerenciador centralizado de prompts de IA
 * 
 * Funcionalidades:
 * - Cache com TTL de 5 minutos
 * - Substituição de variáveis ${...}
 * - Auto-registro de prompts não existentes
 * - Fallback para prompts hardcoded
 * 
 * Padrão de IDs de prompt:
 * - prompt_regen_{fieldName}     → regenerar campo via PDF
 * - prompt_gen_{tipo}            → gerar conteúdo novo
 * - prompt_import_{step}         → processamento de autos
 * - prompt_system_{function}     → prompts de sistema
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================
// TIPOS
// ============================================

export interface PromptConfig {
  id: string;
  prompt: string;
  description?: string;
  cardId?: string;      // Para posicionamento na UI (ex: 'dados-periciando')
  sectionId?: string;   // Seção dentro do card (ex: 'anamnese')
  order?: number;       // Ordem dentro da seção
  variables?: string[]; // Variáveis esperadas no prompt
  isClassified?: boolean; // Se já foi classificado pelo admin
  createdAt?: string;
  updatedAt?: string;
}

export interface PromptContext {
  [key: string]: string | number | boolean | undefined;
}

interface CacheEntry {
  prompt: string;
  config: PromptConfig;
  timestamp: number;
}

// ============================================
// CONSTANTES
// ============================================

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const PROMPT_PREFIX = 'prompt_';

// Cache em memória (por instância da edge function)
const promptCache = new Map<string, CacheEntry>();

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
  const prefix = `[prompt-manager]`;
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  console[level](`${prefix} ${message}${metaStr}`);
}

/**
 * Substitui variáveis ${varName} no prompt pelo valor do contexto
 */
export function interpolatePrompt(prompt: string, context: PromptContext): string {
  return prompt.replace(/\$\{(\w+)\}/g, (match, varName) => {
    const value = context[varName];
    if (value === undefined) {
      log('warn', `Variável não encontrada no contexto: ${varName}`);
      return match; // Mantém a variável original se não encontrada
    }
    return String(value);
  });
}

/**
 * Extrai as variáveis esperadas de um prompt template
 */
export function extractVariables(prompt: string): string[] {
  const matches = prompt.match(/\$\{(\w+)\}/g) || [];
  return [...new Set(matches.map(m => m.slice(2, -1)))];
}

/**
 * Verifica se o cache está válido
 */
function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp < CACHE_TTL_MS;
}

/**
 * Cria cliente Supabase com service role para operações administrativas
 */
function createSupabaseAdmin() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  
  return createClient(supabaseUrl, serviceRoleKey);
}

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

/**
 * Busca um prompt do banco de dados ou cache
 * 
 * @param promptId - ID único do prompt (ex: 'prompt_regen_historiaAtual')
 * @param defaultPrompt - Prompt padrão se não existir no banco
 * @param context - Variáveis para interpolação
 * @param options - Opções adicionais
 * @returns Prompt interpolado pronto para uso
 */
export async function getPrompt(
  promptId: string,
  defaultPrompt: string,
  context: PromptContext = {},
  options: {
    autoRegister?: boolean;
    description?: string;
    cardId?: string;
    sectionId?: string;
  } = {}
): Promise<string> {
  const fullId = promptId.startsWith(PROMPT_PREFIX) ? promptId : `${PROMPT_PREFIX}${promptId}`;
  
  // 1. Verificar cache
  const cached = promptCache.get(fullId);
  if (cached && isCacheValid(cached)) {
    log('info', `Cache hit para ${fullId}`);
    return interpolatePrompt(cached.prompt, context);
  }
  
  // 2. Buscar do banco
  try {
    const supabase = createSupabaseAdmin();
    
    const { data, error } = await supabase
      .from('system_config')
      .select('value')
      .eq('id', fullId)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      log('error', `Erro ao buscar prompt ${fullId}`, { error: error.message });
    }
    
    if (data?.value) {
      const config = data.value as PromptConfig;
      const prompt = config.prompt || defaultPrompt;
      
      // Atualizar cache
      promptCache.set(fullId, {
        prompt,
        config,
        timestamp: Date.now()
      });
      
      log('info', `Prompt carregado do banco: ${fullId}`);
      return interpolatePrompt(prompt, context);
    }
    
    // 3. Prompt não existe no banco
    log('info', `Prompt não encontrado no banco: ${fullId}, usando fallback`);
    
    // 4. Auto-registrar se habilitado
    if (options.autoRegister !== false) {
      await ensurePromptExists(fullId, defaultPrompt, {
        description: options.description,
        cardId: options.cardId,
        sectionId: options.sectionId
      });
    }
    
    // Usar fallback
    return interpolatePrompt(defaultPrompt, context);
    
  } catch (err) {
    log('error', `Exceção ao buscar prompt ${fullId}`, { error: String(err) });
    return interpolatePrompt(defaultPrompt, context);
  }
}

/**
 * Garante que um prompt existe no banco de dados
 * Se não existir, cria com valores padrão e marca como "não classificado"
 * 
 * @param promptId - ID único do prompt
 * @param defaultPrompt - Texto padrão do prompt
 * @param meta - Metadados opcionais
 */
export async function ensurePromptExists(
  promptId: string,
  defaultPrompt: string,
  meta: {
    description?: string;
    cardId?: string;
    sectionId?: string;
    order?: number;
  } = {}
): Promise<void> {
  const fullId = promptId.startsWith(PROMPT_PREFIX) ? promptId : `${PROMPT_PREFIX}${promptId}`;
  
  try {
    const supabase = createSupabaseAdmin();
    
    // Verificar se já existe
    const { data: existing } = await supabase
      .from('system_config')
      .select('id')
      .eq('id', fullId)
      .single();
    
    if (existing) {
      return; // Já existe, não precisa criar
    }
    
    // Criar novo registro
    const config: PromptConfig = {
      id: fullId,
      prompt: defaultPrompt,
      description: meta.description || `Prompt auto-registrado: ${fullId}`,
      cardId: meta.cardId,
      sectionId: meta.sectionId,
      order: meta.order,
      variables: extractVariables(defaultPrompt),
      isClassified: !!(meta.cardId && meta.sectionId), // Classificado se tiver cardId e sectionId
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const { error } = await supabase
      .from('system_config')
      .insert({
        id: fullId,
        value: config,
        description: meta.description || `Prompt auto-registrado: ${fullId}`
      });
    
    if (error) {
      // Pode ser race condition, ignorar se já existe
      if (!error.message.includes('duplicate')) {
        log('error', `Erro ao auto-registrar prompt ${fullId}`, { error: error.message });
      }
    } else {
      log('info', `Auto-registrado promptId=${fullId}`, { 
        cardId: meta.cardId, 
        sectionId: meta.sectionId 
      });
    }
    
  } catch (err) {
    log('error', `Exceção ao auto-registrar prompt ${fullId}`, { error: String(err) });
  }
}

/**
 * Atualiza um prompt existente no banco
 * 
 * @param promptId - ID único do prompt
 * @param updates - Campos a atualizar
 */
export async function updatePrompt(
  promptId: string,
  updates: Partial<PromptConfig>
): Promise<boolean> {
  const fullId = promptId.startsWith(PROMPT_PREFIX) ? promptId : `${PROMPT_PREFIX}${promptId}`;
  
  try {
    const supabase = createSupabaseAdmin();
    
    // Buscar config atual
    const { data: current } = await supabase
      .from('system_config')
      .select('value')
      .eq('id', fullId)
      .single();
    
    if (!current) {
      log('warn', `Prompt não encontrado para atualização: ${fullId}`);
      return false;
    }
    
    const currentConfig = current.value as PromptConfig;
    const newConfig: PromptConfig = {
      ...currentConfig,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    // Se o prompt foi alterado, recalcular variáveis
    if (updates.prompt) {
      newConfig.variables = extractVariables(updates.prompt);
    }
    
    const { error } = await supabase
      .from('system_config')
      .update({
        value: newConfig,
        description: updates.description || currentConfig.description,
        updated_at: new Date().toISOString()
      })
      .eq('id', fullId);
    
    if (error) {
      log('error', `Erro ao atualizar prompt ${fullId}`, { error: error.message });
      return false;
    }
    
    // Invalidar cache
    promptCache.delete(fullId);
    log('info', `Prompt atualizado: ${fullId}`);
    return true;
    
  } catch (err) {
    log('error', `Exceção ao atualizar prompt ${fullId}`, { error: String(err) });
    return false;
  }
}

/**
 * Lista todos os prompts cadastrados
 * 
 * @param filter - Filtros opcionais
 */
export async function listPrompts(filter?: {
  cardId?: string;
  sectionId?: string;
  isClassified?: boolean;
}): Promise<PromptConfig[]> {
  try {
    const supabase = createSupabaseAdmin();
    
    const { data, error } = await supabase
      .from('system_config')
      .select('id, value, description, updated_at')
      .like('id', `${PROMPT_PREFIX}%`);
    
    if (error) {
      log('error', 'Erro ao listar prompts', { error: error.message });
      return [];
    }
    
    let prompts = (data || []).map(row => {
      const config = row.value as PromptConfig;
      return {
        ...config,
        id: row.id,
        updatedAt: row.updated_at
      };
    });
    
    // Aplicar filtros
    if (filter) {
      if (filter.cardId !== undefined) {
        prompts = prompts.filter(p => p.cardId === filter.cardId);
      }
      if (filter.sectionId !== undefined) {
        prompts = prompts.filter(p => p.sectionId === filter.sectionId);
      }
      if (filter.isClassified !== undefined) {
        prompts = prompts.filter(p => p.isClassified === filter.isClassified);
      }
    }
    
    return prompts;
    
  } catch (err) {
    log('error', 'Exceção ao listar prompts', { error: String(err) });
    return [];
  }
}

/**
 * Limpa o cache de prompts (útil após atualizações em lote)
 */
export function clearCache(): void {
  promptCache.clear();
  log('info', 'Cache de prompts limpo');
}

/**
 * Retorna estatísticas do cache
 */
export function getCacheStats(): { size: number; entries: string[] } {
  return {
    size: promptCache.size,
    entries: Array.from(promptCache.keys())
  };
}

// ============================================
// PROMPTS PADRÃO (FALLBACKS)
// ============================================

/**
 * Catálogo de prompts padrão para fallback
 * Estes são usados quando o prompt não existe no banco
 */
export const DEFAULT_PROMPTS = {
  // Regeneração de campos via PDF
  regen_resumoPeticaoInicial: `Você é um assistente especializado em análise de processos trabalhistas.
Analise o documento PDF e extraia um resumo da petição inicial, incluindo:
- Pedidos principais do reclamante
- Alegações de danos ou doenças ocupacionais
- Período de exposição alegado
- Valores pretendidos (se mencionados)

Seja objetivo e técnico. Máximo de 500 palavras.`,

  regen_resumoContestacao: `Você é um assistente especializado em análise de processos trabalhistas.
Analise o documento PDF e extraia um resumo da contestação, incluindo:
- Principais argumentos de defesa
- Negativas ou admissões parciais
- Documentos mencionados como prova
- Pedidos de improcedência

Seja objetivo e técnico. Máximo de 500 palavras.`,

  regen_historiaAtual: `Você é um perito médico do trabalho.
Com base nos documentos apresentados, elabore a história atual da doença/condição do periciando, incluindo:
- Início dos sintomas
- Evolução do quadro
- Tratamentos realizados
- Estado atual

Use linguagem técnica médica apropriada.`,

  regen_antecedentes: `Você é um perito médico do trabalho.
Extraia dos documentos os antecedentes patológicos relevantes do periciando:
- Doenças preexistentes
- Cirurgias anteriores
- Internações
- Uso de medicamentos crônicos
- Histórico familiar relevante`,

  regen_exameFisico: `Você é um perito médico do trabalho.
Com base nos laudos e exames apresentados, compile os achados do exame físico:
- Estado geral
- Achados específicos por sistema
- Limitações funcionais observadas
- Correlação com a queixa principal`,

  // Geração de conteúdo
  gen_analiseIncapacidade: `Você é um perito médico do trabalho especializado em avaliação de incapacidade.
Com base nas informações fornecidas, elabore uma análise técnica da incapacidade laboral:

Dados do caso:
\${dadosCaso}

Considere:
1. Tipo de incapacidade (temporária/permanente, parcial/total)
2. Relação com as atividades laborais
3. Prognóstico de recuperação
4. Necessidade de reabilitação profissional`,

  gen_nexoCausal: `Você é um perito médico do trabalho.
Analise o nexo causal entre a condição de saúde e a atividade laboral:

Diagnósticos: \${diagnosticos}
Atividade laboral: \${atividadeLaboral}
Exposição ocupacional: \${exposicao}

Classifique o nexo como:
- Nexo causal direto
- Concausa
- Sem nexo causal

Justifique tecnicamente sua conclusão.`,

  // Sistema
  system_importarAutos: `Você é um assistente especializado em análise de documentos médico-legais e processos trabalhistas.
Sua tarefa é extrair e organizar informações de processos judiciais relacionados a perícias médicas.

Siga as instruções específicas para cada tipo de documento.
Mantenha precisão técnica e objetividade.
Cite números de páginas quando relevante.`
};

/**
 * Obtém o prompt padrão do catálogo
 */
export function getDefaultPrompt(promptId: string): string | undefined {
  const key = promptId.replace(PROMPT_PREFIX, '').replace(/^(regen_|gen_|system_)/, '$1');
  return DEFAULT_PROMPTS[key as keyof typeof DEFAULT_PROMPTS];
}
