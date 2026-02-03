import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAIConfig, callAI } from "../_shared/ai-config.ts";
import { getPrompt } from "../_shared/prompt-manager.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface GerarRespostaRequest {
  laudo_id: string;
  quesito_texto: string;
  quesito_numero?: number;
}

// Fallback hardcoded - usado se o banco estiver indisponível
const DEFAULT_SYSTEM_PROMPT = `Você é um perito médico especialista em medicina do trabalho, respondendo a uma impugnação de laudo pericial.

Sua tarefa é elaborar uma resposta técnica fundamentada que:
1. Mantenha a coerência com as conclusões do laudo original
2. Cite evidências clínicas e documentais do laudo
3. Use linguagem técnica e formal apropriada
4. Seja objetiva e imparcial
5. Fundamente cada afirmação com dados do laudo

Responda sempre em português brasileiro, de forma técnica e profissional.`;

function buildUserPrompt(laudo: any, quesitoTexto: string): string {
  // Formatar CIDs de forma legível
  let cidsFormatados = 'Não informado';
  if (laudo.diagnostico_cids && Array.isArray(laudo.diagnostico_cids)) {
    cidsFormatados = laudo.diagnostico_cids
      .map((cid: any) => `${cid.codigo || cid.cid} - ${cid.descricao || cid.nome || 'Sem descrição'}`)
      .join('; ');
  }

  return `
LAUDO PERICIAL ORIGINAL:

IDENTIFICAÇÃO DO PROCESSO:
- Processo: ${laudo.processo_numero || 'Não informado'}
- Vara: ${laudo.processo_vara || 'Não informada'}
- Reclamante: ${laudo.reclamante || 'Não informado'}
- Reclamada: ${laudo.reclamada || 'Não informada'}

DADOS DO PERICIANDO:
- Nome: ${laudo.vitima_nome || 'Não informado'}
- Data de Nascimento: ${laudo.vitima_nascimento || 'Não informada'}
- Profissão: ${laudo.vitima_profissao || 'Não informada'}
- Escolaridade: ${laudo.vitima_escolaridade || 'Não informada'}

HISTÓRICO OCUPACIONAL:
${laudo.historico_ocupacional || 'Não informado'}

DADOS DO POSTO DE TRABALHO:
${laudo.descricao_posto_trabalho || 'Não informado'}

ATIVIDADES LABORAIS:
${laudo.descricao_atividades_laborais || 'Não informado'}

HISTÓRIA DO ACIDENTE/DOENÇA:
${laudo.historia_acidente || 'Não informado'}

HISTÓRIA CLÍNICA ATUAL:
${laudo.historia_atual || 'Não informado'}

ANTECEDENTES PATOLÓGICOS:
${laudo.antecedentes || 'Não informado'}

TRATAMENTOS REALIZADOS:
${laudo.tratamentos || 'Não informado'}

EXAME FÍSICO:
${laudo.exame_fisico || 'Não informado'}

EXAMES COMPLEMENTARES:
${laudo.exames_complementares || 'Não informado'}

DIAGNÓSTICOS (CIDs):
${cidsFormatados}

DESCRIÇÃO TÉCNICA DAS DOENÇAS:
${laudo.descricao_tecnica_doencas || 'Não informado'}

ANÁLISE DO NEXO CAUSAL:
- Tipo: ${laudo.nexo_causal_tipo || 'Não informado'}
- Justificativa: ${laudo.nexo_causal_justificativa || 'Não informada'}

ANÁLISE DA INCAPACIDADE:
${laudo.analise_incapacidade_laboral || 'Não informado'}

CONCLUSÃO DO LAUDO:
- CID Conclusivo: ${laudo.conclusao_cid || 'Não informado'}
- Análise: ${laudo.conclusao_analise || 'Não informada'}
- Incapacidade: ${laudo.conclusao_incapacidade || 'Não informada'}
- Status: ${laudo.conclusao_status || 'Não informado'}
- Justificativa: ${laudo.conclusao_justificativa || 'Não informada'}

TABELA SUSEP:
${laudo.tabela_susep || 'Não informado'}

DANO ESTÉTICO:
${laudo.dano_estetico || 'Não informado'}

AUXÍLIO DE TERCEIROS:
${laudo.auxilio_terceiros || 'Não informado'}

---

QUESITO DA IMPUGNAÇÃO A SER RESPONDIDO:
"${quesitoTexto}"

---

INSTRUÇÕES PARA A RESPOSTA:
1. Elabore uma resposta técnica fundamentada exclusivamente no conteúdo do laudo acima
2. Mantenha as conclusões periciais originais
3. Cite os elementos técnicos e evidências que sustentam o posicionamento
4. Use linguagem formal apropriada para documentos judiciais
5. Seja objetivo e direto, evitando repetições desnecessárias
6. Se o quesito questionar algum aspecto do laudo, explique tecnicamente a fundamentação utilizada
7. Inicie a resposta diretamente com o conteúdo técnico, sem repetir o quesito

Elabore a resposta técnica:`;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verificar autenticação
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Cliente com token do usuário para verificar permissões
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verificar claims do usuário
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error('[gerar-resposta-impugnacao] Auth error:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Token inválido ou expirado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log(`[gerar-resposta-impugnacao] User authenticated: ${userId}`);

    // Parse request body
    const { laudo_id, quesito_texto, quesito_numero } = await req.json() as GerarRespostaRequest;

    if (!laudo_id || !quesito_texto) {
      return new Response(
        JSON.stringify({ error: 'laudo_id e quesito_texto são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[gerar-resposta-impugnacao] Buscando laudo ${laudo_id} para quesito ${quesito_numero || 'N/A'}`);

    // Buscar o laudo (RLS vai garantir que pertence ao usuário)
    const { data: laudo, error: laudoError } = await supabaseClient
      .from('laudos')
      .select('*')
      .eq('id', laudo_id)
      .maybeSingle();

    if (laudoError) {
      console.error('[gerar-resposta-impugnacao] Erro ao buscar laudo:', laudoError);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar laudo' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!laudo) {
      return new Response(
        JSON.stringify({ error: 'Laudo não encontrado ou não autorizado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[gerar-resposta-impugnacao] Laudo encontrado: ${laudo.title} - ${laudo.vitima_nome}`);

    // Buscar configuração de IA
    const aiConfig = await getAIConfig();
    console.log(`[gerar-resposta-impugnacao] Using AI - Provider: ${aiConfig.provider}, Model: ${aiConfig.model}`);

    if (!aiConfig.apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key de IA não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Montar prompt com contexto do laudo
    const userPrompt = buildUserPrompt(laudo, quesito_texto);

    // Buscar prompt do banco (com fallback hardcoded)
    const systemPromptFinal = await getPrompt(
      'prompt_system_impugnacao',
      DEFAULT_SYSTEM_PROMPT,
      {} // System prompt não usa interpolação de variáveis
    );

    console.log(`[gerar-resposta-impugnacao] Using prompt from: ${systemPromptFinal === DEFAULT_SYSTEM_PROMPT ? 'fallback' : 'database'}`);

    try {
      const result = await callAI(aiConfig, systemPromptFinal, userPrompt, {
        userId,
        promptType: 'resposta_impugnacao',
        maxOutputTokens: 2048
      });

      console.log(`[gerar-resposta-impugnacao] Resposta gerada - Provider: ${result.provider}, Model: ${result.model}, UsedFallback: ${result.usedFallback}`);

      return new Response(
        JSON.stringify({
          resposta: result.text,
          provider: result.provider,
          model: result.model,
          usedFallback: result.usedFallback,
          laudo_info: {
            vitima_nome: laudo.vitima_nome,
            processo_numero: laudo.processo_numero
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (aiError) {
      console.error('[gerar-resposta-impugnacao] AI error:', aiError);
      
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
        JSON.stringify({ error: `Erro ao gerar resposta: ${errorMessage}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('[gerar-resposta-impugnacao] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
