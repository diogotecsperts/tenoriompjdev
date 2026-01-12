import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAIConfig, callAI } from "../_shared/ai-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GerarResumoRequest {
  tipo: 'resumo_peticao' | 'resumo_contestacao' | 'descricao_doencas' | 'nexo_causal' | 'incapacidade';
  contexto: {
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
      const result = await callAI(aiConfig, systemPrompt, prompt);
      
      console.log(`[gerar-resumos] Resumo gerado com sucesso - Provider: ${result.provider}, Model: ${result.model}`);

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
