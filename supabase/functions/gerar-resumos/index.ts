import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAIConfig, callAI } from "../_shared/ai-config.ts";
import { getPrompt } from "../_shared/prompt-manager.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GerarResumoRequest {
  tipo: 'resumo_peticao' | 'resumo_contestacao' | 'descricao_doencas' | 'descricao_cid' | 'nexo_causal' | 'incapacidade' | 'sugestoes_pericia' | 'referencias_bibliograficas' | 'aprimorar_texto';
  contexto: {
    textoOriginal?: string;
    campo?: string;
    peticaoInicial?: string;
    contestacao?: string;
    cids?: string;
    postoTrabalho?: string;
    atividadesLaborais?: string;
    historicoOcupacional?: string;
    exameFisico?: string;
    examesComplementares?: string;
    antecedentes?: string;
    tratamentos?: string;
    historiaAcidente?: string;
    historiaAtual?: string;
    nexoCausal?: string;
    conclusao?: string;
    metodologia?: string;
  };
}

// Prompts padrão (fallback) - mantidos para retrocompatibilidade
const defaultPrompts = {
  resumo_peticao: (ctx: GerarResumoRequest['contexto']) => `
Você é um perito médico especialista em medicina do trabalho.
Elabore um resumo técnico e objetivo da petição inicial para um laudo pericial.

Texto da Petição Inicial extraído:
${ctx.peticaoInicial || 'Não informado'}

REGRAS DE REDAÇÃO INQUEBRÁVEIS (RISCO LEGAL):
1. ATENÇÃO AO VIÉS: É ESTRITAMENTE PROIBIDO presumir, inventar ou adicionar doenças ocupacionais típicas da profissão (ex: tendinopatias, LER/DORT, síndrome do impacto, PAIR) se elas NÃO estiverem textualmente descritas na petição. O caso pode se tratar de um trauma grave ou acidente atípico.
2. Seja absolutamente fiel aos fatos: cite apenas as lesões, sintomas e dinâmicas de acidente que estão explícitas no texto fornecido.
3. Não utilize placeholders ([INSERIR]). Se não houver clareza, limite-se aos fatos apresentados.
4. Use apenas texto plano, sem Markdown, em no máximo 3 parágrafos contínuos.

INSTRUÇÕES:
- Resuma os pontos principais alegados pelo reclamante
- Destaque a dinâmica do adoecimento/acidente e as doenças reais mencionadas
- Identifique os nexos causais alegados
- Mencione os pedidos principais
`,

  resumo_contestacao: (ctx: GerarResumoRequest['contexto']) => `
Você é um perito médico especialista em medicina do trabalho. Elabore um resumo técnico e objetivo da contestação para um laudo pericial médico trabalhista.

Texto da Contestação:
${ctx.contestacao || 'Não informado'}

Instruções:
- Resuma os pontos principais alegados pela reclamada
- Destaque os argumentos contrários ao nexo causal
- Identifique documentos ou evidências mencionadas
- Mencione os pedidos de improcedência
- Use linguagem técnica e imparcial
- Máximo 3 parágrafos
`,

  descricao_doencas: (ctx: GerarResumoRequest['contexto']) => `
Você é um perito médico especialista em medicina do trabalho. Elabore uma descrição técnica detalhada das doenças identificadas para um laudo pericial.

CIDs identificados:
${ctx.cids || 'Não informado'}

Informações adicionais:
- Posto de trabalho: ${ctx.postoTrabalho || 'Não informado'}
- Atividades laborais: ${ctx.atividadesLaborais || 'Não informado'}
- Histórico ocupacional: ${ctx.historicoOcupacional || 'Não informado'}

Instruções:
Para cada CID mencionado, forneça:
1. Nome da doença e código CID-10
2. Definição técnica
3. Etiologia (causas possíveis)
4. Sintomas característicos
5. Fatores de risco ocupacionais (quando aplicável)
6. Relação com atividades laborais descritas

Use linguagem técnica médica apropriada para laudo pericial.
`,

  // Novo tipo: Gera descrição técnica específica para CIDs inseridos manualmente
  descricao_cid: (ctx: GerarResumoRequest['contexto']) => `
Você é um perito médico especialista em medicina do trabalho. Elabore a descrição técnica detalhada para cada CID informado.

CÓDIGOS CID A DESCREVER:
${ctx.cids || 'Não informado'}

CONTEXTO OCUPACIONAL (se disponível):
- Atividades laborais: ${ctx.atividadesLaborais || 'Não informado'}
- Histórico ocupacional: ${ctx.historicoOcupacional || 'Não informado'}

INSTRUÇÕES OBRIGATÓRIAS:
Para CADA CID informado, forneça obrigatoriamente:

1. TÍTULO EM CAIXA ALTA com nome completo da doença e código CID-10
   Exemplo: TENDINITE DO SUPRAESPINHOSO (CID-10: M75.1)

2. DEFINIÇÃO TÉCNICA
   Descreva tecnicamente o que é a patologia, sua localização anatômica e características principais.

3. ETIOLOGIA
   Liste as causas possíveis, incluindo fatores ocupacionais quando aplicável.

4. SINTOMAS CARACTERÍSTICOS
   Descreva os sintomas típicos da condição.

5. FATORES DE RISCO OCUPACIONAIS
   Relacione com atividades laborais que podem causar ou agravar a condição.

FORMATO DE SAÍDA:
- Use CAIXA ALTA para títulos de seção (não use markdown com asteriscos)
- Separe cada CID com uma linha em branco
- Seja técnico e objetivo, mas completo
- Mínimo 2 parágrafos por CID
`,

  nexo_causal: (ctx: GerarResumoRequest['contexto']) => `
Você é um perito médico especialista em medicina do trabalho. Elabore uma análise técnica COMPLETA do nexo causal para um laudo pericial médico trabalhista, seguindo OBRIGATORIAMENTE os critérios científicos estabelecidos.

DADOS PARA ANÁLISE:
- CIDs/Diagnósticos: ${ctx.cids || 'Não informado'}
- Posto de trabalho: ${ctx.postoTrabalho || 'Não informado'}
- Atividades laborais: ${ctx.atividadesLaborais || 'Não informado'}
- Histórico ocupacional: ${ctx.historicoOcupacional || 'Não informado'}
- História do acidente/doença: ${ctx.historiaAcidente || 'Não informado'}
- História atual: ${ctx.historiaAtual || 'Não informado'}
- Exame físico: ${ctx.exameFisico || 'Não informado'}
- Exames complementares: ${ctx.examesComplementares || 'Não informado'}
- Antecedentes patológicos: ${ctx.antecedentes || 'Não informado'}

ESTRUTURA OBRIGATÓRIA DA ANÁLISE:

1. CLASSIFICAÇÃO DE SCHILLING
Aplique a Classificação de Schilling (1983) para determinar a relação trabalho-doença:
- GRUPO I: Doença Ocupacional Típica (trabalho é causa NECESSÁRIA)
- GRUPO II: Doença Agravada pelo Trabalho (trabalho é fator CONTRIBUTIVO - Concausa)
- GRUPO III: Doença Comum sem Relação (ausência de nexo)
- GRUPO IV: Doença do Trabalho (listada em legislação específica)

Justifique em 1-2 linhas o enquadramento escolhido.

2. CRITÉRIOS DE SIMONIN
Analise os 3 critérios de Simonin (1960):
- MECANISMO: Há compatibilidade entre a exposição ocupacional e a patologia diagnosticada?
- CRONOLOGIA: O tempo de exposição é compatível com o surgimento da doença?
- EXCLUSÃO: Existem causas extraocupacionais que explicam a doença?

Para cada critério, forneça justificativa de 1 linha.

3. CRITÉRIOS DE BRADFORD-HILL
Analise os critérios de Bradford-Hill (1965) aplicáveis ao caso:
- Força da associação: [justificativa em 1 linha]
- Consistência: [justificativa em 1 linha]
- Especificidade: [justificativa em 1 linha]
- Temporalidade: [justificativa em 1 linha]
- Gradiente biológico: [justificativa em 1 linha]
- Plausibilidade biológica: [justificativa em 1 linha]
- Coerência: [justificativa em 1 linha]

4. CONCLUSÃO DO NEXO
Com base na análise acima, classifique como:
- NEXO CAUSAL DIRETO (Grupo I de Schilling)
- CONCAUSA (Grupo II de Schilling)
- AUSÊNCIA DE NEXO CAUSAL (Grupo III de Schilling)

IMPORTANTE:
- Se faltar dado crítico para a análise, declare explicitamente: "INFORMAÇÃO INSUFICIENTE para determinar [aspecto específico]"
- Use CAIXA ALTA para títulos de seção
- Não use markdown com asteriscos
- Seja objetivo mas fundamentado
`,

  incapacidade: (ctx: GerarResumoRequest['contexto']) => `
Você é um perito médico especialista em medicina do trabalho. Elabore uma análise técnica COMPLETA da incapacidade laboral, seguindo a metodologia pericial obrigatória.

DADOS PARA ANÁLISE:
- CIDs/Diagnósticos: ${ctx.cids || 'Não informado'}
- Cargo/Função: ${ctx.postoTrabalho || 'Não informado'}
- Atividades laborais: ${ctx.atividadesLaborais || 'Não informado'}
- Exame físico: ${ctx.exameFisico || 'Não informado'}
- Exames complementares: ${ctx.examesComplementares || 'Não informado'}
- Tratamentos realizados: ${ctx.tratamentos || 'Não informado'}
- Histórico ocupacional: ${ctx.historicoOcupacional || 'Não informado'}
- Nexo causal estabelecido: ${ctx.nexoCausal || 'Não informado'}

ESTRUTURA OBRIGATÓRIA DA ANÁLISE:

1. EXIGÊNCIAS DA FUNÇÃO
Descreva as demandas físicas e/ou cognitivas do cargo ocupado:
- Movimentos exigidos
- Posturas adotadas
- Carga física/mental
- Jornada de trabalho

2. BASE CLÍNICA OBJETIVA
Apresente os achados que fundamentam a análise:
- Alterações no exame físico
- Resultados de exames complementares
- CIDs diagnosticados e sua gravidade
- Estágio evolutivo da patologia

3. LIMITAÇÕES FUNCIONAIS
Descreva objetivamente:
- O que o periciando NÃO consegue realizar
- Restrições de movimento, força, cognição
- Impacto nas atividades de vida diária
- Necessidade de auxílio de terceiros

4. CORRELAÇÃO COM O NEXO
Se houver nexo causal estabelecido, correlacione:
- Classificação de Schilling aplicada
- Critérios de Simonin atendidos
- Critérios de Bradford-Hill aplicáveis

5. CONCLUSÃO DA INCAPACIDADE
Classifique a incapacidade como:
- INCAPACIDADE TOTAL TEMPORÁRIA
- INCAPACIDADE PARCIAL TEMPORÁRIA
- INCAPACIDADE TOTAL PERMANENTE
- INCAPACIDADE PARCIAL PERMANENTE
- AUSÊNCIA DE INCAPACIDADE LABORAL

Indique também:
- Possibilidade de reabilitação profissional
- Necessidade de readaptação de função
- Prognóstico

IMPORTANTE:
- Use CAIXA ALTA para títulos de seção
- Não use markdown com asteriscos
- Se faltar informação crítica, declare: "INFORMAÇÃO INSUFICIENTE"
`,

  sugestoes_pericia: (ctx: GerarResumoRequest['contexto']) => `
Você é um perito médico especialista em medicina do trabalho. 
Com base nas informações do caso, elabore sugestões práticas para auxiliar a perícia.

DADOS DO CASO:
- CIDs/Diagnósticos alegados: ${ctx.cids || 'Não informado'}
- História do acidente/doença: ${ctx.historiaAcidente || 'Não informado'}
- História atual: ${ctx.historiaAtual || 'Não informado'}
- Posto de trabalho: ${ctx.postoTrabalho || 'Não informado'}
- Atividades laborais: ${ctx.atividadesLaborais || 'Não informado'}
- Antecedentes patológicos: ${ctx.antecedentes || 'Não informado'}

INSTRUÇÕES IMPORTANTES:
- Responda APENAS em português brasileiro
- NÃO use tabelas de forma alguma
- Use apenas listas com marcadores (-) e títulos (##, ###)
- Seja objetivo e direto
- Use linguagem técnica médica

ESTRUTURA DA RESPOSTA:

## PERGUNTAS SUGERIDAS PARA A ANAMNESE

### Sobre o início e evolução
- Liste 2-3 perguntas específicas sobre quando iniciaram os sintomas e como evoluíram

### Sobre o trabalho
- Liste 2-3 perguntas sobre as atividades realizadas e exposição a fatores de risco

### Sobre tratamentos
- Liste 2-3 perguntas sobre tratamentos realizados e resultados obtidos

### Sobre limitações atuais
- Liste 2-3 perguntas sobre atividades que não consegue mais realizar e impacto na vida diária

---

## EXAME FÍSICO SUGERIDO

### Inspeção Geral
- O que observar na inspeção inicial do periciando
- Postura, marcha, estado geral

### Testes Específicos
- Liste 3-5 manobras ou testes relevantes para os CIDs informados
- Para cada teste, indique brevemente o que avalia

### Avaliação Funcional
- Amplitude de movimento (quais articulações avaliar)
- Força muscular (quais grupos musculares)
- Sensibilidade (quando aplicável)

Forneça entre 8-12 perguntas e 5-8 testes/manobras específicas relevantes para os CIDs informados.
`,

  referencias_bibliograficas: (ctx: GerarResumoRequest['contexto']) => {
    // Detecta se há documentos ocupacionais (ASO/PCMSO) no contexto
    const hasOccupationalDocs = [
      ctx.postoTrabalho || '',
      ctx.atividadesLaborais || '',
      ctx.historicoOcupacional || '',
      ctx.nexoCausal || '',
      ctx.examesComplementares || ''
    ].some(field => 
      /\b(ASO|PCMSO|Atestado de Sa[úu]de Ocupacional|PPRA|LTCAT|PPP)\b/i.test(field)
    );

    return `
Você é um perito médico especialista em medicina do trabalho. Elabore a lista de referências bibliográficas para o laudo pericial.

DADOS DO LAUDO:
- CIDs/Diagnósticos: ${ctx.cids || 'Não informado'}
- Posto de trabalho: ${ctx.postoTrabalho || 'Não informado'}
- Atividades laborais: ${ctx.atividadesLaborais || 'Não informado'}
- Histórico ocupacional: ${ctx.historicoOcupacional || 'Não informado'}
- Nexo causal: ${ctx.nexoCausal || 'Não informado'}
- Tratamentos: ${ctx.tratamentos || 'Não informado'}
- Exames complementares: ${ctx.examesComplementares || 'Não informado'}

REFERÊNCIAS OBRIGATÓRIAS (SEMPRE incluir):
1- SCHILLING, R.S.F. More effective prevention in occupational health practice. J Soc Occup Med, v. 33, p. 71-79, 1983.

2- BRADFORD HILL, A. The Environment and Disease: Association or Causation? Proc R Soc Med, v. 58, p. 295-300, 1965.

3- SIMONIN, C. Medicina Legal Judicial. Barcelona: Editorial JIMS, 1960.

${hasOccupationalDocs ? `4- ASSOCIAÇÃO NACIONAL DE MEDICINA DO TRABALHO. Diretrizes para avaliação de nexo técnico em doenças ocupacionais. São Paulo: ANAMT, 2024.

` : ''}
INSTRUÇÕES PARA REFERÊNCIAS DINÂMICAS:
- Adicione 3-5 referências REAIS e específicas relacionadas aos CIDs informados
- Inclua legislação aplicável (CLT, Lei 8.213/91, NRs relevantes)
- Inclua CID-10 (OMS) e normas do CFM quando pertinente
- Use formato ABNT para todas as referências
- Numere sequencialmente (${hasOccupationalDocs ? '5' : '4'}-, ${hasOccupationalDocs ? '6' : '5'}-, etc.)
- Seja ESPECÍFICO: se há lesão de ombro, cite obras sobre ombro; se há LER/DORT, cite obras sobre ergonomia

FORMATO DE SAÍDA:
1- SCHILLING, R.S.F. More effective prevention in occupational health practice...

2- BRADFORD HILL, A. The Environment and Disease...

3- SIMONIN, C. Medicina Legal Judicial...
${hasOccupationalDocs ? '\n4- ASSOCIAÇÃO NACIONAL DE MEDICINA DO TRABALHO. Diretrizes...\n' : ''}
[Referências dinâmicas específicas para o caso]

Forneça entre 6 e 10 referências no total, sempre incluindo as obrigatórias primeiro.
`;
  },

  aprimorar_texto: (ctx: GerarResumoRequest['contexto']) => `
Você é um revisor especializado em textos médico-periciais. Seu trabalho é APENAS corrigir e aprimorar o texto fornecido, SEM alterar seu conteúdo técnico ou factual.

TEXTO ORIGINAL:
${ctx.textoOriginal || ''}

CAMPO DO LAUDO: ${ctx.campo || 'Não especificado'}

REGRAS ESTRITAS:
1. Corrija APENAS: ortografia, gramática, concordância verbal/nominal, pontuação
2. Melhore a formalidade e o estilo para padrão de laudo pericial
3. NÃO altere dados técnicos: datas, números, CIDs, nomes, percentuais, medidas, lateralidade
4. NÃO adicione informações novas
5. NÃO remova informações existentes
6. NÃO altere diagnósticos ou conclusões médicas
7. Mantenha a estrutura de parágrafos original
8. Use linguagem técnica e formal apropriada para laudos periciais

Retorne APENAS o texto corrigido, sem comentários ou explicações.
`
};

