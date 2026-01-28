import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAIConfig, callAI } from "../_shared/ai-config.ts";
import { retrieveExtractedContent } from "../_shared/pdf-visual-extractor.ts";
import { getRelevantChunk, getFieldPrompt } from "../_shared/smart-chunker.ts";

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

  afastamentos: `Extraia os "Períodos de Afastamento" do documento.
Foque em: datas de início e fim de afastamentos, motivos (CID se disponível), benefícios recebidos (auxílio-doença, auxílio-acidente, aposentadoria por invalidez).
Liste cronologicamente.`,

  descricaoPostoTrabalho: `Extraia a "Descrição do Posto de Trabalho" do documento.
Foque em: ambiente físico, equipamentos utilizados, condições ergonômicas, exposição a riscos físicos/químicos/biológicos, temperatura, ruído, iluminação.`,

  descricaoAtividadesLaborais: `Extraia as "Atividades Laborais" ou "Descrição das Funções" do documento.
Foque em: tarefas executadas diariamente, movimentos repetitivos, esforço físico, carga de trabalho, jornada, pausas, postura predominante.`,

  quesitosJuizo: `Extraia os "Quesitos do Juízo" do documento.
Liste cada quesito numerado exatamente como consta no documento, sem inventar respostas.
Mantenha a formatação original.`,

  quesitosReclamante: `Extraia os "Quesitos do Reclamante" ou "Quesitos do Autor" do documento.
Liste cada quesito numerado exatamente como consta no documento, sem inventar respostas.
Mantenha a formatação original.`,

  quesitosReclamada: `Extraia os "Quesitos da Reclamada" ou "Quesitos da Ré" do documento.
Liste cada quesito numerado exatamente como consta no documento, sem inventar respostas.
Mantenha a formatação original.`,
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
    const extractedContentPath = aiMetadata?.extracted_content_path;

    if (!pdfFilePath && !importJobId && !extractedContentPath) {
      return new Response(
        JSON.stringify({ error: 'Este laudo não possui um PDF de origem registrado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PRIORITY 1: Try to get full text from bucket (most accurate for two-phase extractions)
    if (extractedContentPath) {
      console.log(`[regerar-campo-pdf] Trying bucket content at: ${extractedContentPath}`);
      
      try {
        const extracted = await retrieveExtractedContent(extractedContentPath);
        
        if (extracted?.rawText && extracted.rawText.length > 500) {
          console.log(`[regerar-campo-pdf] Using bucket content (${extracted.rawText.length} chars)`);
          
          // Use smart chunker to get relevant region for this field
          const relevantChunk = getRelevantChunk(extracted.rawText, fieldKey);
          const specificPrompt = getFieldPrompt(fieldKey);
          
          // Get AI config
          const aiConfig = await getAIConfig();
          
          const result = await callAI(
            aiConfig,
            'Você é um assistente especializado em extração de dados de documentos médicos e jurídicos. Extraia apenas as informações solicitadas, sem inventar dados.',
            `${specificPrompt}\n\nConteúdo relevante do documento:\n${relevantChunk}`,
            { promptType: `regerar_${fieldKey}` }
          );

          return new Response(
            JSON.stringify({ 
              texto: result.text,
              provider: result.provider,
              model: result.model,
              source: 'bucket_full_text'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (bucketError) {
        console.warn(`[regerar-campo-pdf] Bucket retrieval failed, falling back to cache:`, bucketError);
      }
    }

    // PRIORITY 2 (FALLBACK): Try to get PDF content from import_jobs result if available
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
        } else if (result.data) {
          // Fallback: reconstruct context from structured data
          const data = result.data;
          const parts: string[] = [];
          
          // Add processo info
          if (data.processo) {
            parts.push(`PROCESSO: ${data.processo.numero || ''}`);
            parts.push(`Reclamante: ${data.processo.reclamante || ''}`);
            parts.push(`Reclamada: ${data.processo.reclamada || ''}`);
            parts.push(`Vara: ${data.processo.vara || ''}`);
          }
          
          // Add historico
          if (data.historico) {
            if (data.historico.historia_atual) parts.push(`HISTÓRIA ATUAL:\n${data.historico.historia_atual}`);
            if (data.historico.historico_ocupacional) parts.push(`HISTÓRICO OCUPACIONAL:\n${data.historico.historico_ocupacional}`);
            if (data.historico.antecedentes_patologicos) parts.push(`ANTECEDENTES PATOLÓGICOS:\n${data.historico.antecedentes_patologicos}`);
            if (data.historico.tratamentos_realizados) parts.push(`TRATAMENTOS:\n${data.historico.tratamentos_realizados}`);
            if (data.historico.afastamentos) parts.push(`AFASTAMENTOS:\n${data.historico.afastamentos}`);
          }
          
          // Add acidente
          if (data.acidente) {
            if (data.acidente.descricao) parts.push(`HISTÓRIA DO ACIDENTE:\n${data.acidente.descricao}`);
            if (data.acidente.data) parts.push(`Data do acidente: ${data.acidente.data}`);
            if (data.acidente.local) parts.push(`Local: ${data.acidente.local}`);
          }
          
          // Add exame_clinico
          if (data.exame_clinico) {
            if (data.exame_clinico.lesoes_descritas) parts.push(`LESÕES/QUADRO CLÍNICO:\n${data.exame_clinico.lesoes_descritas}`);
            if (data.exame_clinico.exames_complementares) parts.push(`EXAMES COMPLEMENTARES:\n${data.exame_clinico.exames_complementares}`);
            if (data.exame_clinico.laudos_medicos) parts.push(`LAUDOS MÉDICOS:\n${data.exame_clinico.laudos_medicos}`);
          }
          
          // Add informacoes_medicas
          if (data.informacoes_medicas) {
            if (data.informacoes_medicas.cids_mencionados) {
              parts.push(`CIDs MENCIONADOS: ${data.informacoes_medicas.cids_mencionados.join(', ')}`);
            }
            if (data.informacoes_medicas.incapacidade_alegada) {
              parts.push(`INCAPACIDADE ALEGADA: ${data.informacoes_medicas.incapacidade_alegada}`);
            }
            if (data.informacoes_medicas.nexo_sugerido) {
              parts.push(`NEXO SUGERIDO: ${data.informacoes_medicas.nexo_sugerido}`);
            }
          }
          
          // Add quesitos
          if (data.quesitos) {
            if (data.quesitos.juizo) parts.push(`QUESITOS DO JUÍZO:\n${data.quesitos.juizo}`);
            if (data.quesitos.reclamante) parts.push(`QUESITOS DO RECLAMANTE:\n${data.quesitos.reclamante}`);
            if (data.quesitos.reclamada) parts.push(`QUESITOS DA RECLAMADA:\n${data.quesitos.reclamada}`);
          }
          
          // Add resumo if available
          if (data.resumo) parts.push(`RESUMO:\n${data.resumo}`);
          
          // Add resumos_ia if available
          if (result.resumos_ia) {
            if (result.resumos_ia.resumo_peticao) parts.push(`RESUMO PETIÇÃO INICIAL:\n${result.resumos_ia.resumo_peticao}`);
            if (result.resumos_ia.resumo_contestacao) parts.push(`RESUMO CONTESTAÇÃO:\n${result.resumos_ia.resumo_contestacao}`);
            if (result.resumos_ia.descricao_doencas) parts.push(`DESCRIÇÃO TÉCNICA DOENÇAS:\n${result.resumos_ia.descricao_doencas}`);
          }
          
          pdfContent = parts.join('\n\n');
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
