import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAIConfig, callAI } from "../_shared/ai-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GerarResumoRequest {
  tipo: 'resumo_peticao' | 'resumo_contestacao' | 'descricao_doencas' | 'nexo_causal' | 'incapacidade' | 'sugestoes_pericia' | 'referencias_bibliograficas' | 'aprimorar_texto';
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

const prompts = {
  resumo_peticao: (ctx: GerarResumoRequest['contexto']) => `
Você é um perito médico especialista em medicina do trabalho. Elabore um resumo técnico e objetivo da petição inicial para um laudo pericial médico trabalhista.

Texto da Petição Inicial:
${ctx.peticaoInicial || 'Não informado'}

Instruções:
- Resuma os pontos principais alegados pelo reclamante
- Destaque as doenças/lesões mencionadas
- Identifique os nexos causais alegados
- Mencione os pedidos principais
- Use linguagem técnica e imparcial
- Máximo 3 parágrafos
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

  nexo_causal: (ctx: GerarResumoRequest['contexto']) => `
Você é um perito médico especialista em medicina do trabalho. Elabore uma análise técnica do nexo causal para um laudo pericial médico trabalhista.

Dados para análise:
- CIDs/Diagnósticos: ${ctx.cids || 'Não informado'}
- Posto de trabalho: ${ctx.postoTrabalho || 'Não informado'}
- Atividades laborais: ${ctx.atividadesLaborais || 'Não informado'}
- Histórico ocupacional: ${ctx.historicoOcupacional || 'Não informado'}
- História do acidente/doença: ${ctx.historiaAcidente || 'Não informado'}
- História atual: ${ctx.historiaAtual || 'Não informado'}
- Exame físico: ${ctx.exameFisico || 'Não informado'}
- Exames complementares: ${ctx.examesComplementares || 'Não informado'}
- Antecedentes patológicos: ${ctx.antecedentes || 'Não informado'}

Instruções:
Analise o nexo causal utilizando os critérios de Bradford-Hill e Simonin:
1. Plausibilidade biológica
2. Força da associação
3. Temporalidade
4. Consistência
5. Especificidade
6. Gradiente dose-resposta

Classifique o nexo como: Direto, Concausa, Agravamento ou Sem Nexo Causal.
Fundamente tecnicamente sua conclusão citando evidências clínicas e documentais.
`,

  incapacidade: (ctx: GerarResumoRequest['contexto']) => `
Você é um perito médico especialista em medicina do trabalho. Elabore uma análise técnica da incapacidade laboral para um laudo pericial.

Dados para análise:
- CIDs/Diagnósticos: ${ctx.cids || 'Não informado'}
- Exame físico: ${ctx.exameFisico || 'Não informado'}
- Exames complementares: ${ctx.examesComplementares || 'Não informado'}
- Tratamentos realizados: ${ctx.tratamentos || 'Não informado'}
- Atividades laborais: ${ctx.atividadesLaborais || 'Não informado'}
- Posto de trabalho: ${ctx.postoTrabalho || 'Não informado'}

Instruções:
Analise a capacidade laboral considerando:
1. Tipo de incapacidade (parcial/total, temporária/permanente)
2. Limitações funcionais identificadas no exame físico
3. Compatibilidade com a função exercida
4. Possibilidade de reabilitação profissional
5. Necessidade de readaptação de função
6. Impacto nas atividades de vida diária

Fundamente tecnicamente sua análise com base nos achados clínicos e exames.
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

  referencias_bibliograficas: (ctx: GerarResumoRequest['contexto']) => `
Você é um perito médico especialista em medicina do trabalho. Com base nas informações do laudo, identifique e liste referências bibliográficas pertinentes e específicas para o caso.

DADOS DO LAUDO:
- CIDs/Diagnósticos: ${ctx.cids || 'Não informado'}
- Posto de trabalho: ${ctx.postoTrabalho || 'Não informado'}
- Atividades laborais: ${ctx.atividadesLaborais || 'Não informado'}
- Histórico ocupacional: ${ctx.historicoOcupacional || 'Não informado'}
- Nexo causal: ${ctx.nexoCausal || 'Não informado'}
- Conclusão: ${ctx.conclusao || 'Não informado'}
- Metodologia: ${ctx.metodologia || 'Não informado'}
- Tratamentos: ${ctx.tratamentos || 'Não informado'}
- Exames complementares: ${ctx.examesComplementares || 'Não informado'}

INSTRUÇÕES:
- Liste entre 5 e 8 referências bibliográficas pertinentes ao caso específico
- Numere cada referência (1-, 2-, 3-, etc.)
- Inclua obras de medicina do trabalho relacionadas aos CIDs informados
- Inclua legislação aplicável (CLT, Lei 8.213/91, NRs relevantes para o caso)
- Inclua normas técnicas do CFM e CID-10
- NÃO inclua referências genéricas desnecessárias
- Seja específico: se há lesão de coluna, cite obras sobre coluna; se há LER/DORT, cite obras sobre ergonomia
- Use formato ABNT para as referências

FORMATO DE SAÍDA:
1- AUTOR. Título da obra. Cidade: Editora, Ano.

2- BRASIL. Lei/Norma específica aplicável ao caso.

3- Norma técnica ou regulamentadora pertinente.

Forneça referências que realmente embasem tecnicamente o laudo para este caso específico.
`,

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

const systemPrompt = 'Você é um perito médico especialista em medicina do trabalho, com vasta experiência em elaboração de laudos periciais. Responda sempre em português brasileiro, de forma técnica e imparcial.';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tipo, contexto } = await req.json() as GerarResumoRequest;

    if (!tipo || !prompts[tipo]) {
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

    const prompt = prompts[tipo](contexto);
    console.log(`[gerar-resumos] Gerando resumo do tipo: ${tipo}`);

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
