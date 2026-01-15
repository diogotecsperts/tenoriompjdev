import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAIConfig, callAI } from "../_shared/ai-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Field-specific prompts for regeneration
const fieldPrompts: Record<string, string> = {
  historiaAtual: `Extraia APENAS a "História Atual" ou "Queixas Atuais" do documento. 
Foque em: sintomas atuais, evolução recente, queixas principais, impacto nas atividades diárias.
Seja objetivo e técnico. Não invente informações.`,

  historicoOcupacional: `Extraia APENAS o "Histórico Ocupacional" do documento.
Foque em: empresas anteriores, funções exercidas, tempo em cada emprego, exposição a riscos.
Liste cronologicamente quando possível.`,

  historiaAcidente: `Extraia APENAS a "História do Acidente" ou "Descrição do Evento" do documento.
Foque em: data, local, circunstâncias, mecanismo da lesão, atendimento inicial.
Seja factual e cronológico.`,

  antecedentes: `Extraia APENAS os "Antecedentes Patológicos" do documento.
Foque em: doenças prévias, cirurgias, internações, uso de medicamentos crônicos, histórico familiar relevante.`,

  tratamentos: `Extraia APENAS os "Tratamentos Realizados" do documento.
Foque em: medicações, fisioterapia, cirurgias, internações, tempo de tratamento, resposta terapêutica.`,

  laudosMedicos: `Extraia APENAS os "Laudos Médicos" ou "Pareceres Médicos" do documento.
Foque em: diagnósticos, conclusões médicas, recomendações, limitações apontadas.`,

  examesComplementares: `Extraia APENAS os "Exames Complementares" do documento.
Foque em: tipo de exame, data, resultado, laudo, conclusão.
Liste cada exame separadamente.`,

  resumoPeticaoInicial: `Extraia e resuma a "Petição Inicial" do documento.
Foque em: alegações do reclamante, doenças/lesões mencionadas, nexo causal alegado, pedidos principais.
Máximo 3 parágrafos.`,

  resumoContestacao: `Extraia e resuma a "Contestação" do documento.
Foque em: argumentos da reclamada, negativas de nexo, documentos citados, pedidos de improcedência.
Máximo 3 parágrafos.`,

  descricaoTecnicaDoencas: `Extraia informações sobre as doenças mencionadas e descreva tecnicamente cada uma.
Para cada CID/doença, forneça: definição, etiologia, sintomas, relação ocupacional.`,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { laudoId, fieldKey } = await req.json();

    if (!laudoId || !fieldKey) {
      return new Response(
        JSON.stringify({ error: 'laudoId e fieldKey são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch laudo and verify ownership
    const { data: laudo, error: laudoError } = await supabase
      .from('laudos')
      .select('id, user_id, ai_metadata')
      .eq('id', laudoId)
      .single();

    if (laudoError || !laudo) {
      return new Response(
        JSON.stringify({ error: 'Laudo não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (laudo.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Acesso negado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get PDF path from ai_metadata
    const aiMetadata = laudo.ai_metadata as any;
    const pdfFilePath = aiMetadata?.pdfFilePath;
    const importJobId = aiMetadata?.importJobId;

    if (!pdfFilePath && !importJobId) {
      return new Response(
        JSON.stringify({ error: 'Este laudo não possui um PDF de origem registrado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try to get PDF content from import_jobs result if available
    let pdfContent = '';
    
    if (importJobId) {
      const { data: job } = await supabase
        .from('import_jobs')
        .select('result')
        .eq('id', importJobId)
        .single();
      
      if (job?.result) {
        const result = job.result as any;
        // Use textos_brutos if available (raw extracted text)
        if (result.textos_brutos) {
          pdfContent = JSON.stringify(result.textos_brutos);
        } else if (result.extractedText) {
          pdfContent = result.extractedText;
        }
      }
    }

    // If no cached content available, return error (re-extraction from PDF requires Vision which is complex)
    if (!pdfContent) {
      return new Response(
        JSON.stringify({ error: 'Não há dados do PDF em cache. Reimporte o PDF para extrair novamente.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use cached content with focused prompt
    const aiConfig = await getAIConfig();
    const fieldPrompt = fieldPrompts[fieldKey] || `Extraia o campo "${fieldKey}" do documento de forma objetiva e técnica.`;

    const result = await callAI(
      aiConfig,
      'Você é um assistente especializado em extração de dados de documentos médicos e jurídicos. Extraia apenas as informações solicitadas, sem inventar dados.',
      `${fieldPrompt}\n\nConteúdo do documento:\n${pdfContent}`,
      { promptType: `regerar_${fieldKey}` }
    );

    return new Response(
      JSON.stringify({ 
        texto: result.text,
        provider: result.provider,
        model: result.model
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in regerar-campo-pdf:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