// Mapeamento de tipos para IDs de prompt e metadados
const promptMapping: Record<string, { promptId: string; cardId: string; sectionId: string; description: string }> = {
  resumo_peticao: { promptId: 'prompt_gen_resumo_peticao', cardId: 'resumo-autos', sectionId: 'resumo', description: 'Resumir petição inicial' },
  resumo_contestacao: { promptId: 'prompt_gen_resumo_contestacao', cardId: 'resumo-autos', sectionId: 'resumo', description: 'Resumir contestação' },
  descricao_doencas: { promptId: 'prompt_gen_descricao_doencas', cardId: 'analise-tecnica', sectionId: 'descricao-doencas', description: 'Descrição técnica das doenças' },
  descricao_cid: { promptId: 'prompt_gen_descricao_cid', cardId: 'analise-tecnica', sectionId: 'descricao-doencas', description: 'Gerar descrição técnica para CIDs específicos' },
  nexo_causal: { promptId: 'prompt_gen_nexo_causal', cardId: 'analise-tecnica', sectionId: 'nexo', description: 'Análise de nexo causal' },
  incapacidade: { promptId: 'prompt_gen_incapacidade', cardId: 'analise-tecnica', sectionId: 'analise-incapacidade', description: 'Análise de incapacidade' },
  sugestoes_pericia: { promptId: 'prompt_gen_sugestoes_pericia', cardId: 'periciando', sectionId: 'anamnese', description: 'Sugestões para perícia' },
  referencias_bibliograficas: { promptId: 'prompt_gen_referencias', cardId: 'referencias', sectionId: 'referencias', description: 'Referências bibliográficas' },
  aprimorar_texto: { promptId: 'prompt_gen_aprimorar_texto', cardId: '_global', sectionId: '_aprimorar', description: 'Aprimorar texto (correção gramatical)' }
};

const defaultSystemPrompt = 'Você é um perito médico especialista em medicina do trabalho, com vasta experiência em elaboração de laudos periciais. Responda sempre em português brasileiro, de forma técnica e imparcial.';

// Tipos que DEVEM usar Markdown (renderizados em painéis dedicados com react-markdown)
const TIPOS_COM_MARKDOWN_INTENCIONAL = new Set(['sugestoes_pericia', 'aprimorar_texto']);

// Regra de formatação injetada no system prompt para tipos que vão para o corpo do laudo
const REGRA_FORMATACAO_PLAIN_TEXT = ' REGRA DE FORMATAÇÃO OBRIGATÓRIA: Retorne APENAS texto plano. É estritamente proibido usar formatação Markdown (sem negritos com asteriscos, sem títulos com #, sem listas com * ou -). Use CAIXA ALTA para títulos de seção e quebras de linha simples para separar blocos de conteúdo.';

// Regra de idioma para garantir acentuação correta em português
const REGRA_IDIOMA = ' REGRA DE IDIOMA: Todo o texto DEVE ser redigido em Português Brasileiro correto e formal, com TODOS os acentos, cedilhas e diacríticos adequados (á, é, í, ó, ú, â, ê, ô, ã, õ, ç). Texto sem acentuação será REJEITADO.';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tipo, contexto } = await req.json() as GerarResumoRequest;

    if (!tipo || !defaultPrompts[tipo]) {
      return new Response(
        JSON.stringify({ error: 'Tipo de resumo inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar configuração de IA dinamicamente
    const aiConfig = await getAIConfig();
    console.log(`[gerar-resumos] Using AI Config - Provider: ${aiConfig.provider}, Model: ${aiConfig.model}`);

    if (!aiConfig.apiKey) {
      console.error('[gerar-resumos] No API key configured');
      return new Response(
        JSON.stringify({ error: 'API key não configurada para o provider selecionado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Gerar prompt base (fallback)
    const defaultPrompt = defaultPrompts[tipo](contexto);
    
    // Buscar prompt customizado via prompt-manager
    const mapping = promptMapping[tipo];
    
    // Contexto completo para interpolação - todas as variáveis possíveis
    const interpolationContext = {
      cids: contexto.cids || 'Não informado',
      postoTrabalho: contexto.postoTrabalho || 'Não informado',
      atividadesLaborais: contexto.atividadesLaborais || 'Não informado',
      historicoOcupacional: contexto.historicoOcupacional || 'Não informado',
      exameFisico: contexto.exameFisico || 'Não informado',
      examesComplementares: contexto.examesComplementares || 'Não informado',
      antecedentes: contexto.antecedentes || 'Não informado',
      tratamentos: contexto.tratamentos || 'Não informado',
      historiaAcidente: contexto.historiaAcidente || 'Não informado',
      historiaAtual: contexto.historiaAtual || 'Não informado',
      peticaoInicial: contexto.peticaoInicial || 'Não informado',
      contestacao: contexto.contestacao || 'Não informado',
      nexoCausal: contexto.nexoCausal || 'Não informado',
      conclusao: contexto.conclusao || 'Não informado',
      metodologia: contexto.metodologia || 'Não informado',
      textoOriginal: contexto.textoOriginal || '',
      campo: contexto.campo || 'Não especificado',
    };
    
    const prompt = await getPrompt(
      mapping.promptId,
      defaultPrompt,
      interpolationContext,
      {
        autoRegister: true,
        description: mapping.description,
        cardId: mapping.cardId,
        sectionId: mapping.sectionId
      }
    );
    
    console.log(`[gerar-resumos] Gerando resumo do tipo: ${tipo} (promptId: ${mapping.promptId})`);

    // Buscar system prompt via prompt-manager
    const baseSystemPrompt = await getPrompt(
      'prompt_system_gerar_resumos',
      defaultSystemPrompt,
      {},
      {
        autoRegister: true,
        description: 'System prompt padrão para geração de resumos',
        cardId: '_system',
        sectionId: '_gerar_resumos'
      }
    );

    // Injetar regra de plain text apenas para tipos que vão para o corpo do laudo
    // Tipos com Markdown intencional (renderizado via react-markdown em painéis dedicados) ficam isentos
    const systemPrompt = TIPOS_COM_MARKDOWN_INTENCIONAL.has(tipo)
      ? baseSystemPrompt + REGRA_IDIOMA
      : baseSystemPrompt + REGRA_FORMATACAO_PLAIN_TEXT + REGRA_IDIOMA;

    console.log(`[gerar-resumos] Formatação plain text: ${!TIPOS_COM_MARKDOWN_INTENCIONAL.has(tipo) ? 'ATIVA' : 'ISENTA (markdown intencional)'}`);

    try {
      const result = await callAI(aiConfig, systemPrompt, prompt, {
        promptType: tipo
      });
      
      console.log(`[gerar-resumos] Resumo gerado com sucesso - Provider: ${result.provider}, Model: ${result.model}, UsedFallback: ${result.usedFallback}`);

      return new Response(
        JSON.stringify({ 
          texto: result.text,
          provider: result.provider,
          model: result.model
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (aiError) {
      console.error('[gerar-resumos] AI call error:', aiError);
      
      // Verificar erros específicos
      const errorMessage = aiError instanceof Error ? aiError.message : 'Erro desconhecido';
      
      if (errorMessage.includes('429')) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente em alguns minutos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (errorMessage.includes('402')) {
        return new Response(
          JSON.stringify({ error: 'Créditos insuficientes. Adicione créditos ao seu workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Erro ao gerar resumo: ${errorMessage}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error in gerar-resumos function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
